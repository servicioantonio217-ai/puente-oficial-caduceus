"""Token-based authentication for client requests."""

from __future__ import annotations

from fastapi import Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from g2_bridge.config import Settings

bearer_scheme: HTTPBearer = HTTPBearer(auto_error=False)


def verify_client_token(credentials: HTTPAuthorizationCredentials, settings: Settings) -> None:
    """Validate the client bearer token against the configured bridge token."""
    if credentials.credentials != settings.bridge_token:
        raise AuthError(status_code=401, detail="Invalid bridge token")


def verify_agent_configured(settings: Settings) -> None:
    """Ensure the agent API key is configured."""
    if not settings.agent_api_key:
        raise AuthError(status_code=503, detail="Agent API key not configured")


class AuthError(Exception):
    """Raised when bearer token validation fails."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail


async def get_authenticated_request(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = None,
) -> Request:
    """FastAPI dependency: validates client token and agent configuration."""
    if credentials is None:
        credentials = await bearer_scheme(request)
    if credentials is None:
        raise AuthError(status_code=401, detail="Missing bearer token")
    settings: Settings = request.app.state.settings
    verify_client_token(credentials, settings)
    verify_agent_configured(settings)
    return request
