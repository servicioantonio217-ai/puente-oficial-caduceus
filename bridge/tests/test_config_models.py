"""Config and models tests."""

from __future__ import annotations

from g2_bridge.config import Settings
from g2_bridge.models import (
    AgentResponse,
    AudioResponse,
    CreateSessionRequest,
    MessageResponse,
    MessageRole,
    OutputMessage,
    OutputTextContent,
    SessionDetailResponse,
    SessionResponse,
)


class TestSettings:
    def test_default_values(self):
        s = Settings()
        assert s.host == "0.0.0.0"
        assert s.port == 8643
        assert s.bridge_token == ""
        assert s.agent_api_key == ""
        assert s.agent_api_url == "http://localhost:8642/v1"
        assert s.stt_api_url == ""
        assert s.stt_api_key == ""
        assert s.stt_model == "whisper-1"
        assert s.database_path == "/data/g2_bridge.db"
        assert s.agent_instructions == ""
        assert s.max_response_chars == 500
        assert s.max_audio_bytes == 5 * 1024 * 1024

    def test_is_configured_both_set(self):
        s = Settings(bridge_token="tok", agent_api_key="key")
        assert s.is_configured is True

    def test_is_configured_missing_token(self):
        s = Settings(bridge_token="", agent_api_key="key")
        assert s.is_configured is False

    def test_is_configured_missing_key(self):
        s = Settings(bridge_token="tok", agent_api_key="")
        assert s.is_configured is False

    def test_is_configured_both_empty(self):
        s = Settings()
        assert s.is_configured is False

    def test_stt_configured_with_url(self):
        s = Settings(stt_api_url="http://stt:8080/transcribe")
        assert s.stt_configured is True

    def test_stt_configured_without_url(self):
        s = Settings()
        assert s.stt_configured is False

    def test_env_prefix(self):
        """Verify the env_prefix is G2_."""
        assert Settings.model_config.get("env_prefix") == "G2_"


class TestModels:
    def test_message_role_values(self):
        assert MessageRole.USER == "user"
        assert MessageRole.ASSISTANT == "assistant"

    def test_create_session_request_defaults(self):
        req = CreateSessionRequest()
        assert req.name is None

    def test_create_session_request_with_name(self):
        req = CreateSessionRequest(name="My Chat")
        assert req.name == "My Chat"

    def test_session_response(self):
        resp = SessionResponse(
            id="s1",
            name="Test",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
            message_count=0,
        )
        assert resp.id == "s1"

    def test_message_response(self):
        ts = "2026-01-01T00:00:00+00:00"
        resp = MessageResponse(id="m1", role=MessageRole.USER, content="Hi", created_at=ts)
        assert resp.role == "user"

    def test_session_detail_response(self):
        ts = "2026-01-01T00:00:00+00:00"
        msg = MessageResponse(id="m1", role=MessageRole.USER, content="Hi", created_at=ts)
        resp = SessionDetailResponse(
            id="s1",
            name="Test",
            created_at=ts,
            updated_at=ts,
            message_count=2,
            messages=[msg],
        )
        assert len(resp.messages) == 1

    def test_agent_response_auto_id(self):
        resp = AgentResponse()
        assert resp.id.startswith("resp_")
        assert resp.status == "completed"
        assert resp.output == []
        assert resp.usage == {"input_tokens": 0, "output_tokens": 0}

    def test_agent_response_custom_id(self):
        resp = AgentResponse(id="custom_id")
        assert resp.id == "custom_id"

    def test_output_text_content_defaults(self):
        content = OutputTextContent(text="hello")
        assert content.type == "output_text"
        assert content.text == "hello"

    def test_output_message_defaults(self):
        msg = OutputMessage(content=[OutputTextContent(text="hi")])
        assert msg.type == "message"
        assert msg.role == "assistant"

    def test_audio_response(self):
        resp = AudioResponse(
            transcript="hello",
            response=AgentResponse(id="r1"),
        )
        assert resp.transcript == "hello"
        assert resp.response.id == "r1"
