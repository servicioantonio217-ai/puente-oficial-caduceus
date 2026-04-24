"""Tests for LLM response summarization (issue #75)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from g2_bridge.summarize import generate_title, summarize


def _make_settings(
    endpoint: str = "http://localhost:4000/v1/chat/completions",
    model: str = "gemma-3-4b",
    api_key: str = "test-key",
    max_chars: int = 300,
) -> MagicMock:
    """Create a mock Settings object with summarization config."""
    settings = MagicMock()
    settings.summarize_api_url = endpoint
    settings.summarize_model = model
    settings.summarize_api_key = api_key
    settings.max_summary_chars = max_chars
    return settings


@pytest.mark.asyncio
async def test_summarize_success():
    """Successful summarization returns the summary text."""
    settings = _make_settings()

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Short summary."}}],
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await summarize("A very long agent response " * 50, settings)

    assert result == "Short summary."


@pytest.mark.asyncio
async def test_summarize_empty_response():
    """Empty summary text returns None (triggers fallback)."""
    settings = _make_settings()

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "   "}}],
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await summarize("Some text", settings)

    assert result is None


@pytest.mark.asyncio
async def test_summarize_timeout_fallback():
    """Timeout returns None (graceful fallback to full text)."""
    settings = _make_settings()

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await summarize("Some text", settings)

    assert result is None


@pytest.mark.asyncio
async def test_summarize_http_error_fallback():
    """HTTP error returns None (graceful fallback)."""
    settings = _make_settings()

    mock_response = MagicMock()
    mock_response.status_code = 503
    mock_response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError(
            "Service Unavailable",
            request=MagicMock(),
            response=mock_response,
        ),
    )

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await summarize("Some text", settings)

    assert result is None


@pytest.mark.asyncio
async def test_summarize_no_endpoint():
    """Missing endpoint/model returns None without calling anything."""
    settings = _make_settings(endpoint="", model="")

    result = await summarize("Some text", settings)
    assert result is None


@pytest.mark.asyncio
async def test_summarize_no_api_key():
    """Works without API key (local LiteLLM)."""
    settings = _make_settings(api_key="")

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Summary without key."}}],
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await summarize("Some text", settings)

    assert result == "Summary without key."
    # Verify no Authorization header was sent
    call_kwargs = mock_client.post.call_args
    assert "Authorization" not in call_kwargs.kwargs.get("headers", {})


# --- generate_title tests (issue #76) ---


@pytest.mark.asyncio
async def test_generate_title_success_one_word():
    """Single-word title is returned as-is."""
    settings = _make_settings()

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Weather"}}],
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await generate_title("What's the weather in Vienna today?", settings)

    assert result == "Weather"


@pytest.mark.asyncio
async def test_generate_title_success_two_words():
    """Two-word title is returned as-is."""
    settings = _make_settings()

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Wiener Schnitzel"}}],
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await generate_title("How do I cook a Wiener Schnitzel?", settings)

    assert result == "Wiener Schnitzel"


@pytest.mark.asyncio
async def test_generate_title_three_words_accepted():
    """Three-word title is still accepted (max threshold)."""
    settings = _make_settings()

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "How to cook"}}],
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await generate_title("Tell me how to cook pasta", settings)

    assert result == "How to cook"


@pytest.mark.asyncio
async def test_generate_title_too_many_words_discarded():
    """Title with >3 words is discarded (model didn't follow instructions)."""
    settings = _make_settings()

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "How to cook Wiener Schnitzel perfectly"}}],
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await generate_title("How do I cook a Wiener Schnitzel?", settings)

    assert result is None


@pytest.mark.asyncio
async def test_generate_title_short_input_skipped():
    """Input shorter than 10 characters is skipped entirely."""
    settings = _make_settings()

    with patch("g2_bridge.summarize.httpx.AsyncClient") as mock_cls:
        result = await generate_title("Hi", settings)

    assert result is None
    mock_cls.assert_not_called()


@pytest.mark.asyncio
async def test_generate_title_empty_response():
    """Empty model response returns None."""
    settings = _make_settings()

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "   "}}],
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await generate_title("What's the weather forecast?", settings)

    assert result is None


@pytest.mark.asyncio
async def test_generate_title_timeout():
    """Timeout returns None gracefully."""
    settings = _make_settings()

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("g2_bridge.summarize.httpx.AsyncClient", return_value=mock_client):
        result = await generate_title("Tell me a long story please", settings)

    assert result is None


@pytest.mark.asyncio
async def test_generate_title_no_endpoint():
    """Missing endpoint/model returns None without calling anything."""
    settings = _make_settings(endpoint="", model="")

    result = await generate_title("What's the weather today?", settings)
    assert result is None
