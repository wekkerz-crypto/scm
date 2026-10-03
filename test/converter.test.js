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
  assert.match(part.xcs, /CreatePolyline\("Pocket_1", /);
  assert.match(part.xcs, /CreateContourPocket\("Pocketing_1", 5, "", TypeOfProcess.ConcentricalPocket, "E016"/);
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

test('konvertieren.bat für den X-Konverter', () => {
  const { makeBatch } = require('../web/js/convert.js');
  const bat = makeBatch({ xconverterPath: 'D:\\Maestro\\XConverter.exe', toolsFile: 'D:\\Tlgx\\def.tlgx' });
  assert.ok(/^[\x20-\x7e\r\n]*$/.test(bat), 'nur ASCII');
  assert.ok(!/[^\r]\n/.test(bat), 'nur CRLF');
  assert.match(bat, /set "XCONV=D:\\Maestro\\XConverter.exe"/);
  assert.match(bat, /set "TOOLS=D:\\Tlgx\\def.tlgx"/);
  assert.match(bat, /set "OUT=%~dp0pgmx"/);
  assert.match(bat, /call "%XCONV%" -s -m 0 -t "%TOOLS%" -i "%~1" -o "%OUT%\\%~2.pgmx"/);
  assert.match(makeBatch({ pgmxDir: 'C:\\Maestro\\Programme' }), /set "OUT=C:\\Maestro\\Programme"/);
});

test('5-Achs-Testplatte: Tasche mit Insel, Fasen, schräge Kante, schräge Bohrung, Zustellung', () => {
  const { convert } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [part] = convert(read('test/fixtures/fuenfachs.step'), { toolInfo: toolInfo, stepDown: 10 });
  assert.strictEqual(part.error, null);
  const x = part.xcs;
  assert.match(x, /CreateCircleCenterRadius\("Island_1_1", 130, 200, 15, true\);/);
  assert.match(x, /CreateContourPocket\("Pocketing_1", 8, "", TypeOfProcess.ConcentricalPocket, "E016", "-1", -1, -1, -1, 50, false, "Island_1_1"\);/);
  assert.match(x, /CreateChamfer\("Chamfer_\d", 3, 3, 0, 2,/);
  assert.match(x, /CreateChamfer\("Chamfer_\d", 2, 2, 0, 3,/);
  assert.match(x, /CreateSlantedRoughFinish\("SlantedMilling_1", 0, 30, 2, 21,/);
  assert.match(x, /CreateSlantedDrill\("Drill_Slanted_1", 350, 250, 19, 180, 30, 15, 8,/);
  assert.match(x, /CreateDrill \("Drill_Vertical_1", 185, 200, 13, 8,/); // Bohrung im Taschenboden
  assert.match(x, /CreateUnidirectionalMillingStrategy\(true, 10, 0, 1, false\);\r\nCreateRoughFinish\("Milling_1", 22,/);
  assert.ok(!/Contour_2/.test(x), 'keine Konturfräsung für Fasen/Gehrung');
  assert.deepStrictEqual(part.warnings, []);
});

test('Werkzeugwahl je Bearbeitung und Warnung bei zu kurzer Schneide', () => {
  const { convert } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const tools = T.parseTlgx(read('maestro/werkzeuge/def.tlgx'));
  assert.ok(tools.filter((t) => t.kind === 'mill').length > 30);
  assert.strictEqual(tools.find((t) => t.name === '066').blade, 5.1);
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [solid] = readParts(read('test/fixtures/fuenfachs.step'));
  const part = convertSolid(solid, { toolInfo: T.infoMap(tools) },
    { overrides: { tools: { 'pocket-0': 'E020', format: 'E040' }, steps: { 'pocket-0': 3 } } });
  assert.match(part.xcs, /CreateContourParallelStrategy\(true, 1, true, 3, 0\);\r\nCreateContourPocket\("Pocketing_1", 8, "", TypeOfProcess.ConcentricalPocket, "E020"/);
  assert.match(part.xcs, /CreateRoughFinish\("Milling_1", 22, "", TypeOfProcess.GeneralRouting, "E040"/);
  assert.ok(part.warnings.some((w) => /Schneidenlänge E040/.test(w)), part.warnings.join('|'));
});
