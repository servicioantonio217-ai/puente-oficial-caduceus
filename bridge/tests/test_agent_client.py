"""Agent client tests — parse_response edge cases."""

from __future__ import annotations

import pytest

from g2_bridge.agent_client import AgentClient
from g2_bridge.config import Settings


class TestParseResponse:
    def setup_method(self):
        self.settings = Settings(agent_api_key="test", agent_api_url="http://localhost:9999/v1")
        self.client = AgentClient(self.settings)

    def teardown_method(self):
        import asyncio

        try:
            loop = asyncio.get_running_loop()
            loop.run_until_complete(self.client.close())
        except RuntimeError:
            asyncio.run(self.client.close())

    def test_parse_normal_response(self):
        raw = {
            "id": "resp_abc",
            "choices": [
                {"message": {"role": "assistant", "content": "Hello!"}, "finish_reason": "stop"},
            ],
            "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7},
        }
        result = self.client.parse_response(raw)
        assert result.id == "resp_abc"
        assert result.status == "completed"
        assert len(result.output) == 1
        assert result.output[0].content[0].text == "Hello!"
        assert result.usage["prompt_tokens"] == 5

    def test_parse_empty_choices(self):
        raw = {"id": "resp_empty", "choices": [], "usage": {}}
        result = self.client.parse_response(raw)
        assert result.id == "resp_empty"
        assert result.output == []

    def test_parse_missing_choices_key(self):
        raw = {"id": "resp_nochoices"}
        result = self.client.parse_response(raw)
        assert result.output == []

    def test_parse_empty_message_content(self):
        raw = {
            "id": "resp_blank",
            "choices": [
                {"message": {"role": "assistant", "content": ""}, "finish_reason": "stop"},
            ],
        }
        result = self.client.parse_response(raw)
        assert result.output == []  # empty content → no output message

    def test_parse_missing_message_content_key(self):
        raw = {
            "id": "resp_nocontent",
            "choices": [{"message": {"role": "assistant"}, "finish_reason": "stop"}],
        }
        result = self.client.parse_response(raw)
        assert result.output == []

    def test_parse_missing_id(self):
        raw = {
            "choices": [
                {"message": {"role": "assistant", "content": "text"}, "finish_reason": "stop"},
            ],
        }
        result = self.client.parse_response(raw)
        assert result.id == ""  # empty string from raw.get

    def test_parse_missing_usage(self):
        raw = {
            "id": "resp_nousage",
            "choices": [
                {"message": {"role": "assistant", "content": "text"}, "finish_reason": "stop"},
            ],
        }
        result = self.client.parse_response(raw)
        # raw.get("usage", {}) returns {} when key is missing
        assert result.usage == {}

    def test_client_uses_configured_url(self):
        """Verify the client is configured with the correct base URL."""
        assert str(self.client._client.base_url) == self.settings.agent_api_url + "/"

    def test_client_has_auth_header(self):
        """Verify the client sends the API key in the Authorization header."""
        expected = f"Bearer {self.settings.agent_api_key}"
        assert self.client._client.headers["Authorization"] == expected

    def test_client_uses_configured_timeout(self):
        """Verify the client uses the configured agent_timeout, not a hardcoded value."""
        # Default Settings has agent_timeout=300.0
        assert self.client._client.timeout.read == 300.0
        assert self.client._client.timeout.connect == 10.0

    def test_client_custom_timeout(self):
        """Verify a custom G2_AGENT_TIMEOUT value is passed through to httpx."""
        settings = Settings(
            agent_api_key="test",
            agent_api_url="http://localhost:9999/v1",
            agent_timeout=600.0,
        )
        client = AgentClient(settings)
        assert client._client.timeout.read == 600.0
        assert client._client.timeout.connect == 10.0


