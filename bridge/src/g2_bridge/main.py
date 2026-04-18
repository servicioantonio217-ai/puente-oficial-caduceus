"""FastAPI application entry point."""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from g2_bridge.agent_client import AgentClient
from g2_bridge.auth import AuthError
from g2_bridge.config import Settings
from g2_bridge.database import Database
from g2_bridge.lock import SessionLock
from g2_bridge.logging_config import configure_logging
from g2_bridge.routers import audio, health, messages, sessions
from g2_bridge.stt_client import STTClient

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application startup and shutdown."""
    settings: Settings = app.state.settings

    # Configure structured logging from settings
    configure_logging(
        log_level=settings.log_level,
        log_format=settings.log_format,
    )

    # Startup summary — no secrets
    logger.info(
        "G2 Bridge starting on %s:%d",
        settings.host,
        settings.port,
    )
    logger.info(
        "Database: %s",
        settings.database_path,
        extra={"extra_fields": {"database": settings.database_path}},
    )
    logger.info(
        "Agent API: %s",
        settings.agent_api_url,
        extra={"extra_fields": {"agent_api_url": settings.agent_api_url}},
    )
    logger.info(
        "STT configured: %s",
        settings.stt_configured,
        extra={
            "extra_fields": {
                "stt": str(settings.stt_configured),
                **(
                    {"stt_model": settings.stt_model, "stt_api_url": settings.stt_api_url}
                    if settings.stt_configured
                    else {}
                ),
            }
        },
    )
    logger.info(
        "Auth: bridge_token configured (%d chars)",
        len(settings.bridge_token),
        extra={"extra_fields": {"token_length": str(len(settings.bridge_token))}},
    )
    logger.info(
        "Log level: %s, format: %s",
        settings.log_level,
        settings.log_format,
    )

    # Initialize database
    db = Database(settings.database_path)
    await db.connect()
    app.state.db = db
    logger.info("Database connected: %s", settings.database_path)

    # Initialize per-session lock for serializing concurrent requests (issue #58)
    session_lock = SessionLock()
    app.state.session_lock = session_lock

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
    logger.info("Shutting down G2 Bridge...")
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
        # Log auth failures with context but no secrets
        if exc.status_code == 401:
            logger.warning(
                "Auth failed: %s (%s %s from %s)",
                exc.detail,
                request.method,
                request.url.path,
                request.client.host if request.client else "unknown",
            )
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error(
            "Unhandled exception: %s %s — %s",
            request.method,
            request.url.path,
            exc,
            exc_info=True,
            extra={"extra_fields": {"method": request.method, "path": request.url.path}},
        )
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

    # Request logging + timing middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip health endpoint from request logging (too noisy)
        if request.url.path == "/health":
            return await call_next(request)

        start = time.monotonic()
        client_ip = request.client.host if request.client else "unknown"

        response = await call_next(request)

        duration_ms = (time.monotonic() - start) * 1000

        extra: dict[str, str] = {
            "method": request.method,
            "path": request.url.path,
            "status": str(response.status_code),
            "duration_ms": f"{duration_ms:.0f}",
            "client_ip": client_ip,
        }

        # Extract session_id from path if present (/v1/sessions/{id}/...)
        parts = request.url.path.strip("/").split("/")
        if len(parts) >= 3 and parts[0] == "v1" and parts[1] == "sessions":
            extra["session_id"] = parts[2]

        log_level = logging.WARNING if duration_ms > 5000 else logging.DEBUG
        logger.log(
            log_level,
            "%s %s -> %d (%dms)",
            request.method,
            request.url.path,
            response.status_code,
            int(duration_ms),
            extra={"extra_fields": extra},
        )

        return response

    # Register routers
    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(messages.router)
    app.include_router(audio.router)

    return app


# For `uvicorn g2_bridge.main:app` usage
app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = Settings()
    uvicorn.run("g2_bridge.main:app", host=settings.host, port=settings.port)
