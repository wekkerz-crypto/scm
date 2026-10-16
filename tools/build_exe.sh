#!/bin/sh
# Baut dist/Weckwop.exe (Windows, 64 Bit) und dist/Weckwop-portabel.zip (ohne .exe).
# Aufruf: sh tools/build_exe.sh   (braucht Go ≥ 1.21; Symbol/Versionsinfo: exe/rsrc_windows_amd64.syso,
# neu erzeugen mit: go install github.com/tc-hib/go-winres@latest && (cd exe && go-winres make --in winres/winres.json --arch amd64))
set -e
cd "$(dirname "$0")/.."
rm -rf exe/web
mkdir -p exe/web dist
cp web/index.html exe/web/
cp -r web/js exe/web/js
cp -r web/css exe/web/css
cd exe
# bewusst ohne -s -w (Symbole entfernen wirkt auf Virenscanner verdächtig)
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui" -o ../dist/Weckwop.exe .
cd ..
rm -rf exe/web
# Variante ohne .exe: Ordner mit der Seite und einer Start-Datei
rm -rf dist/Weckwop-portabel dist/Weckwop-portabel.zip
mkdir -p dist/Weckwop-portabel/Weckwop
cp web/index.html dist/Weckwop-portabel/Weckwop/
cp -r web/js dist/Weckwop-portabel/Weckwop/js
cp -r web/css dist/Weckwop-portabel/Weckwop/css
printf '@echo off\r\nrem Öffnet Weckwop im Standardbrowser\r\nstart "" "%%~dp0index.html"\r\n' > "dist/Weckwop-portabel/Weckwop/Weckwop starten.cmd"
printf 'Weckwop (ohne Installation)\r\n\r\nOrdner Weckwop an einen festen Ort kopieren (z. B. C:\\Weckwop)\r\nund index.html oder "Weckwop starten.cmd" doppelklicken.\r\nLäuft komplett im Browser, ohne Internet. Einstellungen bleiben erhalten,\r\nsolange der Ordner am selben Ort bleibt.\r\n' > dist/Weckwop-portabel/Weckwop/LIES-MICH.txt
(cd dist/Weckwop-portabel && python3 -c "
import zipfile, os
z = zipfile.ZipFile('../Weckwop-portabel.zip', 'w', zipfile.ZIP_DEFLATED)
for r, ds, fs in os.walk('Weckwop'):
    for f in fs: z.write(os.path.join(r, f))
z.close()")
rm -rf dist/Weckwop-portabel
ls -l dist/Weckwop.exe dist/Weckwop-portabel.zip
