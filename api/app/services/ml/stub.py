"""Placeholder used until the ML team provides a model. The API maps this to 503 ml_unavailable."""

from app.services.ml.base import MLInferenceService


class StubMLInferenceService(MLInferenceService):
    def predict(self, image: bytes) -> dict[str, str]:
        raise NotImplementedError("No ML model is configured. Set ML_SERVICE=pkg.module:ClassName.")
