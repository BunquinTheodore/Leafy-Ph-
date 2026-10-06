"""MobileNetV2 PlantVillage inference service with a CLIP "is this a leaf?" gate.

(MODEL_PATH, ML_ALLOW_PICKLE, ML_RESIZE_MODE, ML_LEAF_GATE, ...) are read from env.
The classifier is Daksh159/plant-disease-mobilenetv2
(torchvision mobilenet_v2, 224x224, ImageNet normalization).

- Gate: a zero-shot CLIP model checks that the upload is a plant leaf BEFORE the
  classifier runs. Non-leaf images return plant="unknown", disease="unknown".
  The CLIP weights are downloaded automatically from Hugging Face on first start
  (about 600 MB for the default model) and cached for later runs.
- Handles any input size: MobileNetV2 ends in global average pooling, and every
  upload is brought to 224x224 with ML_RESIZE_MODE (crop | squash | pad | strict).
- Weights load strictly via load_state_dict. Plain state_dicts use
  torch.load(weights_only=True); a full pickled model is only unpickled when
  ML_ALLOW_PICKLE is on (the default), and only for files you trust.
- Class order is ASSUMED to be LABEL_MAP order (based on PlantVillage dataset labels)
- Output labels are mapped explicitly to the app's taxonomy (LABEL_MAP).

Extra dependency:  pip install transformers

Env vars for the gate:
  ML_LEAF_GATE         true/false   enable the gate (default true)
  ML_GATE_THRESHOLD    float        min leaf probability to pass (default 0.5)
  ML_GATE_MODEL        str          HF model id (default openai/clip-vit-base-patch32)
  ML_GATE_CACHE_DIR    path         where to cache the download (default: HF cache)
  ML_GATE_OFFLINE      true/false   never hit the network, use the cache only
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

# ---------------------------------------------------------------------------
# CLIP leaf gate
# ---------------------------------------------------------------------------
DEFAULT_GATE_MODEL = "openai/clip-vit-base-patch32"
DEFAULT_GATE_THRESHOLD = 0.5

LEAF_PROMPTS = [
    "a close-up photo of a plant leaf",
    "a photo of a diseased leaf",
    "a photo of a healthy green leaf",
]
NON_LEAF_PROMPTS = [
    "a photo of a person",
    "a photo of an animal",
    "a photo of a hand",
    "a photo of a room",
    "a photo of a building",
    "a photo of a vehicle",
    "a photo of food",
    "a photo of soil",
    "a photo of a whole tree",
    "a screenshot",
    "a photo of a document with text",
    "a blurry photo",
]


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _as_tensor(out) -> torch.Tensor:
    """get_*_features returns a tensor in transformers 4.x; newer versions may
    return a model-output object whose pooler_output holds the projected features."""
    if isinstance(out, torch.Tensor):
        return out
    return out.pooler_output


class CLIPLeafGate:
    """Zero-shot "is this a plant leaf?" check.

    Downloads the CLIP weights from Hugging Face on first use (cached afterwards),
    encodes the text prompts ONCE, and then only runs the image encoder per request.
    """

    def __init__(
        self,
        device: torch.device,
        model_name: str = DEFAULT_GATE_MODEL,
        threshold: float = DEFAULT_GATE_THRESHOLD,
        cache_dir: str | None = None,
        offline: bool = False,
    ):
        try:
            from transformers import CLIPImageProcessor, CLIPModel, CLIPTokenizer
        except ImportError as exc:
            raise MLConfigurationError(
                "The leaf gate needs the 'transformers' package "
                "(pip install transformers), or set ML_LEAF_GATE=false."
            ) from exc

        self.device = device
        self.threshold = threshold
        self.model_name = model_name

        logger.info(
            "Loading CLIP leaf gate %r (downloads on first run, then uses the cache)...",
            model_name,
        )
        try:
            self.model = (
                CLIPModel.from_pretrained(
                    model_name, cache_dir=cache_dir, local_files_only=offline
                )
                .to(device)
                .eval()
            )
            self.tokenizer = CLIPTokenizer.from_pretrained(
                model_name, cache_dir=cache_dir, local_files_only=offline
            )
            self.image_processor = CLIPImageProcessor.from_pretrained(
                model_name, cache_dir=cache_dir, local_files_only=offline
            )
        except OSError as exc:
            raise MLConfigurationError(
                f"Could not load/download CLIP model {model_name!r}"
                f"{' (offline mode, not in cache)' if offline else ''}: {exc}"
            ) from exc

        self.n_leaf = len(LEAF_PROMPTS)
        prompts = LEAF_PROMPTS + NON_LEAF_PROMPTS
        tokens = self.tokenizer(prompts, padding=True, return_tensors="pt").to(device)
        with torch.inference_mode():
            text_emb = _as_tensor(self.model.get_text_features(**tokens))
            self.text_emb = F.normalize(text_emb, dim=-1)  # (n_prompts, d)
            self.logit_scale = self.model.logit_scale.exp().item()
        logger.info(
            "CLIP leaf gate ready (threshold=%.2f, %d leaf / %d non-leaf prompts).",
            threshold, self.n_leaf, len(NON_LEAF_PROMPTS),
        )

    @torch.inference_mode()
    def leaf_probability(self, img: Image.Image) -> float:
        pixel_values = self.image_processor(images=img, return_tensors="pt")[
            "pixel_values"
        ].to(self.device)
        img_emb = F.normalize(
            _as_tensor(self.model.get_image_features(pixel_values=pixel_values)),
            dim=-1,
        )  # (1, d)
        logits = self.logit_scale * (img_emb @ self.text_emb.T)[0]  # (n_prompts,)
        probs = logits.softmax(dim=0)
        return probs[: self.n_leaf].sum().item()

    def is_leaf(self, img: Image.Image) -> tuple[bool, float]:
        p = self.leaf_probability(img)
        return p >= self.threshold, p


# ---------------------------------------------------------------------------
# Inference service
# ---------------------------------------------------------------------------
class PytorchMLInferenceService(MLInferenceService):
    def __init__(
        self,
        model_path: str | None = None,
        device: str | None = None,
        allow_pickle: bool | None = None,
        resize_mode: str | None = None,
        leaf_gate: bool | None = None,
        gate_threshold: float | None = None,
    ):
        self.model_path = Path(
            model_path or os.getenv("MODEL_PATH") or DEFAULT_MODEL_PATH
        )
        if allow_pickle is None:
            allow_pickle = _env_bool("ML_ALLOW_PICKLE", True)
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

        # Leaf gate (CLIP). Loaded at startup so the download happens here,
        # not on the first user request.
        if leaf_gate is None:
            leaf_gate = _env_bool("ML_LEAF_GATE", True)
        self.gate: CLIPLeafGate | None = None
        if leaf_gate:
            if gate_threshold is None:
                try:
                    gate_threshold = float(
                        os.getenv("ML_GATE_THRESHOLD", DEFAULT_GATE_THRESHOLD)
                    )
                except ValueError as exc:
                    raise MLConfigurationError(
                        "ML_GATE_THRESHOLD must be a number between 0 and 1."
                    ) from exc
            self.gate = CLIPLeafGate(
                device=self.device,
                model_name=os.getenv("ML_GATE_MODEL", DEFAULT_GATE_MODEL),
                threshold=gate_threshold,
                cache_dir=os.getenv("ML_GATE_CACHE_DIR") or None,
                offline=_env_bool("ML_GATE_OFFLINE", False),
            )
        else:
            logger.warning("Leaf gate disabled: non-leaf images will reach the classifier.")

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

        # Gate runs on the full-size image, BEFORE _fit, so a center-crop in the
        # classifier's preprocessing can't hide context from it.
        if self.gate is not None:
            is_leaf, leaf_p = self.gate.is_leaf(img)
            if not is_leaf:
                logger.info(
                    "Leaf gate rejected image (leaf_p=%.3f < %.2f).",
                    leaf_p, self.gate.threshold,
                )
                # confidence here = how sure the gate is that this is NOT a leaf
                return {
                    "plant": "unknown",
                    "disease": "unknown",
                    "confidence": f"{1.0 - leaf_p:.2f}",
                }

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