"""Configuration via environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    @property
    def is_configured(self) -> bool:
        """Check if required settings are present."""
        return bool(self.bridge_token and self.agent_api_key)

    @property
    def stt_configured(self) -> bool:
        """Check if STT endpoint is configured."""
        return bool(self.stt_api_url)
