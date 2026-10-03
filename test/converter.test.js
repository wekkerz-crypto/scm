'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { convert } = require('../web/js/convert.js');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const one = (p) => {
  const parts = convert(read(p));
  assert.strictEqual(parts.length, 1);
  assert.strictEqual(parts[0].error, null);
  return parts[0];
};

// Bohrungen eines XCS-Programms inkl. aufgelöster Muster als sortierte Liste.
function drillSet(xcs) {
  const out = [];
  let plane = 'Top';
  let pat = [1, 1, 0, 0];
  for (const line of xcs.split(/\r?\n/)) {
    let m = /^SelectWorkplane\("(\w+)"\)/.exec(line);
    if (m) plane = m[1];
    m = /^CreatePattern\(([^)]*)\)/.exec(line);
    if (m) pat = m[1].split(',').map(Number);
    m = /^CreateDrill \("[^"]*", ([-\d.]+), ([-\d.]+), ([-\d.]+), ([-\d.]+)/.exec(line);
    if (m) {
      const [x, y, depth, d] = m.slice(1).map(Number);
      const [nY, nX, dY, dX] = pat;
      for (let i = 0; i < nY; i++) for (let j = 0; j < nX; j++) {
        out.push([plane, (x + j * dX).toFixed(2), (y + i * dY).toFixed(2), depth, d].join(' '));
      }
    }
  }
  return out.sort();
}

const lines = (s) => s.split(/\r?\n/).filter((l) => l.trim());

test('Seitenwand (Nachbau von 32_Seitenwand_R.xcs)', () => {
  const part = one('test/fixtures/seitenwand_32.step');
  const sample = read('maestro/beispiele/32_Seitenwand_R.xcs');
  assert.deepStrictEqual(drillSet(part.xcs), drillSet(sample));
  // Alles außer dem Sockelausschnitt (dort Bögen statt AddFilletToPolyline) muss 1:1 vorkommen
  const gen = new Set(lines(part.xcs));
  const skip = /Contour_2|AddFilletToPolyline|AddArc2Point|AddSegmentToPolyline\((1575|-30), 0\)|Milling_2/;
  for (const l of lines(sample)) {
    if (skip.test(l) || /^Create(Pattern|Drill)/.test(l)) continue;
    assert.ok(gen.has(l), 'fehlt: ' + l);
  }
  assert.match(part.xcs, /CreateRoughFinish\("Milling_2", 21, "", TypeOfProcess.GeneralRouting, "E016", "-1", 1,/);
  assert.match(part.xcs, /AddArc2PointCenterToPolyline\(634.871, 43.983, 1080, -511, false\);/);
  assert.deepStrictEqual(part.warnings, []);
});

test('Oberboden (Nachbau von 27_Oberboden.xcs) – horizontale Bohrungen', () => {
  const part = one('test/fixtures/oberboden_27.step');
  const sample = read('maestro/beispiele/27_Oberboden.xcs');
  assert.deepStrictEqual(drillSet(part.xcs), drillSet(sample));
  const noDrills = (s) => lines(s).filter((l) => !/^(CreatePattern|CreateDrill)/.test(l));
  assert.deepStrictEqual(noDrills(part.xcs), noDrills(sample));
});

test('Onshape-Export Oberboden (Meter-Einheiten)', () => {
  const part = one('step/Oberboden.step');
  assert.strictEqual(part.name, 'kp1 - Oberboden');
  assert.match(part.xcs, /CreateFinishedWorkpieceBox\("Workpiece", 692, 530, 19\);/);
  const d = drillSet(part.xcs);
  assert.strictEqual(d.filter((s) => s.startsWith('Left ')).length, 8);
  assert.strictEqual(d.filter((s) => s.startsWith('Right ')).length, 8);
  assert.ok(d.every((s) => / 27 8$/.test(s)));
});

test('Onshape-Export Seitenwand: Rundloch wird gefräst', () => {
  const part = one('step/Seitenwand_R.step');
  assert.match(part.xcs, /CreateFinishedWorkpieceBox\("Workpiece", 1000, 530, 19\);/);
  assert.match(part.xcs, /AddArc2PointCenterToPolyline\(432.698, 203.57, 482.86, 203.57, false\);/);
  assert.strictEqual(drillSet(part.xcs).length, 36);
});

test('Testplatte: Drehen, Falz, Quernut in Falz, Tasche, Durchbruch, Bohrung von unten', () => {
  const part = one('test/fixtures/testplatte.step');
  const p = part.panel;
  assert.deepStrictEqual([p.L, p.W, p.T].map(Math.round), [900, 400, 18]);
  assert.strictEqual(p.grooves.length, 1);
  assert.strictEqual(p.rebates.length, 1);
  assert.strictEqual(p.cutouts.length, 1);
  assert.match(part.xcs, /CreateSegment\("SlotSegment_1", 800, -50, 800, 450\);/);
  assert.match(part.xcs, /CreateDrill \("Drill_Vertical_\d+", 700, 22.5, 13, 35,.*"P"\);/);
  assert.match(part.xcs, /CreateDrill \("Drill_Vertical_\d+", 100, 300, 20, 7,.*"L"\);/);
  assert.ok(part.warnings.some((w) => /Tasche 60×80/.test(w)));
  assert.ok(part.warnings.some((w) => /von unten/.test(w)));
  assert.ok(part.xcs.endsWith('CreateNullOperation("XN", 1900, null, 1, 50, false, " ");\r\n'));
});

test('Wenden: Bohrung von unten wird oben', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [solid] = readParts(read('test/fixtures/testplatte.step'));
  const auto = convertSolid(solid, {});
  const o = auto.panel.orientation;
  const flipped = convertSolid(solid, {}, { orientation: { rot: o.rot, flip: !o.flip } });
  assert.deepStrictEqual([flipped.panel.L, flipped.panel.W].map(Math.round), [900, 400]);
  // Bohrung von unten (X=50, Y=50) liegt nach dem Wenden oben bei Y = 400 − 50
  assert.match(flipped.xcs, /CreateDrill \("Drill_Vertical_\d+", 50, 350, 10, 8,.*"P"\);/);
  assert.ok(flipped.warnings.some((w) => /von unten/.test(w))); // Topfband jetzt unten
});
