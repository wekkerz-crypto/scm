# Anleitung für Claude Code: Tischlerei-Kalkulation lokal installieren

Dieses Repository enthält die **Tischlerei-Kalkulation** (Ordner `kalkulation/`): eine lokale Web-App
(Python/FastAPI-Backend, Browser-Oberfläche ohne Build-Schritt). Ziel: die App auf diesem Rechner
lauffähig machen und dem Nutzer (Tischlermeister, deutschsprachig) erklären, wie er sie startet.
Antworte dem Nutzer auf Deutsch, kurz und ohne Fachjargon.

## Schritte

1. **Python prüfen** – benötigt Python 3.11, 3.12 oder 3.13 (64 Bit).
   - Windows: `py -3 --version` (sonst `python --version`). Fehlt Python oder ist die Version zu alt/neu:
     den Nutzer bitten, Python 3.12 von https://www.python.org/downloads/ zu installieren
     (Haken bei „Add python.exe to PATH“), danach neu prüfen. Nicht selbst systemweit installieren.
   - macOS/Linux: `python3 --version`.
2. **Virtuelle Umgebung und Pakete** (im Ordner `kalkulation/`):
   - Windows: `py -3.12 -m venv .venv` (bzw. passende Version), dann `.venv\Scripts\python -m pip install --upgrade pip`
     und `.venv\Scripts\python -m pip install -r requirements-dev.txt`
   - macOS/Linux: `python3 -m venv .venv` und `.venv/bin/pip install -r requirements-dev.txt`
   - Das Paket `cadquery-ocp-novtk` (OpenCascade, für STEP-Export) ist groß (~300 MB) – Download kann dauern.
3. **Tests ausführen** (müssen alle grün sein): `.venv\Scripts\python -m pytest -q tests`
   (macOS/Linux: `.venv/bin/python -m pytest -q tests`). Bei Fehlern Ursache suchen und dem Nutzer berichten,
   keine Tests abschalten.
4. **App starten**: `.venv\Scripts\python -m app` (oder `start.bat` doppelklicken; macOS/Linux `./start.sh`).
   Der Browser öffnet `http://localhost:8000`. Die Konsole zeigt die Adresse im lokalen Netz fürs Handy.
   Läuft schon etwas auf Port 8000: `--port 8080` verwenden.
5. **Windows-Firewall**: Beim ersten Start „Private Netzwerke“ erlauben, sonst geht der Handy-Upload (QR-Code) nicht.
6. **Optional: Desktop-Verknüpfung** auf `kalkulation\start.bat` anlegen, wenn der Nutzer das möchte
   (vorher fragen).
7. **Optional: eigene exe bauen** (nur Windows): `.venv\Scripts\pyinstaller --noconfirm tischlerei.spec`
   → `dist\Tischlerei-Kalkulation\Tischlerei-Kalkulation.exe`. Dauert einige Minuten, Ordner ca. 500 MB.

## Danach dem Nutzer erklären

- **KI einrichten**: In der App unter „Vorgaben & Preise → KI“ den Anthropic-API-Schlüssel eintragen
  (erstellen unter https://console.anthropic.com → API Keys). Ohne Schlüssel funktioniert alles außer
  Skizzenanalyse und KI-Angebotstext. Den Schlüssel nie in Dateien im Repository schreiben.
- **Eigene Werte**: Preise und Konstruktionsregeln sind Beispielwerte („Konstruktionsregeln“ und „Vorgaben & Preise“).
- **Daten**: liegen in `kalkulation/daten/` (beim Start aus dem Quellcode) bzw. `Dokumente\Tischlerei-Kalkulation`
  (bei der exe). Sicherung: Startseite → „alle Daten als ZIP herunterladen“. Der Ordner `daten/` ist nicht im Git.
- **Testprojekt**: Startseite → „Testprojekt: Unterschrank mit Tür + Fachboden“.

## Hinweise für Weiterentwicklung

- Ausführliche Doku, Architektur und offene Punkte: `kalkulation/README.md`.
- Tests: `kalkulation/tests/test_kern.py`; nach Änderungen immer ausführen.
- Frontend ohne Build: `kalkulation/static/` (Preact + htm, Three.js liegen unter `static/vendor/`).
- Kernlogik: `app/generator.py` (Datenmodell → Bauteile), `app/zeichnung.py`, `app/kollision.py`,
  `app/kalkulation.py`, `app/zuschnitt.py`, `app/step_export.py`, `app/ki.py`.
