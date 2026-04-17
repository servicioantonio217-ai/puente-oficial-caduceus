"""Per-session async lock to serialize concurrent requests.

Prevents race conditions when two audio/text messages arrive for the same
session simultaneously.  Without serialization, both requests load the same
history snapshot, both get processed independently, and the first message's
context is lost from the second request's view — causing the "interrupt drops
first message" bug (issue #58).

Usage::

    lock = SessionLock()
    async with lock.acquire(session_id):
        # Only one request per session runs at a time
        ...
"""

from __future__ import annotations

import asyncio
from collections import defaultdict


class SessionLock:
    """Async lock keyed by session ID.

    Each session gets its own ``asyncio.Lock``.  Locks are created lazily and
    removed when no coroutines are waiting (so memory doesn't grow unbounded).
    """

    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    def acquire(self, session_id: str) -> _AcquireContext:
        return _AcquireContext(self, session_id)


class _AcquireContext:
    """Context manager that acquires/releases the per-session lock."""

    def __init__(self, parent: SessionLock, session_id: str) -> None:
        self._parent = parent
        self._session_id = session_id
        self._lock: asyncio.Lock | None = None

    async def __aenter__(self) -> None:
        self._lock = self._parent._locks[self._session_id]
        await self._lock.acquire()
        return None

    async def __aexit__(self, *args: object) -> None:
        if self._lock is not None:
            self._lock.release()
            # Clean up lock if no one else is waiting
            if not self._lock.locked() and not self._lock._waiters:  # type: ignore[attr-defined]
                self._parent._locks.pop(self._session_id, None)
