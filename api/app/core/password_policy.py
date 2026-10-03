"""Password policy: 10 to 128 characters, not the email, not a common password."""

MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 128

_COMMON_PASSWORDS = frozenset(
    {
        "password",
        "password1",
        "password12",
        "password123",
        "password1234",
        "passw0rd123",
        "1234567890",
        "12345678910",
        "123456789012",
        "qwertyuiop",
        "qwerty12345",
        "qwerty123456",
        "1q2w3e4r5t",
        "iloveyou123",
        "iloveyou1234",
        "letmein1234",
        "welcome1234",
        "welcome12345",
        "administrator",
        "abcdefghij",
        "abc1234567",
        "0123456789",
        "9876543210",
        "football123",
        "baseball123",
        "monkey12345",
        "dragon12345",
        "superman123",
        "trustno1234",
        "changeme123",
        "leafy12345",
        "leafyleafy",
    }
)


def password_policy_violation(password: str, email: str | None = None) -> str | None:
    """Return a short machine readable reason, or None when the password is acceptable."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return "too_short"
    if len(password) > MAX_PASSWORD_LENGTH:
        return "too_long"
    lowered = password.lower()
    if email is not None and lowered == email.strip().lower():
        return "same_as_email"
    if lowered in _COMMON_PASSWORDS or len(set(lowered)) == 1:
        return "too_common"
    return None
