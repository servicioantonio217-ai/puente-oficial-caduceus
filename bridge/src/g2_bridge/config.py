"""Configuration via environment variables."""

from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic_settings import BaseSettings, SettingsConfigDict


def _resolve_tz(tz_name: str) -> ZoneInfo | None:
    """Resolve a timezone name to a ZoneInfo object.

    Returns None for empty/UTC (caller uses UTC directly).
    Raises ValueError for invalid timezone names.
    """
    if not tz_name or tz_name.upper() == "UTC":
        return None
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError as exc:
        msg = f"Invalid timezone: {tz_name!r}"
        raise ValueError(msg) from exc


class Settings(BaseSettings):
    """Bridge configuration. All values can be set via environment variables."""

    model_config = SettingsConfigDict(env_prefix="G2_", env_file=".env", env_file_encoding="utf-8")

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Auth — client token (phone → bridge)
    bridge_token: str = ""  # G2_BRIDGE_TOKEN — required

    # Auth — AI Agent API key (bridge → agent)
    agent_api_key: str = ""  # G2_AGENT_API_KEY — required
    agent_api_url: str = "http://localhost:8642/v1"  # G2_AGENT_API_URL

    # STT (Speech-to-Text)
    stt_api_url: str = ""  # G2_STT_API_URL — e.g. http://localhost:8080/v1/audio/transcriptions
    stt_api_key: str = ""  # G2_STT_API_KEY — optional, if STT endpoint requires auth
    stt_model: str = "whisper-1"  # G2_STT_MODEL — model name sent to STT endpoint

    # Storage
    database_path: str = "/data/g2_bridge.db"  # G2_DATABASE_PATH

    # AI Agent behavior
    agent_instructions: str = ""  # G2_AGENT_INSTRUCTIONS — optional system prompt for the agent

    # Response adaptation
    max_response_chars: int = 500  # G2_MAX_RESPONSE_CHARS
    max_audio_bytes: int = 5 * 1024 * 1024  # G2_MAX_AUDIO_BYTES — 5 MB limit

    # Conversation context
    max_context_messages: int = 50  # G2_MAX_CONTEXT_MESSAGES — max history sent to agent

    # Display
    timezone: str = "UTC"  # G2_TIMEZONE — IANA timezone for timestamps (e.g. Europe/Vienna)

    def model_post_init(self, __context: object) -> None:
        """Validate timezone setting after model initialization."""
        _resolve_tz(self.timezone)  # Raises ValueError if invalid

    @property
    def is_configured(self) -> bool:
        """Check if required settings are present."""
        return bool(self.bridge_token and self.agent_api_key)

    @property
    def stt_configured(self) -> bool:
        """Check if STT endpoint is configured."""
        return bool(self.stt_api_url)

    def convert_utc_to_local(self, utc_iso: str) -> str:
        """Convert a UTC ISO timestamp to the configured local timezone.

        Input: '2026-04-14T20:30:00+00:00' or '2026-04-14T20:30:00.123456+00:00'
        Output: same format but in configured timezone, or unchanged if UTC.
        """
        tz = _resolve_tz(self.timezone)
        if tz is None:
            return utc_iso  # Already UTC or no conversion needed

        dt = datetime.fromisoformat(utc_iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        local_dt = dt.astimezone(tz)
        return local_dt.isoformat()
