#!/bin/sh
# Baut dist/STEP2XCS.exe (Windows, 64 Bit): Web-Tool eingebettet, öffnet sich im Standardbrowser.
# Aufruf: sh tools/build_exe.sh   (braucht Go ≥ 1.21)
set -e
cd "$(dirname "$0")/.."
rm -rf exe/web
mkdir -p exe/web/js dist
cp web/index.html exe/web/
cp web/js/*.js exe/web/js/
cd exe
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o ../dist/STEP2XCS.exe .
cd ..
rm -rf exe/web
ls -l dist/STEP2XCS.exe
