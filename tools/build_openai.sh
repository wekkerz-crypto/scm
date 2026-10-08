#!/bin/sh
# Baut web/js/vendor/openai.js: OpenAI-SDK (openai) als ein Browser-Skript (window.OpenAI) für den KI-Assistenten
# mit ChatGPT. Braucht Internet (npm). Aufruf: sh tools/build_openai.sh [Version]
set -e
cd "$(dirname "$0")/.."
VER="${1:-7.30.0}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && npm init -y >/dev/null && npm i --no-audit --no-fund "openai@$VER" esbuild >/dev/null &&
  printf "import OpenAI from 'openai';\nwindow.OpenAI = OpenAI;\n" > entry.js &&
  npx esbuild entry.js --bundle --minify --format=iife --platform=browser --target=es2020 --outfile=openai.js >/dev/null)
{ echo "/* openai $VER (Apache-2.0, siehe license.openai.txt) – Browser-Bündel: tools/build_openai.sh */"; cat "$TMP/openai.js"; } > web/js/vendor/openai.js
cp "$TMP/node_modules/openai/LICENSE" web/js/vendor/license.openai.txt
ls -l web/js/vendor/openai.js
