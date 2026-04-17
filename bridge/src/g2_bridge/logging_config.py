"""Structured logging configuration for the G2 Bridge.

Provides two log formatters:
- text: Human-readable format for development
- json: Machine-parseable JSON format for production log aggregation

Usage:
    from g2_bridge.logging_config import configure_logging
    configure_logging(log_level="INFO", log_format="text")
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime


class _JsonFormatter(logging.Formatter):
    """Format log records as single-line JSON objects.

    Output fields: timestamp, level, logger, message, and any extra
    fields added via ``logger.info("msg", extra={...})``.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Merge any extra fields the caller attached
        if record.__dict__.get("extra_fields"):
            log_entry.update(record.__dict__["extra_fields"])

        # Include exception info if present
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


class _TextFormatter(logging.Formatter):
    """Human-readable log format for development.

    Format: 2026-04-17 15:30:00.123 INFO  [session_id] logger: message
    """

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, tz=UTC).strftime(
            "%Y-%m-%d %H:%M:%S.%f"
        )[:-3]
        level = f"{record.levelname:<5}"
        logger = record.name

        # Build optional context suffix from extra_fields
        extras = record.__dict__.get("extra_fields")
        context = ""
        if extras:
            parts = [f"{k}={v}" for k, v in extras.items()]
            context = f" [{', '.join(parts)}]"

        message = record.getMessage()
        line = f"{ts} {level} {logger}:{context} {message}"

        if record.exc_info and record.exc_info[0] is not None:
            line += "\n" + self.formatException(record.exc_info)

        return line


def configure_logging(log_level: str = "INFO", log_format: str = "text") -> None:
    """Configure the root logger for the g2_bridge package.

    Args:
        log_level: One of DEBUG, INFO, WARNING, ERROR, CRITICAL.
        log_format: "text" for human-readable, "json" for machine-parseable.
    """
    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    if log_format == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(_TextFormatter())

    # Configure the g2_bridge namespace only — don't touch the root logger
    # to avoid interfering with third-party library logging.
    bridge_logger = logging.getLogger("g2_bridge")
    bridge_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    bridge_logger.handlers.clear()
    bridge_logger.addHandler(handler)
    bridge_logger.propagate = False

    # Quiet down noisy third-party loggers at INFO level
    for noisy in ("httpx", "httpcore", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
