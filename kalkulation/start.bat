@echo off
rem Tischlerei-Kalkulation starten (Windows, aus dem Quellcode)
cd /d "%~dp0"
if not exist .venv (
  echo Erster Start: Python-Umgebung wird eingerichtet ...
  py -3 -m venv .venv || python -m venv .venv
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\python -m pip install -r requirements.txt
)
.venv\Scripts\python -m app %*
pause
