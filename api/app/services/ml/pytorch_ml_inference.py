"""Vanilla PlantVillage inference service.

- Architecture copied from the Kaggle notebook (ResNet9).
- Weights go through load_state_dict (strict) into that architecture.
  Plain state_dicts load with torch.load(weights_only=True). If the file is a
  full pickled model, it is unpickled once (only when ML_ALLOW_PICKLE is on,
  which is the default) and its weights are copied into the notebook ResNet9.
- No CLIP gate, no resizing/letterboxing/EXIF handling, no normalization, no
  confidence threshold.
- Output labels are mapped explicitly to the app's taxonomy (LABEL_MAP).
"""
import io
import os
import pickle
import sys
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image

from app.services.ml.base import MLInferenceService
from app.services.ml.dev_fake import MLConfigurationError

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

DEFAULT_MODEL_PATH = (
    Path(__file__).parent / "models" / "plant-disease-model-complete.pth"
)
INPUT_SIZE = 256


def ConvBlock(in_channels, out_channels, pool=False):
    layers = [
        nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
        nn.BatchNorm2d(out_channels),
        nn.ReLU(inplace=True),
    ]
    if pool:
        layers.append(nn.MaxPool2d(4))
    return nn.Sequential(*layers)


class ResNet9(nn.Module):
    def __init__(self, in_channels, num_diseases):
        super().__init__()

        self.conv1 = ConvBlock(in_channels, 64)
        self.conv2 = ConvBlock(64, 128, pool=True)  # 128 x 64 x 64
        self.res1 = nn.Sequential(ConvBlock(128, 128), ConvBlock(128, 128))

        self.conv3 = ConvBlock(128, 256, pool=True)  # 256 x 16 x 16
        self.conv4 = ConvBlock(256, 512, pool=True)  # 512 x 4 x 4
        self.res2 = nn.Sequential(ConvBlock(512, 512), ConvBlock(512, 512))

        self.classifier = nn.Sequential(
            nn.MaxPool2d(4), nn.Flatten(), nn.Linear(512, num_diseases)
        )

    def forward(self, xb):
        out = self.conv1(xb)
        out = self.conv2(out)
        out = self.res1(out) + out
        out = self.conv3(out)
        out = self.conv4(out)
        out = self.res2(out) + out
        out = self.classifier(out)
        return out


class PytorchMLInferenceService(MLInferenceService):
    def __init__(
        self,
        model_path: str | None = None,
        device: str | None = None,
        allow_pickle: bool | None = None,
    ):
        self.model_path = Path(
            model_path or os.getenv("MODEL_PATH") or DEFAULT_MODEL_PATH
        )
        if allow_pickle is None:
            allow_pickle = os.getenv("ML_ALLOW_PICKLE", "true").strip().lower() in (
                "1", "true", "yes", "on",
            )
        self.allow_pickle = allow_pickle
        self.classes = list(LABEL_MAP)
        self.device = torch.device(
            device or ("cuda" if torch.cuda.is_available() else "cpu")
        )
        self._to_tensor = T.ToTensor()

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
                    "full pickled model). Set ML_ALLOW_PICKLE=true to load it, or "
                    "convert it with convert_to_state_dict.py."
                ) from exc
            obj = self._load_full_pickle()
        if isinstance(obj, nn.Module):
            obj = obj.state_dict()
        if isinstance(obj, dict):
            for key in ("state_dict", "model_state_dict"):
                if key in obj and isinstance(obj[key], dict):
                    obj = obj[key]
                    break
        return {k.removeprefix("module."): v for k, v in obj.items()}

    def _load_full_pickle(self):
        main = sys.modules["__main__"]
        injected = not hasattr(main, "ResNet9")
        if injected:
            main.ResNet9 = ResNet9
        try:
            return torch.load(
                self.model_path, map_location=self.device, weights_only=False
            )
        except (AttributeError, ModuleNotFoundError) as exc:
            raise MLConfigurationError(
                "The model file is a full pickled model, but its class is not "
                f"importable ({exc})."
            ) from exc
        finally:
            if injected:
                del main.ResNet9

    def _load_model(self) -> nn.Module:
        if not self.model_path.is_file():
            raise MLConfigurationError(f"Model file not found: {self.model_path}")
        model = ResNet9(3, len(self.classes))
        model.load_state_dict(self._read_state_dict())  # strict
        return model.to(self.device).eval()

    def predict(self, image: bytes) -> dict[str, str]:
        img = Image.open(io.BytesIO(image)).convert("RGB")
        if img.size != (INPUT_SIZE, INPUT_SIZE):
            raise ValueError(
                f"Expected a {INPUT_SIZE}x{INPUT_SIZE} image (as in the dataset), "
                f"got {img.size[0]}x{img.size[1]}. This vanilla service does no resizing."
            )

        x = self._to_tensor(img).unsqueeze(0).to(self.device)

        with torch.inference_mode():
            probs = F.softmax(self.model(x), dim=1)[0]

        confidence, idx = probs.max(dim=0)
        plant, disease = LABEL_MAP[self.classes[idx.item()]]

        return {
            "plant": plant,
            "disease": disease,
            "confidence": f"{confidence.item():.2f}",
        }