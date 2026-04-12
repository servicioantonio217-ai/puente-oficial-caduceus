"""Session CRUD endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request

from g2_bridge.auth import AuthError, verify_client_token
from g2_bridge.database import Database
from g2_bridge.models import (
    CreateSessionRequest,
    MessageResponse,
    SessionDetailResponse,
    SessionResponse,
)

router = APIRouter(prefix="/v1/sessions", tags=["sessions"])


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    request: Request, body: CreateSessionRequest | None = None
) -> SessionResponse:
    """Create a new chat session."""
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

    credentials: HTTPAuthorizationCredentials = await HTTPBearer()(request)
    settings = request.app.state.settings
    verify_client_token(credentials, settings)

    db: Database = request.app.state.db
    session_id = str(uuid.uuid4())
    agent_conversation_id = str(uuid.uuid4())
    now = _now_iso()
    name = body.name if body and body.name else ""

    await db.create_session(session_id, name, agent_conversation_id, now)

    return SessionResponse(
        id=session_id,
        name=name,
        created_at=now,
        updated_at=now,
        message_count=0,
    )


@router.get("", response_model=list[SessionResponse])
async def list_sessions(request: Request) -> list[SessionResponse]:
    """List all sessions, ordered by most recently updated."""
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

    credentials: HTTPAuthorizationCredentials = await HTTPBearer()(request)
    settings = request.app.state.settings
    verify_client_token(credentials, settings)

    db: Database = request.app.state.db
    rows = await db.list_sessions()

    return [
        SessionResponse(
            id=row["id"],
            name=row["name"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            message_count=row["message_count"],
        )
        for row in rows
    ]


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(request: Request, session_id: str) -> SessionDetailResponse:
    """Get session details including full message history."""
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

    credentials: HTTPAuthorizationCredentials = await HTTPBearer()(request)
    settings = request.app.state.settings
    verify_client_token(credentials, settings)

    db: Database = request.app.state.db
    session = await db.get_session(session_id)
    if session is None:
        raise AuthError(status_code=404, detail="Session not found")

    messages = await db.get_messages(session_id)

    return SessionDetailResponse(
        id=session["id"],
        name=session["name"],
        created_at=session["created_at"],
        updated_at=session["updated_at"],
        message_count=session["message_count"],
        messages=[
            MessageResponse(
                id=m["id"],
                role=m["role"],
                content=m["content"],
                created_at=m["created_at"],
            )
            for m in messages
        ],
    )


@router.delete("/{session_id}", status_code=204)
async def delete_session(request: Request, session_id: str) -> None:
    """Delete a session and all its messages."""
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

    credentials: HTTPAuthorizationCredentials = await HTTPBearer()(request)
    settings = request.app.state.settings
    verify_client_token(credentials, settings)

    db: Database = request.app.state.db
    deleted = await db.delete_session(session_id)
    if not deleted:
        raise AuthError(status_code=404, detail="Session not found")
