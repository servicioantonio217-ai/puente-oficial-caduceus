"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from g2_bridge.models import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic health check — always returns 200 if the server is running."""
    return HealthResponse()
