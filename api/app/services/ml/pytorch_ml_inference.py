"""MobileNetV2 PlantVillage inference service (upgraded over the ResNet9 one).

(MODEL_PATH, ML_ALLOW_PICKLE, ML_RESIZE_MODE) as the arguments for inference service,
The model utilized is Daksh159/plant-disease-mobilenetv2
(torchvision mobilenet_v2, 224x224, ImageNet normalization).

- Handles any input size: MobileNetV2 ends in global average pooling, and every
  upload is brought to 224x224 with ML_RESIZE_MODE (crop | squash | pad | strict).
  Images that are already 224x224 skip that step.
- Weights load strictly via load_state_dict. Plain state_dicts use
  torch.load(weights_only=True); a full pickled model is only unpickled when
  ML_ALLOW_PICKLE is on (the default), and only for files you trust.
- Class order is ASSUMED to be LABEL_MAP order (based on PlantVillage dataset labels)
- Output labels are mapped explicitly to the app's taxonomy (LABEL_MAP).
"""
import io
import logging
import os
import pickle
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image, ImageOps
from torchvision import models

from app.services.ml.base import MLInferenceService
from app.services.ml.dev_fake import MLConfigurationError

logger = logging.getLogger(__name__)

LABEL_MAP: dict[str, tuple[str, str]] = {
    "Apple___Apple_scab": ("apple", "apple-scab"),
    "Apple___Black_rot": ("apple", "black-rot"),
    "Apple___Cedar_apple_rust": ("apple", "cedar-apple-rust"),
    "Apple___healthy": ("apple", "healthy"),
    "Blueberry___healthy": ("blueberry", "healthy"),
    "Cherry_(including_sour)___Powdery_mildew": ("cherry", "powdery-mildew"),
    "Cherry_(including_sour)___healthy": ("cherry", "healthy"),
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": ("corn", "gray-leaf-spot"),
    "Corn_(maize)___Common_rust_": ("corn", "common-rust"),
    "Corn_(maize)___Northern_Leaf_Blight": ("corn", "northern-corn-leaf-blight"),
    "Corn_(maize)___healthy": ("corn", "healthy"),
    "Grape___Black_rot": ("grape", "black-rot"),
    "Grape___Esca_(Black_Measles)": ("grape", "esca"),
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)": ("grape", "leaf-blight"),
    "Grape___healthy": ("grape", "healthy"),
    "Orange___Haunglongbing_(Citrus_greening)": ("orange", "huanglongbing"),
    "Peach___Bacterial_spot": ("peach", "bacterial-spot"),
    "Peach___healthy": ("peach", "healthy"),
    "Pepper,_bell___Bacterial_spot": ("bell-pepper", "bacterial-spot"),
    "Pepper,_bell___healthy": ("bell-pepper", "healthy"),
    "Potato___Early_blight": ("potato", "early-blight"),
    "Potato___Late_blight": ("potato", "late-blight"),
    "Potato___healthy": ("potato", "healthy"),
    "Raspberry___healthy": ("unknown", "unknown"),
    "Soybean___healthy": ("soybean", "healthy"),
    "Squash___Powdery_mildew": ("squash", "powdery-mildew"),
    "Strawberry___Leaf_scorch": ("strawberry", "leaf-scorch"),
    "Strawberry___healthy": ("strawberry", "healthy"),
    "Tomato___Bacterial_spot": ("tomato", "bacterial-spot"),
    "Tomato___Early_blight": ("tomato", "early-blight"),
    "Tomato___Late_blight": ("tomato", "late-blight"),
    "Tomato___Leaf_Mold": ("tomato", "leaf-mold"),
    "Tomato___Septoria_leaf_spot": ("tomato", "septoria-leaf-spot"),
    "Tomato___Spider_mites Two-spotted_spider_mite": ("tomato", "spider-mites"),
    "Tomato___Target_Spot": ("tomato", "target-spot"),
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": ("tomato", "tomato-yellow-leaf-curl-virus"),
    "Tomato___Tomato_mosaic_virus": ("tomato", "tomato-mosaic-virus"),
    "Tomato___healthy": ("tomato", "healthy"),
}

DEFAULT_MODEL_PATH = Path(__file__).parent / "models" / "mobilenetv2_plant.pth"
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
INPUT_SIZE = 224  # MobileNetV2 checkpoint was trained at 224x224

# Note: This is the method to be used when handling images that are bigger than 224x224.
# Configure this method with the ML_RESIZE_MODE env var
#   crop   - resize the short side to 224, center-crop (leaf fills the frame)
#   squash - resize straight to 224x224 (keeps everything, distorts aspect ratio)
#   pad    - letterbox with a neutral gray (keeps everything, leaf gets smaller)
#   strict - raise ValueError
RESIZE_MODES = ("crop", "squash", "pad", "strict")
PAD_COLOR = (128, 128, 128)


