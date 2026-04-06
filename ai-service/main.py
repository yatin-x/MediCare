"""
MedAssist ML Microservice
Loads scikit-learn TF-IDF + Logistic Regression pipeline
Exposes /predict and /health endpoints
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
# import pickle
import joblib
import json
import os
import re
import logging
from pathlib import Path

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="MedAssist Urgency Predictor",
    description="Classifies clinical transcript text into low / medium / high urgency",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten this in production
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ── Model globals (loaded once at startup) ────────────────────────────────────
MODEL_DIR = Path(__file__).parent / "model"

# Single pipeline object — TF-IDF + calibrated classifier baked in together
model = None
model_info: dict = {}


def load_artifacts():
    """Load urgency_model.pkl (full pipeline) and model_info.json from model/ directory."""
    global model, model_info

    model_path = MODEL_DIR / "urgency_model.pkl"
    info_path  = MODEL_DIR / "model_info.json"

    if not model_path.exists():
        raise FileNotFoundError(
            f"Required model file not found: {model_path}\n"
            f"Place urgency_model.pkl inside ai-service/model/"
        )

    logger.info("Loading urgency model pipeline...")
    model = joblib.load(model_path)

    if info_path.exists():
        with open(info_path) as f:
            model_info = json.load(f)
        logger.info(f"Model info: {model_info}")
    else:
        logger.warning("model_info.json not found — continuing without metadata")
        model_info = {}

    logger.info("✅ Model pipeline loaded successfully")


@app.on_event("startup")
def startup_event():
    load_artifacts()


# ── Text preprocessing (mirrors lib/nlp.ts logic) ─────────────────────────────
def preprocess(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ── Schemas ───────────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    text: str           # cleanText or raw transcript — we preprocess anyway

class PredictResponse(BaseModel):
    urgency: str        # "low" | "medium" | "high"
    confidence: float   # 0.0 – 1.0
    probabilities: dict # {"low": 0.1, "medium": 0.3, "high": 0.6}
    model_version: str


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    """Used by Next.js analyze route to check if the ML service is up."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {
        "status": "ok",
        "model_loaded": True,
        "model_info": model_info,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="text field is empty")

    clean = preprocess(req.text)

    # Pipeline handles TF-IDF transform internally — just pass raw text
    predicted_label: str = model.predict([clean])[0]

    # Confidence from class probabilities
    proba = model.predict_proba([clean])[0]
    classes = list(model.classes_)
    proba_dict = {cls: round(float(p), 4) for cls, p in zip(classes, proba)}
    confidence = round(float(max(proba)), 4)

    # Normalise label to lowercase string
    urgency = str(predicted_label).lower()
    if urgency not in ("low", "medium", "high"):
        logger.warning(f"Unexpected label from model: {urgency!r} — defaulting to medium")
        urgency = "medium"

    logger.info(f"Predicted: {urgency} ({confidence:.2%}) | input length: {len(clean)} chars")

    return PredictResponse(
        urgency=urgency,
        confidence=confidence,
        probabilities=proba_dict,
        model_version=model_info.get("version", "1.0.0"),
    )