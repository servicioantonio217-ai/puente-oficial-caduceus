"""Message endpoint — forward text to AI Agent and return response."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request

from g2_bridge.agent_client import AgentClient
from g2_bridge.auth import AuthError, verify_agent_configured, verify_client_token
from g2_bridge.database import Database
from g2_bridge.models import AgentResponse, SendMessageRequest
from g2_bridge.response import truncate_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/sessions", tags=["messages"])


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


@router.post("/{session_id}/message", response_model=AgentResponse)
async def send_message(
    request: Request, session_id: str, body: SendMessageRequest
) -> AgentResponse:
    """Send a text message to the AI Agent and return the adapted response."""
    from fastapi.security import HTTPBearer

    # Auth
    credentials = await HTTPBearer(auto_error=False)(request)
    if credentials is None:
        raise AuthError(status_code=401, detail="Missing bearer token")
    settings = request.app.state.settings
    verify_client_token(credentials, settings)
    verify_agent_configured(settings)

    db: Database = request.app.state.db
    agent: AgentClient = request.app.state.agent

    # Verify session exists
    session = await db.get_session(session_id)
    if session is None:
        raise AuthError(status_code=404, detail="Session not found")

    # Store user message
    now = _now_iso()
    await db.add_message(str(uuid.uuid4()), session_id, "user", body.content, now)
    await db.update_session_timestamp(session_id, now)

    # Forward to AI Agent
    conversation_id = await db.get_agent_conversation_id(session_id)
    try:
        raw_response = await agent.send_message(body.content, conversation_id)
    except Exception as e:
        logger.error("Agent request failed: %s", e)
        raise AuthError(status_code=502, detail=f"Agent request failed: {e}") from e

    agent_response = agent.parse_response(raw_response)

    # Extract text from response
    response_text = ""
    for msg in agent_response.output:
        for content in msg.content:
            response_text += content.text

    # Store assistant message (adapted/truncated version)
    adapted_text = truncate_response(response_text, settings.max_response_chars)
    await db.add_message(str(uuid.uuid4()), session_id, "assistant", adapted_text, now)

    # Adapt response for G2 display
    if agent_response.output:
        adapted_output = agent_response.output.copy()
        for msg in adapted_output:
            msg.content = [type(c)(type="output_text", text=adapted_text) for c in msg.content]
        agent_response.output = adapted_output

    agent_response.conversation = session_id
    return agent_response
