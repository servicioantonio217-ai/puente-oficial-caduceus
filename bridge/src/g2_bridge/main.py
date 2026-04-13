"""FastAPI application entry point."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from g2_bridge.agent_client import AgentClient
from g2_bridge.auth import AuthError
from g2_bridge.config import Settings
from g2_bridge.database import Database
from g2_bridge.routers import audio, health, messages, sessions
from g2_bridge.stt_client import STTClient

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application startup and shutdown."""
    settings: Settings = app.state.settings

    # Initialize database
    db = Database(settings.database_path)
    await db.connect()
    app.state.db = db
    logger.info("Database connected: %s", settings.database_path)

    # Initialize agent client
    agent = AgentClient(settings)
    app.state.agent = agent
    logger.info("Agent client initialized: %s", settings.agent_api_url)

    # Initialize STT client
    stt = STTClient(settings)
    app.state.stt = stt
    if settings.stt_configured:
        logger.info("STT client initialized: %s", settings.stt_api_url)
    else:
        logger.warning("STT not configured. Set G2_STT_API_URL for voice input.")

    if not settings.is_configured:
        logger.warning("Bridge not fully configured. Set G2_BRIDGE_TOKEN and G2_AGENT_API_KEY.")

    yield

    # Shutdown
    await stt.close()
    await agent.close()
    await db.close()
    logger.info("Shutdown complete")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="G2 Bridge",
        description="Bridge server connecting Even Realities G2 smart glasses to AI agents",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Store settings
    app.state.settings = settings or Settings()

    # Register exception handlers
    @app.exception_handler(AuthError)
    async def auth_exception_handler(request: Request, exc: AuthError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled exception: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    # Register CORS middleware (must be before routers)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(messages.router)
    app.include_router(audio.router)

    return app


# For `uvicorn g2_bridge.main:app` usage
app = create_app()
