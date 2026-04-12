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

    # Storage
    database_path: str = "/data/g2_bridge.db"  # G2_DATABASE_PATH

    # Response adaptation
    max_response_chars: int = 500  # G2_MAX_RESPONSE_CHARS

    @property
    def is_configured(self) -> bool:
        """Check if required settings are present."""
        return bool(self.bridge_token and self.agent_api_key)
