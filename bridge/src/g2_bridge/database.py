"""SQLite database for session and message storage."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import aiosqlite

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    agent_conversation_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
"""


class Database:
    """Async SQLite database wrapper."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._connection: aiosqlite.Connection | None = None

    async def connect(self) -> None:
        """Open database connection and create tables."""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._connection = await aiosqlite.connect(self.db_path)
        self._connection.row_factory = aiosqlite.Row
        await self._connection.execute("PRAGMA journal_mode=WAL")
        await self._connection.execute("PRAGMA foreign_keys=ON")
        await self._connection.executescript(_SCHEMA)
        await self._connection.commit()
        logger.info("Database connected: %s", self.db_path)

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()
            self._connection = None
            logger.info("Database connection closed")

    @property
    def connection(self) -> aiosqlite.Connection:
        if self._connection is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self._connection

    # --- Session operations ---

    async def create_session(
        self, session_id: str, name: str, agent_conversation_id: str, now: str
    ) -> None:
        try:
            await self.connection.execute(
                "INSERT INTO sessions (id, name, created_at, updated_at, agent_conversation_id) "
                "VALUES (?, ?, ?, ?, ?)",
                (session_id, name, now, now, agent_conversation_id),
            )
            await self.connection.commit()
            logger.debug("DB: session created id=%s", session_id)
        except Exception:
            logger.error("Failed to create session %s", session_id, exc_info=True)
            raise

    async def list_sessions(self) -> list[dict[str, Any]]:
        try:
            cursor = await self.connection.execute(
                "SELECT s.id, s.name, s.created_at, s.updated_at, "
                "COUNT(m.id) AS message_count "
                "FROM sessions s LEFT JOIN messages m ON m.session_id = s.id "
                "GROUP BY s.id ORDER BY s.updated_at DESC"
            )
            rows = await cursor.fetchall()
            logger.debug("DB: listed %d sessions", len(rows))
            return [dict(row) for row in rows]
        except Exception:
            logger.error("Failed to list sessions", exc_info=True)
            raise

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        try:
            cursor = await self.connection.execute(
                "SELECT s.id, s.name, s.created_at, s.updated_at, "
                "COUNT(m.id) AS message_count "
                "FROM sessions s LEFT JOIN messages m ON m.session_id = s.id "
                "WHERE s.id = ? GROUP BY s.id",
                (session_id,),
            )
            row = await cursor.fetchone()
            return dict(row) if row else None
        except Exception:
            logger.error("Failed to get session %s", session_id, exc_info=True)
            raise

    async def get_agent_conversation_id(self, session_id: str) -> str | None:
        try:
            cursor = await self.connection.execute(
                "SELECT agent_conversation_id FROM sessions WHERE id = ?",
                (session_id,),
            )
            row = await cursor.fetchone()
            return dict(row)["agent_conversation_id"] if row else None
        except Exception:
            logger.error(
                "Failed to get agent conversation id for %s",
                session_id,
                exc_info=True,
            )
            raise

    async def update_session_timestamp(self, session_id: str, now: str) -> None:
        try:
            await self.connection.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (now, session_id),
            )
            await self.connection.commit()
            logger.debug("DB: updated session timestamp id=%s", session_id)
        except Exception:
            logger.error(
                "Failed to update session timestamp for %s",
                session_id,
                exc_info=True,
            )
            raise

    async def rename_session(self, session_id: str, name: str) -> bool:
        """Rename a session without touching updated_at.

        updated_at tracks content activity (messages), not metadata changes.
        Bumping it on rename caused sessions to jump to the top of the list
        on glasses (which sort by updated_at), creating an inconsistency with
        the smartphone app. See issue #45.
        """
        try:
            cursor = await self.connection.execute(
                "UPDATE sessions SET name = ? WHERE id = ?",
                (name, session_id),
            )
            await self.connection.commit()
            return cursor.rowcount > 0
        except Exception:
            logger.error("Failed to rename session %s", session_id, exc_info=True)
            raise

    async def delete_session(self, session_id: str) -> bool:
        try:
            cursor = await self.connection.execute(
                "DELETE FROM sessions WHERE id = ?", (session_id,)
            )
            await self.connection.commit()
            return cursor.rowcount > 0
        except Exception:
            logger.error("Failed to delete session %s", session_id, exc_info=True)
            raise

    async def delete_sessions_bulk(self, session_ids: list[str]) -> int:
        """Delete multiple sessions by ID. Returns count of deleted sessions.

        Uses a single DELETE with IN clause for efficiency. Messages are
        automatically removed via ON DELETE CASCADE foreign key.
        """
        if not session_ids:
            return 0
        try:
            placeholders = ",".join("?" for _ in session_ids)
            cursor = await self.connection.execute(
                f"DELETE FROM sessions WHERE id IN ({placeholders})",
                session_ids,
            )
            await self.connection.commit()
            return cursor.rowcount
        except Exception:
            logger.error("Failed to bulk delete sessions", exc_info=True)
            raise

    # --- Message operations ---

    async def add_message(
        self, message_id: str, session_id: str, role: str, content: str, now: str
    ) -> None:
        try:
            await self.connection.execute(
                "INSERT INTO messages (id, session_id, role, content, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (message_id, session_id, role, content, now),
            )
            await self.connection.commit()
            logger.debug(
                "DB: message added session=%s role=%s",
                session_id,
                role,
            )
        except Exception:
            logger.error("Failed to add message to session %s", session_id, exc_info=True)
            raise

    async def delete_message(self, message_id: str) -> bool:
        """Delete a single message by ID.

        Used to clean up orphaned user messages when the agent call fails
        after the user message was already stored (issue #58).
        Returns True if a row was deleted.
        """
        try:
            cursor = await self.connection.execute(
                "DELETE FROM messages WHERE id = ?", (message_id,)
            )
            await self.connection.commit()
            return cursor.rowcount > 0
        except Exception:
            logger.error("Failed to delete message %s", message_id, exc_info=True)
            raise

    async def get_messages(self, session_id: str) -> list[dict[str, Any]]:
        try:
            cursor = await self.connection.execute(
                "SELECT id, role, content, created_at FROM messages "
                "WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,),
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
        except Exception:
            logger.error("Failed to get messages for session %s", session_id, exc_info=True)
            raise
