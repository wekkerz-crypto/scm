#!/bin/bash
# Offline-Spracherkennung für den Sägemodus holen: Vosk (vosk-browser 0.0.8, Apache-2.0) und das kleine deutsche
# Modell (vosk-model-small-de-0.15, ca. 45 MB, Apache-2.0) → ZIEL/vosk.js und ZIEL/model-de.tar.gz.
#   bash sprache_holen.sh [ZIEL]      (Standard: ./vosk)
# Danach den Ordner als step2maestro/js/vendor/vosk/ ablegen (Pi offline: macht einrichten.sh --sprache selbst;
# Webserver: per FileZilla hochladen). Läuft nur über http/https, nicht aus einer Datei (file://).
set -euo pipefail
ZIEL="${1:-./vosk}"
MODELL="vosk-model-small-de-0.15"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
command -v curl >/dev/null || { echo "curl fehlt (sudo apt-get install curl)"; exit 1; }
command -v python3 >/dev/null || { echo "python3 fehlt"; exit 1; }
echo "Lade Vosk …"
curl -fsSL -o "$TMP/vb.tgz" "https://registry.npmjs.org/vosk-browser/-/vosk-browser-0.0.8.tgz"
tar xzf "$TMP/vb.tgz" -C "$TMP"
echo "Lade deutsches Sprachmodell (ca. 45 MB) …"
curl -fSL --progress-bar -o "$TMP/m.zip" "https://alphacephei.com/vosk/models/$MODELL.zip"
(cd "$TMP" && python3 -m zipfile -e m.zip . && tar czf model-de.tar.gz "$MODELL")
mkdir -p "$ZIEL"
cp "$TMP/package/dist/vosk.js" "$ZIEL/vosk.js"
cp "$TMP/model-de.tar.gz" "$ZIEL/model-de.tar.gz"
printf 'vosk-browser 0.0.8 (Apache-2.0, https://github.com/ccoreilly/vosk-browser)\n%s (Apache-2.0, https://alphacephei.com/vosk/models)\n' "$MODELL" > "$ZIEL/LIZENZ.txt"
echo "Fertig: $ZIEL (vosk.js, model-de.tar.gz)"
