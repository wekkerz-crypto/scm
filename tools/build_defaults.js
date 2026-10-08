#!/usr/bin/env node
/* Erzeugt web/js/tools-default.js (Werkzeugliste) und web/js/sample.js (Beispiel-STEP) neu. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { parseTlgx } = require('../web/js/tools.js');

const tools = parseTlgx(fs.readFileSync(path.join(root, 'maestro/werkzeuge/def.tlgx'), 'utf8'));
fs.writeFileSync(path.join(root, 'web/js/tools-default.js'),
  '/* Standard-Werkzeugliste – erzeugt aus maestro/werkzeuge/def.tlgx (node tools/build_defaults.js) */\n' +
  'window.DEFAULT_TOOLS = ' + JSON.stringify(tools) + ';\n');

const samples = [['kp1 - Rechte Seite.step', 'step/Seitenwand_R.step'], ['kp1 - Oberboden.step', 'step/Oberboden.step'],
  ['5-Achs-Testplatte.step', 'test/fixtures/fuenfachs.step']]
  .map(([name, p]) => ({ name: name, text: fs.readFileSync(path.join(root, p), 'utf8') }));
fs.writeFileSync(path.join(root, 'web/js/sample.js'),
  '/* Beispieldaten – erzeugt von tools/build_defaults.js */\nwindow.SAMPLE_STEPS = ' + JSON.stringify(samples) + ';\n');
console.log(tools.length + ' Werkzeuge, ' + samples.length + ' Beispiele');
