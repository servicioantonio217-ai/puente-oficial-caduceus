"""Data models for sessions and messages."""

from __future__ import annotations

import uuid
from enum import StrEnum

from pydantic import BaseModel, Field


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


# --- Database row models (for SQLite) ---


class SessionRow:
    """Represents a session row in SQLite."""

    def __init__(
        self,
        id: str,
        name: str,
        created_at: str,
        updated_at: str,
        agent_conversation_id: str,
    ) -> None:
        self.id = id
        self.name = name
        self.created_at = created_at
        self.updated_at = updated_at
        self.agent_conversation_id = agent_conversation_id

    @property
    def message_count(self) -> int:
        # Populated by JOIN in queries
        return getattr(self, "_message_count", 0)


class MessageRow:
    """Represents a message row in SQLite."""

    def __init__(
        self,
        id: str,
        session_id: str,
        role: str,
        content: str,
        created_at: str,
    ) -> None:
        self.id = id
        self.session_id = session_id
        self.role = role
        self.content = content
        self.created_at = created_at


# --- API request/response models ---


class CreateSessionRequest(BaseModel):
    name: str | None = None


class SessionResponse(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    message_count: int


class MessageResponse(BaseModel):
    id: str
    role: MessageRole
    content: str
    created_at: str


class SessionDetailResponse(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    message_count: int
    messages: list[MessageResponse]


class SendMessageRequest(BaseModel):
    content: str


class AudioResponse(BaseModel):
    """Response for audio transcription + AI reply."""

    transcript: str
    response: AgentResponse


class OutputTextContent(BaseModel):
    type: str = "output_text"
    text: str


class OutputMessage(BaseModel):
    type: str = "message"
    role: str = "assistant"
    content: list[OutputTextContent]


class AgentResponse(BaseModel):
    """OpenAI Responses API compatible response."""

    id: str = Field(default_factory=lambda: f"resp_{uuid.uuid4().hex[:12]}")
    status: str = "completed"
    conversation: str = ""
    output: list[OutputMessage] = []
    usage: dict = Field(default_factory=lambda: {"input_tokens": 0, "output_tokens": 0})


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
