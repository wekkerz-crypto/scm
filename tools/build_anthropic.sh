#!/bin/sh
# Baut web/js/vendor/anthropic.js: Anthropic-SDK (@anthropic-ai/sdk) als ein Browser-Skript (window.Anthropic) für den
# KI-Assistenten. Braucht Internet (npm). Aufruf: sh tools/build_anthropic.sh [Version]
set -e
cd "$(dirname "$0")/.."
VER="${1:-0.131.0}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && npm init -y >/dev/null && npm i --no-audit --no-fund "@anthropic-ai/sdk@$VER" esbuild >/dev/null &&
  printf "import Anthropic from '@anthropic-ai/sdk';\nwindow.Anthropic = Anthropic;\n" > entry.js &&
  npx esbuild entry.js --bundle --minify --format=iife --platform=browser --target=es2020 --outfile=anthropic.js >/dev/null)
{ echo "/* @anthropic-ai/sdk $VER (MIT, siehe license.anthropic-sdk.txt) – Browser-Bündel: tools/build_anthropic.sh */"; cat "$TMP/anthropic.js"; } > web/js/vendor/anthropic.js
cp "$TMP/node_modules/@anthropic-ai/sdk/LICENSE" web/js/vendor/license.anthropic-sdk.txt
ls -l web/js/vendor/anthropic.js
