"""Per request context passed from the HTTP layer into services."""

from dataclasses import dataclass

MAX_USER_AGENT_LENGTH = 300


@dataclass(frozen=True)
class RequestContext:
    request_id: str | None = None
    ip: str | None = None
    user_agent: str | None = None
