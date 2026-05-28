"""AI Agent client — OpenAI Chat Completions API compatible."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from g2_bridge.config import Settings
from g2_bridge.models import AgentResponse, OutputMessage, OutputTextContent

logger = logging.getLogger(__name__)


class AgentClient:
    """Async client for the AI Agent Chat Completions API."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.agent_api_url,
            headers={
                "Authorization": f"Bearer {settings.agent_api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(settings.agent_timeout, connect=10.0),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def send_message(
        self,
        content: str,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """Send a message to the AI Agent with conversation history.

        Uses the OpenAI Chat Completions API format:
        POST /chat/completions with { model, messages, stream: false }

        Args:
            content: The current user message.
            history: Prior messages as [{"role": "user"|"assistant", "content": "..."}].
                     These are included before the current message so the agent
                     has full conversation context.
        """
        messages: list[dict[str, str]] = []
        if self.settings.agent_instructions:
            messages.append({"role": "system", "content": self.settings.agent_instructions})

        # Include conversation history (prior turns)
        if history:
            messages.extend(history)

        # Current user message
        messages.append({"role": "user", "content": content})

        payload: dict[str, Any] = {
            "model": "perplexity/sonar",
            "messages": messages,
            "stream": False,
        }

        logger.debug(
            "Sending to agent: %d history messages + 1 current",
            len(history) if history else 0,
            extra={
                "extra_fields": {
                    "history_count": str(len(history) if history else 0),
                    "total_messages": str(len(messages)),
                }
            },
        )
        response = await self._client.post("/chat/completions", json=payload)

        if response.status_code != 200:
            logger.error(
                "Agent returned %d: %s",
                response.status_code,
                response.text[:200],
                extra={
                    "extra_fields": {
                        "status_code": str(response.status_code),
                        "body": response.text[:200],
                    }
                },
            )
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
