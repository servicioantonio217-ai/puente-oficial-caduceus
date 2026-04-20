"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Request

from g2_bridge.models import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request) -> HealthResponse:
    """Basic health check — always returns 200 if the server is running.

    Exposes the bridge's agent_timeout so that the app can align its
    request timeout with the server-side wait duration, preventing
    the app from aborting before the bridge finishes processing.

    Exposes streaming_enabled so the app can detect streaming support
    and use streaming endpoints when available.
    """
    settings = request.app.state.settings
    return HealthResponse(
        agent_timeout=settings.agent_timeout,
        streaming_enabled=settings.stream_enabled,
    )
