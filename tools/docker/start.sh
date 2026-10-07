#!/bin/sh
# Start im Container: Daten-Ordner (Volume /daten) anlegen und in das Programm einhängen, dann Apache.
set -e
W=/var/www/html
for d in dekore/daten dekore/bilder dekore/vorschau projekte/daten; do
  mkdir -p "/daten/$d"
  rm -rf "$W/$d"
  ln -s "/daten/$d" "$W/$d"
done
mkdir -p "${S2M_ORDNER:-/daten/ordner}"
chown -R www-data:www-data /daten "${S2M_ORDNER:-/daten/ordner}"
# Passwort der Dekor-Verwaltung schon gesetzt: Freigabe zum Einrichten entfernen
[ -f /daten/dekore/daten/passwort.php ] && rm -f "$W/dekore/EINRICHTEN"
# OpenAI-Schlüssel auch als Datei möglich: /daten/ki/openai-key (eine Zeile)
if [ -z "${OPENAI_API_KEY:-}" ] && [ -s /daten/ki/openai-key ]; then
  OPENAI_API_KEY="$(head -n 1 /daten/ki/openai-key | tr -d '\r\n ')"
  export OPENAI_API_KEY
fi
exec apache2-foreground
