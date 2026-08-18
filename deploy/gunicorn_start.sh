#!/usr/bin/env bash
# Gunicorn entrypoint for the Student Grade Predictor.
# Used by the systemd service (deploy/student-predictor.service) and for manual runs.
#
# Usage (from the project root on the server):
#   ./deploy/gunicorn_start.sh
set -euo pipefail

cd "$(dirname "$0")/.."          # project root (repo dir)
export PATH="$PWD/venv/bin:$PATH"

exec gunicorn --workers 3 --bind 127.0.0.1:8000 app:app