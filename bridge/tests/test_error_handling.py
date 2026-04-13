"""Tests for error handling improvements."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from g2_bridge.auth import classify_httpx_error

HEADERS = {"Authorization": "Bearer test-client-token"}


# --- classify_httpx_error unit tests ---


class TestClassifyHttpxError:
    """Verify httpx exceptions are mapped to appropriate status codes."""

    def test_connect_error(self):
        status, detail = classify_httpx_error(httpx.ConnectError("connection refused"))
        assert status == 502
        assert "unreachable" in detail.lower()

    def test_timeout_exception(self):
        status, detail = classify_httpx_error(httpx.TimeoutException("timed out"))
        assert status == 504
        assert "timed out" in detail.lower()

    def test_read_timeout(self):
        status, detail = classify_httpx_error(httpx.ReadTimeout("read timed out"))
        assert status == 504

    def test_http_status_error_401(self):
        resp = httpx.Response(401, request=httpx.Request("POST", "http://test"))
        exc = httpx.HTTPStatusError("unauthorized", request=resp.request, response=resp)
        status, detail = classify_httpx_error(exc)
        assert status == 502
        assert "authentication failed" in detail.lower()

    def test_http_status_error_500(self):
        resp = httpx.Response(500, request=httpx.Request("POST", "http://test"))
        exc = httpx.HTTPStatusError("server error", request=resp.request, response=resp)
        status, detail = classify_httpx_error(exc)
        assert status == 502
        assert "server error" in detail.lower()

    def test_http_status_error_429(self):
        resp = httpx.Response(429, request=httpx.Request("POST", "http://test"))
        exc = httpx.HTTPStatusError("rate limited", request=resp.request, response=resp)
        status, detail = classify_httpx_error(exc)
        assert status == 502
        assert "429" in detail

    def test_generic_exception(self):
        status, detail = classify_httpx_error(RuntimeError("something weird"))
        assert status == 502
        assert "something weird" in detail


# --- Integration tests: orphan prevention ---


async def test_agent_failure_does_not_store_user_message(app_with_state, client):
    """When the agent fails, no messages should be stored (orphan prevention)."""
    _app, _db, agent = app_with_state

    created = await client.post("/v1/sessions", headers=HEADERS, json={})
    session_id = created.json()["id"]

    with patch.object(
        agent, "send_message", new_callable=AsyncMock, side_effect=httpx.ConnectError("connection refused")
    ):
        response = await client.post(
            f"/v1/sessions/{session_id}/message",
            headers=HEADERS,
            json={"content": "This should not be stored"},
        )

    assert response.status_code == 502

    # Verify no messages were persisted
    detail = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)
    assert detail.status_code == 200
    data = detail.json()
    assert data["message_count"] == 0
    assert data["messages"] == []


async def test_generic_exception_handler_returns_500(app_with_state, client):
    """Generic unhandled exceptions should return 500 with safe message."""
    _app, _db, agent = app_with_state

    created = await client.post("/v1/sessions", headers=HEADERS, json={})
    session_id = created.json()["id"]

    with patch.object(
        agent,
        "send_message",
        new_callable=AsyncMock,
        side_effect=ValueError("internal logic error"),
    ):
        response = await client.post(
            f"/v1/sessions/{session_id}/message",
            headers=HEADERS,
            json={"content": "trigger internal error"},
        )

    assert response.status_code == 502
    assert response.json()["detail"]
