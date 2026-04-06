"""
test_model.py — Run this BEFORE starting the FastAPI server.
Verifies that the .pkl files load correctly and the model predicts sensibly.

Usage:
    python test_model.py
"""

import pickle
import json
import re
from pathlib import Path

MODEL_DIR = Path(__file__).parent / "model"

# ── 1. File presence check ────────────────────────────────────────────────────
print("=" * 55)
print("MedAssist ML Model — Pre-flight Check")
print("=" * 55)

required = ["urgency_model.pkl"]
optional = ["model_info.json"]

for fname in required:
    path = MODEL_DIR / fname
    status = "✅ FOUND" if path.exists() else "❌ MISSING"
    print(f"  {status}  {fname}")

for fname in optional:
    path = MODEL_DIR / fname
    status = "✅ FOUND" if path.exists() else "⚠️  MISSING (optional)"
    print(f"  {status}  {fname}")

missing = [f for f in required if not (MODEL_DIR / f).exists()]
if missing:
    print(f"\n🚨 Cannot continue — missing required files: {missing}")
    print(f"   Place them inside:  ml-service/model/")
    exit(1)

print()

# ── 2. Load artifacts ─────────────────────────────────────────────────────────
print("Loading model pipeline...", end=" ")
with open(MODEL_DIR / "urgency_model.pkl", "rb") as f:
    model = pickle.load(f)
print("OK")

if (MODEL_DIR / "model_info.json").exists():
    with open(MODEL_DIR / "model_info.json") as f:
        info = json.load(f)
    print(f"Model info: {info}")

print(f"Classes in model: {list(model.classes_)}")
print()

# ── 3. Preprocessing ──────────────────────────────────────────────────────────
def preprocess(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

# ── 4. Sample predictions ─────────────────────────────────────────────────────
test_cases = [
    (
        "Patient reports mild headache and fatigue for two days. No fever. "
        "Advised rest and increased fluid intake.",
        "low",
    ),
    (
        "Patient has persistent chest pain radiating to left arm, shortness of breath, "
        "and dizziness for the last hour. Blood pressure elevated at 160/100.",
        "high",
    ),
    (
        "Moderate back pain after lifting heavy objects. No neurological symptoms. "
        "Prescribed ibuprofen 400mg and physiotherapy sessions.",
        "medium",
    ),
    (
        "Sudden severe headache described as worst of life, neck stiffness, "
        "photophobia. CT scan ordered immediately.",
        "high",
    ),
    (
        "Routine follow-up. Blood sugar levels stable. Continue metformin 500mg twice daily.",
        "low",
    ),
]

print("Running sample predictions:")
print("-" * 55)

passed = 0
for text, expected in test_cases:
    clean = preprocess(text)
    label = model.predict([clean])[0]
    proba = model.predict_proba([clean])[0]
    confidence = max(proba)
    classes = list(model.classes_)
    proba_dict = {c: round(float(p), 3) for c, p in zip(classes, proba)}

    match = "✅" if str(label).lower() == expected else "⚠️ "
    if str(label).lower() == expected:
        passed += 1

    print(f"{match} Predicted: {label:<8}  Confidence: {confidence:.1%}")
    print(f"   Expected:  {expected}")
    print(f"   Proba:     {proba_dict}")
    print(f"   Input:     {text[:70]}...")
    print()

print("-" * 55)
print(f"Results: {passed}/{len(test_cases)} matched expected labels")
print()

if passed >= 3:
    print("✅ Model looks good — you can start the FastAPI server.")
    print()
    print("Start command (local):")
    print("   cd ml-service")
    print("   uvicorn main:app --host 0.0.0.0 --port 8000 --reload")
    print()
    print("Start command (Docker):")
    print("   docker compose up --build")
else:
    print("⚠️  More than 2 predictions didn't match expected labels.")
    print("   This may be fine if your training data has different label distributions.")
    print("   Check with your roommate about the training dataset and labels used.")