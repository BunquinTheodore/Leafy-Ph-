import io
import os
import pickle
import re
import sys
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image

from app.services.ml.base import MLInferenceService
from app.services.ml.dev_fake import MLConfigurationError

PLANTVILLAGE_CLASSES = [
    "Apple___Apple_scab",
    "Apple___Black_rot",
    "Apple___Cedar_apple_rust",
    "Apple___healthy",
    "Blueberry___healthy",
    "Cherry_(including_sour)___Powdery_mildew",
    "Cherry_(including_sour)___healthy",
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
    "Corn_(maize)___Common_rust_",
    "Corn_(maize)___Northern_Leaf_Blight",
    "Corn_(maize)___healthy",
    "Grape___Black_rot",
    "Grape___Esca_(Black_Measles)",
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)",
    "Grape___healthy",
    "Orange___Haunglongbing_(Citrus_greening)",
    "Peach___Bacterial_spot",
    "Peach___healthy",
    "Pepper,_bell___Bacterial_spot",
    "Pepper,_bell___healthy",
    "Potato___Early_blight",
    "Potato___Late_blight",
    "Potato___healthy",
    "Raspberry___healthy",
    "Soybean___healthy",
    "Squash___Powdery_mildew",
    "Strawberry___Leaf_scorch",
    "Strawberry___healthy",
    "Tomato___Bacterial_spot",
    "Tomato___Early_blight",
    "Tomato___Late_blight",
    "Tomato___Leaf_Mold",
    "Tomato___Septoria_leaf_spot",
    "Tomato___Spider_mites Two-spotted_spider_mite",
    "Tomato___Target_Spot",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
    "Tomato___Tomato_mosaic_virus",
    "Tomato___healthy",
]

LABEL_OVERRIDES: dict[str, tuple[str, str]] = {
}

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)

DEFAULT_MODEL_PATH = (
    Path(__file__).parent / "models" / "plant-disease-model-complete.pth"
)

LEAF_PROMPTS = [
    "a photo of a plant leaf",
    "a close-up photo of a diseased plant leaf",
    "a photo of a healthy green leaf",
]

NOT_LEAF_PROMPTS = [
    "a photo of a person",
    "a photo of a human hand",
    "a photo of an animal",
    "a photo of a pet",
    "a photo of a building",
    "a photo of a car",
    "a photo of food",
    "a photo of a fruit",
    "a photo of furniture",
    "a photo of a room",
    "a photo of the sky",
    "a photo of a wall",
    "a photo of soil or the ground",
    "a screenshot",
    "a photo of a document or text",
    "a blurry photo",
    "a photo of an object on a table",
]


def slugify(text: str) -> str:
    """'Cherry_(including_sour)' -> 'cherry', 'Late_blight' -> 'late_blight'."""
    text = re.sub(r"\(.*?\)", "", text)  # drop parentheticals
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text)  # collapse everything else
    return text.strip("_").lower()


def _conv_block(in_ch: int, out_ch: int, pool: bool = False) -> nn.Sequential:
    layers = [
        nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1),
        nn.BatchNorm2d(out_ch),
        nn.ReLU(inplace=True),
    ]
    if pool:
        layers.append(nn.MaxPool2d(4))
    return nn.Sequential(*layers)


class ResNet9(nn.Module):

    def __init__(self, in_channels: int, num_classes: int):
        super().__init__()
        self.conv1 = _conv_block(in_channels, 64)
        self.conv2 = _conv_block(64, 128, pool=True)
        self.res1 = nn.Sequential(_conv_block(128, 128), _conv_block(128, 128))
        self.conv3 = _conv_block(128, 256, pool=True)
        self.conv4 = _conv_block(256, 512, pool=True)
        self.res2 = nn.Sequential(_conv_block(512, 512), _conv_block(512, 512))
        self.classifier = nn.Sequential(
            nn.MaxPool2d(4), nn.Flatten(), nn.Linear(512, num_classes)
        )

    def forward(self, xb):
        out = self.conv1(xb)
        out = self.conv2(out)
        out = self.res1(out) + out
        out = self.conv3(out)
        out = self.conv4(out)
        out = self.res2(out) + out
        return self.classifier(out)


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in ("1", "true", "yes", "on")


def _env_float(name: str, default):
    value = os.getenv(name)
    return default if value is None else float(value)


