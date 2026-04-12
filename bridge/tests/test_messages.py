"""Message endpoint tests."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

HEADERS = {"Authorization": "Bearer test-client-token"}

MOCK_AGENT_RESPONSE = {
    "id": "chatcmpl_test123",
    "object": "chat.completion",
    "choices": [
        {
            "index": 0,
            "message": {"role": "assistant", "content": "Hello from the AI agent!"},
            "finish_reason": "stop",
        }
    ],
    "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
}

MOCK_AGENT_LONG_RESPONSE = {
    "id": "chatcmpl_test456",
    "object": "chat.completion",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "This is a very long response. " * 50,
            },
            "finish_reason": "stop",
        }
    ],
    "usage": {"prompt_tokens": 10, "completion_tokens": 200, "total_tokens": 210},
}


async def test_send_message_success(app_with_state, client):
    _app, _db, agent = app_with_state

    created = await client.post("/v1/sessions", headers=HEADERS, json={})
    session_id = created.json()["id"]

    with patch.object(
        agent, "send_message", new_callable=AsyncMock, return_value=MOCK_AGENT_RESPONSE
    ):
        response = await client.post(
            f"/v1/sessions/{session_id}/message",
            headers=HEADERS,
            json={"content": "Hello!"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert len(data["output"]) == 1
    assert data["output"][0]["content"][0]["text"] == "Hello from the AI agent!"


async def test_send_message_truncation(client):
    """Long responses should be truncated to max_response_chars."""
    from httpx import ASGITransport, AsyncClient

    from g2_bridge.agent_client import AgentClient
    from g2_bridge.config import Settings
    from g2_bridge.database import Database
    from g2_bridge.main import create_app

    settings = Settings(
        bridge_token="test-client-token",
        agent_api_key="test-agent-key",
        agent_api_url="http://localhost:9999/v1",
        database_path=":memory:",
        max_response_chars=100,
    )
    app = create_app(settings)
    db = Database(settings.database_path)
    await db.connect()
    agent = AgentClient(settings)
    app.state.db = db
    app.state.agent = agent

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as trunc_client:
            created = await trunc_client.post("/v1/sessions", headers=HEADERS, json={})
            session_id = created.json()["id"]

            with patch.object(
                agent, "send_message", new_callable=AsyncMock, return_value=MOCK_AGENT_LONG_RESPONSE
            ):
                response = await trunc_client.post(
                    f"/v1/sessions/{session_id}/message",
                    headers=HEADERS,
                    json={"content": "Tell me a story"},
                )

        assert response.status_code == 200
        data = response.json()
        text = data["output"][0]["content"][0]["text"]
        assert len(text) <= 104  # 100 chars + "..."
    finally:
        await agent.close()
        await db.close()


async def test_send_message_session_not_found(client):
    response = await client.post(
        "/v1/sessions/nonexistent/message",
        headers=HEADERS,
        json={"content": "Hello!"},
    )

    assert response.status_code == 404


async def test_send_message_agent_failure(app_with_state, client):
    _app, _db, agent = app_with_state

    created = await client.post("/v1/sessions", headers=HEADERS, json={})
    session_id = created.json()["id"]

    with patch.object(
        agent, "send_message", new_callable=AsyncMock, side_effect=Exception("Agent unreachable")
    ):
        response = await client.post(
            f"/v1/sessions/{session_id}/message",
            headers=HEADERS,
            json={"content": "Hello!"},
        )

    assert response.status_code == 502
    assert "Agent request failed" in response.json()["detail"]


async def test_message_persists_in_session_history(app_with_state, client):
    """After sending a message, both user and assistant messages appear in session detail."""
    _app, _db, agent = app_with_state

    created = await client.post("/v1/sessions", headers=HEADERS, json={})
    session_id = created.json()["id"]

    with patch.object(
        agent, "send_message", new_callable=AsyncMock, return_value=MOCK_AGENT_RESPONSE
    ):
        await client.post(
            f"/v1/sessions/{session_id}/message",
            headers=HEADERS,
            json={"content": "Hello!"},
        )

    # Fetch session detail
    detail = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)

    assert detail.status_code == 200
    data = detail.json()
    assert data["message_count"] == 2  # user + assistant
    assert len(data["messages"]) == 2
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][0]["content"] == "Hello!"
    assert data["messages"][1]["role"] == "assistant"
