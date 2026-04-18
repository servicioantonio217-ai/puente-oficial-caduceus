"""Speech-to-Text client — Whisper-compatible API."""

from __future__ import annotations

import json
import logging
import time

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

        Handles both plain text and JSON response formats (some providers
        return JSON even when response_format=text is requested).
        """
        files = {"file": (filename, audio_data, "audio/wav")}
        data = {"model": self.settings.stt_model, "response_format": "text"}

        stt_start = time.monotonic()
        logger.debug(
            "Sending audio to STT: %d bytes, model=%s",
            len(audio_data),
            self.settings.stt_model,
        )

        response = await self._client.post(
            self.settings.stt_api_url,
            files=files,
            data=data,
        )
        stt_latency = time.monotonic() - stt_start

        if response.status_code != 200:
            logger.error(
                "STT returned %d: %s",
                response.status_code,
                response.text[:200],
                extra={
                    "extra_fields": {
                        "status_code": str(response.status_code),
                        "stt_latency_s": f"{stt_latency:.1f}",
                    }
                },
            )
            response.raise_for_status()

        raw = response.text.strip()

        # Some providers return JSON even with response_format=text
        # Try to parse and extract the text field
        if raw.startswith("{"):
            try:
                parsed = json.loads(raw)
                transcript = str(parsed.get("text", ""))
            except json.JSONDecodeError:
                transcript = raw
        else:
            transcript = raw

        transcript = transcript.strip()

        logger.info(
            "STT transcript: %s (latency=%.1fs, %d chars)",
            transcript[:100],
            stt_latency,
            len(transcript),
            extra={
                "extra_fields": {
                    "stt_latency_s": f"{stt_latency:.1f}",
                    "transcript_length": str(len(transcript)),
                }
            },
        )
        return transcript
