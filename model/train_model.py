"""
Phase 3 — Train a Linear Regression model for the Student Grade Predictor.

- Loads model/dataset.csv
- 80/20 train/test split
- Trains sklearn.linear_model.LinearRegression
- Evaluates R² and MAE, prints to console, saves to model/metrics.json
- Saves the fitted model with joblib.dump to model/model.pkl

Trained once at build time; the Flask app only loads the saved artifact.
"""

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

DATASET_PATH = "model/dataset.csv"
MODEL_PATH = "model/model.pkl"
METRICS_PATH = "model/metrics.json"
RANDOM_STATE = 42

FEATURES = ["study_hours", "attendance_rate", "previous_score"]
TARGET = "final_marks"


def main() -> None:
    df = pd.read_csv(DATASET_PATH)
    X = df[FEATURES].to_numpy()
    y = df[TARGET].to_numpy()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE
    )

    model = LinearRegression()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    r2 = float(r2_score(y_test, y_pred))
    mae = float(mean_absolute_error(y_test, y_pred))

    metrics = {
        "r2": round(r2, 4),
        "mae": round(mae, 4),
        "train_samples": int(X_train.shape[0]),
        "test_samples": int(X_test.shape[0]),
        "features": FEATURES,
        "model": "LinearRegression",
    }

    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    joblib.dump(model, MODEL_PATH)

    print(f"Saved model to {MODEL_PATH}")
    print(f"Saved metrics to {METRICS_PATH}")
    print(f"R²  (test): {r2:.4f}")
    print(f"MAE (test): {mae:.4f}")
    print("Coefficients:", dict(zip(FEATURES, np.round(model.coef_, 3))))
    print("Intercept:", round(float(model.intercept_), 3))


if __name__ == "__main__":
    main()