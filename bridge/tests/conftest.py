"""Shared test fixtures."""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient

from g2_bridge.config import Settings
from g2_bridge.main import create_app


@asynccontextmanager
async def _lifespan_test(settings: Settings):
    """Minimal lifespan for tests — sets up db, agent, and session lock on app state."""
    from g2_bridge.agent_client import AgentClient
    from g2_bridge.database import Database
    from g2_bridge.lock import SessionLock

    db = Database(settings.database_path)
    await db.connect()
    agent = AgentClient(settings)
    session_lock = SessionLock()
    yield db, agent, session_lock
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
    """Create app with db, agent, and session lock initialized. Returns (app, db, agent)."""
    application = create_app(settings)
    async with _lifespan_test(settings) as (db, agent, session_lock):
        application.state.db = db
        application.state.agent = agent
        application.state.session_lock = session_lock
        yield application, db, agent


@pytest.fixture
async def client(app_with_state):
    """HTTP client with db and agent initialized."""
    application, _db, _agent = app_with_state
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
