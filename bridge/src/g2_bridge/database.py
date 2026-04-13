"""SQLite database for session and message storage."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import aiosqlite

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

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()
            self._connection = None

    @property
    def connection(self) -> aiosqlite.Connection:
        if self._connection is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self._connection

    # --- Session operations ---

    async def create_session(
        self, session_id: str, name: str, agent_conversation_id: str, now: str
    ) -> None:
        await self.connection.execute(
            "INSERT INTO sessions (id, name, created_at, updated_at, agent_conversation_id) "
            "VALUES (?, ?, ?, ?, ?)",
            (session_id, name, now, now, agent_conversation_id),
        )
        await self.connection.commit()

    async def list_sessions(self) -> list[dict[str, Any]]:
        cursor = await self.connection.execute(
            "SELECT s.id, s.name, s.created_at, s.updated_at, "
            "COUNT(m.id) AS message_count "
            "FROM sessions s LEFT JOIN messages m ON m.session_id = s.id "
            "GROUP BY s.id ORDER BY s.updated_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        cursor = await self.connection.execute(
            "SELECT s.id, s.name, s.created_at, s.updated_at, "
            "COUNT(m.id) AS message_count "
            "FROM sessions s LEFT JOIN messages m ON m.session_id = s.id "
            "WHERE s.id = ? GROUP BY s.id",
            (session_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def get_agent_conversation_id(self, session_id: str) -> str | None:
        cursor = await self.connection.execute(
            "SELECT agent_conversation_id FROM sessions WHERE id = ?",
            (session_id,),
        )
        row = await cursor.fetchone()
        return dict(row)["agent_conversation_id"] if row else None

    async def update_session_timestamp(self, session_id: str, now: str) -> None:
        await self.connection.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        await self.connection.commit()

    async def rename_session(self, session_id: str, name: str, now: str) -> bool:
        cursor = await self.connection.execute(
            "UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?",
            (name, now, session_id),
        )
        await self.connection.commit()
        return cursor.rowcount > 0

    async def delete_session(self, session_id: str) -> bool:
        cursor = await self.connection.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        await self.connection.commit()
        return cursor.rowcount > 0

    # --- Message operations ---

    async def add_message(
        self, message_id: str, session_id: str, role: str, content: str, now: str
    ) -> None:
        await self.connection.execute(
            "INSERT INTO messages (id, session_id, role, content, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (message_id, session_id, role, content, now),
        )
        await self.connection.commit()

    async def get_messages(self, session_id: str) -> list[dict[str, Any]]:
        cursor = await self.connection.execute(
            "SELECT id, role, content, created_at FROM messages "
            "WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
