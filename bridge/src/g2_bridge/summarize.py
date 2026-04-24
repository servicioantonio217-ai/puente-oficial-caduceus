"""Optional LLM-based response summarization and session title generation."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from g2_bridge.config import Settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "Summarize the following AI assistant response for display on a tiny screen "
    "(~8 lines, ~44 chars per line). Keep the core message. Remove filler, "
    "hedging, and unnecessary detail. Preserve key facts, numbers, and "
    "actionable info. Output plain text, no markdown."
)

_TITLE_SYSTEM_PROMPT = (
    "Generate a short title (1-2 words) for a chat based on this message. "
    "Be specific, not generic. Output only the title words, no punctuation, "
    "no quotes."
)

# Timeout for the summarization LLM call — must not block response delivery.
_SUMMARIZE_TIMEOUT_S = 10.0

# Minimum user message length to generate a meaningful title.
_MIN_TITLE_INPUT_LENGTH = 10

# Maximum number of words allowed in a generated title.
_MAX_TITLE_WORDS = 3


async def summarize(text: str, settings: Settings) -> str | None:
    """Call an OpenAI-compatible endpoint to summarize text.

    Returns the summary string on success, or None on any failure
    (timeout, HTTP error, empty response). The caller should fall back
    to the full text when None is returned.
    """
    if not settings.summarize_api_url or not settings.summarize_model:
        logger.warning("Summarization requested but endpoint/model not configured")
        return None

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.summarize_api_key:
        headers["Authorization"] = f"Bearer {settings.summarize_api_key}"

    payload = {
        "model": settings.summarize_model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        "max_tokens": settings.max_summary_chars,
        "temperature": 0.3,
    }

    try:
        async with httpx.AsyncClient(timeout=_SUMMARIZE_TIMEOUT_S) as client:
            resp = await client.post(
                settings.summarize_api_url,
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()

        data = resp.json()
        summary = str(data["choices"][0]["message"]["content"]).strip()

        if not summary:
            logger.warning("Summarization returned empty text")
            return None

        logger.info(
            "Summarization complete: %d chars → %d chars",
            len(text),
            len(summary),
        )
        return summary

    except httpx.TimeoutException:
        logger.warning(
            "Summarization timed out (%.1fs) — falling back to full text",
            _SUMMARIZE_TIMEOUT_S,
        )
        return None
    except httpx.HTTPStatusError as e:
        logger.warning(
            "Summarization HTTP error %d — falling back to full text",
            e.response.status_code,
        )
        return None
    except Exception as e:
        logger.warning("Summarization failed: %s — falling back to full text", e)
        return None


async def generate_title(text: str, settings: Settings) -> str | None:
    """Generate a short title (1-2 words) for a chat session based on a user message.

    Returns the title string on success, or None on any failure (input too short,
    model returned too many words, timeout, HTTP error). The caller should leave
    the session name unchanged when None is returned.
    """
    if len(text) < _MIN_TITLE_INPUT_LENGTH:
        logger.debug("Skipping title generation: input too short (%d chars)", len(text))
        return None

    if not settings.summarize_api_url or not settings.summarize_model:
        logger.debug("Title generation skipped: endpoint/model not configured")
        return None

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.summarize_api_key:
        headers["Authorization"] = f"Bearer {settings.summarize_api_key}"

    payload = {
        "model": settings.summarize_model,
        "messages": [
            {"role": "system", "content": _TITLE_SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        "max_tokens": 15,
        "temperature": 0.3,
    }

    try:
        async with httpx.AsyncClient(timeout=_SUMMARIZE_TIMEOUT_S) as client:
            resp = await client.post(
                settings.summarize_api_url,
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()

        data = resp.json()
        raw_title = str(data["choices"][0]["message"]["content"]).strip()

        if not raw_title:
            logger.warning("Title generation returned empty text")
            return None

        words = raw_title.split()
        if len(words) > _MAX_TITLE_WORDS:
            logger.warning(
                "Title generation returned %d words (max %d) — discarding: %r",
                len(words),
                _MAX_TITLE_WORDS,
                raw_title,
            )
            return None

        title = " ".join(words)
        logger.info("Session title generated: %s", title)
        return title

    except httpx.TimeoutException:
        logger.warning("Title generation timed out (%.1fs)", _SUMMARIZE_TIMEOUT_S)
        return None
    except httpx.HTTPStatusError as e:
        logger.warning("Title generation HTTP error %d", e.response.status_code)
        return None
    except Exception as e:
        logger.warning("Title generation failed: %s", e)
        return None
