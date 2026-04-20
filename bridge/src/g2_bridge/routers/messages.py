"""Message endpoint — forward text to AI Agent and return response."""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from json import JSONDecodeError

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from g2_bridge.agent_client import AgentClient
from g2_bridge.auth import (
    AuthError,
    classify_httpx_error,
    verify_agent_configured,
    verify_client_token,
)
from g2_bridge.context import build_history
from g2_bridge.database import Database
from g2_bridge.lock import SessionLock
from g2_bridge.models import AgentResponse, OutputMessage, OutputTextContent, SendMessageRequest
from g2_bridge.response import truncate_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/sessions", tags=["messages"])


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _sse_event(event_type: str, data: dict[str, object]) -> str:
    """Format a Server-Sent Event."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload)}\n\n"


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
    lock: SessionLock = request.app.state.session_lock

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

    # Serialize per-session — prevents concurrent requests from reading
    # the same history snapshot and dropping context (issue #58).
    async with lock.acquire(session_id):
        # Store user message BEFORE calling the agent so concurrent (queued)
        # requests see it in history.  If the agent call fails we clean up.
        now = _now_iso()
        user_msg_id = str(uuid.uuid4())
        await db.add_message(user_msg_id, session_id, "user", body.content, now)
        await db.update_session_timestamp(session_id, now)

        # Load conversation history from DB (now includes this user message)
        stored_messages = await db.get_messages(session_id)
        history = build_history(stored_messages[:-1], settings.max_context_messages)

        logger.debug(
            "Loaded conversation history: session=%s, messages=%d",
            session_id,
            len(history),
            extra={"extra_fields": {"session_id": session_id, "history_count": str(len(history))}},
        )

        # Forward to AI Agent
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
                extra={
                    "extra_fields": {
                        "session_id": session_id,
                        "latency_s": f"{agent_latency:.1f}",
                    }
                },
            )
            # Remove the orphaned user message — agent never saw it
            await db.delete_message(user_msg_id)
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

        # Store assistant message
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


@router.post("/{session_id}/message/stream")
async def send_message_stream(
    request: Request, session_id: str, body: SendMessageRequest
) -> StreamingResponse:
    """Send a text message to the AI Agent and stream the response via SSE.

    SSE events:
    - token: {"type": "token", "content": "..."} — incremental response tokens
    - response: {"type": "response", "data": {...}} — final response object
    - error: {"type": "error", "message": "..."} — sent on agent failure

    This endpoint is only active when streaming is enabled in bridge config.
    """
    from fastapi.security import HTTPBearer

    # Auth
    credentials = await HTTPBearer(auto_error=False)(request)
    if credentials is None:
        raise AuthError(status_code=401, detail="Missing bearer token")
    settings = request.app.state.settings
    verify_client_token(credentials, settings)
    verify_agent_configured(settings)

    if not settings.stream_enabled:
        raise AuthError(status_code=503, detail="Streaming is not enabled on this bridge")

    db: Database = request.app.state.db
    agent: AgentClient = request.app.state.agent
    lock: SessionLock = request.app.state.session_lock

    # Verify session exists
    session = await db.get_session(session_id)
    if session is None:
        raise AuthError(status_code=404, detail="Session not found")

    # Log incoming user message (content length only, not full text)
    logger.info(
        "User message received (streaming): session=%s, content_length=%d",
        session_id,
        len(body.content),
        extra={
            "extra_fields": {
                "session_id": session_id,
                "content_length": str(len(body.content)),
            }
        },
    )

    async def stream() -> AsyncIterator[str]:
        """SSE stream: response tokens incrementally, then final response."""
        # Serialize per-session — prevents concurrent requests from reading
        # the same history snapshot and dropping context (issue #58).
        async with lock.acquire(session_id):
            # Store user message BEFORE calling the agent so concurrent (queued)
            # requests see it in history. If the agent call fails we clean up.
            now = _now_iso()
            user_msg_id = str(uuid.uuid4())
            await db.add_message(user_msg_id, session_id, "user", body.content, now)
            await db.update_session_timestamp(session_id, now)

            # Load conversation history from DB (now includes this user message)
            stored_messages = await db.get_messages(session_id)
            history = build_history(stored_messages[:-1], settings.max_context_messages)

            logger.debug(
                "Loaded conversation history: session=%s, messages=%d",
                session_id,
                len(history),
                extra={
                    "extra_fields": {
                        "session_id": session_id,
                        "history_count": str(len(history)),
                    }
                },
            )

            # Forward to AI Agent with streaming
            agent_start = time.monotonic()
            full_response_text = ""
            try:
                async for chunk in agent.send_message_stream(body.content, history=history):
                    # Parse SSE chunk from agent
                    if chunk.startswith("data: "):
                        data_str = chunk[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                full_response_text += content
                                # Yield token chunk to client
                                yield _sse_event("token", {"content": content})
                        except (JSONDecodeError, KeyError, IndexError):
                            pass
                agent_latency = time.monotonic() - agent_start
            except Exception as e:
                agent_latency = time.monotonic() - agent_start
                logger.error(
                    "Agent streaming request failed: session=%s, latency=%.1fs — %s",
                    session_id,
                    agent_latency,
                    e,
                    extra={
                        "extra_fields": {
                            "session_id": session_id,
                            "latency_s": f"{agent_latency:.1f}",
                        }
                    },
                )
                # Remove the orphaned user message — agent never saw it
                await db.delete_message(user_msg_id)
                yield _sse_event("error", {"message": f"Agent request failed: {e}"})
                return

            logger.info(
                "Agent response (streaming): session=%s, chars=%d, latency=%.1fs",
                session_id,
                len(full_response_text),
                agent_latency,
                extra={
                    "extra_fields": {
                        "session_id": session_id,
                        "response_chars": str(len(full_response_text)),
                        "latency_s": f"{agent_latency:.1f}",
                    }
                },
            )

            # Store assistant message
            original_len = len(full_response_text)
            adapted_text = truncate_response(full_response_text, settings.max_response_chars)
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

        # Build agent response object for final event
        agent_response_obj = AgentResponse(
            id=f"resp_{uuid.uuid4().hex[:12]}",
            status="completed",
            conversation=session_id,
            output=[
                OutputMessage(
                    role="assistant",
                    content=[OutputTextContent(text=adapted_text)],
                )
            ],
            usage={
                "input_tokens": 0,
                "output_tokens": 0,
            },  # Usage tracking not available in streaming mode
        )

        yield _sse_event("response", {"data": agent_response_obj.model_dump()})

    return StreamingResponse(stream(), media_type="text/event-stream")
