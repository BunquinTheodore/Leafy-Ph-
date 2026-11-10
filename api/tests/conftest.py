"""Shared test helpers. Settings never read a real .env or real credentials."""

from typing import Any

import pytest
from app.core.config import Settings

TEST_JWT_SECRET = "test-secret-for-unit-tests-0123456789abcdef"
TEST_DATABASE_URL = "postgresql+asyncpg://test:test@127.0.0.1:1/never_connects"


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "env": "test",
        "database_url": TEST_DATABASE_URL,
        "jwt_secret": TEST_JWT_SECRET,
        "argon2_time_cost": 1,
        "argon2_memory_kib": 64,
        "argon2_parallelism": 1,
        "log_level": "WARNING",
        "allow_insecure_mocks": True,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def settings() -> Settings:
    return make_settings()


# ---- test case traceability ----------------------------------------------------------------
# Tests carry @pytest.mark.tc("TC-001") ids from docs/test-cases.md. When any ran, the end of the
# session prints one line per test case so the whole list can be checked at a glance:
#   pytest -m tc --no-cov

_TC_RESULTS: dict[str, dict[str, int]] = {}


def _tc_ids(item: pytest.Item) -> list[str]:
    return [str(mark.args[0]) for mark in item.iter_markers("tc") if mark.args]


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    failed = report.failed or (report.skipped and not hasattr(report, "wasxfail"))
    if report.when != "call" and not failed:
        return
    ids = {value for key, value in report.user_properties if key == "tc"}
    for tc_id in sorted(ids):
        counts = _TC_RESULTS.setdefault(tc_id, {"passed": 0, "failed": 0})
        counts["failed" if failed else "passed"] += 1


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo[None]) -> None:
    for tc_id in _tc_ids(item):
        item.user_properties.append(("tc", tc_id))


def pytest_terminal_summary(terminalreporter: Any) -> None:
    if not _TC_RESULTS:
        return

    def sort_key(tc_id: str) -> tuple[int, str]:
        return (0, tc_id) if tc_id.startswith("TC-") else (1, tc_id)

    terminalreporter.section("test case results")
    for tc_id in sorted(_TC_RESULTS, key=sort_key):
        counts = _TC_RESULTS[tc_id]
        status = "FAIL" if counts["failed"] else "PASS"
        terminalreporter.write_line(
            f"{tc_id}  {status}  ({counts['passed']} passed, {counts['failed']} failed)"
        )
