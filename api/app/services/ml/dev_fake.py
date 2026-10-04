"""DEV ONLY fake predictor so the UI can be exercised end to end without the real model.

It picks a label from seeds/labels.json by hashing the image. It is never the default, it
refuses to run in production and the settings validator rejects ML_SERVICE=dev-fake in prod.
"""

import hashlib
import json
from functools import lru_cache
from pathlib import Path

from app.core.logging import get_logger
from app.services.ml.base import MLInferenceService

LABELS_PATH = Path(__file__).resolve().parents[2] / "seeds" / "labels.json"
_PRODUCTION_NAMES = frozenset({"prod", "production"})
_log = get_logger("leafy.ml.dev_fake")


class MLConfigurationError(RuntimeError):
    """ML_SERVICE points at something that is not a usable MLInferenceService."""


@lru_cache(maxsize=1)
def load_label_choices() -> tuple[tuple[str, str], ...]:
    """Every (plant, disease) pair, a healthy label per plant, and one unknown label."""
    document = json.loads(LABELS_PATH.read_text(encoding="utf-8"))
    choices: list[tuple[str, str]] = []
    for plant in sorted(document["plants"]):
        choices.extend((plant, disease) for disease in document["plants"][plant])
        choices.append((plant, document["reserved"]["healthy"]))
    choices.append((document["reserved"]["unknown"], document["reserved"]["unknown"]))
    return tuple(choices)


class DevFakeMLService(MLInferenceService):
    """Deterministic fake. DEV ONLY: its answers have nothing to do with the photo."""

    def __init__(self, *, environment: str) -> None:
        if environment.strip().lower() in _PRODUCTION_NAMES:
            raise MLConfigurationError("The dev-fake ML service must never run in production")
        self._choices = load_label_choices()
        _log.warning(
            "DEV ONLY fake ML predictor is active. Results are not real and must not be trusted.",
            environment=environment,
        )

    def predict(self, image: bytes) -> dict[str, str]:
        digest = hashlib.sha256(image).digest()
        plant, disease = self._choices[int.from_bytes(digest[:8], "big") % len(self._choices)]
        confidence = 0.55 + (digest[8] / 255) * 0.44
        return {"plant": plant, "disease": disease, "confidence": f"{confidence:.2f}"}
