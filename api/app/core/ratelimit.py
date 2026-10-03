"""In memory sliding window rate limiter (v1; Redis is the upgrade path)."""

import math
from collections import deque

from app.core.clock import Clock, SystemClock
from app.core.errors import AppError, ErrorCode

_PRUNE_THRESHOLD = 10_000


class RateLimiter:
    def __init__(self, clock: Clock | None = None, enabled: bool = True) -> None:
        self._clock = clock or SystemClock()
        self._enabled = enabled
        self._hits: dict[str, deque[float]] = {}

    def hit(self, key: str, *, limit: int, window_seconds: int) -> None:
        """Record one attempt for `key`; raise rate_limited when over `limit` in the window."""
        if not self._enabled:
            return
        now = self._clock.now().timestamp()
        window_start = now - window_seconds
        bucket = self._hits.setdefault(key, deque())
        while bucket and bucket[0] <= window_start:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, math.ceil(bucket[0] + window_seconds - now))
            raise AppError(ErrorCode.RATE_LIMITED, headers={"Retry-After": str(retry_after)})
        bucket.append(now)
        if len(self._hits) > _PRUNE_THRESHOLD:
            self._prune(window_start)

    def _prune(self, window_start: float) -> None:
        stale = [
            key for key, bucket in self._hits.items() if not bucket or bucket[-1] <= window_start
        ]
        for key in stale:
            del self._hits[key]
