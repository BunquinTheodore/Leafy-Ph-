"""Scriptable ML services for tests. Never imported by application code."""

import threading
from typing import Any

from app.services.ml.base import MLInferenceService


class ScriptedML(MLInferenceService):
    """Returns `result`, raises `error`, or blocks on `gate` until the test releases it."""

    def __init__(self, result: dict[str, str] | None = None) -> None:
        self.result: dict[str, Any] = result or {
            "plant": "tomato",
            "disease": "early-blight",
            "confidence": "0.91",
        }
        self.error: BaseException | None = None
        self.gate: threading.Event | None = None
        self.calls: list[bytes] = []

    def predict(self, image: bytes) -> dict[str, str]:
        self.calls.append(image)
        if self.gate is not None:
            self.gate.wait(timeout=10)
        if self.error is not None:
            raise self.error
        return dict(self.result)