class TestSendMessageWithInstructions:
    @pytest.mark.asyncio
    async def test_send_message_includes_system_prompt(self):
        """When agent_instructions is set, a system message should be included."""
        from unittest.mock import AsyncMock, MagicMock, patch

        settings = Settings(
            agent_api_key="test",
            agent_api_url="http://localhost:9999/v1",
            agent_instructions="You are a helpful assistant.",
        )
        client = AgentClient(settings)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "r",
            "choices": [
                {"message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"},
            ],
            "usage": {},
        }

        with patch.object(
            client._client, "post", new_callable=AsyncMock, return_value=mock_response
        ) as mock_post:
            await client.send_message("Hello")

        call_args = mock_post.call_args
        payload = call_args.kwargs["json"]
        assert payload["messages"][0]["role"] == "system"
        assert payload["messages"][0]["content"] == "You are a helpful assistant."
        assert payload["messages"][1]["role"] == "user"
        await client.close()

    @pytest.mark.asyncio
    async def test_send_message_no_system_prompt_when_empty(self):
        """When agent_instructions is empty, no system message should be included."""
        from unittest.mock import AsyncMock, MagicMock, patch

        settings = Settings(agent_api_key="test", agent_api_url="http://localhost:9999/v1")
        client = AgentClient(settings)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "r",
            "choices": [
                {"message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"},
            ],
            "usage": {},
        }

        with patch.object(
            client._client, "post", new_callable=AsyncMock, return_value=mock_response
        ) as mock_post:
            await client.send_message("Hello")

        call_args = mock_post.call_args
        payload = call_args.kwargs["json"]
        assert all(m["role"] != "system" for m in payload["messages"])
        assert payload["messages"][0]["role"] == "user"
        await client.close()


class TestSendMessageWithHistory:
    @pytest.mark.asyncio
    async def test_send_message_includes_history(self):
        """History messages should appear between system prompt and current message."""
        from unittest.mock import AsyncMock, MagicMock, patch

        settings = Settings(
            agent_api_key="test",
            agent_api_url="http://localhost:9999/v1",
            agent_instructions="You are helpful.",
        )
        client = AgentClient(settings)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "r",
            "choices": [
                {"message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"},
            ],
            "usage": {},
        }

        history = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
            {"role": "user", "content": "How are you?"},
        ]

        with patch.object(
            client._client, "post", new_callable=AsyncMock, return_value=mock_response
        ) as mock_post:
            await client.send_message("Good!", history=history)

        call_args = mock_post.call_args
        payload = call_args.kwargs["json"]
        msgs = payload["messages"]

        # system + 3 history + 1 current = 5
        assert len(msgs) == 5
        assert msgs[0]["role"] == "system"
        assert msgs[1]["content"] == "Hi"
        assert msgs[2]["content"] == "Hello!"
        assert msgs[3]["content"] == "How are you?"
        assert msgs[4]["role"] == "user"
        assert msgs[4]["content"] == "Good!"
        await client.close()

    @pytest.mark.asyncio
    async def test_send_message_without_history(self):
        """When history is None, only system prompt + user message are sent."""
        from unittest.mock import AsyncMock, MagicMock, patch

        settings = Settings(agent_api_key="test", agent_api_url="http://localhost:9999/v1")
        client = AgentClient(settings)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "r",
            "choices": [
                {"message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"},
            ],
            "usage": {},
        }

        with patch.object(
            client._client, "post", new_callable=AsyncMock, return_value=mock_response
        ) as mock_post:
            await client.send_message("Hello", history=None)

        call_args = mock_post.call_args
        payload = call_args.kwargs["json"]
        assert len(payload["messages"]) == 1
        assert payload["messages"][0]["role"] == "user"
        await client.close()

    @pytest.mark.asyncio
    async def test_send_message_empty_history(self):
        """Empty history list is treated same as None."""
        from unittest.mock import AsyncMock, MagicMock, patch

        settings = Settings(agent_api_key="test", agent_api_url="http://localhost:9999/v1")
        client = AgentClient(settings)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "r",
            "choices": [
                {"message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"},
            ],
            "usage": {},
        }

        with patch.object(
            client._client, "post", new_callable=AsyncMock, return_value=mock_response
        ) as mock_post:
            await client.send_message("Hello", history=[])

        call_args = mock_post.call_args
        payload = call_args.kwargs["json"]
        assert len(payload["messages"]) == 1
        assert payload["messages"][0]["role"] == "user"
        await client.close()
