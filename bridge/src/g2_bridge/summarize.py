"""Optional LLM-based response summarization for G2 glasses display."""

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

# Timeout for the summarization LLM call — must not block response delivery.
_SUMMARIZE_TIMEOUT_S = 10.0


async def summarize(text: str, settings: Settings) -> str | None:
    """Call an OpenAI-compatible endpoint to summarize text.

    Returns the summary string on success, or None on any failure
    (timeout, HTTP error, empty response). The caller should fall back
    to the full text when None is returned.
    """
    if not settings.summarize_endpoint or not settings.summarize_model:
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
        "max_tokens": settings.summary_max_chars,
        "temperature": 0.3,
    }

    try:
        async with httpx.AsyncClient(timeout=_SUMMARIZE_TIMEOUT_S) as client:
            resp = await client.post(
                settings.summarize_endpoint,
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()

        data = resp.json()
        summary = data["choices"][0]["message"]["content"].strip()

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
        logger.warning("Summarization timed out (%.1fs) — falling back to full text", _SUMMARIZE_TIMEOUT_S)
        return None
    except httpx.HTTPStatusError as e:
        logger.warning("Summarization HTTP error %d — falling back to full text", e.response.status_code)
        return None
    except Exception as e:
        logger.warning("Summarization failed: %s — falling back to full text", e)
        return None
