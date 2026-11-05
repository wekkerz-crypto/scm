#!/usr/bin/env bash
# Tischlerei-Kalkulation starten (Linux/macOS, aus dem Quellcode)
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  echo "Erster Start: Python-Umgebung wird eingerichtet ..."
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi
exec .venv/bin/python -m app "$@"
