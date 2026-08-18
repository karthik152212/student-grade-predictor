# AI-Powered Student Grade Predictor

A full-stack web app that predicts a student's **final marks** from
**study hours**, **attendance rate**, and **previous score**, using a
scikit-learn **Linear Regression** model served via **Flask**, deployed
on **AWS EC2** behind **Nginx + Gunicorn** (systemd-managed).

## Tech Stack

- **ML:** Python, scikit-learn, pandas, numpy, joblib
- **Backend:** Flask (Python)
- **Frontend:** HTML, CSS, vanilla JavaScript, Chart.js (via CDN)
- **Server:** Gunicorn (WSGI) + Nginx (reverse proxy)
- **Deployment:** AWS EC2 (Ubuntu 22.04 LTS), GitHub for source control

## Model Performance

Trained on ~500 synthetic rows (80/20 split, seed 42):

| Metric | Value |
| ------ | ----- |
| R²  (test) | **0.9627** |
| MAE (test) | **2.82** |

`model/metrics.json` holds the exact numbers. The model is trained once
at build time (`model/train_model.py`) and loaded by the Flask app at
startup — never per request.

## Project Structure

```
student-grade-predictor/
├── app.py                     # Flask app entrypoint
├── requirements.txt
├── model/
│   ├── generate_data.py       # synthetic data (500 rows)
│   ├── train_model.py         # trains + saves model/metrics
│   ├── dataset.csv            # generated
│   ├── model.pkl              # generated (committed: deploy from fresh clone w/o retraining)
│   └── metrics.json           # generated
├── static/
│   ├── style.css
│   └── script.js
├── templates/
│   └── index.html
├── deploy/
│   ├── gunicorn_start.sh
│   ├── student-predictor.service   # systemd unit
│   └── nginx.conf
├── .gitignore
└── README.md
```

## Local Setup

```bash
# 1. Create venv + install pinned deps
python -m venv venv
venv\Scripts\pip install -r requirements.txt      # Windows
# or: source venv/bin/activate && pip install -r requirements.txt   # Linux/macOS

# 2. Regenerate data + retrain (optional — model.pkl is already committed)
python model/generate_data.py
python model/train_model.py

# 3. Run the app (dev server)
python app.py            # serves on 0.0.0.0:8000
# Production WSGI (Linux only):
#   gunicorn --workers 3 --bind 127.0.0.1:8000 app:app
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

Input is validated server-side (non-numeric or out-of-range values are
rejected with a `400` and a clear message).

**Grade bands:** A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, else F.

## Deployment (AWS EC2, Ubuntu 22.04)

Steps taken / to reproduce manually:

1. **Launch** a `t2.micro` Ubuntu 22.04 LTS instance; open inbound **TCP 22 (SSH)** and **80 (HTTP)** in its security group.
2. **Install** base packages:
   ```bash
   sudo apt update && sudo apt install -y python3 python3-pip python3-venv nginx git
   ```
3. **Get the code**:
   ```bash
   git clone https://github.com/<owner>/student-grade-predictor.git
   cd student-grade-predictor
   ```
4. **App environment** (model.pkl is already in the repo; regenerate if preferred):
   ```bash
   python3 -m venv venv
   venv/bin/pip install -r requirements.txt
   # optional: venv/bin/python model/generate_data.py && venv/bin/python model/train_model.py
   ```
5. **systemd service** (auto-start + restart on crash/reboot):
   ```bash
   sudo cp deploy/student-predictor.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now student-predictor
   systemctl status student-predictor
   ```
6. **Nginx reverse proxy** (port 80 → 127.0.0.1:8000):
   ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/default
   sudo nginx -t && sudo systemctl reload nginx
   ```
7. **Verify from outside** the instance:
   ```bash
   curl http://<PUBLIC-IP>/api/health    # -> {"status":"ok"}
   ```

## How the Prediction Works

`final_marks` is a weighted linear combination of the three features
(study hours weighted highest, then previous score, then attendance)
plus Gaussian noise, clipped to `[0, 100]` — so the data is realistic
but not perfectly linear. `train_model.py` fits `LinearRegression` on an
80/20 split and persists `model/model.pkl` + `model/metrics.json`.
