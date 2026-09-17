#!/usr/bin/env bash
# Create a local venv and install sklearn deps, then run a command with that Python.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/.venv"
PY="${PYTHON:-python3}"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "Creating $VENV (one-time)…"
  "$PY" -m venv "$VENV"
fi

"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q "scikit-learn>=1.5" "joblib>=1.4" "fastapi>=0.115" "uvicorn[standard]>=0.30"

exec "$VENV/bin/python" "$@"
