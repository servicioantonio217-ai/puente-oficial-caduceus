"""Direct database module tests — edge cases for session and message operations."""

from __future__ import annotations

import pytest

from g2_bridge.database import Database


@pytest.fixture
async def db():
    database = Database(":memory:")
    await database.connect()
    yield database
    await database.close()


class TestDatabaseConnection:
    def test_not_connected_raises(self):
        db = Database(":memory:")
        with pytest.raises(RuntimeError, match="not connected"):
            _ = db.connection

    @pytest.mark.asyncio
    async def test_connect_creates_tables(self, db):
        # If connect() succeeded, tables exist — verify by inserting
        await db.create_session("s1", "Test", "conv1", "2026-01-01T00:00:00+00:00")
        session = await db.get_session("s1")
        assert session is not None

    @pytest.mark.asyncio
    async def test_close_idempotent(self, db):
        await db.close()
        await db.close()  # second close should not raise


class TestSessionOperations:
    @pytest.mark.asyncio
    async def test_create_session(self, db):
        await db.create_session("s1", "My Session", "conv1", "2026-01-01T00:00:00+00:00")
        session = await db.get_session("s1")
        assert session["id"] == "s1"
        assert session["name"] == "My Session"
        assert session["message_count"] == 0

    @pytest.mark.asyncio
    async def test_create_session_with_empty_name(self, db):
        await db.create_session("s2", "", "conv2", "2026-01-01T00:00:00+00:00")
        session = await db.get_session("s2")
        assert session["name"] == ""

    @pytest.mark.asyncio
    async def test_list_sessions_ordered_by_updated_at(self, db):
        await db.create_session("s1", "First", "conv1", "2026-01-01T00:00:00+00:00")
        await db.create_session("s2", "Second", "conv2", "2026-01-02T00:00:00+00:00")
        sessions = await db.list_sessions()
        assert len(sessions) == 2
        assert sessions[0]["id"] == "s2"  # most recent first

    @pytest.mark.asyncio
    async def test_list_sessions_empty(self, db):
        sessions = await db.list_sessions()
        assert sessions == []

    @pytest.mark.asyncio
    async def test_get_session_not_found(self, db):
        session = await db.get_session("nonexistent")
        assert session is None

    @pytest.mark.asyncio
    async def test_get_agent_conversation_id(self, db):
        await db.create_session("s1", "Test", "conv-abc-123", "2026-01-01T00:00:00+00:00")
        conv_id = await db.get_agent_conversation_id("s1")
        assert conv_id == "conv-abc-123"

    @pytest.mark.asyncio
    async def test_get_agent_conversation_id_not_found(self, db):
        conv_id = await db.get_agent_conversation_id("nonexistent")
        assert conv_id is None

    @pytest.mark.asyncio
    async def test_update_session_timestamp(self, db):
        await db.create_session("s1", "Test", "conv1", "2026-01-01T00:00:00+00:00")
        await db.update_session_timestamp("s1", "2026-06-15T12:00:00+00:00")
        session = await db.get_session("s1")
        assert session["updated_at"] == "2026-06-15T12:00:00+00:00"

    @pytest.mark.asyncio
    async def test_delete_session(self, db):
        await db.create_session("s1", "Test", "conv1", "2026-01-01T00:00:00+00:00")
        deleted = await db.delete_session("s1")
        assert deleted is True
        assert await db.get_session("s1") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_session(self, db):
        deleted = await db.delete_session("nonexistent")
        assert deleted is False

    @pytest.mark.asyncio
    async def test_delete_session_cascades_messages(self, db):
        """Deleting a session should also delete its messages."""
        await db.create_session("s1", "Test", "conv1", "2026-01-01T00:00:00+00:00")
        await db.add_message("m1", "s1", "user", "Hello", "2026-01-01T00:00:00+00:00")
        await db.delete_session("s1")
        # Session gone
        assert await db.get_session("s1") is None
        # Re-create with same ID to check messages are gone
        await db.create_session("s1", "Test2", "conv2", "2026-01-01T00:00:00+00:00")
        session = await db.get_session("s1")
        assert session["message_count"] == 0


class TestMessageOperations:
    @pytest.mark.asyncio
    async def test_add_message(self, db):
        await db.create_session("s1", "Test", "conv1", "2026-01-01T00:00:00+00:00")
        await db.add_message("m1", "s1", "user", "Hello", "2026-01-01T00:00:01+00:00")
        messages = await db.get_messages("s1")
        assert len(messages) == 1
        assert messages[0]["content"] == "Hello"
        assert messages[0]["role"] == "user"

    @pytest.mark.asyncio
    async def test_messages_ordered_by_created_at(self, db):
        await db.create_session("s1", "Test", "conv1", "2026-01-01T00:00:00+00:00")
        await db.add_message("m1", "s1", "assistant", "First", "2026-01-01T00:00:01+00:00")
        await db.add_message("m2", "s1", "user", "Second", "2026-01-01T00:00:02+00:00")
        messages = await db.get_messages("s1")
        assert messages[0]["content"] == "First"
        assert messages[1]["content"] == "Second"

    @pytest.mark.asyncio
    async def test_get_messages_empty(self, db):
        await db.create_session("s1", "Test", "conv1", "2026-01-01T00:00:00+00:00")
        messages = await db.get_messages("s1")
        assert messages == []

    @pytest.mark.asyncio
    async def test_get_messages_nonexistent_session(self, db):
        messages = await db.get_messages("nonexistent")
        assert messages == []

    @pytest.mark.asyncio
    async def test_message_count_in_session_detail(self, db):
        await db.create_session("s1", "Test", "conv1", "2026-01-01T00:00:00+00:00")
        await db.add_message("m1", "s1", "user", "Hello", "2026-01-01T00:00:01+00:00")
        await db.add_message("m2", "s1", "assistant", "Hi!", "2026-01-01T00:00:02+00:00")
        session = await db.get_session("s1")
        assert session["message_count"] == 2

    @pytest.mark.asyncio
    async def test_multiple_sessions_isolated(self, db):
        """Messages from one session don't leak to another."""
        await db.create_session("s1", "Session 1", "conv1", "2026-01-01T00:00:00+00:00")
        await db.create_session("s2", "Session 2", "conv2", "2026-01-01T00:00:00+00:00")
        await db.add_message("m1", "s1", "user", "Only in s1", "2026-01-01T00:00:01+00:00")
        await db.add_message("m2", "s2", "user", "Only in s2", "2026-01-01T00:00:01+00:00")

        s1_messages = await db.get_messages("s1")
        s2_messages = await db.get_messages("s2")
        assert len(s1_messages) == 1
        assert s1_messages[0]["content"] == "Only in s1"
        assert len(s2_messages) == 1
        assert s2_messages[0]["content"] == "Only in s2"
