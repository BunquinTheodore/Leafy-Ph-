import json
from datetime import timedelta

import pytest
from app.core.clock import FixedClock, SystemClock
from app.core.errors import AppError, ErrorCode
from app.core.logging import configure_logging, get_logger, request_id_var
from app.core.password_policy import password_policy_violation
from app.core.ratelimit import RateLimiter


def test_rate_limiter_blocks_after_limit_and_reports_retry_after() -> None:
    clock = FixedClock()
    limiter = RateLimiter(clock)
    for _ in range(3):
        limiter.hit("k", limit=3, window_seconds=60)
    with pytest.raises(AppError) as caught:
        limiter.hit("k", limit=3, window_seconds=60)
    assert caught.value.code is ErrorCode.RATE_LIMITED
    assert caught.value.headers["Retry-After"] == "60"


def test_rate_limiter_window_slides_and_keys_are_independent() -> None:
    clock = FixedClock()
    limiter = RateLimiter(clock)
    limiter.hit("a", limit=1, window_seconds=10)
    limiter.hit("b", limit=1, window_seconds=10)
    clock.advance(seconds=11)
    limiter.hit("a", limit=1, window_seconds=10)


def test_rate_limiter_can_be_disabled() -> None:
    limiter = RateLimiter(FixedClock(), enabled=False)
    for _ in range(100):
        limiter.hit("k", limit=1, window_seconds=60)


def test_rate_limiter_prunes_stale_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.core.ratelimit._PRUNE_THRESHOLD", 2)
    clock = FixedClock()
    limiter = RateLimiter(clock)
    for key in ("a", "b"):
        limiter.hit(key, limit=1, window_seconds=5)
    clock.advance(seconds=10)
    limiter.hit("c", limit=1, window_seconds=5)
    assert set(limiter._hits) == {"c"}


def test_clocks_return_aware_utc_and_fixed_clock_advances() -> None:
    assert SystemClock().now().tzinfo is not None
    clock = FixedClock()
    start = clock.now()
    clock.advance(hours=1)
    assert clock.now() - start == timedelta(hours=1)


@pytest.mark.parametrize(
    ("password", "email", "expected"),
    [
        ("short", None, "too_short"),
        ("x" * 129, None, "too_long"),
        ("Leaf@Example.com", "leaf@example.com", "same_as_email"),
        ("password123", None, "too_common"),
        ("aaaaaaaaaaaa", None, "too_common"),
        ("a calm green forest", "leaf@example.com", None),
    ],
)
def test_password_policy(password: str, email: str | None, expected: str | None) -> None:
    assert password_policy_violation(password, email) == expected


def test_logging_emits_json_with_request_id_and_redacts_secrets(
    capsys: pytest.CaptureFixture[str],
) -> None:
    configure_logging("INFO")
    token = request_id_var.set("req-12345678")
    try:
        get_logger("test").info("hello", refresh_token="raw-value", note="visible")
    finally:
        request_id_var.reset(token)
    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line["request_id"] == "req-12345678"
    assert line["refresh_token"] == "[redacted]"
    assert line["note"] == "visible"
    assert "raw-value" not in json.dumps(line)
