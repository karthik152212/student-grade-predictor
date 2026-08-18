#!/usr/bin/env bash
# Gunicorn entrypoint for the Student Grade Predictor (production Linux).
#
# Render starts the app directly via its Blueprint startCommand
# (gunicorn app:app --workers 1 --bind 0.0.0.0:$PORT), so this script is
# optional. It is kept for manual/other Linux hosts:
#
# Usage (from the project root on a Linux host):
#   ./deploy/gunicorn_start.sh
set -euo pipefail

cd "$(dirname "$0")/.."          # project root (repo dir)
export PATH="$PWD/venv/bin:$PATH"

# Bind 0.0.0.0:8000 so the app is reachable behind whatever proxy the host
# provides; override the port with PORT if needed.
PORT="${PORT:-8000}"
exec gunicorn --workers 3 --bind "0.0.0.0:$PORT" app:app