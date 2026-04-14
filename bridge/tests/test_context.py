"""Tests for conversation context builder."""

from __future__ import annotations

from g2_bridge.context import build_history


class TestBuildHistory:
    def test_empty_messages(self):
        assert build_history([], 10) == []

    def test_single_message(self):
        messages = [{"role": "user", "content": "Hello"}]
        result = build_history(messages, 10)
        assert result == [{"role": "user", "content": "Hello"}]

    def test_full_conversation(self):
        messages = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
            {"role": "user", "content": "How are you?"},
            {"role": "assistant", "content": "Fine, thanks!"},
        ]
        result = build_history(messages, 10)
        assert len(result) == 4
        assert result[0]["role"] == "user"
        assert result[0]["content"] == "Hi"
        assert result[3]["content"] == "Fine, thanks!"

    def test_truncates_oldest_messages(self):
        """When history exceeds max_messages, oldest messages are dropped."""
        messages = [{"role": "user", "content": f"Message {i}"} for i in range(10)]
        result = build_history(messages, 3)
        assert len(result) == 3
        # Should keep the LAST 3 messages (most recent)
        assert result[0]["content"] == "Message 7"
        assert result[1]["content"] == "Message 8"
        assert result[2]["content"] == "Message 9"

    def test_exactly_at_limit(self):
        """No truncation when message count equals max_messages."""
        messages = [{"role": "user", "content": f"Msg {i}"} for i in range(5)]
        result = build_history(messages, 5)
        assert len(result) == 5
        assert result[0]["content"] == "Msg 0"

    def test_max_messages_zero(self):
        """max_messages=0 returns empty list (no context)."""
        messages = [{"role": "user", "content": "Hello"}]
        result = build_history(messages, 0)
        assert result == []

    def test_strips_extra_fields(self):
        """Only role and content are kept from stored messages."""
        messages = [
            {"id": "abc", "role": "user", "content": "Hi", "created_at": "2026-01-01"},
            {"id": "def", "role": "assistant", "content": "Hey", "session_id": "s1"},
        ]
        result = build_history(messages, 10)
        assert result == [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hey"},
        ]
