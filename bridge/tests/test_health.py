"""Health endpoint tests."""

from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from g2_bridge.config import Settings
from g2_bridge.main import create_app


async def test_health_returns_ok():
    """Health endpoint works even without database/agent (no auth needed)."""
    app = create_app(Settings(bridge_token="", agent_api_key=""))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


async def test_health_exposes_default_agent_timeout():
    """Health endpoint returns the default agent_timeout (300s)."""
    app = create_app(Settings(bridge_token="", agent_api_key=""))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["agent_timeout"] == 300.0


async def test_health_exposes_custom_agent_timeout():
    """Health endpoint returns the configured agent_timeout value."""
    app = create_app(Settings(bridge_token="", agent_api_key="", agent_timeout=600.0))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["agent_timeout"] == 600.0
