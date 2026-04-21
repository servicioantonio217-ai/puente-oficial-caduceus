"""Integration smoke test — full API flow through the bridge.

Tests the complete happy path and key error scenarios end-to-end,
using ASGITransport (no real network). The AI agent is mocked.

This is NOT a unit test — it exercises the full FastAPI middleware,
auth, routing, database, and response adaptation stack.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from g2_bridge.config import Settings
from g2_bridge.main import create_app

# --- Mock agent response (Chat Completions format) ---

MOCK_AGENT_RAW = {
    "id": "chatcmpl-test123",
    "object": "chat.completion",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "Hello! I am your AI assistant. This is a test response.",
            },
            "finish_reason": "stop",
        }
    ],
    "usage": {"prompt_tokens": 10, "completion_tokens": 15, "total_tokens": 25},
}


@pytest.fixture
def settings() -> Settings:
    return Settings(
        bridge_token="smoke-test-token",
        agent_api_key="smoke-agent-key",
        agent_api_url="http://localhost:9999/v1",
        stt_api_url="http://localhost:9999/v1/audio/transcriptions",
        stt_model="whisper-1",
        database_path=":memory:",
        max_response_chars=500,
        max_audio_bytes=5 * 1024 * 1024,
    )


@pytest.fixture
async def app_with_state(settings: Settings):
    """Create app with all services initialized (db, agent, stt, session_lock)."""
    from g2_bridge.agent_client import AgentClient
    from g2_bridge.database import Database
    from g2_bridge.lock import SessionLock
    from g2_bridge.stt_client import STTClient

    application = create_app(settings)
    db = Database(settings.database_path)
    await db.connect()
    agent = AgentClient(settings)
    stt = STTClient(settings)
    application.state.db = db
    application.state.agent = agent
    application.state.stt = stt
    application.state.session_lock = SessionLock()
    yield application, db, agent, stt
    await stt.close()
    await agent.close()
    await db.close()


@pytest.fixture
async def client(app_with_state):
    """HTTP client with full app state."""
    application, *_ = app_with_state
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


HEADERS = {"Authorization": "Bearer smoke-test-token"}


# ============================================================
# Happy path: full API flow
# ============================================================


@pytest.mark.asyncio
async def test_full_api_flow(client: AsyncClient) -> None:
    """Smoke test: health → create session → send message → get session → delete."""

    # 1. Health check
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"

    # 2. Create session
    with patch(
        "g2_bridge.routers.messages.AgentClient.send_message",
        new_callable=AsyncMock,
        return_value=MOCK_AGENT_RAW,
    ):
        resp = await client.post(
            "/v1/sessions",
            json={"name": "Smoke Test Session"},
            headers=HEADERS,
        )
    assert resp.status_code == 201
    session = resp.json()
    session_id = session["id"]
    assert session["name"] == "Smoke Test Session"
    assert session["message_count"] == 0

    # 3. Send a text message (mocked agent)
    with patch(
        "g2_bridge.routers.messages.AgentClient.send_message",
        new_callable=AsyncMock,
        return_value=MOCK_AGENT_RAW,
    ):
        resp = await client.post(
            f"/v1/sessions/{session_id}/message",
            json={"content": "Hello, AI!"},
            headers=HEADERS,
        )
    assert resp.status_code == 200
    agent_resp = resp.json()
    assert agent_resp["status"] == "completed"
    assert agent_resp["conversation"] == session_id
    assert len(agent_resp["output"]) == 1
    assert "Hello! I am your AI assistant" in agent_resp["output"][0]["content"][0]["text"]

    # 4. Get session detail — should now have 2 messages (user + assistant)
    resp = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["id"] == session_id
    assert detail["message_count"] == 2
    assert len(detail["messages"]) == 2
    assert detail["messages"][0]["role"] == "user"
    assert detail["messages"][0]["content"] == "Hello, AI!"
    assert detail["messages"][1]["role"] == "assistant"
    assert "Hello! I am your AI assistant" in detail["messages"][1]["content"]

    # 5. List sessions — should contain our session
    resp = await client.get("/v1/sessions", headers=HEADERS)
    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) >= 1
    ids = [s["id"] for s in sessions]
    assert session_id in ids

    # 6. Create a second session to verify list ordering
    with patch(
        "g2_bridge.routers.messages.AgentClient.send_message",
        new_callable=AsyncMock,
        return_value=MOCK_AGENT_RAW,
    ):
        resp = await client.post("/v1/sessions", json={}, headers=HEADERS)
    assert resp.status_code == 201
    session2_id = resp.json()["id"]

    resp = await client.get("/v1/sessions", headers=HEADERS)
    sessions = resp.json()
    assert len(sessions) == 2
    # Most recently updated first — session2 was created after session1's message
    assert sessions[0]["id"] == session2_id

    # 7. Delete first session
    resp = await client.delete(f"/v1/sessions/{session_id}", headers=HEADERS)
    assert resp.status_code == 204

    # 8. Verify deletion — get should 404
    resp = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)
    assert resp.status_code == 404

    # 9. List should now have only 1 session
    resp = await client.get("/v1/sessions", headers=HEADERS)
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # 10. Cleanup — delete second session
    resp = await client.delete(f"/v1/sessions/{session2_id}", headers=HEADERS)
    assert resp.status_code == 204


# ============================================================
# Auth error scenarios
# ============================================================


@pytest.mark.asyncio
async def test_no_auth_returns_401(client: AsyncClient) -> None:
    """All endpoints should reject requests without a bearer token."""

    # Health is public — no auth required
    resp = await client.get("/health")
    assert resp.status_code == 200

    # All other endpoints require auth
    resp = await client.post("/v1/sessions", json={})
    assert resp.status_code == 401

    resp = await client.get("/v1/sessions")
    assert resp.status_code == 401

    resp = await client.get("/v1/sessions/nonexistent")
    assert resp.status_code == 401

    resp = await client.delete("/v1/sessions/nonexistent")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_wrong_token_returns_401(client: AsyncClient) -> None:
    """Wrong bearer token should be rejected."""

    bad_headers = {"Authorization": "Bearer wrong-token"}
    resp = await client.post("/v1/sessions", json={}, headers=bad_headers)
    assert resp.status_code == 401
    assert "Invalid bridge token" in resp.json()["detail"]


# ============================================================
# Session error scenarios
# ============================================================


@pytest.mark.asyncio
async def test_get_nonexistent_session_returns_404(client: AsyncClient) -> None:
    resp = await client.get("/v1/sessions/nonexistent-id", headers=HEADERS)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_session_returns_404(client: AsyncClient) -> None:
    resp = await client.delete("/v1/sessions/nonexistent-id", headers=HEADERS)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_message_to_nonexistent_session_returns_404(
    client: AsyncClient,
) -> None:
    with patch(
        "g2_bridge.routers.messages.AgentClient.send_message",
        new_callable=AsyncMock,
        return_value=MOCK_AGENT_RAW,
    ):
        resp = await client.post(
            "/v1/sessions/nonexistent/message",
            json={"content": "Hello"},
            headers=HEADERS,
        )
    assert resp.status_code == 404


# ============================================================
# Message: agent failure
# ============================================================


@pytest.mark.asyncio
async def test_agent_failure_returns_502(client: AsyncClient) -> None:
    """When the agent is unreachable, the bridge should return 502."""

    # Create a session first
    resp = await client.post("/v1/sessions", json={}, headers=HEADERS)
    session_id = resp.json()["id"]

    # Send message with failing agent
    with patch(
        "g2_bridge.routers.messages.AgentClient.send_message",
        new_callable=AsyncMock,
        side_effect=Exception("Connection refused"),
    ):
        resp = await client.post(
            f"/v1/sessions/{session_id}/message",
            json={"content": "Hello"},
            headers=HEADERS,
        )
    assert resp.status_code == 502
    assert "Agent request failed" in resp.json()["detail"]


# ============================================================
# Message: response truncation
# ============================================================


@pytest.mark.asyncio
async def test_long_response_returned_in_full(client: AsyncClient) -> None:
    """Long responses should be returned in full — no server-side truncation."""

    long_response = {
        "id": "chatcmpl-long",
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "Word. " * 500,  # ~2500 chars
                },
            }
        ],
    }

    # Create session — max_response_chars is ignored now
    resp = await client.post("/v1/sessions", json={}, headers=HEADERS)
    session_id = resp.json()["id"]

    with patch(
        "g2_bridge.routers.messages.AgentClient.send_message",
        new_callable=AsyncMock,
        return_value=long_response,
    ):
        resp = await client.post(
            f"/v1/sessions/{session_id}/message",
            json={"content": "Tell me a story"},
            headers=HEADERS,
        )
    assert resp.status_code == 200
    agent_resp = resp.json()
    # The full text should be returned without truncation
    full_text = agent_resp["output"][0]["content"][0]["text"]
    expected_text = "Word. " * 500
    assert full_text == expected_text
    assert len(full_text) > 500  # well above old truncation limit

    # The stored message should also be the full text
    resp = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)
    detail = resp.json()
    stored_text = detail["messages"][1]["content"]
    assert stored_text == expected_text


# ============================================================
# Audio endpoint: STT failure scenarios
# ============================================================


@pytest.mark.asyncio
async def test_audio_without_stt_config_returns_503(client: AsyncClient) -> None:
    """Audio endpoint should return 503 when STT is not configured."""

    # Create app without STT configured
    no_stt_settings = Settings(
        bridge_token="smoke-test-token",
        agent_api_key="smoke-agent-key",
        agent_api_url="http://localhost:9999/v1",
        database_path=":memory:",
    )
    from g2_bridge.agent_client import AgentClient
    from g2_bridge.database import Database
    from g2_bridge.lock import SessionLock
    from g2_bridge.stt_client import STTClient

    application = create_app(no_stt_settings)
    db = Database(no_stt_settings.database_path)
    await db.connect()
    agent = AgentClient(no_stt_settings)
    stt = STTClient(no_stt_settings)
    application.state.db = db
    application.state.agent = agent
    application.state.stt = stt
    application.state.session_lock = SessionLock()

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/v1/sessions/nonexistent/audio",
            files={"file": ("test.wav", b"\x00" * 100, "audio/wav")},
            headers=HEADERS,
        )
    assert resp.status_code == 503
    assert "STT endpoint not configured" in resp.json()["detail"]

    await stt.close()
    await agent.close()
    await db.close()


@pytest.mark.asyncio
async def test_audio_to_nonexistent_session_returns_404(client: AsyncClient) -> None:
    """Audio to a non-existent session should return 404."""

    audio_bytes = b"\x00" * 3200  # Minimal WAV-like data
    with patch(
        "g2_bridge.routers.audio.STTClient.transcribe",
        new_callable=AsyncMock,
        return_value="hello world",
    ):
        resp = await client.post(
            "/v1/sessions/nonexistent/audio",
            files={"file": ("test.wav", audio_bytes, "audio/wav")},
            headers=HEADERS,
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_audio_empty_file_returns_400(client: AsyncClient) -> None:
    """Empty audio file should return 400."""

    resp = await client.post(
        "/v1/sessions/nonexistent/audio",
        files={"file": ("test.wav", b"", "audio/wav")},
        headers=HEADERS,
    )
    assert resp.status_code == 400
    assert "Empty audio file" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_audio_too_large_returns_413(client: AsyncClient) -> None:
    """Audio exceeding max_audio_bytes should return 413."""

    # Create a session
    resp = await client.post("/v1/sessions", json={}, headers=HEADERS)
    session_id = resp.json()["id"]

    # Send audio that exceeds the limit
    huge_audio = b"\x00" * (5 * 1024 * 1024 + 1)  # 5MB + 1 byte
    resp = await client.post(
        f"/v1/sessions/{session_id}/audio",
        files={"file": ("big.wav", huge_audio, "audio/wav")},
        headers=HEADERS,
    )
    assert resp.status_code == 413


# ============================================================
# CORS headers
# ============================================================


@pytest.mark.asyncio
async def test_cors_middleware_configured(client: AsyncClient) -> None:
    """CORS middleware is registered on the app (headers only appear with real HTTP).

    ASGITransport does not always surface CORS headers, so we verify
    the middleware is registered rather than checking response headers.
    """

    from starlette.middleware.cors import CORSMiddleware

    # Extract the app from the transport
    app_with_state_data = client._transport.app  # type: ignore[attr-defined]
    cors_found = any(m.cls is CORSMiddleware for m in app_with_state_data.user_middleware)
    assert cors_found, "CORS middleware not registered"


# ============================================================
# Session naming
# ============================================================


@pytest.mark.asyncio
async def test_create_session_with_and_without_name(client: AsyncClient) -> None:
    """Sessions can be created with or without a name."""

    # With name
    resp = await client.post("/v1/sessions", json={"name": "Named Session"}, headers=HEADERS)
    assert resp.status_code == 201
    assert resp.json()["name"] == "Named Session"

    # Without name (defaults to empty string)
    resp = await client.post("/v1/sessions", json={}, headers=HEADERS)
    assert resp.status_code == 201
    assert resp.json()["name"] == ""

    # With null name
    resp = await client.post("/v1/sessions", json={"name": None}, headers=HEADERS)
    assert resp.status_code == 201
    assert resp.json()["name"] == ""


# ============================================================
# Multiple messages in same session
# ============================================================


@pytest.mark.asyncio
async def test_multiple_messages_in_session(client: AsyncClient) -> None:
    """Sending multiple messages accumulates history correctly."""

    # Create session
    resp = await client.post("/v1/sessions", json={}, headers=HEADERS)
    session_id = resp.json()["id"]

    responses = [
        {
            "id": "chatcmpl-1",
            "choices": [{"message": {"role": "assistant", "content": "First reply."}}],
        },
        {
            "id": "chatcmpl-2",
            "choices": [{"message": {"role": "assistant", "content": "Second reply."}}],
        },
        {
            "id": "chatcmpl-3",
            "choices": [{"message": {"role": "assistant", "content": "Third reply."}}],
        },
    ]

    for i, raw_resp in enumerate(responses):
        with patch(
            "g2_bridge.routers.messages.AgentClient.send_message",
            new_callable=AsyncMock,
            return_value=raw_resp,
        ):
            resp = await client.post(
                f"/v1/sessions/{session_id}/message",
                json={"content": f"Message {i + 1}"},
                headers=HEADERS,
            )
        assert resp.status_code == 200

    # Session should have 6 messages (3 user + 3 assistant)
    resp = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)
    detail = resp.json()
    assert detail["message_count"] == 6
    assert len(detail["messages"]) == 6

    # Verify alternating roles
    for i, msg in enumerate(detail["messages"]):
        expected_role = "user" if i % 2 == 0 else "assistant"
        assert msg["role"] == expected_role


# ============================================================
# Session rename
# ============================================================


@pytest.mark.asyncio
async def test_rename_session_success(client):
    """PATCH /v1/sessions/{id} with valid name returns 200."""
    # Create a session first
    resp = await client.post("/v1/sessions", json={"name": "Old Name"}, headers=HEADERS)
    assert resp.status_code == 201
    session_id = resp.json()["id"]

    # Rename it
    resp = await client.patch(
        f"/v1/sessions/{session_id}",
        json={"name": "New Name"},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "New Name"
    assert data["id"] == session_id
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_rename_session_empty_name_returns_422(client):
    """PATCH with empty name returns 422 validation error."""
    resp = await client.post("/v1/sessions", headers=HEADERS)
    session_id = resp.json()["id"]

    resp = await client.patch(
        f"/v1/sessions/{session_id}",
        json={"name": ""},
        headers=HEADERS,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_rename_session_not_found(client):
    """PATCH on nonexistent session returns 404."""
    resp = await client.patch(
        "/v1/sessions/nonexistent-id",
        json={"name": "New Name"},
        headers=HEADERS,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_rename_session_no_auth(client):
    """PATCH without auth returns 401."""
    resp = await client.post("/v1/sessions", headers=HEADERS)
    session_id = resp.json()["id"]

    resp = await client.patch(
        f"/v1/sessions/{session_id}",
        json={"name": "New Name"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_rename_session_name_too_long(client):
    """PATCH with name >100 chars returns 422."""
    resp = await client.post("/v1/sessions", headers=HEADERS)
    session_id = resp.json()["id"]

    long_name = "A" * 101
    resp = await client.patch(
        f"/v1/sessions/{session_id}",
        json={"name": long_name},
        headers=HEADERS,
    )
    assert resp.status_code == 422
