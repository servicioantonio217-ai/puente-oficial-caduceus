"""Message endpoint — forward text to AI Agent and return response."""

from __future__ import annotations

import logging
import time
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request

from g2_bridge.agent_client import AgentClient
from g2_bridge.auth import (
    AuthError,
    classify_httpx_error,
    verify_agent_configured,
    verify_client_token,
)
from g2_bridge.context import build_history
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

    # Log incoming user message (content length only, not full text)
    logger.info(
        "User message received: session=%s, content_length=%d",
        session_id,
        len(body.content),
        extra={
            "extra_fields": {
                "session_id": session_id,
                "content_length": str(len(body.content)),
            }
        },
    )

    # Load conversation history from DB
    stored_messages = await db.get_messages(session_id)
    history = build_history(stored_messages, settings.max_context_messages)

    logger.debug(
        "Loaded conversation history: session=%s, messages=%d",
        session_id,
        len(history),
        extra={"extra_fields": {"session_id": session_id, "history_count": str(len(history))}},
    )

    # Forward to AI Agent BEFORE storing messages to avoid orphans
    agent_start = time.monotonic()
    try:
        raw_response = await agent.send_message(body.content, history=history)
    except Exception as e:
        agent_latency = time.monotonic() - agent_start
        logger.error(
            "Agent request failed: session=%s, latency=%.1fs — %s",
            session_id,
            agent_latency,
            e,
            extra={"extra_fields": {"session_id": session_id, "latency_s": f"{agent_latency:.1f}"}},
        )
        status_code, detail = classify_httpx_error(e)
        raise AuthError(status_code=status_code, detail=detail) from e

    agent_latency = time.monotonic() - agent_start
    agent_response = agent.parse_response(raw_response)

    # Extract text from response
    response_text = ""
    for msg in agent_response.output:
        for content in msg.content:
            response_text += content.text

    logger.info(
        "Agent response: session=%s, chars=%d, latency=%.1fs",
        session_id,
        len(response_text),
        agent_latency,
        extra={
            "extra_fields": {
                "session_id": session_id,
                "response_chars": str(len(response_text)),
                "latency_s": f"{agent_latency:.1f}",
            }
        },
    )

    # Store both messages only after agent succeeds
    now = _now_iso()
    await db.add_message(str(uuid.uuid4()), session_id, "user", body.content, now)
    await db.update_session_timestamp(session_id, now)

    # Store assistant message (adapted/truncated version)
    original_len = len(response_text)
    adapted_text = truncate_response(response_text, settings.max_response_chars)
    await db.add_message(str(uuid.uuid4()), session_id, "assistant", adapted_text, now)

    # Log truncation if it occurred
    if len(adapted_text) != original_len:
        logger.info(
            "Response adapted: session=%s, %d -> %d chars",
            session_id,
            original_len,
            len(adapted_text),
            extra={
                "extra_fields": {
                    "session_id": session_id,
                    "original_chars": str(original_len),
                    "adapted_chars": str(len(adapted_text)),
                }
            },
        )

    # Adapt response for G2 display
    if agent_response.output:
        adapted_output = agent_response.output.copy()
        for msg in adapted_output:
            msg.content = [type(c)(type="output_text", text=adapted_text) for c in msg.content]
        agent_response.output = adapted_output

    agent_response.conversation = session_id
    return agent_response
