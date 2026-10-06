#!/bin/sh
# Baut dist/Step2Maestro-Pi.zip: Raspberry Pi am Sägeplatz – einrichten.sh (Zebra an USB über CUPS, Vollbild mit
# --kiosk-printing), ANLEITUNG-PI.txt und step2maestro/ zum Offline-Betrieb (wie das Webserver-Paket, ohne PHP-Teil).
# Aufruf: sh tools/build_pi.sh   (bzw. npm run build:pi)
set -e
cd "$(dirname "$0")/.."
sh tools/build_web.sh >/dev/null
OUT=dist/Step2Maestro-Pi
rm -rf "$OUT" "$OUT.zip"
mkdir -p "$OUT"
python3 - <<'PY'
import zipfile
z = zipfile.ZipFile('dist/Step2Maestro-Webserver.zip')
for n in z.namelist():
    if n.startswith('step2maestro/') and not n.startswith('step2maestro/dekore/') and n != 'step2maestro/.htaccess':
        z.extract(n, 'dist/Step2Maestro-Pi')
PY
cp tools/pi/einrichten.sh tools/pi/ANLEITUNG-PI.txt "$OUT/"
(cd "$OUT" && python3 -c "
import zipfile, os
z = zipfile.ZipFile('../Step2Maestro-Pi.zip', 'w', zipfile.ZIP_DEFLATED)
for f in ('ANLEITUNG-PI.txt', 'einrichten.sh'):
    i = zipfile.ZipInfo.from_file(f); i.external_attr = (0o755 if f.endswith('.sh') else 0o644) << 16
    z.writestr(i, open(f, 'rb').read(), zipfile.ZIP_DEFLATED)
for r, ds, fs in os.walk('step2maestro'):
    for f in sorted(fs): z.write(os.path.join(r, f))
z.close()")
rm -rf "$OUT"
ls -l "$OUT.zip"
