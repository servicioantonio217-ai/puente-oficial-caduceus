"""Response adaptation logic — applies response_mode to agent output."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from g2_bridge.response import truncate_response
from g2_bridge.summarize import summarize

if TYPE_CHECKING:
    from g2_bridge.config import Settings

logger = logging.getLogger(__name__)


async def adapt_response(response_text: str, settings: Settings) -> tuple[str, str]:
    """Apply the configured response_mode to produce (full_text, display_text).

    Returns a tuple of:
    - full_text: always the original, unmodified agent response
    - display_text: adapted version for glasses (may equal full_text)

    Modes:
    - "full": display_text = full_text (no processing)
    - "truncate": display_text = truncated via truncate_response()
    - "summarize": display_text = LLM summary (falls back to full_text on error)
    """
    full_text = response_text

    if settings.response_mode == "summarize":
        summary = await summarize(response_text, settings)
        display_text = summary if summary is not None else response_text
        return full_text, display_text

    if settings.response_mode == "truncate":
        display_text = truncate_response(response_text, settings.max_response_chars)
        return full_text, display_text

    # "full" mode — no adaptation
    return full_text, response_text
