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

        Uses the OpenAI Responses API format:
        POST /v1/responses with { input, conversation, stream: false }
        """
        payload: dict[str, Any] = {
            "input": content,
            "stream": False,
        }
        if conversation_id:
            payload["conversation"] = conversation_id

        logger.debug("Sending to agent: %s", payload)
        response = await self._client.post("/responses", json=payload)

        if response.status_code != 200:
            logger.error("Agent returned %d: %s", response.status_code, response.text)
            response.raise_for_status()

        return response.json()

    def parse_response(self, raw: dict[str, Any]) -> AgentResponse:
        """Parse raw agent response into our AgentResponse model."""
        conversation_id = raw.get("conversation", "")
        output_items = raw.get("output", [])
        usage = raw.get("usage", {})

        messages: list[OutputMessage] = []
        for item in output_items:
            if item.get("type") == "message":
                content_items = []
                for c in item.get("content", []):
                    if c.get("type") == "output_text":
                        content_items.append(OutputTextContent(text=c["text"]))
                if content_items:
                    messages.append(
                        OutputMessage(role=item.get("role", "assistant"), content=content_items)
                    )

        return AgentResponse(
            id=raw.get("id", ""),
            status=raw.get("status", "completed"),
            conversation=conversation_id,
            output=messages,
            usage=usage,
        )
