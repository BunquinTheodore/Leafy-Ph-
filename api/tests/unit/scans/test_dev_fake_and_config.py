import json
import logging

import pytest
from app.services.ml import MLConfigurationError, create_ml_service
from app.services.ml.dev_fake import DevFakeMLService, load_label_choices
from pydantic import ValidationError

from tests.conftest import make_settings


def test_choices_come_from_labels_json_and_include_healthy_and_unknown() -> None:
    choices = load_label_choices()
    assert ("tomato", "early-blight") in choices
    assert ("tomato", "healthy") in choices
    assert ("blueberry", "healthy") in choices
    assert ("unknown", "unknown") in choices


def test_prediction_is_deterministic_per_image() -> None:
    service = DevFakeMLService(environment="dev")
    first = service.predict(b"image-a")
    assert first == service.predict(b"image-a")
    assert set(first) == {"plant", "disease", "confidence"}
    assert 0 <= float(first["confidence"]) <= 1


def test_different_images_cover_many_labels() -> None:
    service = DevFakeMLService(environment="dev")
    seen = {tuple(service.predict(f"img-{n}".encode()).items()) for n in range(200)}
    assert len(seen) > 20


def test_prediction_is_json_ready() -> None:
    json.dumps(DevFakeMLService(environment="test").predict(b"x"))


@pytest.mark.parametrize("environment", ["prod", "production", "PRODUCTION"])
def test_refuses_to_run_in_production(environment: str) -> None:
    with pytest.raises(MLConfigurationError):
        DevFakeMLService(environment=environment)


def test_logs_a_loud_warning(capsys: pytest.CaptureFixture[str]) -> None:
    DevFakeMLService(environment="dev")
    captured = capsys.readouterr()
    assert "DEV ONLY" in captured.out + captured.err


def test_factory_builds_dev_fake_outside_production() -> None:
    assert isinstance(create_ml_service("dev-fake", environment="dev"), DevFakeMLService)


def test_factory_refuses_dev_fake_in_production() -> None:
    with pytest.raises(MLConfigurationError):
        create_ml_service("dev-fake", environment="prod")


def test_settings_refuse_dev_fake_in_prod() -> None:
    with pytest.raises(ValidationError):
        make_settings(env="prod", ml_service="dev-fake")
    assert make_settings(env="dev", ml_service="dev-fake").ml_service == "dev-fake"


def test_settings_scan_defaults() -> None:
    settings = make_settings()
    assert settings.scan_quota == 500
    assert settings.ml_timeout == 30
    assert settings.ml_service == "stub"
    assert settings.scan_stuck_seconds > settings.ml_timeout


def test_logging_module_is_not_required() -> None:
    assert logging.getLogger("leafy.ml")
