"""Response adaptation for G2 display constraints."""

from __future__ import annotations

import re


def truncate_response(text: str, max_chars: int = 500) -> str:
    """Truncate text to fit G2 display, cutting at a clean sentence boundary.

    Rules:
    - If text fits within max_chars, return as-is.
    - Otherwise, find the last sentence boundary (., !, ?) within the limit.
    - If no sentence boundary found, cut at the last space or hard limit.
    - Append "..." if truncated.
    """
    if len(text) <= max_chars:
        return text

    # Look for sentence endings within the limit
    truncated = text[:max_chars]

    # Find last sentence-ending punctuation followed by a space or end
    # Search in the truncated portion for ". ", "! ", "? "
    last_sentence_end = -1
    for pattern in [r"\.\s", r"!\s", r"\?\s"]:
        matches = list(re.finditer(pattern, truncated))
        if matches:
            pos = matches[-1].start()
            if pos > last_sentence_end:
                last_sentence_end = pos

    if last_sentence_end > 0:
        return text[: last_sentence_end + 1] + "..."

    # No sentence boundary found — cut at last space
    last_space = truncated.rfind(" ")
    if last_space > max_chars // 2:  # Only cut at space if it's not too far back
        return text[:last_space] + "..."

    # Hard cut
    return text[:max_chars] + "..."
