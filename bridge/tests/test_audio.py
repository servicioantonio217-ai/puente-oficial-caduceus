"""Tests for the audio endpoint and STT client."""

from unittest.mock import AsyncMock

import httpx
import pytest
from httpx import Request, Response

from g2_bridge.config import Settings
from g2_bridge.models import AudioResponse
from g2_bridge.stt_client import STTClient

# --- STT Client Tests ---


class TestSTTClient:
    def test_stt_configured_true(self):
        settings = Settings(stt_api_url="http://localhost:8080/v1/audio/transcriptions")
        assert settings.stt_configured is True

    def test_stt_configured_false(self):
        settings = Settings()
        assert settings.stt_configured is False

    def test_stt_configured_with_key(self):
        settings = Settings(stt_api_url="http://stt:8080/transcribe", stt_api_key="secret")
        assert settings.stt_configured is True

    @pytest.mark.asyncio
    async def test_transcribe_returns_text(self):
        settings = Settings(stt_api_url="http://localhost:8080/v1/audio/transcriptions")
        client = STTClient(settings)

        mock_response = Response(200, text="hello world")
        client._client = AsyncMock()
        client._client.post = AsyncMock(return_value=mock_response)

        result = await client.transcribe(b"\x00\x00" * 100, "test.wav")
        assert result == "hello world"
        client._client.post.assert_called_once()
        call_args = client._client.post.call_args
        assert "files" in call_args.kwargs
        assert "data" in call_args.kwargs

    @pytest.mark.asyncio
    async def test_transcribe_strips_whitespace(self):
        settings = Settings(stt_api_url="http://localhost:8080/v1/audio/transcriptions")
        client = STTClient(settings)

        mock_response = Response(200, text="  hello world  \n")
        client._client = AsyncMock()
        client._client.post = AsyncMock(return_value=mock_response)

        result = await client.transcribe(b"\x00\x00" * 100, "test.wav")
        assert result == "hello world"

    @pytest.mark.asyncio
    async def test_transcribe_error_propagates(self):
        settings = Settings(stt_api_url="http://localhost:8080/v1/audio/transcriptions")
        client = STTClient(settings)

        mock_request = Request("POST", "http://localhost:8080/v1/audio/transcriptions")
        mock_response = Response(500, request=mock_request, text="Internal Server Error")
        client._client = AsyncMock()
        client._client.post = AsyncMock(return_value=mock_response)

        with pytest.raises(httpx.HTTPStatusError):
            await client.transcribe(b"\x00\x00" * 100, "test.wav")

    @pytest.mark.asyncio
    async def test_transcribe_handles_json_response(self):
        """Some providers return JSON even with response_format=text."""
        settings = Settings(stt_api_url="http://localhost:8080/v1/audio/transcriptions")
        client = STTClient(settings)

        mock_response = Response(200, text='{"text":"hello world","usage":null}')
        client._client = AsyncMock()
        client._client.post = AsyncMock(return_value=mock_response)

        result = await client.transcribe(b"\x00\x00" * 100, "test.wav")
        assert result == "hello world"

    @pytest.mark.asyncio
    async def test_transcribe_handles_empty_json_text(self):
        """JSON response with empty text field returns empty string."""
        settings = Settings(stt_api_url="http://localhost:8080/v1/audio/transcriptions")
        client = STTClient(settings)

        mock_response = Response(200, text='{"text":"","usage":null,"segments":[]}')
        client._client = AsyncMock()
        client._client.post = AsyncMock(return_value=mock_response)

        result = await client.transcribe(b"\x00\x00" * 100, "test.wav")
        assert result == ""


# --- Audio Response Model Tests ---


class TestAudioResponse:
    def test_audio_response_model(self):
        from g2_bridge.models import AgentResponse

        resp = AudioResponse(
            transcript="hello",
            response=AgentResponse(id="resp_123", conversation="sess_1"),
        )
        assert resp.transcript == "hello"
        assert resp.response.id == "resp_123"

    def test_audio_response_defaults(self):
        from g2_bridge.models import AgentResponse

        resp = AudioResponse(
            transcript="test",
            response=AgentResponse(),
        )
        assert resp.response.id  # auto-generated
        assert resp.response.status == "completed"
