"""Error codes and the single application exception.

Messages are static strings chosen per code. Exception text, input values and stack details are
never copied into a response.
"""
# ruff: noqa: S105  (enum member names contain the word token or password; they are not secrets)

from collections.abc import Mapping, Sequence
from enum import StrEnum
from typing import Any


class ErrorCode(StrEnum):
    TOKEN_INVALID_OR_EXPIRED = "token_invalid_or_expired"
    NOT_AUTHENTICATED = "not_authenticated"
    TOKEN_EXPIRED = "token_expired"
    INVALID_TOKEN = "invalid_token"
    INVALID_CREDENTIALS = "invalid_credentials"
    REFRESH_INVALID = "refresh_invalid"
    REFRESH_REUSE_DETECTED = "refresh_reuse_detected"
    EMAIL_NOT_VERIFIED = "email_not_verified"
    PASSWORD_INCORRECT = "password_incorrect"
    CSRF_FAILED = "csrf_failed"
    NOT_FOUND = "not_found"
    EMAIL_TAKEN = "email_taken"
    ALREADY_VERIFIED = "already_verified"
    PAYLOAD_TOO_LARGE = "payload_too_large"
    UNSUPPORTED_MEDIA_TYPE = "unsupported_media_type"
    VALIDATION_ERROR = "validation_error"
    INVALID_IMAGE = "invalid_image"
    INVALID_CURSOR = "invalid_cursor"
    RATE_LIMITED = "rate_limited"
    INTERNAL_ERROR = "internal_error"
    PREDICTION_FAILED = "prediction_failed"
    ML_UNAVAILABLE = "ml_unavailable"
    STORAGE_UNAVAILABLE = "storage_unavailable"
    GOOGLE_AUTH_FAILED = "google_auth_failed"
    GOOGLE_EMAIL_UNVERIFIED = "google_email_unverified"
    INVALID_STATE = "invalid_state"
    SCAN_NOT_FAILED = "scan_not_failed"
    SCAN_NOT_COMPLETED = "scan_not_completed"
    SCAN_QUOTA_EXCEEDED = "scan_quota_exceeded"
    SERVICE_UNAVAILABLE = "service_unavailable"
    METHOD_NOT_ALLOWED = "method_not_allowed"
    REAUTH_REQUIRED = "reauth_required"


ERROR_STATUS: Mapping[ErrorCode, int] = {
    ErrorCode.TOKEN_INVALID_OR_EXPIRED: 400,
    ErrorCode.NOT_AUTHENTICATED: 401,
    ErrorCode.TOKEN_EXPIRED: 401,
    ErrorCode.INVALID_TOKEN: 401,
    ErrorCode.INVALID_CREDENTIALS: 401,
    ErrorCode.REFRESH_INVALID: 401,
    ErrorCode.REFRESH_REUSE_DETECTED: 401,
    ErrorCode.EMAIL_NOT_VERIFIED: 403,
    ErrorCode.PASSWORD_INCORRECT: 403,
    ErrorCode.CSRF_FAILED: 403,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.EMAIL_TAKEN: 409,
    ErrorCode.ALREADY_VERIFIED: 409,
    ErrorCode.PAYLOAD_TOO_LARGE: 413,
    ErrorCode.UNSUPPORTED_MEDIA_TYPE: 415,
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.INVALID_IMAGE: 422,
    ErrorCode.INVALID_CURSOR: 400,
    ErrorCode.RATE_LIMITED: 429,
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.PREDICTION_FAILED: 502,
    ErrorCode.ML_UNAVAILABLE: 503,
    ErrorCode.STORAGE_UNAVAILABLE: 503,
    ErrorCode.GOOGLE_AUTH_FAILED: 400,
    ErrorCode.GOOGLE_EMAIL_UNVERIFIED: 400,
    ErrorCode.INVALID_STATE: 400,
    ErrorCode.SCAN_NOT_FAILED: 409,
    ErrorCode.SCAN_NOT_COMPLETED: 409,
    ErrorCode.SCAN_QUOTA_EXCEEDED: 409,
    ErrorCode.SERVICE_UNAVAILABLE: 503,
    ErrorCode.METHOD_NOT_ALLOWED: 405,
    ErrorCode.REAUTH_REQUIRED: 403,
}

ERROR_MESSAGES: Mapping[ErrorCode, str] = {
    ErrorCode.TOKEN_INVALID_OR_EXPIRED: "This link is invalid or has expired.",
    ErrorCode.NOT_AUTHENTICATED: "Please sign in to continue.",
    ErrorCode.TOKEN_EXPIRED: "Your session has expired. Please sign in again.",
    ErrorCode.INVALID_TOKEN: "Your session is not valid. Please sign in again.",
    ErrorCode.INVALID_CREDENTIALS: "The email or password is not correct.",
    ErrorCode.REFRESH_INVALID: "Your session is not valid. Please sign in again.",
    ErrorCode.REFRESH_REUSE_DETECTED: "Your session was ended for safety. Please sign in again.",
    ErrorCode.EMAIL_NOT_VERIFIED: "Please verify your email to continue.",
    ErrorCode.PASSWORD_INCORRECT: "The password is not correct.",
    ErrorCode.CSRF_FAILED: "The request could not be verified. Please try again.",
    ErrorCode.NOT_FOUND: "We could not find what you asked for.",
    ErrorCode.EMAIL_TAKEN: "That email already has an account.",
    ErrorCode.ALREADY_VERIFIED: "This email is already verified.",
    ErrorCode.PAYLOAD_TOO_LARGE: "The request is too large.",
    ErrorCode.UNSUPPORTED_MEDIA_TYPE: "This file type is not supported.",
    ErrorCode.VALIDATION_ERROR: "Some details are not valid. Please check and try again.",
    ErrorCode.INVALID_IMAGE: "This image could not be used. Try another photo.",
    ErrorCode.INVALID_CURSOR: "The page position is not valid.",
    ErrorCode.RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
    ErrorCode.INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
    ErrorCode.PREDICTION_FAILED: "We could not analyze this photo. Please try again.",
    ErrorCode.ML_UNAVAILABLE: "Analysis is not available right now.",
    ErrorCode.STORAGE_UNAVAILABLE: "Storage is not available right now. Please try again.",
    ErrorCode.GOOGLE_AUTH_FAILED: "Google sign in did not work. Please try again.",
    ErrorCode.GOOGLE_EMAIL_UNVERIFIED: "Your Google email is not verified.",
    ErrorCode.INVALID_STATE: "The sign in request could not be verified. Please try again.",
    ErrorCode.SCAN_NOT_FAILED: "Only a failed scan can be retried.",
    ErrorCode.SCAN_NOT_COMPLETED: "This scan has not finished yet.",
    ErrorCode.SCAN_QUOTA_EXCEEDED: "You have reached the scan limit. Delete old scans to continue.",
    ErrorCode.SERVICE_UNAVAILABLE: "The service is not ready. Please try again shortly.",
    ErrorCode.METHOD_NOT_ALLOWED: "This action is not allowed here.",
    ErrorCode.REAUTH_REQUIRED: "Please sign in again to confirm this change.",
}


class AppError(Exception):
    """A domain or HTTP error that maps to one envelope response."""

    def __init__(
        self,
        code: ErrorCode,
        *,
        details: Sequence[Mapping[str, Any]] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(code.value)
        self.code = code
        self.status_code = ERROR_STATUS[code]
        self.message = ERROR_MESSAGES[code]
        self.details: list[dict[str, Any]] | None = (
            [dict(item) for item in details] if details is not None else None
        )
        self.headers: dict[str, str] = dict(headers or {})
