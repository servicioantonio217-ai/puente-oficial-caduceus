"""Auth module tests — verify_client_token, verify_agent_configured, get_authenticated_request."""

from __future__ import annotations

import pytest

from g2_bridge.auth import AuthError, verify_agent_configured, verify_client_token
from g2_bridge.config import Settings


class TestVerifyClientToken:
    def test_valid_token(self):
        settings = Settings(bridge_token="secret-token")
        from fastapi.security import HTTPAuthorizationCredentials

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="secret-token")
        verify_client_token(credentials, settings)  # should not raise

    def test_invalid_token(self):
        settings = Settings(bridge_token="secret-token")
        from fastapi.security import HTTPAuthorizationCredentials

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="wrong-token")
        with pytest.raises(AuthError) as exc_info:
            verify_client_token(credentials, settings)
        assert exc_info.value.status_code == 401
        assert "Invalid bridge token" in exc_info.value.detail

    def test_empty_configured_token(self):
        settings = Settings(bridge_token="")
        from fastapi.security import HTTPAuthorizationCredentials

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="")
        verify_client_token(credentials, settings)  # empty matches empty

    def test_nonempty_token_vs_empty_config(self):
        settings = Settings(bridge_token="")
        from fastapi.security import HTTPAuthorizationCredentials

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="some-token")
        with pytest.raises(AuthError) as exc_info:
            verify_client_token(credentials, settings)
        assert exc_info.value.status_code == 401


class TestVerifyAgentConfigured:
    def test_agent_configured(self):
        settings = Settings(agent_api_key="key-123")
        verify_agent_configured(settings)  # should not raise

    def test_agent_not_configured(self):
        settings = Settings(agent_api_key="")
        with pytest.raises(AuthError) as exc_info:
            verify_agent_configured(settings)
        assert exc_info.value.status_code == 503
        assert "Agent API key not configured" in exc_info.value.detail


class TestGetAuthenticatedRequest:
    """get_authenticated_request is a FastAPI dependency — fully tested indirectly via
    router tests (test_sessions.py, test_messages.py, test_audio_endpoint.py).
    These tests cover the lower-level auth functions it delegates to."""

    @pytest.mark.asyncio
    async def test_credentials_none_then_bearer_none_raises(self):
        """When both credentials=None and bearer_scheme returns None → 401."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from g2_bridge.auth import get_authenticated_request

        request = MagicMock()
        mock_bearer = AsyncMock(return_value=None)
        with patch("g2_bridge.auth.bearer_scheme", new_callable=lambda: lambda r: mock_bearer(r)):
            with pytest.raises(AuthError) as exc_info:
                await get_authenticated_request(request, credentials=None)
            assert exc_info.value.status_code == 401
            assert "Missing bearer token" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_valid_credentials_pass_through(self):
        """When valid credentials are passed, function accesses request.app.state.settings."""
        from unittest.mock import MagicMock

        from fastapi.security import HTTPAuthorizationCredentials

        from g2_bridge.auth import get_authenticated_request

        settings = Settings(bridge_token="tok", agent_api_key="key")

        # Build a mock request chain: request.app.state.settings
        mock_state = MagicMock()
        mock_state.settings = settings
        mock_app = MagicMock()
        mock_app.state = mock_state
        request = MagicMock()
        request.app = mock_app

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="tok")
        result = await get_authenticated_request(request, credentials=credentials)
        assert result is request  # returns the request object
