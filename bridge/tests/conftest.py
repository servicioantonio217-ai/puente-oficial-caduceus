"""Shared test fixtures."""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient

from g2_bridge.config import Settings
from g2_bridge.main import create_app


@asynccontextmanager
async def _lifespan_test(settings: Settings):
    """Minimal lifespan for tests — sets up db and agent on app state."""
    from g2_bridge.agent_client import AgentClient
    from g2_bridge.database import Database

    db = Database(settings.database_path)
    await db.connect()
    agent = AgentClient(settings)
    yield db, agent
    await agent.close()
    await db.close()


@pytest.fixture
def settings() -> Settings:
    return Settings(
        bridge_token="test-client-token",
        agent_api_key="test-agent-key",
        agent_api_url="http://localhost:9999/v1",
        database_path=":memory:",
    )


@pytest.fixture
async def app_with_state(settings: Settings):
    """Create app with db and agent initialized. Returns (app, db, agent)."""
    application = create_app(settings)
    async with _lifespan_test(settings) as (db, agent):
        application.state.db = db
        application.state.agent = agent
        yield application, db, agent


@pytest.fixture
async def client(app_with_state):
    """HTTP client with db and agent initialized."""
    application, _db, _agent = app_with_state
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
