"""The ML inference contract. The real model lives in a separate package written by the ML team."""

from abc import ABC, abstractmethod


class MLInferenceService(ABC):
    """Plug in a model by subclassing this and setting ML_SERVICE=pkg.module:ClassName.

    Contract for predict():

    * `image` is the sanitized JPEG produced by the API (long edge at most 2048 px, EXIF removed).
    * Return a dict with string keys and string values:
        - "plant": the plant slug (see api/app/seeds/data/labels.json), for example "tomato".
        - "disease": a disease slug for that plant, or "healthy", or "unknown".
        - "confidence" (optional): a decimal string between 0 and 1, for example "0.93".
    * Unknown slugs are tolerated: the API resolves them to an "unknown" verdict.
    * The call is blocking. The API runs it in a worker thread with a timeout, so it may use CPU
      or GPU freely but must be safe to call from several threads.
    * Raise any exception on failure. The API stores a generic failure and never exposes the text.
    """

    @abstractmethod
    def predict(self, image: bytes) -> dict[str, str]:
        """Classify one leaf photo and return the label mapping described above."""
