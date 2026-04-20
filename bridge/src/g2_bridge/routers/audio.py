"""Audio endpoint — receive WAV, transcribe, forward to AI Agent via SSE."""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from fastapi import APIRouter, Request, UploadFile
from fastapi.responses import StreamingResponse

from g2_bridge.agent_client import AgentClient
from g2_bridge.auth import (
    AuthError,
    verify_agent_configured,
    verify_client_token,
)
from g2_bridge.context import build_history
from g2_bridge.database import Database
from g2_bridge.lock import SessionLock
from g2_bridge.models import AgentResponse, OutputMessage, OutputTextContent
from g2_bridge.response import truncate_response
from g2_bridge.stt_client import STTClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/sessions", tags=["audio"])


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _sse_event(event_type: str, data: dict[str, object]) -> str:
    """Format a Server-Sent Event."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/{session_id}/audio")
async def send_audio(request: Request, session_id: str, file: UploadFile) -> StreamingResponse:
    """Receive WAV audio, transcribe via STT, stream transcript and agent response via SSE.

    SSE events:
    - transcript: {"type": "transcript", "text": "..."} — sent immediately after STT
    - response: {"type": "response", "data": {...}} — sent when agent responds
    - error: {"type": "error", "message": "..."} — sent on agent failure
    """
    from fastapi.security import HTTPBearer

    # Auth
    credentials = await HTTPBearer(auto_error=False)(request)
    if credentials is None:
        raise AuthError(status_code=401, detail="Missing bearer token")
    settings = request.app.state.settings
    verify_client_token(credentials, settings)
    verify_agent_configured(settings)

    if not settings.stt_configured:
        raise AuthError(status_code=503, detail="STT endpoint not configured")

    # Validate file
    if not file.filename:
        raise AuthError(status_code=400, detail="No file provided")

    audio_data = await file.read()
    if len(audio_data) > settings.max_audio_bytes:
        raise AuthError(
            status_code=413,
            detail=f"Audio too large: {len(audio_data)} bytes (max {settings.max_audio_bytes})",
        )
    if len(audio_data) == 0:
        raise AuthError(status_code=400, detail="Empty audio file")

    # Log audio received (size, approximate duration at 16kHz mono 16-bit)
    approx_duration = len(audio_data) / 32000  # 16kHz * 2 bytes
    logger.info(
        "Audio received: session=%s, size=%d bytes (~%.1fs)",
        session_id,
        len(audio_data),
        approx_duration,
        extra={
            "extra_fields": {
                "session_id": session_id,
                "audio_bytes": str(len(audio_data)),
                "approx_duration_s": f"{approx_duration:.1f}",
            }
        },
    )

    db: Database = request.app.state.db
    agent: AgentClient = request.app.state.agent
    stt: STTClient = request.app.state.stt
    lock: SessionLock = request.app.state.session_lock

    # Verify session exists
    session = await db.get_session(session_id)
    if session is None:
        raise AuthError(status_code=404, detail="Session not found")

    # Transcribe (outside the lock — STT is independent of session state)
    stt_start = time.monotonic()
    try:
        transcript = await stt.transcribe(audio_data, file.filename or "audio.wav")
    except Exception as e:
        stt_latency = time.monotonic() - stt_start
        logger.error(
            "STT transcription failed: session=%s, latency=%.1fs — %s",
            session_id,
            stt_latency,
            e,
            extra={
                "extra_fields": {
                    "session_id": session_id,
                    "stt_latency_s": f"{stt_latency:.1f}",
                }
            },
        )
        raise AuthError(status_code=502, detail=f"STT request failed: {e}") from e

    stt_latency = time.monotonic() - stt_start

    if not transcript:
        raise AuthError(status_code=422, detail="STT returned empty transcript")

    logger.info(
        "STT transcript: session=%s, latency=%.1fs, text=%s",
        session_id,
        stt_latency,
        transcript[:80],
        extra={
            "extra_fields": {
                "session_id": session_id,
                "stt_latency_s": f"{stt_latency:.1f}",
                "transcript_length": str(len(transcript)),
            }
        },
    )

    # Store user message BEFORE starting the stream so it's persisted even if
    # the connection breaks. This also makes it visible to concurrent requests
    # that read history while we wait for the agent.
    now = _now_iso()
    user_msg_id = str(uuid.uuid4())
    await db.add_message(user_msg_id, session_id, "user", transcript, now)
    await db.update_session_timestamp(session_id, now)

    async def stream() -> AsyncIterator[str]:
        """SSE stream: transcript first, then agent response (streaming or non-streaming)."""
        # Phase 1: Send transcript immediately
        yield _sse_event("transcript", {"text": transcript})

        # Phase 2: Call agent and stream response
        # Serialize per-session — prevents concurrent requests from reading
        # the same history snapshot and dropping context (issue #58).
        async with lock.acquire(session_id):
            # Load conversation history from DB (includes the user message
            # we stored above)
            stored_messages = await db.get_messages(session_id)
            history = build_history(stored_messages[:-1], settings.max_context_messages)

            # Forward transcript to AI Agent
            agent_start = time.monotonic()

            if settings.stream_enabled:
                # Streaming mode: stream tokens incrementally
                full_response_text = ""
                try:
                    async for chunk in agent.send_message_stream(transcript, history=history):
                        # Parse the SSE chunk from the agent
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
                            except (json.JSONDecodeError, KeyError, IndexError):
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
            else:
                # Non-streaming mode: wait for full response
                try:
                    raw_response = await agent.send_message(transcript, history=history)
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
                    yield _sse_event("error", {"message": f"Agent request failed: {e}"})
                    return

                agent_latency = time.monotonic() - agent_start
                agent_response = agent.parse_response(raw_response)

                # Extract text from response
                full_response_text = ""
                for msg in agent_response.output:
                    for content in msg.content:
                        full_response_text += content.text

            logger.info(
                "Agent response (audio): session=%s, chars=%d, latency=%.1fs",
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

        # Build agent response object for the final event
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
