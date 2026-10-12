#!/bin/sh
# Baut dist/Weckwop-Pi.zip: Raspberry Pi am Sägeplatz – einrichten.sh (Zebra an USB über CUPS, Vollbild mit
# --kiosk-printing), ANLEITUNG-PI.txt und step2maestro/ zum Offline-Betrieb (wie das Webserver-Paket, ohne PHP-Teil).
# Dazu dist/Weckwop-Pi-Installer.sh: alles in einer Datei (tools/pi/installer-kopf.sh + Paket), fragt und ruft einrichten.sh auf.
# Aufruf: sh tools/build_pi.sh   (bzw. npm run build:pi)
set -e
cd "$(dirname "$0")/.."
sh tools/build_web.sh >/dev/null
OUT=dist/Weckwop-Pi
rm -rf "$OUT" "$OUT.zip"
mkdir -p "$OUT"
python3 - <<'PY'
import zipfile
z = zipfile.ZipFile('dist/Weckwop-Webserver.zip')
for n in z.namelist():
    if n.startswith('step2maestro/') and not n.startswith('step2maestro/dekore/') and n != 'step2maestro/.htaccess':
        z.extract(n, 'dist/Weckwop-Pi')
PY
cp tools/pi/einrichten.sh tools/pi/sprache_holen.sh tools/pi/weckwop-dienst.py tools/pi/ANLEITUNG-PI.txt "$OUT/"
(cd "$OUT" && python3 -c "
import zipfile, os
z = zipfile.ZipFile('../Weckwop-Pi.zip', 'w', zipfile.ZIP_DEFLATED)
for f in ('ANLEITUNG-PI.txt', 'einrichten.sh', 'sprache_holen.sh', 'weckwop-dienst.py'):
    i = zipfile.ZipInfo.from_file(f); i.external_attr = (0o755 if f.endswith(('.sh', '.py')) else 0o644) << 16
    z.writestr(i, open(f, 'rb').read(), zipfile.ZIP_DEFLATED)
for r, ds, fs in os.walk('step2maestro'):
    for f in sorted(fs): z.write(os.path.join(r, f))
z.close()")
# eine Datei zum Installieren: Kopf (Fragen, Prüfung) + Paket als base64 (tar.gz) angehängt
(cd "$OUT" && tar czf ../weckwop-pi-paket.tgz --owner=0 --group=0 ANLEITUNG-PI.txt einrichten.sh sprache_holen.sh weckwop-dienst.py step2maestro)
SUM="$(sha256sum dist/weckwop-pi-paket.tgz | cut -d' ' -f1)"
STAND="$(date +%Y-%m-%d)$(git rev-parse --short HEAD 2>/dev/null | sed 's/^/ · /')"
sed -e "s/@PRUEF@/$SUM/" -e "s/@STAND@/$STAND/" tools/pi/installer-kopf.sh > dist/Weckwop-Pi-Installer.sh
base64 -w 76 dist/weckwop-pi-paket.tgz >> dist/Weckwop-Pi-Installer.sh
chmod +x dist/Weckwop-Pi-Installer.sh
rm -f dist/weckwop-pi-paket.tgz
rm -rf "$OUT"
ls -l "$OUT.zip" dist/Weckwop-Pi-Installer.sh
