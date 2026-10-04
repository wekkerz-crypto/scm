#!/usr/bin/env node
/*
 * Kommandozeile: STEP → XCS
 *
 *   node cli/step2xcs.js teil.step [weitere.step …] [-o ausgabeordner] [--bat]
 *
 *   --bat            legt zusätzlich konvertieren.bat für den Maestro X-Konverter in den Ausgabeordner
 *   --tools datei    Werkzeugliste (.tlgx) für Durchmesser/Schneidenlängen (Standard: maestro/werkzeuge/def.tlgx)
 *   --step mm        Zustellung je Durchgang beim Fräsen (Standard: aus)
 *   --no-order-rule  Reihenfolge wie erkannt statt nach der Reihenfolge-Regel
 *   --schraege-5achs Schrägen an Rundungen 5-achsig fräsen (CreateSlantedRoughFinish entlang der Kontur)
 *   --kugelfraesen   gewölbte Flächen mit dem Kugelfräser zeilenfräsen (lädt OpenCascade für das 3D-Netz)
 *   --4achs          gewölbte Zylinderflächen 4-achsig mit dem Schaftfräser abzeilen (übrige: Kugelfräser)
 *   --zweiseitig     Teile mit Bearbeitungen von unten: Seite 1 (mit Formatfräsen) und Seite 2 (um Y gewendet,
 *                    ohne Rohteil-Versatz) als Name_S1.xcs / Name_S2.xcs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { readParts, convertSolid, makeBatch } = require('../web/js/convert.js');
const OcctMesh = require('../web/js/occtmesh.js');
const { parseTlgx, infoMap } = require('../web/js/tools.js');

const args = process.argv.slice(2);
let outDir = null;
let bat = false;
let toolsFile = path.join(__dirname, '..', 'maestro', 'werkzeuge', 'def.tlgx');
let stepDown = 0;
let orderRule = true;
let curvedSlant = false;
let curvedSurface = false;
let flat4 = false;
let twoSided = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o' || args[i] === '--out') outDir = args[++i];
  else if (args[i] === '--bat') bat = true;
  else if (args[i] === '--tools') toolsFile = args[++i];
  else if (args[i] === '--step') stepDown = parseFloat(args[++i]);
  else if (args[i] === '--no-order-rule') orderRule = false;
  else if (args[i] === '--schraege-5achs') curvedSlant = true;
  else if (args[i] === '--kugelfraesen') curvedSurface = true;
  else if (args[i] === '--4achs') { curvedSurface = true; flat4 = true; }
  else if (args[i] === '--zweiseitig') twoSided = true;
  else files.push(args[i]);
}
if (!files.length) {
  console.error('Aufruf: node cli/step2xcs.js teil.step [weitere.step …] [-o ausgabeordner] [--bat]');
  process.exit(1);
}

const settings = { stepDown: stepDown || 0 };
if (!orderRule) settings.orderRule = { on: false };
if (curvedSlant) settings.curvedSlantOn = true;
if (curvedSurface) settings.curvedSurfaceOn = true;
if (flat4) settings.curvedSurfaceMode = 'flat4';
if (fs.existsSync(toolsFile)) settings.toolInfo = infoMap(parseTlgx(fs.readFileSync(toolsFile, 'utf8')));

async function main() {
  const occt = curvedSurface ? await OcctMesh.loadNode() : null;
  let failed = 0;
  const dirs = new Set();
  const used = new Map(); // Ordner → vergebene Dateinamen (nichts überschreiben, was in diesem Lauf entstand)
  for (const file of files) {
    let parts;
    try {
      const text = fs.readFileSync(file, 'utf8');
      const meshes = occt ? OcctMesh.read(occt, text) : null;
      parts = readParts(text, path.basename(file)).map((s) => convertSolid(s, settings, { meshes: meshes, overrides: { twoSided: twoSided } }));
    } catch (e) {
      failed++;
      console.error('✗ ' + file + ': ' + (e.message || e));
      continue;
    }
    const dir = outDir || path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    dirs.add(dir);
    if (!used.has(dir)) used.set(dir, new Set());
    const taken = used.get(dir);
    for (const part0 of parts) {
      if (part0.error) {
        failed++;
        console.error('✗ ' + file + ' / ' + part0.name + ': ' + part0.error);
        continue;
      }
      for (const part of part0.side2 ? [part0, part0.side2] : [part0]) {
        const name = part.fileName.replace(/\.xcs$/i, '');
        let k = name;
        for (let j = 2; taken.has(k.toLowerCase()); j++) k = name + '_' + j;
        taken.add(k.toLowerCase());
        const target = path.join(dir, k + '.xcs');
        fs.writeFileSync(target, part.xcs);
        const p = part.panel;
        console.log('✓ ' + target + '  (' + [p.L, p.W, p.T].map((v) => Math.round(v * 100) / 100).join(' × ') + ' mm, ' +
          part.ops.length + ' Bearbeitungen' + (part.side === 2 ? ', Seite 2' : '') + ')');
        for (const w of part.warnings) console.log('  ⚠ ' + w);
      }
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
}
main().catch((e) => { console.error('✗ ' + (e.message || e)); process.exit(1); });
