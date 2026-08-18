"""
Phase 2 — Synthetic data generation for the Student Grade Predictor.

Creates model/dataset.csv with ~500 rows:
  Features:  study_hours (0-12), attendance_rate (0-100), previous_score (0-100)
  Target:    final_marks (0-100)

final_marks is a weighted linear combination of the three features
(study_hours weighted highest, then previous_score, then attendance_rate)
plus Gaussian noise, clipped to [0, 100]. Seeded for reproducibility.
"""

import numpy as np
import pandas as pd

RNG_SEED = 42
N_ROWS = 500
OUTPUT_PATH = "model/dataset.csv"


def generate_dataset(n_rows: int = N_ROWS, seed: int = RNG_SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    study_hours = rng.uniform(0.0, 12.0, n_rows)
    attendance_rate = rng.uniform(0.0, 100.0, n_rows)
    previous_score = rng.uniform(0.0, 100.0, n_rows)

    # Weights reflect feature importance: study_hours highest, then previous
    # score, then attendance. Max ~2*12 + 0.45*100 + 0.30*100 = 99.
    final_marks = (
        2.00 * study_hours
        + 0.45 * previous_score
        + 0.30 * attendance_rate
        + rng.normal(loc=0.0, scale=3.5, size=n_rows)
    )
    final_marks = np.clip(final_marks, 0.0, 100.0)

    df = pd.DataFrame(
        {
            "study_hours": np.round(study_hours, 2),
            "attendance_rate": np.round(attendance_rate, 2),
            "previous_score": np.round(previous_score, 2),
            "final_marks": np.round(final_marks, 2),
        }
    )
    return df


if __name__ == "__main__":
    df = generate_dataset()
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(df)} rows to {OUTPUT_PATH}")
    print(df.describe().to_string())