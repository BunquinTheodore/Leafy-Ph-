import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import jwt
import pytest
from app.core.errors import AppError, ErrorCode
from app.core.security import (
    PasswordService,
    decode_access_token,
    encode_access_token,
    generate_opaque_token,
    sha256_hex,
)

SECRET = "unit-test-secret-0123456789abcdefghijkl"
NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def passwords() -> PasswordService:
    return PasswordService(time_cost=1, memory_kib=64, parallelism=1)


def _token(**overrides: object) -> str:
    values: dict[str, object] = {
        "user_id": uuid.uuid4(),
        "secret": SECRET,
        "issuer": "leafy-api",
        "audience": "leafy-web",
        "now": NOW,
        "ttl_seconds": 900,
    }
    values.update(overrides)
    return encode_access_token(**values)  # type: ignore[arg-type]


def _decode(token: str, now: datetime = NOW, **overrides: str) -> object:
    values = {"secret": SECRET, "issuer": "leafy-api", "audience": "leafy-web", **overrides}
    return decode_access_token(token, now=now, **values)


def test_hash_uses_argon2id_and_verifies(passwords: PasswordService) -> None:
    hashed = passwords.hash("correct horse battery")
    assert hashed.startswith("$argon2id$")
    assert passwords.verify("correct horse battery", hashed) is True
    assert passwords.verify("wrong password!", hashed) is False


def test_verify_never_raises_on_a_malformed_hash(passwords: PasswordService) -> None:
    assert passwords.verify("anything", "not-a-hash") is False


def test_verify_with_no_hash_still_runs_a_real_verification(passwords: PasswordService) -> None:
    spy = MagicMock(wraps=passwords._hasher)
    with patch.object(passwords, "_hasher", spy):
        assert passwords.verify("anything", None) is False
    spy.verify.assert_called_once()
    assert spy.verify.call_args.args[0] == passwords._dummy_hash


def test_needs_rehash_detects_weaker_parameters(passwords: PasswordService) -> None:
    weak = PasswordService(time_cost=1, memory_kib=8, parallelism=1).hash("some password")
    assert passwords.needs_rehash(weak) is True
    assert passwords.needs_rehash(passwords.hash("some password")) is False


def test_access_token_round_trip() -> None:
    user_id = uuid.uuid4()
    claims = _decode(_token(user_id=user_id))
    assert claims.user_id == user_id  # type: ignore[attr-defined]
    assert claims.expires_at == NOW + timedelta(seconds=900)  # type: ignore[attr-defined]


def test_expired_token_is_rejected_with_token_expired() -> None:
    token = _token()
    with pytest.raises(AppError) as caught:
        _decode(token, now=NOW + timedelta(seconds=901))
    assert caught.value.code is ErrorCode.TOKEN_EXPIRED


@pytest.mark.parametrize(
    "overrides",
    [{"secret": "another-secret-0123456789abcdefghijklmn"}, {"issuer": "evil"}, {"audience": "x"}],
)
def test_token_with_wrong_secret_issuer_or_audience_is_rejected(
    overrides: dict[str, str],
) -> None:
    with pytest.raises(AppError) as caught:
        _decode(_token(), **overrides)  # type: ignore[arg-type]
    assert caught.value.code is ErrorCode.INVALID_TOKEN


def test_garbage_and_none_algorithm_tokens_are_rejected() -> None:
    forged = jwt.encode({"sub": str(uuid.uuid4())}, key="", algorithm="none")
    for bad in ("garbage", forged, ""):
        with pytest.raises(AppError) as caught:
            _decode(bad)
        assert caught.value.code is ErrorCode.INVALID_TOKEN


def test_token_of_another_type_is_rejected() -> None:
    claims = {
        "sub": str(uuid.uuid4()),
        "iss": "leafy-api",
        "aud": "leafy-web",
        "iat": int(NOW.timestamp()),
        "exp": int((NOW + timedelta(minutes=5)).timestamp()),
        "typ": "refresh",
    }
    with pytest.raises(AppError) as caught:
        _decode(jwt.encode(claims, SECRET, algorithm="HS256"))
    assert caught.value.code is ErrorCode.INVALID_TOKEN


def test_non_uuid_subject_is_rejected() -> None:
    claims = {
        "sub": "not-a-uuid",
        "iss": "leafy-api",
        "aud": "leafy-web",
        "iat": int(NOW.timestamp()),
        "exp": int((NOW + timedelta(minutes=5)).timestamp()),
        "typ": "access",
    }
    with pytest.raises(AppError) as caught:
        _decode(jwt.encode(claims, SECRET, algorithm="HS256"))
    assert caught.value.code is ErrorCode.INVALID_TOKEN


def test_opaque_tokens_are_unique_and_long() -> None:
    tokens = {generate_opaque_token() for _ in range(50)}
    assert len(tokens) == 50
    assert all(len(token) >= 43 for token in tokens)


def test_sha256_hex_is_stable_hex() -> None:
    digest = sha256_hex("abc")
    assert digest == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
