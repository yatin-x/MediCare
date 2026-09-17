"""
Train MedAssist urgency classifier (TF-IDF + calibrated logistic regression).

Usage:
    python3 ai-service/train.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).parent
MODEL_DIR = ROOT / "model"
DATA_PATH = ROOT / "data" / "urgency_train.jsonl"


def examples() -> list[tuple[str, str]]:
    high = [
        "Patient has persistent chest pain radiating to left arm, shortness of breath, and dizziness.",
        "Chest pain for 2 days and shortness of breath. Patient is scared this is an emergency.",
        "Sudden severe headache described as worst of life, neck stiffness, photophobia.",
        "Difficulty breathing and chest tightness after the antibiotic. Possible anaphylaxis.",
        "Unconscious episode with seizure at home. Family called emergency.",
        "Stroke symptoms: face droop, slurred speech, weakness on one side.",
        "Heart attack concern: crushing chest pain, sweating, nausea, radiating to jaw.",
        "Severe shortness of breath at rest, cannot speak full sentences.",
        "Gastrointestinal bleeding, vomiting blood, black stools, dizziness.",
        "Patient reports suicidal thoughts and a plan. Immediate safety needed.",
        "High fever 104 with stiff neck and confusion. Possible meningitis.",
        "Pregnant patient with severe abdominal pain and vaginal bleeding.",
        "Child with blue lips, difficulty breathing, and wheezing that is not improving.",
        "Severe allergic reaction, swelling of tongue, hives, difficulty breathing.",
        "Palpitations with chest pain and shortness of breath after exertion.",
        "I have had chest pain for 2 days. It is severe. I also have shortness of breath.",
        "Emergency: patient collapsed, unresponsive, no pulse initially.",
        "Worst headache of life with vomiting and blurred vision.",
        "Severe abdominal pain, rigid abdomen, fever — possible acute abdomen.",
        "Coughing blood, chest pain, and sudden shortness of breath.",
        "High blood pressure 190/120 with chest pain and headache.",
        "Diabetic patient with very high sugars, vomiting, deep breathing.",
        "Trauma: head injury, vomiting, not waking easily.",
        "Asthma attack not responding to inhaler, using accessory muscles.",
        "Chest pain radiating, shortness of breath, blood pressure 160/100.",
    ]
    medium = [
        "Cough and fever for 3 days. Take paracetamol and drink water.",
        "I have a cough and fever for 3 days. Sore throat and fatigue.",
        "The cough is still there. It has been worsening for 1 week. Fever came back.",
        "Moderate back pain after lifting. No neurological symptoms. Prescribed ibuprofen.",
        "Persistent fever for five days, infection likely, follow up needed.",
        "Worsening cough, headache, dizziness, weakness. Blood test advised.",
        "Moderate abdominal pain after meals. Recurring for two weeks.",
        "Urinary burning and fever. Possible UTI. Start antibiotics after culture.",
        "Ear pain and fever in a child. Recurring infection this month.",
        "Inflammation of the joint, swelling, difficulty walking but no fever spike.",
        "Follow up visit: symptoms improving but still persistent cough.",
        "Patient has moderate pain and recurring headaches. Needs attention this week.",
        "Sore throat, fever, swollen glands. Possible strep. Come back if worse.",
        "Skin infection spreading slowly, redness, warmth. Oral antibiotic considered.",
        "Asthma with night cough, using inhaler more, not an emergency today.",
        "Migraine for two days, photophobia mild, responding partly to medicine.",
        "Blood pressure a bit high, headache, no chest pain. Recheck in clinic.",
        "Diarrhea for four days, mild dehydration, oral rehydration advised.",
        "Wound looking infected, pus, fever low grade. Follow up in two days.",
        "Sinus pain and fever after a cold. Worsening despite rest.",
        "Patient reports persistent fatigue and low grade fever for a week.",
        "Cough with yellow sputum, fever, no chest pain. Chest x-ray if not better.",
        "Knee swelling after sprain, moderate pain, can still walk.",
        "Anxiety with palpitations but no chest pain or shortness of breath.",
        "Follow up from last viral illness. Still some fever at night.",
    ]
    low = [
        "Routine follow-up. Blood sugar levels stable. Continue metformin 500mg twice daily.",
        "Mild headache and fatigue for two days. No fever. Advised rest and fluids.",
        "Patient presented for a general consultation. Feeling well overall.",
        "Vaccination visit. No acute complaints.",
        "Mild runny nose for one day. Rest and steam inhalation.",
        "Skin dryness and itch. No infection. Moisturizer advised.",
        "Blood pressure check, numbers stable, continue current tablets.",
        "Sleep well, mild insomnia this week, no other symptoms.",
        "Thank you. I will rest and drink water. Feeling better already.",
        "Routine diabetes review. No chest pain, no shortness of breath.",
        "Mild sore throat without fever. Salt water gargle.",
        "Seasonal allergy, runny nose, cetirizine as needed.",
        "Well child visit. Eating well, no fever, no cough.",
        "Refill of pantoprazole. Acid reflux mild, diet advice.",
        "Patient wants a fitness certificate. No complaints.",
        "Mild backache after sitting long hours. Stretching and rest.",
        "Constipation mild. Increase fiber and water.",
        "Follow up after recovered viral illness. Fully better now.",
        "Eye strain from screens. No vision loss. Rest eyes.",
        "Mild anxiety about exams. Sleep hygiene discussed.",
        "Cold for two days, runny nose only, no fever.",
        "Lipoma check, soft lump, no pain. Reassurance.",
        "Dental checkup referral. No acute infection.",
        "Vitamin D advice. Fatigue mild, labs otherwise fine.",
        "Wound healed well. Remove dressing. No redness.",
    ]
    rows: list[tuple[str, str]] = []
    for text in high:
        rows.append((text, "high"))
    for text in medium:
        rows.append((text, "medium"))
    for text in low:
        rows.append((text, "low"))
    return rows


def main() -> None:
    rows = examples()
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DATA_PATH.open("w") as f:
        for text, label in rows:
            f.write(json.dumps({"text": text, "urgency": label}) + "\n")

    X_base = [t for t, _ in rows]
    y_base = [lab for _, lab in rows]
    X_train, X_test, y_train, y_test = train_test_split(
        X_base, y_base, test_size=0.25, random_state=42, stratify=y_base
    )
    train_aug_x = list(X_train)
    train_aug_y = list(y_train)
    for text, label in zip(X_train, y_train):
        train_aug_x.append(f"[patient] {text} [doctor] Please rest.")
        train_aug_y.append(label)

    clf = CalibratedClassifierCV(
        LogisticRegression(max_iter=2000, class_weight="balanced", C=2.0),
        method="sigmoid",
        cv=3,
    )
    pipe = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    ngram_range=(1, 2),
                    min_df=1,
                    max_features=8000,
                    sublinear_tf=True,
                ),
            ),
            ("clf", clf),
        ]
    )
    pipe.fit(train_aug_x, train_aug_y)
    preds = pipe.predict(X_test)
    acc = float(accuracy_score(y_test, preds))
    report = classification_report(y_test, preds, digits=3)
    print(report)
    print(f"holdout_accuracy={acc:.4f}")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    out = MODEL_DIR / "urgency_model.pkl"
    joblib.dump(pipe, out)

    info = {
        "version": "2.0.0",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "labels": ["low", "medium", "high"],
        "algorithm": "tfidf_1-2gram + calibrated logistic regression",
        "n_examples": len(train_aug_x),
        "holdout_accuracy": round(acc, 4),
        "description": {
            "low": "Minor issues, routine care",
            "medium": "Needs attention, follow-up required",
            "high": "Serious/emergency, immediate attention",
        },
        "note": "Synthetic labeled consult snippets for the demo. Retrain with real annotated visits before clinical use.",
    }
    (MODEL_DIR / "model_info.json").write_text(json.dumps(info, indent=2))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
