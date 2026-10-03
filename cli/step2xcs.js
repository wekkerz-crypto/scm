#!/usr/bin/env node
/*
 * Kommandozeile: STEP → XCS
 *
 *   node cli/step2xcs.js teil.step [weitere.step …] [-o ausgabeordner]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { convert } = require('../web/js/convert.js');

const args = process.argv.slice(2);
let outDir = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o' || args[i] === '--out') outDir = args[++i];
  else files.push(args[i]);
}
if (!files.length) {
  console.error('Aufruf: node cli/step2xcs.js teil.step [weitere.step …] [-o ausgabeordner]');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const parts = convert(fs.readFileSync(file, 'utf8'));
  const dir = outDir || path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
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
process.exit(failed ? 2 : 0);
