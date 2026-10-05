from app.core.envelope import error_envelope, success_envelope
from app.core.errors import ERROR_MESSAGES, ERROR_STATUS, AppError, ErrorCode


def test_every_error_code_has_status_and_message() -> None:
    for code in ErrorCode:
        assert code in ERROR_STATUS
        assert ERROR_MESSAGES[code].endswith(".")


def test_plan_error_codes_exist() -> None:
    required = {
        "refresh_reuse_detected",
        "invalid_credentials",
        "email_taken",
        "rate_limited",
        "ml_unavailable",
        "scan_quota_exceeded",
        "google_email_unverified",
    }
    assert required <= {code.value for code in ErrorCode}


def test_app_error_uses_static_message_and_mapped_status() -> None:
    error = AppError(ErrorCode.EMAIL_TAKEN)
    assert error.status_code == 409
    assert error.message == ERROR_MESSAGES[ErrorCode.EMAIL_TAKEN]
    assert error.details is None
    assert error.headers == {}


def test_app_error_copies_details_and_headers() -> None:
    source = {"field": "email"}
    error = AppError(ErrorCode.VALIDATION_ERROR, details=[source], headers={"Retry-After": "3"})
    source["field"] = "changed"
    assert error.details == [{"field": "email"}]
    assert error.headers == {"Retry-After": "3"}


def test_success_envelope_shape() -> None:
    envelope = success_envelope({"a": 1})
    assert envelope.model_dump() == {"success": True, "data": {"a": 1}, "error": None}


def test_error_envelope_shape() -> None:
    body = error_envelope("not_found", "Missing.", request_id="abc12345")
    assert body == {
        "success": False,
        "data": None,
        "error": {
            "code": "not_found",
            "message": "Missing.",
            "details": None,
            "request_id": "abc12345",
        },
    }
