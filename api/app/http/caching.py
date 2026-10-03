"""ETag and Cache-Control helpers for public, cacheable JSON."""

import hashlib
import json
from typing import Any

from fastapi import Request, Response
from pydantic import BaseModel

CATALOG_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600"


def etag_for(payload: BaseModel) -> str:
    """A weak validator derived from the serialized body (compression may change the bytes)."""
    body = json.dumps(payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()[:32]
    return f'W/"{digest}"'


def _opaque(tag: str) -> str:
    return tag.strip().removeprefix("W/")


def matches_if_none_match(header: str | None, etag: str) -> bool:
    if not header:
        return False
    candidates = [part.strip() for part in header.split(",")]
    if "*" in candidates:
        return True
    return any(_opaque(candidate) == _opaque(etag) for candidate in candidates)


def cached_json[T: BaseModel](
    request: Request, response: Response, envelope: T, *, cache_control: str
) -> T | Response:
    """Return the envelope with validators, or a bodyless 304 when the client is current."""
    etag = etag_for(envelope)
    headers: dict[str, Any] = {"ETag": etag, "Cache-Control": cache_control}
    if matches_if_none_match(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)
    response.headers.update(headers)
    return envelope
