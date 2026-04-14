"""Conversation context builder — assembles message history for the agent."""

from __future__ import annotations

from typing import Any


def build_history(messages: list[dict[str, Any]], max_messages: int) -> list[dict[str, str]]:
    """Build conversation history from stored messages.

    Returns the last ``max_messages`` entries as ``[{role, content}]``
    dicts suitable for the Chat Completions API.  The input list must
    already be in chronological order (ASC) as returned by
    ``Database.get_messages()``.
    """
    if not messages or max_messages <= 0:
        return []
    trimmed = messages[-max_messages:] if len(messages) > max_messages else messages
    return [{"role": m["role"], "content": m["content"]} for m in trimmed]
