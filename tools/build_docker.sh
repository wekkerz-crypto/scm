#!/bin/sh
# Baut dist/Weckwop-Docker.zip: Ordner step2maestro-docker/ für die Diskstation (Synology Container Manager) oder jeden
# Docker-Rechner – Dockerfile, docker-compose.yml, start.sh, ANLEITUNG-DOCKER.txt und das Programm (wie das Webserver-Paket).
# Aufruf: sh tools/build_docker.sh   (bzw. npm run build:docker)
set -e
cd "$(dirname "$0")/.."
sh tools/build_web.sh >/dev/null
OUT=dist/Weckwop-Docker
rm -rf "$OUT" "$OUT.zip"
mkdir -p "$OUT/step2maestro-docker"
python3 - <<'PY'
import zipfile
z = zipfile.ZipFile('dist/Weckwop-Webserver.zip')
for n in z.namelist():
    if n.startswith('step2maestro/'):
        z.extract(n, 'dist/Weckwop-Docker/step2maestro-docker')
PY
cp tools/docker/Dockerfile tools/docker/docker-compose.yml tools/docker/start.sh "$OUT/step2maestro-docker/"
sed 's/$/\r/' tools/docker/ANLEITUNG-DOCKER.txt > "$OUT/step2maestro-docker/ANLEITUNG-DOCKER.txt"
(cd "$OUT" && python3 -c "
import zipfile, os
z = zipfile.ZipFile('../Weckwop-Docker.zip', 'w', zipfile.ZIP_DEFLATED)
for r, ds, fs in os.walk('step2maestro-docker'):
    for f in sorted(fs):
        p = os.path.join(r, f)
        i = zipfile.ZipInfo.from_file(p); i.external_attr = (0o755 if f.endswith('.sh') else 0o644) << 16
        z.writestr(i, open(p, 'rb').read(), zipfile.ZIP_DEFLATED)
z.close()")
rm -rf "$OUT"
ls -l "$OUT.zip"
