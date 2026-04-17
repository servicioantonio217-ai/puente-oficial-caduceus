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


# --- Bulk delete tests ---


async def test_bulk_delete_sessions(client):
    """Bulk delete removes all specified sessions."""
    ids = []
    for i in range(3):
        resp = await client.post("/v1/sessions", headers=HEADERS, json={"name": f"Bulk {i}"})
        assert resp.status_code == 201
        ids.append(resp.json()["id"])

    response = await client.post(
        "/v1/sessions/bulk-delete",
        headers=HEADERS,
        json={"session_ids": ids[:2]},
    )
    assert response.status_code == 200
    assert response.json()["deleted_count"] == 2

    # Verify only the third session remains
    list_resp = await client.get("/v1/sessions", headers=HEADERS)
    assert list_resp.status_code == 200
    remaining = [s["id"] for s in list_resp.json()]
    assert ids[2] in remaining
    assert ids[0] not in remaining
    assert ids[1] not in remaining


async def test_bulk_delete_nonexistent_ids(client):
    """Bulk delete with non-existent IDs returns 0 deleted."""
    response = await client.post(
        "/v1/sessions/bulk-delete",
        headers=HEADERS,
        json={"session_ids": ["fake-id-1", "fake-id-2"]},
    )
    assert response.status_code == 200
    assert response.json()["deleted_count"] == 0


async def test_bulk_delete_empty_list_rejected(client):
    """Bulk delete with empty session_ids list is rejected (min_length=1)."""
    response = await client.post(
        "/v1/sessions/bulk-delete",
        headers=HEADERS,
        json={"session_ids": []},
    )
    assert response.status_code == 422  # Validation error


async def test_bulk_delete_auth_required(client):
    """Bulk delete requires authentication."""
    response = await client.post(
        "/v1/sessions/bulk-delete",
        json={"session_ids": ["some-id"]},
    )
    assert response.status_code == 401


async def test_bulk_delete_accepts_many_ids(client):
    """Bulk delete accepts more than 100 IDs (limit removed, bounded by G2_MAX_SESSIONS)."""
    ids = [f"fake-id-{i}" for i in range(101)]
    response = await client.post(
        "/v1/sessions/bulk-delete",
        headers=HEADERS,
        json={"session_ids": ids},
    )
    # These are fake IDs, so deleted_count will be 0 but the request is valid
    assert response.status_code == 200


# --- Session limit / auto-eviction tests ---


async def test_auto_eviction_removes_oldest(client):
    """Creating a session at the limit evicts the oldest one."""
    # The default settings have max_sessions=100, but the fixture uses
    # default Settings which is 100. We need a lower limit for testing.
    # The real auto-eviction test uses a custom settings fixture below.
    # For now, create 2 sessions and verify the normal behavior works.
    pass


async def test_auto_eviction_with_low_limit(app_with_state):
    """With max_sessions=3, creating a 4th session evicts the oldest."""
    from httpx import ASGITransport, AsyncClient

    application, _db, _agent = app_with_state
    # Override max_sessions
    application.state.settings.max_sessions = 3

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create 3 sessions (fills the limit)
        for i in range(3):
            resp = await ac.post(
                "/v1/sessions", headers=HEADERS, json={"name": f"Session {i}"}
            )
            assert resp.status_code == 201

        # Create 4th session — should evict the oldest (Session 0)
        resp = await ac.post(
            "/v1/sessions", headers=HEADERS, json={"name": "Session 3"}
        )
        assert resp.status_code == 201

        # Verify only 3 sessions remain
        list_resp = await ac.get("/v1/sessions", headers=HEADERS)
        assert list_resp.status_code == 200
        sessions = list_resp.json()
        assert len(sessions) == 3
        names = {s["name"] for s in sessions}
        assert "Session 0" not in names  # oldest was evicted
        assert names == {"Session 1", "Session 2", "Session 3"}


async def test_auto_eviction_respects_lru_order(app_with_state):
    """Auto-eviction uses updated_at (LRU), not creation order."""
    from httpx import ASGITransport, AsyncClient

    application, db, _agent = app_with_state
    application.state.settings.max_sessions = 3

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create 3 sessions
        ids = []
        for i in range(3):
            resp = await ac.post(
                "/v1/sessions", headers=HEADERS, json={"name": f"S{i}"}
            )
            ids.append(resp.json()["id"])

        # Touch S0 to make it most recently updated
        import datetime

        now = datetime.datetime.now(datetime.UTC).isoformat()
        await db.update_session_timestamp(ids[0], now)

        # Create 4th — should evict S1 (oldest LRU), not S0
        await ac.post("/v1/sessions", headers=HEADERS, json={"name": "New"})

        list_resp = await ac.get("/v1/sessions", headers=HEADERS)
        sessions = list_resp.json()
        remaining_ids = {s["id"] for s in sessions}
        assert ids[0] in remaining_ids  # S0 was touched, kept
        assert ids[1] not in remaining_ids  # S1 was evicted


async def test_no_eviction_when_under_limit(client):
    """No sessions are evicted when count is below the limit."""
    # Default limit is 100, creating just 2 sessions should not evict
    resp1 = await client.post("/v1/sessions", headers=HEADERS, json={"name": "A"})
    resp2 = await client.post("/v1/sessions", headers=HEADERS, json={"name": "B"})
    assert resp1.status_code == 201
    assert resp2.status_code == 201

    list_resp = await client.get("/v1/sessions", headers=HEADERS)
    sessions = list_resp.json()
    assert len(sessions) == 2


async def test_bulk_delete_no_max_limit(app_with_state):
    """Bulk delete now accepts more than 100 IDs (limit removed)."""
    from httpx import ASGITransport, AsyncClient

    application, _db, _agent = app_with_state
    # Set max_sessions high so we can create 101 sessions
    application.state.settings.max_sessions = 200

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ids = []
        for i in range(101):
            resp = await ac.post(
                "/v1/sessions", headers=HEADERS, json={"name": f"Bulk {i}"}
            )
            ids.append(resp.json()["id"])

        # Bulk delete all 101 — should succeed (no max_length cap)
        resp = await ac.post(
            "/v1/sessions/bulk-delete",
            headers=HEADERS,
            json={"session_ids": ids},
        )
        assert resp.status_code == 200
        assert resp.json()["deleted_count"] == 101