class PytorchMLInferenceService(MLInferenceService):
    def __init__(
        self,
        model_path: str | None = None,
        device: str | None = None,
        allow_pickle: bool | None = None,
        resize_mode: str | None = None,
    ):
        self.model_path = Path(
            model_path or os.getenv("MODEL_PATH") or DEFAULT_MODEL_PATH
        )
        if allow_pickle is None:
            allow_pickle = os.getenv("ML_ALLOW_PICKLE", "true").strip().lower() in (
                "1", "true", "yes", "on",
            )
        self.allow_pickle = allow_pickle
        self.resize_mode = (
            resize_mode or os.getenv("ML_RESIZE_MODE", "crop")
        ).strip().lower()
        if self.resize_mode not in RESIZE_MODES:
            raise MLConfigurationError(
                f"ML_RESIZE_MODE must be one of {RESIZE_MODES}, got {self.resize_mode!r}"
            )
        self.classes = list(LABEL_MAP)  # index -> raw class name
        self.device = torch.device(
            device or ("cuda" if torch.cuda.is_available() else "cpu")
        )
        self._transform = T.Compose(
            [T.ToTensor(), T.Normalize(IMAGENET_MEAN, IMAGENET_STD)]
        )
        logger.info(
            "Assuming checkpoint class order == LABEL_MAP order (%d classes).",
            len(self.classes),
        )
        self.model = self._load_model()


    def _read_state_dict(self) -> dict:
        try:
            obj = torch.load(
                self.model_path, map_location=self.device, weights_only=True
            )
        except pickle.UnpicklingError as exc:
            if not self.allow_pickle:
                raise MLConfigurationError(
                    f"{self.model_path} is not a plain state_dict (it looks like a "
                    "full pickled model). Set ML_ALLOW_PICKLE=true to load it."
                ) from exc
            # Only for files you trust: unpickling can execute code.
            obj = torch.load(
                self.model_path, map_location=self.device, weights_only=False
            )
        if isinstance(obj, nn.Module):
            obj = obj.state_dict()
        if isinstance(obj, dict):
            for key in ("state_dict", "model_state_dict"):
                if key in obj and isinstance(obj[key], dict):
                    obj = obj[key]
                    break
        return {k.removeprefix("module."): v for k, v in obj.items()}

    def _build_model(self, dropout_head: bool) -> nn.Module:
        model = models.mobilenet_v2(weights=None)
        in_features = model.classifier[1].in_features
        n = len(self.classes)
        model.classifier[1] = (
            nn.Sequential(nn.Dropout(0.2), nn.Linear(in_features, n))
            if dropout_head
            else nn.Linear(in_features, n)
        )
        return model

    def _load_model(self) -> nn.Module:
        if not self.model_path.is_file():
            raise MLConfigurationError(f"Model file not found: {self.model_path}")
        state = self._read_state_dict()

        errors = []
        for dropout_head in (True, False):
            model = self._build_model(dropout_head)
            try:
                model.load_state_dict(state)
            except RuntimeError as exc:
                errors.append(f"dropout_head={dropout_head}: {str(exc)[:300]}")
                continue
            return model.to(self.device).eval()

        raise MLConfigurationError(
            "The weights do not fit torchvision mobilenet_v2 with either head. "
            + " | ".join(errors)
        )


    def _fit(self, img: Image.Image) -> Image.Image:
        size = (INPUT_SIZE, INPUT_SIZE)
        if img.size == size:
            return img
        if self.resize_mode == "strict":
            raise ValueError(
                f"Expected a {INPUT_SIZE}x{INPUT_SIZE} image, got "
                f"{img.size[0]}x{img.size[1]} (ML_RESIZE_MODE=strict)."
            )
        if self.resize_mode == "squash":
            return img.resize(size, Image.Resampling.BICUBIC)
        if self.resize_mode == "pad":
            return ImageOps.pad(img, size, Image.Resampling.BICUBIC, color=PAD_COLOR)
        return ImageOps.fit(img, size, Image.Resampling.BICUBIC)  # crop

    def predict(self, image: bytes) -> dict[str, str]:
        img = Image.open(io.BytesIO(image))
        img = ImageOps.exif_transpose(img).convert("RGB")
        img = self._fit(img)

        x = self._transform(img).unsqueeze(0).to(self.device)

        with torch.inference_mode():
            probs = F.softmax(self.model(x), dim=1)[0]

        confidence, idx = probs.max(dim=0)
        plant, disease = LABEL_MAP[self.classes[idx.item()]]

        return {
            "plant": plant,
            "disease": disease,
            "confidence": f"{confidence.item():.2f}",
        }