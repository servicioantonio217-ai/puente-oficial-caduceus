"""AI Agent client — OpenAI Responses API compatible."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from g2_bridge.config import Settings
from g2_bridge.models import AgentResponse, OutputMessage, OutputTextContent

logger = logging.getLogger(__name__)


class AgentClient:
    """Async client for the AI Agent Responses API."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.agent_api_url,
            headers={
                "Authorization": f"Bearer {settings.agent_api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(120.0, connect=10.0),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def send_message(
        self, content: str, conversation_id: str | None = None
    ) -> dict[str, Any]:
        """Send a message to the AI Agent and return the raw response.

        Uses the OpenAI Chat Completions API format:
        POST /chat/completions with { model, messages, stream: false }
        """
        messages: list[dict[str, str]] = []
        if self.settings.agent_instructions:
            messages.append({"role": "system", "content": self.settings.agent_instructions})
        messages.append({"role": "user", "content": content})

        payload: dict[str, Any] = {
            "model": "default",
            "messages": messages,
            "stream": False,
        }

        logger.debug("Sending to agent: %s", payload)
        response = await self._client.post("/chat/completions", json=payload)

        if response.status_code != 200:
            logger.error("Agent returned %d: %s", response.status_code, response.text)
            response.raise_for_status()

        return dict(response.json())

    def parse_response(self, raw: dict[str, Any]) -> AgentResponse:
        """Parse raw agent Chat Completions response into our AgentResponse model."""
        choices = raw.get("choices", [])
        text = ""
        if choices:
            text = choices[0].get("message", {}).get("content", "")

        messages: list[OutputMessage] = []
        if text:
            messages.append(
                OutputMessage(
                    role="assistant",
                    content=[OutputTextContent(text=text)],
                )
            )

        return AgentResponse(
            id=raw.get("id", ""),
            status="completed",
            conversation="",
            output=messages,
            usage=raw.get("usage", {}),
        )
