"""Tests for response_adapter — mode-based response adaptation (issue #75)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from g2_bridge.response_adapter import adapt_response


def _make_settings(mode: str = "full") -> MagicMock:
    """Create mock settings with given response_mode."""
    settings = MagicMock()
    settings.response_mode = mode
    settings.max_response_chars = 100
    settings.summarize_api_url = "http://localhost:4000/v1/chat/completions"
    settings.summarize_model = "gemma-3-4b"
    settings.summarize_api_key = "key"
    settings.max_summary_chars = 300
    return settings


@pytest.mark.asyncio
async def test_full_mode_no_change():
    """'full' mode returns identical full_text and display_text."""
    settings = _make_settings("full")
    text = "This is the full agent response that should not be modified."

    full, display = await adapt_response(text, settings)

    assert full == text
    assert display == text


@pytest.mark.asyncio
async def test_truncate_mode():
    """'truncate' mode truncates display_text, keeps full_text unchanged."""
    settings = _make_settings("truncate")
    settings.max_response_chars = 50
    text = "A" * 200

    full, display = await adapt_response(text, settings)

    assert full == text  # full unchanged
    assert len(display) <= 53  # 50 + "..."
    assert display.endswith("...")


@pytest.mark.asyncio
async def test_summarize_mode_success():
    """'summarize' mode calls LLM and returns summary as display_text."""
    settings = _make_settings("summarize")
    text = "A very long agent response that should be summarized for the glasses."

    with patch(
        "g2_bridge.response_adapter.summarize",
        new_callable=AsyncMock,
        return_value="Short summary.",
    ):
        full, display = await adapt_response(text, settings)

    assert full == text
    assert display == "Short summary."


@pytest.mark.asyncio
async def test_summarize_mode_fallback():
    """'summarize' mode falls back to full text when LLM fails."""
    settings = _make_settings("summarize")
    text = "A very long agent response."

    with patch(
        "g2_bridge.response_adapter.summarize",
        new_callable=AsyncMock,
        return_value=None,
    ):
        full, display = await adapt_response(text, settings)

    assert full == text
    assert display == text  # fallback to full
