"""Session CRUD endpoint tests."""

from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from g2_bridge.config import Settings

HEADERS = {"Authorization": "Bearer test-client-token"}


async def test_create_session(client):
    response = await client.post("/v1/sessions", headers=HEADERS, json={})

    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["name"] == ""
    assert data["message_count"] == 0


async def test_create_session_with_name(client):
    response = await client.post("/v1/sessions", headers=HEADERS, json={"name": "Test Chat"})

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Chat"


async def test_list_sessions(client):
    await client.post("/v1/sessions", headers=HEADERS, json={"name": "First"})
    await client.post("/v1/sessions", headers=HEADERS, json={"name": "Second"})

    response = await client.get("/v1/sessions", headers=HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    # Most recently updated first
    assert data[0]["name"] == "Second"


async def test_get_session_detail(client):
    created = await client.post("/v1/sessions", headers=HEADERS, json={"name": "Detail Test"})
    session_id = created.json()["id"]

    response = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == session_id
    assert data["name"] == "Detail Test"
    assert data["messages"] == []


async def test_get_session_not_found(client):
    response = await client.get("/v1/sessions/nonexistent-id", headers=HEADERS)

    assert response.status_code == 404


async def test_delete_session(client):
    created = await client.post("/v1/sessions", headers=HEADERS, json={})
    session_id = created.json()["id"]

    delete_response = await client.delete(f"/v1/sessions/{session_id}", headers=HEADERS)
    assert delete_response.status_code == 204

    # Verify it's gone
    get_response = await client.get(f"/v1/sessions/{session_id}", headers=HEADERS)
    assert get_response.status_code == 404


async def test_session_auth_required(client):
    response = await client.post(
        "/v1/sessions", json={}, headers={"Authorization": "Bearer wrong-token"}
    )

    assert response.status_code == 401


async def test_session_no_auth_header(client):
    response = await client.post("/v1/sessions", json={})

    # HTTPBearer returns 401 when no Authorization header is present
    assert response.status_code == 401


async def test_session_timestamps_with_timezone(app_with_state, settings: Settings):
    """Verify session timestamps are converted to configured timezone."""
    # Override timezone to Europe/Vienna (UTC+2 in summer)
    settings.timezone = "Europe/Vienna"

    application, _db, _agent = app_with_state
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create a session
        response = await ac.post("/v1/sessions", headers=HEADERS, json={"name": "TZ Test"})
        assert response.status_code == 201
        data = response.json()

        # created_at should have +02:00 offset (CEST in April)
        created_at = data["created_at"]
        assert "+02:00" in created_at

        # List sessions — should also have converted timestamps
        response = await ac.get("/v1/sessions", headers=HEADERS)
        assert response.status_code == 200
        sessions = response.json()
        assert len(sessions) >= 1
        assert "+02:00" in sessions[0]["created_at"]

        # Get session detail — messages should also be converted
        response = await ac.get(f"/v1/sessions/{data['id']}", headers=HEADERS)
        assert response.status_code == 200
        detail = response.json()
        assert "+02:00" in detail["created_at"]


async def test_session_timestamps_utc_by_default(client):
    """Verify timestamps are UTC when no timezone is configured."""
    response = await client.post("/v1/sessions", headers=HEADERS, json={"name": "UTC Test"})
    assert response.status_code == 201
    data = response.json()

    # Default timezone is UTC — timestamps should have +00:00
    assert "+00:00" in data["created_at"]
    assert "+00:00" in data["updated_at"]
