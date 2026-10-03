#!/usr/bin/env node
/*
 * Kommandozeile: STEP → XCS
 *
 *   node cli/step2xcs.js teil.step [weitere.step …] [-o ausgabeordner] [--bat]
 *
 *   --bat            legt zusätzlich konvertieren.bat für den Maestro X-Konverter in den Ausgabeordner
 *   --tools datei    Werkzeugliste (.tlgx) für Durchmesser/Schneidenlängen (Standard: maestro/werkzeuge/def.tlgx)
 *   --step mm        Zustellung je Durchgang beim Fräsen (Standard: aus)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { convert, makeBatch } = require('../web/js/convert.js');
const { parseTlgx, infoMap } = require('../web/js/tools.js');

const args = process.argv.slice(2);
let outDir = null;
let bat = false;
let toolsFile = path.join(__dirname, '..', 'maestro', 'werkzeuge', 'def.tlgx');
let stepDown = 0;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o' || args[i] === '--out') outDir = args[++i];
  else if (args[i] === '--bat') bat = true;
  else if (args[i] === '--tools') toolsFile = args[++i];
  else if (args[i] === '--step') stepDown = parseFloat(args[++i]);
  else files.push(args[i]);
}
if (!files.length) {
  console.error('Aufruf: node cli/step2xcs.js teil.step [weitere.step …] [-o ausgabeordner] [--bat]');
  process.exit(1);
}

const settings = { stepDown: stepDown || 0 };
if (fs.existsSync(toolsFile)) settings.toolInfo = infoMap(parseTlgx(fs.readFileSync(toolsFile, 'utf8')));

let failed = 0;
const dirs = new Set();
for (const file of files) {
  const parts = convert(fs.readFileSync(file, 'utf8'), settings);
  const dir = outDir || path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  dirs.add(dir);
  for (const part of parts) {
    if (part.error) {
      failed++;
      console.error('✗ ' + file + ' / ' + part.name + ': ' + part.error);
      continue;
    }
    const target = path.join(dir, parts.length === 1 ? path.basename(file).replace(/\.(step|stp)$/i, '') + '.xcs' : part.fileName);
    fs.writeFileSync(target, part.xcs);
    const p = part.panel;
    console.log('✓ ' + target + '  (' + [p.L, p.W, p.T].map((v) => Math.round(v * 100) / 100).join(' × ') + ' mm, ' +
      part.ops.length + ' Bearbeitungen)');
    for (const w of part.warnings) console.log('  ⚠ ' + w);
  }
}
if (bat) {
  for (const dir of dirs) {
    const target = path.join(dir, 'konvertieren.bat');
    fs.writeFileSync(target, makeBatch());
    console.log('✓ ' + target);
  }
}
process.exit(failed ? 2 : 0);
