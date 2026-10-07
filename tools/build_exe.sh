#!/bin/sh
# Baut dist/STEP2XCS.exe (Windows, 64 Bit) und dist/STEP2XCS-portabel.zip (ohne .exe).
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
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui" -o ../dist/STEP2XCS.exe .
cd ..
rm -rf exe/web
# Variante ohne .exe: Ordner mit der Seite und einer Start-Datei
rm -rf dist/STEP2XCS-portabel dist/STEP2XCS-portabel.zip
mkdir -p dist/STEP2XCS-portabel/STEP2XCS
cp web/index.html dist/STEP2XCS-portabel/STEP2XCS/
cp -r web/js dist/STEP2XCS-portabel/STEP2XCS/js
cp -r web/css dist/STEP2XCS-portabel/STEP2XCS/css
printf '@echo off\r\nrem Öffnet den STEP-zu-XCS Konverter im Standardbrowser\r\nstart "" "%%~dp0index.html"\r\n' > "dist/STEP2XCS-portabel/STEP2XCS/STEP2XCS starten.cmd"
printf 'STEP-zu-XCS Konverter (ohne Installation)\r\n\r\nOrdner STEP2XCS an einen festen Ort kopieren (z. B. C:\\STEP2XCS)\r\nund index.html oder "STEP2XCS starten.cmd" doppelklicken.\r\nLäuft komplett im Browser, ohne Internet. Einstellungen bleiben erhalten,\r\nsolange der Ordner am selben Ort bleibt.\r\n' > dist/STEP2XCS-portabel/STEP2XCS/LIES-MICH.txt
(cd dist/STEP2XCS-portabel && python3 -c "
import zipfile, os
z = zipfile.ZipFile('../STEP2XCS-portabel.zip', 'w', zipfile.ZIP_DEFLATED)
for r, ds, fs in os.walk('STEP2XCS'):
    for f in fs: z.write(os.path.join(r, f))
z.close()")
rm -rf dist/STEP2XCS-portabel
ls -l dist/STEP2XCS.exe dist/STEP2XCS-portabel.zip
