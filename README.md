# AI-Powered Student Grade Predictor

A full-stack web app that predicts a student's **final marks** from
**study hours**, **attendance rate**, and **previous score**, using a
scikit-learn **Linear Regression** model served via **Flask + Gunicorn**
and deployed on **Render**.

## Features

- Three live sliders (Study Hours, Attendance %, Previous Score) with
  instant value display.
- One-click **Predict** → predicted marks (animated number) + colored
  grade badge (A/B green, C amber, D/F red) + context message.
- **Chart.js** scatter of training data with the model regression trend
  line and the current prediction as a highlighted point.
- Responsive card UI (two columns on desktop, single column on mobile).
- Strict server-side validation (non-numeric or out-of-range input →
  HTTP 400 with a clear message; never 500).
- `GET /api/health` for deployment checks.

## Architecture

```
GitHub ──► Render ──► Gunicorn ──► Flask ──► Linear Regression (model.pkl)
```

- **ML:** Python, scikit-learn, pandas, numpy, joblib
- **Backend:** Flask
- **Frontend:** HTML, CSS, vanilla JavaScript, Chart.js (CDN)
- **Production server:** Gunicorn (WSGI)
- **Hosting:** Render (Linux runtime, HTTPS, public URL)
- **Source control:** GitHub

## Environments

| Environment | How it runs |
| ----------- | ----------- |
| **Local development (Windows)** | `python app.py` — Flask dev server |
| **Production Linux (any host)** | `gunicorn app:app --bind 0.0.0.0:$PORT` |
| **Render (official)** | Gunicorn via `render.yaml` Blueprint |

> Gunicorn is **Unix-only** and does not run on native Windows (it needs
> the POSIX `fcntl` module). Local Windows development therefore uses the
> Flask dev server; production runs on Render's Linux runtime where
> Gunicorn is validated.

## Model Performance

Trained on ~500 synthetic rows (80/20 split, seed 42):

| Metric | Value |
| ------ | ----- |
| R²  (test) | **0.9627** |
| MAE (test) | **2.82** |

`model/metrics.json` holds the exact numbers.

## Dataset Generation

`model/generate_data.py` (seeded, reproducible) creates ~500 rows:
`final_marks` is a weighted linear combination of the three features
(study hours weighted highest, then previous score, then attendance)
plus Gaussian noise, clipped to `[0, 100]` — realistic but not perfectly
linear.

## Model Training

`model/train_model.py` loads `model/dataset.csv`, splits 80/20, fits
`LinearRegression`, reports R²/MAE, and persists `model/model.pkl` and
`model/metrics.json`. The model is trained **once at build time** and
loaded by Flask at startup — never per request.

## Project Structure

```
student-grade-predictor/
├── app.py                     # Flask entrypoint (app:app)
├── requirements.txt           # pinned deps (incl. gunicorn)
├── render.yaml                # Render Blueprint (official deployment)
├── DECISIONS.md               # architecture/decision changelog
├── model/
│   ├── generate_data.py
│   ├── train_model.py
│   ├── dataset.csv            # generated
│   ├── model.pkl              # generated (committed: no retrain on deploy)
│   └── metrics.json           # generated
├── static/
│   ├── style.css
│   └── script.js
├── templates/
│   └── index.html
├── deploy/
│   └── gunicorn_start.sh      # generic Linux/Gunicorn entry (optional)
├── tests/
│   └── test_app.py            # unittest suite (stdlib)
├── .gitignore
└── README.md
```

## Local Setup

```bash
# 1. Create venv + install pinned deps
python -m venv venv
venv\Scripts\python -m pip install -r requirements.txt   # Windows
# or: source venv/bin/activate && pip install -r requirements.txt   # Linux/macOS

# 2. Regenerate data + retrain (optional — model.pkl is already committed)
python model/generate_data.py
python model/train_model.py

# 3. Run the app (Flask dev server)
python app.py                  # serves on 0.0.0.0:8000

# Production WSGI (Linux only):
#   gunicorn app:app --workers 1 --bind 0.0.0.0:$PORT
```

## Running Tests

Tests use only the Python standard library (`unittest` + Flask test
client), so no extra dependency is required:

```bash
python -m unittest discover -s tests -v
```

Covers: health endpoint, valid prediction/shape/range, boundary inputs
(0s and max), grade bands, and invalid inputs (string, missing key,
out-of-range, malformed JSON → 400).

## GitHub Workflow

1. Clone: `git clone https://github.com/<owner>/student-grade-predictor.git`
2. Branch: `git checkout -b my-change`
3. Commit logically; push: `git push -u origin my-change`
4. Open a pull request. Merging to the default branch triggers a Render
   auto-deploy (`autoDeploy: true` in `render.yaml`).

## Render Deployment (official)

**Automated (Blueprint):** push this repo to GitHub, then in Render choose
**New → Blueprint** and select the repo. `render.yaml` configures a free
web service automatically:
- Build: `pip install -r requirements.txt`
- Start: `gunicorn app:app --workers 1 --bind 0.0.0.0:$PORT`
- Health check: `/api/health`
- Uses the committed `model/model.pkl` — no retraining during deploy.

**Manual (equivalent):** New Web Service → repo → Runtime *Python*,
set Build `pip install -r requirements.txt`, Start
`gunicorn app:app --workers 1 --bind 0.0.0.0:$PORT`, and add a health
check path `/api/health`. Render assigns a public **HTTPS** URL and
manages restart and the `PORT` variable — no SSH, Nginx, systemd, or EC2
needed.

Verify the public URL:

```bash
curl https://<your-service>.onrender.com/api/health   # -> {"status":"ok"}
```

## API

- `GET  /`               → frontend page
- `GET  /api/health`     → `{"status": "ok"}`
- `POST /api/predict`    → `{"predicted_marks": 67.39, "grade": "C"}`

```bash
curl -X POST http://127.0.0.1:8000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"study_hours": 6, "attendance_rate": 80, "previous_score": 70}'
```

Input is validated server-side: non-numeric values, missing keys, and
out-of-range values return **HTTP 400** with a clear error message.

**Grade bands:** A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, else F.

## Limitations

- **Synthetic data:** the dataset is generated, not real student data;
  real-world accuracy is unknown.
- **Linear model:** assumes a linear relationship; the `[0, 100]` clip
  flattens the very top/bottom of the range slightly.
- **Chart trend line** shows the model's prediction across
  *previous score* for the currently selected sliders, plus the current
  prediction point.
- **Gunicorn is Unix-only**; local Windows dev uses the Flask dev server.
- Chart.js is loaded from a CDN, so the page needs internet access.

## Troubleshooting

- **`/api/predict` returns 503** → model failed to load
  (`model/model.pkl` missing); it is committed, so re-clone or retrain.
- **`/api/predict` returns 400** → invalid input; read the `error` field
  for the exact problem.
- **`ModuleNotFoundError: No module named 'fcntl'` on `gunicorn`** → you
  are on Windows; use `python app.py` for local dev (Gunicorn is Unix-only).
- **Chart does not render** → the Chart.js CDN is unreachable; check
  network access.

## Decisions / Changelog

See `DECISIONS.md`. Notable: the deployment target was changed from the
originally specified **AWS EC2 (Nginx + systemd)** to **Render**; the
EC2-specific files were removed and `render.yaml` added.
