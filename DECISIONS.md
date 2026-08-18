# Decisions & Changelog

This file records architecture/process decisions that deviate from, or
supersede, the original `Project spec · MD` / `AGENT_LOOP_PROMPT` inputs,
so the repository never silently contradicts its documentation.

## 2026-08-18 — Deployment target changed: AWS EC2 → Render

- **Decision:** The official production deployment target is **Render**.
  The original spec called for AWS EC2 (Ubuntu 22.04) behind Nginx +
  Gunicorn managed by systemd. That requirement is superseded.
- **Why:** The deployment path was simplified to a managed platform that
  serves the app from GitHub automatically. Render provides the Linux
  runtime Gunicorn requires, HTTPS, and a public URL without SSH/instance
  management.
- **Impact:**
  - Final architecture: **GitHub → Render → Gunicorn → Flask → app**.
  - Removed the EC2-specific `deploy/student-predictor.service`
    (systemd) and `deploy/nginx.conf` files.
  - Kept `deploy/gunicorn_start.sh` (generic production Gunicorn entry).
  - Added `render.yaml` (Render Blueprint) as the deployment definition.
  - README now documents local Windows dev, generic Linux/Gunicorn
    production, and the official Render deployment separately.
  - Gunicorn remains the production WSGI server (it is Unix-only; the
    `fcntl` error on Windows is an environment limitation, not a code
    issue, and is validated in Render's Linux runtime).

## 2026-08-18 — Deployment target changed: Render → PythonAnywhere

- **Decision:** The live/official production deployment is now
  **PythonAnywhere**: https://studentgradepredictor.pythonanywhere.com
- **Why:** The project was deployed on PythonAnywhere's Linux web
  hosting, which serves the app through Gunicorn and provides HTTPS and a
  public URL without EC2/Nginx/systemd. The earlier Render decision was
  superseded in practice by this deployment.
- **Impact:**
  - Final architecture: **GitHub → PythonAnywhere → Gunicorn → Flask →
    app**.
  - `render.yaml` remains in the repo as an optional alternative but is
    **not** the active deployment definition.
  - README now documents PythonAnywhere as the official deployment
    target (local Windows dev, generic Linux/Gunicorn, and the
    PythonAnywhere deployment are still described separately).
  - Gunicorn remains the production WSGI server and is validated on
    PythonAnywhere's Linux runtime (the `fcntl` error is a Windows-only
    limitation).

## 2026-08-18 — Other recorded decisions

- **`model/model.pkl` is committed to git.** Enables a fresh clone /
  any deployment to serve predictions without a training step (explicitly
  allowed by the build instructions).
- **Server-side validation rejects out-of-range / non-numeric input with
  HTTP 400** (rather than clamping). Matches the required API contract.
- **Chart trend line is rendered client-side** from the model
  coefficients injected by `GET /` (no extra API endpoints).
- **Synthetic dataset is reproducible** (`model/generate_data.py`, seed
  42); the model trains once at build time, never per request.
