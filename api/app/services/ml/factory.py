"""Build the configured MLInferenceService from ML_SERVICE ("stub" or "pkg.module:ClassName")."""

import importlib

from app.services.ml.base import MLInferenceService
from app.services.ml.stub import StubMLInferenceService

STUB_NAME = "stub"


class MLConfigurationError(RuntimeError):
    """ML_SERVICE points at something that is not a usable MLInferenceService."""


def create_ml_service(spec: str) -> MLInferenceService:
    name = spec.strip()
    if name == STUB_NAME:
        return StubMLInferenceService()
    module_name, separator, class_name = name.partition(":")
    if not separator or not module_name or not class_name:
        raise MLConfigurationError("ML_SERVICE must be 'stub' or 'pkg.module:ClassName'")
    try:
        module = importlib.import_module(module_name)
        candidate = getattr(module, class_name)
    except (ImportError, AttributeError) as exc:
        raise MLConfigurationError(f"Cannot load ML_SERVICE '{name}'") from exc
    if not (isinstance(candidate, type) and issubclass(candidate, MLInferenceService)):
        raise MLConfigurationError(f"'{name}' is not a subclass of MLInferenceService")
    return candidate()
