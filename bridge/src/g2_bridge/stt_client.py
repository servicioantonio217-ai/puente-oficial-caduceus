"""Speech-to-Text client — Whisper-compatible API."""

from __future__ import annotations

import logging

import httpx

from g2_bridge.config import Settings

logger = logging.getLogger(__name__)


class STTClient:
    """Async client for Whisper-compatible STT endpoints."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        headers: dict[str, str] = {}
        if settings.stt_api_key:
            headers["Authorization"] = f"Bearer {settings.stt_api_key}"
        self._client = httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(30.0, connect=5.0),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def transcribe(self, audio_data: bytes, filename: str = "audio.wav") -> str:
        """Send audio to STT endpoint and return transcript text.

        Uses the Whisper API format:
        POST /audio/transcriptions with multipart form: file + model.
        """
        files = {"file": (filename, audio_data, "audio/wav")}
        data = {"model": "whisper-1", "response_format": "text"}

        logger.info("Sending audio to STT (%d bytes)", len(audio_data))
        response = await self._client.post(
            self.settings.stt_api_url,
            files=files,
            data=data,
        )

        if response.status_code != 200:
            logger.error("STT returned %d: %s", response.status_code, response.text)
            response.raise_for_status()

        transcript = response.text.strip()
        logger.info("STT transcript: %s", transcript[:100])
        return transcript
