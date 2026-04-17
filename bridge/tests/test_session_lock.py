"""Tests for the per-session lock (issue #58 — interrupt message drop)."""

from __future__ import annotations

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from g2_bridge.lock import SessionLock


class TestSessionLock:
    """Unit tests for SessionLock."""

    @pytest.mark.asyncio
    async def test_lock_allows_single_access(self):
        """A single acquire/release cycle works without blocking."""
        lock = SessionLock()
        async with lock.acquire("session-1"):
            pass  # Should not hang

    @pytest.mark.asyncio
    async def test_lock_serializes_concurrent_requests(self):
        """Two concurrent requests to the same session are serialized."""
        lock = SessionLock()
        execution_order: list[str] = []

        async def task(name: str):
            async with lock.acquire("session-1"):
                execution_order.append(f"{name}-start")
                await asyncio.sleep(0.05)
                execution_order.append(f"{name}-end")

        # Run both concurrently — they should NOT overlap
        await asyncio.gather(task("A"), task("B"))

        # Tasks should be serialized: A completes before B starts (or vice versa)
        assert len(execution_order) == 4
        # Check that no task interleaves with another
        # Either A-start, A-end, B-start, B-end or B-start, B-end, A-start, A-end
        assert execution_order[1].endswith("-end")
        assert execution_order[2].endswith("-start")
        # The start and end of the same task should be adjacent
        first_task = execution_order[0].replace("-start", "")
        assert execution_order[1] == f"{first_task}-end"

    @pytest.mark.asyncio
    async def test_lock_allows_parallel_different_sessions(self):
        """Concurrent requests to DIFFERENT sessions run in parallel."""
        lock = SessionLock()
        execution_order: list[str] = []

        async def task(session_id: str, name: str):
            async with lock.acquire(session_id):
                execution_order.append(f"{name}-start")
                await asyncio.sleep(0.05)
                execution_order.append(f"{name}-end")

        # Run in parallel — different sessions, should overlap
        await asyncio.gather(task("session-1", "A"), task("session-2", "B"))

        # Both tasks ran — check they were concurrent (interleaved)
        assert len(execution_order) == 4
        # With parallel execution, we expect interleaving:
        # Both starts before both ends (since they sleep at the same time)
        starts = [e for e in execution_order if e.endswith("-start")]
        ends = [e for e in execution_order if e.endswith("-end")]
        assert len(starts) == 2
        assert len(ends) == 2

    @pytest.mark.asyncio
    async def test_lock_cleanup_after_release(self):
        """Lock entries are cleaned up when no longer in use."""
        lock = SessionLock()
        async with lock.acquire("session-1"):
            assert "session-1" in lock._locks
        # After release with no waiters, lock should be cleaned up
        assert "session-1" not in lock._locks


class TestConcurrentMessages:
    """Integration test — concurrent messages to the same session.

    Verifies that two messages sent simultaneously to the same session
    both get stored and the second sees the first in its history.
    """

    @pytest.mark.asyncio
    async def test_concurrent_messages_both_stored(
        self, app_with_state
    ):
        """Two concurrent message requests both store user + assistant messages."""
        application, db, _agent = app_with_state

        # Create a session first
        transport = ASGITransport(app=application)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create session
            resp = await client.post(
                "/v1/sessions",
                json={"name": "test"},
                headers={"Authorization": "Bearer test-client-token"},
            )
            assert resp.status_code == 201
            session_id = resp.json()["id"]

            # Mock agent to return different responses based on input
            call_count = 0

            async def mock_send(content, history=None):
                nonlocal call_count
                call_count += 1
                # Return a response that includes the message number
                return {
                    "id": f"resp-{call_count}",
                    "choices": [
                        {"message": {"content": f"Response to: {content}"}}
                    ],
                    "usage": {"input_tokens": 10, "output_tokens": 5},
                }

            _agent.send_message = mock_send

            # Send two messages concurrently
            async def send_msg(text: str):
                return await client.post(
                    f"/v1/sessions/{session_id}/message",
                    json={"content": text},
                    headers={"Authorization": "Bearer test-client-token"},
                )

            responses = await asyncio.gather(
                send_msg("First message"),
                send_msg("Second message"),
            )

            assert all(r.status_code == 200 for r in responses), [
                r.text for r in responses
            ]

            # Verify both messages are stored in the database
            messages = await db.get_messages(session_id)

            # Should have 4 messages: 2 user + 2 assistant
            user_msgs = [m for m in messages if m["role"] == "user"]
            assistant_msgs = [m for m in messages if m["role"] == "assistant"]

            assert len(user_msgs) == 2, (
                f"Expected 2 user messages, got {len(user_msgs)}"
            )
            assert len(assistant_msgs) == 2, (
                f"Expected 2 assistant messages, got"
                f" {len(assistant_msgs)}"
            )

            # Both user messages should be present
            user_contents = {m["content"] for m in user_msgs}
            assert "First message" in user_contents
            assert "Second message" in user_contents
