#!/bin/sh
# Baut dist/Step2Maestro-Webserver.zip: Ordner step2maestro/ zum Hochladen auf einen Webspace
# (index.html, js/, Schriften lokal statt Google Fonts, .htaccess) plus ANLEITUNG.txt (Strato).
# Aufruf: sh tools/build_web.sh   (bzw. npm run build:web)
set -e
cd "$(dirname "$0")/.."
OUT=dist/Step2Maestro-Webserver
rm -rf "$OUT" "$OUT.zip"
mkdir -p "$OUT/step2maestro"
cp -r web/js "$OUT/step2maestro/js"
cp -r tools/webserver/fonts "$OUT/step2maestro/fonts"
cp tools/webserver/.htaccess "$OUT/step2maestro/.htaccess"
# Google Fonts -> lokale Schriften (keine Anfrage an fremde Server)
python3 - "$OUT/step2maestro/index.html" <<'PY'
import re, sys
s = open('web/index.html', encoding='utf-8').read()
s, n = re.subn(r'<link rel="preconnect" href="https://fonts\.googleapis\.com">\n<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]*">',
               '<link rel="stylesheet" href="fonts/fonts.css">', s)
assert n == 1, 'Google-Fonts-Verweis in web/index.html nicht gefunden'
s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">', 1)
open(sys.argv[1], 'w', encoding='utf-8').write(s)
PY
sed 's/$/\r/' tools/webserver/ANLEITUNG.txt > "$OUT/ANLEITUNG.txt"
(cd "$OUT" && python3 -c "
import zipfile, os
z = zipfile.ZipFile('../Step2Maestro-Webserver.zip', 'w', zipfile.ZIP_DEFLATED)
z.write('ANLEITUNG.txt')
for r, ds, fs in os.walk('step2maestro'):
    for f in sorted(fs): z.write(os.path.join(r, f))
z.close()")
rm -rf "$OUT"
ls -l "$OUT.zip"