class PytorchMLInferenceService(MLInferenceService):
    """PlantVillage classifier with an optional CLIP "is this a leaf?" gate.
        This gate classifies and captures non-leaf items in order to improve
        classification accuracy.
    """

    def __init__(
        self,
        model_path: str | None = None,
        classes: list[str] | None = None,
        label_overrides: dict[str, tuple[str, str]] | None = None,
        input_size: int = 256,
        letterbox: bool = True,
        min_confidence: float | None = 0.5,
        device: str | None = None,
        leaf_gate: bool = True,
        leaf_min_prob: float = 0.5,
        clip_model: str | None = None,
    ):
        self.model_path = model_path or os.getenv("MODEL_PATH") or DEFAULT_MODEL_PATH
        self.classes = classes or PLANTVILLAGE_CLASSES
        self.label_overrides = label_overrides or LABEL_OVERRIDES
        self.input_size = int(_env_float("ML_INPUT_SIZE", input_size))
        self.letterbox = _env_bool("ML_LETTERBOX", letterbox)
        self.min_confidence = _env_float("ML_MIN_CONFIDENCE", min_confidence)
        self.device = torch.device(
            device or ("cuda" if torch.cuda.is_available() else "cpu")
        )

        self._pad_color = tuple(round(m * 255) for m in IMAGENET_MEAN)
        steps = [T.ToTensor()]
        if os.getenv("ML_NORMALIZE", "none").strip().lower() != "none":
            steps.append(T.Normalize(IMAGENET_MEAN, IMAGENET_STD))
        self._to_tensor = T.Compose(steps)

        self.model = self._load_model()

        self.leaf_gate = _env_bool("ML_LEAF_GATE", leaf_gate)
        self.leaf_min_prob = _env_float("ML_LEAF_MIN_PROB", leaf_min_prob)
        if self.leaf_gate:
            self._load_gate(
                clip_model
                or os.getenv("CLIP_MODEL", "openai/clip-vit-base-patch32")
            )
        self._split = {c: self._to_slugs(c) for c in self.classes}

    def _build_architecture(self) -> torch.nn.Module:
        """note: Only used when the .pth is a state_dict."""
        return ResNet9(3, len(self.classes))

    def _load_model(self) -> torch.nn.Module:
        if not Path(self.model_path).is_file():
            raise MLConfigurationError(f"Model file not found: {self.model_path}")
        try:
            obj = torch.load(
                self.model_path, map_location=self.device, weights_only=True
            )
        except pickle.UnpicklingError:
            main = sys.modules["__main__"]
            injected = not hasattr(main, "ResNet9")
            if injected:
                main.ResNet9 = ResNet9
            try:
                obj = torch.load(
                    self.model_path, map_location=self.device, weights_only=False
                )
            except (AttributeError, ModuleNotFoundError) as exc:
                raise MLConfigurationError(
                    "The model file is a full pickled model, but its class is not "
                    f"importable ({exc}). Make the class importable where the "
                    "pickle expects it, or re-save the model as a state_dict."
                ) from exc
            finally:
                if injected:
                    del main.ResNet9

        if isinstance(obj, torch.nn.Module):
            model = obj
        else:
            state = obj
            if isinstance(obj, dict):
                for key in ("state_dict", "model_state_dict", "model"):
                    if key in obj and isinstance(obj[key], dict):
                        state = obj[key]
                        break
            state = {k.removeprefix("module."): v for k, v in state.items()}
            model = self._build_architecture()
            model.load_state_dict(state)

        return model.to(self.device).eval()

    def _to_slugs(self, label: str) -> tuple[str, str]:
        if label in self.label_overrides:
            return self.label_overrides[label]
        plant, _, disease = label.partition("___")
        return slugify(plant), slugify(disease) or "unknown"

    def _preprocess(self, img: Image.Image) -> torch.Tensor:
        size = self.input_size
        if self.letterbox:
            img.thumbnail((size, size), Image.Resampling.BICUBIC)
            canvas = Image.new("RGB", (size, size), self._pad_color)
            canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
            img = canvas
        else:
            img = img.resize((size, size), Image.Resampling.BICUBIC)

        return self._to_tensor(img).unsqueeze(0).to(self.device)

    def _load_gate(self, name: str) -> None:
        try:
            from transformers import CLIPModel, CLIPProcessor
        except ImportError as exc:
            raise MLConfigurationError(
                "The leaf gate needs `transformers`; install it or set "
                "ML_LEAF_GATE=false"
            ) from exc

        self._clip = CLIPModel.from_pretrained(name).to(self.device).eval()
        self._clip_proc = CLIPProcessor.from_pretrained(name)
        prompts = LEAF_PROMPTS + NOT_LEAF_PROMPTS
        self._n_leaf_prompts = len(LEAF_PROMPTS)
        self._clip_text = self._clip_proc(
            text=prompts, return_tensors="pt", padding=True
        ).to(self.device)

    def _leaf_probability(self, img: Image.Image) -> float:
        pixels = self._clip_proc(images=img, return_tensors="pt")["pixel_values"]
        with torch.inference_mode():
            out = self._clip(**self._clip_text, pixel_values=pixels.to(self.device))
            probs = out.logits_per_image[0].softmax(dim=-1)
        return probs[: self._n_leaf_prompts].sum().item()

    def predict(self, image: bytes) -> dict[str, str]:
        img = Image.open(io.BytesIO(image)).convert("RGB")

        if self.leaf_gate and self._leaf_probability(img) < self.leaf_min_prob:
            return {"plant": "unknown", "disease": "unknown"}

        x = self._preprocess(img)

        with torch.inference_mode():
            probs = F.softmax(self.model(x), dim=1)[0]

        confidence, idx = probs.max(dim=0)
        confidence = confidence.item()
        plant, disease = self._split[self.classes[idx.item()]]

        if self.min_confidence is not None and confidence < self.min_confidence:
            disease = "unknown"

        return {
            "plant": plant,
            "disease": disease,
            "confidence": f"{confidence:.2f}",
        }