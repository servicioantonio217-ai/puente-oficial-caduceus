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
