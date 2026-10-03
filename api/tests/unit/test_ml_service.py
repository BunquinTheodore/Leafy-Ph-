import pytest
from app.services.ml import (
    MLConfigurationError,
    MLInferenceService,
    StubMLInferenceService,
    create_ml_service,
)


class FakeMLService(MLInferenceService):
    def predict(self, image: bytes) -> dict[str, str]:
        return {"plant": "tomato", "disease": "healthy", "confidence": "0.93"}


class NotAService:
    pass


def test_abstract_class_cannot_be_instantiated() -> None:
    with pytest.raises(TypeError):
        MLInferenceService()  # type: ignore[abstract]


def test_stub_raises_not_implemented() -> None:
    with pytest.raises(NotImplementedError):
        StubMLInferenceService().predict(b"jpeg")


def test_factory_returns_stub_by_default_name() -> None:
    assert isinstance(create_ml_service("stub"), StubMLInferenceService)
    assert isinstance(create_ml_service("  stub "), StubMLInferenceService)


def test_factory_loads_a_dotted_class() -> None:
    service = create_ml_service("tests.unit.test_ml_service:FakeMLService")
    assert service.predict(b"x")["plant"] == "tomato"


@pytest.mark.parametrize(
    "spec",
    [
        "no_colon_here",
        ":Missing",
        "pkg_that_does_not_exist:Thing",
        "tests.unit.test_ml_service:Nope",
        "tests.unit.test_ml_service:NotAService",
    ],
)
def test_factory_rejects_bad_specs(spec: str) -> None:
    with pytest.raises(MLConfigurationError):
        create_ml_service(spec)
