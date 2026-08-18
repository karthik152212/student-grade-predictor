"""
Student Grade Predictor — Flask backend.

- GET  /              minimal input page (templates/index.html)
- GET  /result        results page (templates/result.html); model coefficients
                       are injected server-side for model-derived explanations
- POST /api/predict   predicts final marks + grade from study_hours,
                      attendance_rate, previous_score (validated server-side)
- GET  /api/health    deployment health check -> {"status": "ok"}

The trained model (model/model.pkl) is loaded once at startup, not per request.
"""

import json
import math

import joblib
import numpy as np
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

MODEL_PATH = "model/model.pkl"

# Feature -> (min, max) for server-side validation.
BOUNDS = {
    "study_hours": (0.0, 12.0),
    "attendance_rate": (0.0, 100.0),
    "previous_score": (0.0, 100.0),
}
FEATURES = list(BOUNDS.keys())

GRADES = ((90, "A"), (75, "B"), (60, "C"), (40, "D"))  # else "F"


def _load_model(path: str = MODEL_PATH):
    """Load the trained model once at startup; None if unavailable."""
    try:
        return joblib.load(path)
    except Exception as exc:  # pragma: no cover - depends on environment
        print(f"WARNING: could not load model from {path}: {exc}")
        return None


# Loaded once at app startup (not per request).
model = _load_model()


def grade_for(marks: float) -> str:
    for threshold, grade in GRADES:
        if marks >= threshold:
            return grade
    return "F"


def _validate(payload) -> dict:
    """Return a dict of float features, raising ValueError on bad input."""
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")
    values = {}
    for feature, (lo, hi) in BOUNDS.items():
        raw = payload.get(feature)
        if isinstance(raw, bool):  # bool is a subclass of int; reject it
            raise ValueError(f"'{feature}' must be a number")
        try:
            value = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"'{feature}' must be a number (got {raw!r})")
        if not math.isfinite(value):
            raise ValueError(f"'{feature}' must be a finite number")
        if not lo <= value <= hi:
            raise ValueError(
                f"'{feature}' must be between {lo:g} and {hi:g} (got {value:g})"
            )
        values[feature] = value
    return values


def _model_info():
    """JSON-safe dict of the trained model's coefficients/intercept/features.

    Injected server-side into the results page so the explanations and what-if
    analysis are derived from the actual model — coefficients are never
    hard-coded in the frontend, keeping the model the single source of truth."""
    if model is None:
        return None
    return {
        "features": FEATURES,
        "coefficients": [float(c) for c in model.coef_],
        "intercept": float(model.intercept_),
    }


@app.get("/")
def index():
    # Minimal input page: collects the three inputs and a Predict button.
    # No prediction, chart, or model details are served on the homepage.
    return render_template("index.html")


@app.get("/result")
def result():
    # Results page. Model coefficients are injected server-side using the same
    # mechanism as before, so the page can compute contributions and what-if
    # scenarios from the actual trained model without a new API endpoint.
        info = _model_info()
        # Always pass a JSON string ("null" when the model is unavailable) so the
        # page can `JSON.parse` it unconditionally without template errors.
        model_json = json.dumps(info) if info is not None else "null"
        return render_template("result.html", model_json=model_json)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/predict")
def predict():
    if model is None:  # pragma: no cover - only when artifact is missing
        return jsonify({"error": "model is not loaded"}), 503

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "request body must be a JSON object"}), 400

    try:
        values = _validate(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    x = np.array([[values[f] for f in FEATURES]], dtype=float)
    predicted = float(model.predict(x)[0])
    predicted = round(min(100.0, max(0.0, predicted)), 2)

    return jsonify({"predicted_marks": predicted, "grade": grade_for(predicted)})


if __name__ == "__main__":
    # Local dev only; production runs via gunicorn.
    app.run(host="0.0.0.0", port=8000, debug=False)