'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { convert } = require('../web/js/convert.js');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ORIGINAL_ORDER = { orderRule: { on: false } }; // Reihenfolge wie in den Maestro-Beispielen
const one = (p, settings) => {
  const parts = convert(read(p), settings);
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
  const part = one('test/fixtures/seitenwand_32.step', ORIGINAL_ORDER);
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
  const part = one('test/fixtures/oberboden_27.step', ORIGINAL_ORDER);
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

test('Arbeitsfeld: bis 1300 mm IJ, darüber IL', () => {
  const X = require('../web/js/xcs.js');
  const panel = (L) => ({ L: L, W: 500, T: 19, outline: [], outlineIsRect: true, cutouts: [], drills: [], grooves: [], rebates: [],
    pockets: [], chamfers: [], slantWalls: [], slantDrills: [], bottom: [], warnings: [] });
  const field = (L) => /SetMachiningParameters\("(\w+)"/.exec(X.write(panel(L)).text)[1];
  assert.strictEqual(field(612), 'IJ');
  assert.strictEqual(field(1300), 'IJ');
  assert.strictEqual(field(1300.5), 'IL');
  assert.strictEqual(field(2305), 'IL');
});

test('Werkzeugbahn für die Animation', () => {
  const { convert } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const TP = require('../web/js/toolpath.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [part] = convert(read('test/fixtures/fuenfachs.step'), { toolInfo: toolInfo });
  const moves = TP.build(part, toolInfo, {});
  const format = moves.find((m) => m.type === 'cut' && m.label === 'Formatfräsen');
  const r = toolInfo.E014.d / 2;
  // Fräsermitte läuft außen um die Platte (Korrektur rechts)
  assert.ok(format.pts.every((q) => q[0] <= -r + 1e-6 || q[0] >= 600 + r - 1e-6 || q[1] <= -r + 1e-6 || q[1] >= 400 + r - 1e-6));
  const pocket = moves.filter((m) => m.type === 'cut' && /^Tasche/.test(m.label));
  assert.ok(pocket.length > 3, 'Tasche wird ausgeräumt');
  // keine Taschenbahn näher als der Fräserradius an der Insel (Mitte 130/200, R15)
  const rp = toolInfo.E016.d / 2;
  for (const m of pocket) for (const q of m.pts) assert.ok(Math.hypot(q[0] - 130, q[1] - 200) >= 15 + rp - 0.6);
  assert.ok(moves.some((m) => m.type === 'plunge'));
  assert.strictEqual(moves[moves.length - 1].label, 'Parkposition');
});

test('Reihenfolge-Regel (an/aus/geändert), Reihenfolge je Teil, zurück auf die Oberseite', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const X = require('../web/js/xcs.js');
  const [solid] = readParts(read('test/fixtures/oberboden_27.step'));
  // Regel aus: Reihenfolge wie erkannt (Formatfräsen zuerst)
  const off = convertSolid(solid, ORIGINAL_ORDER);
  assert.strictEqual(off.groups[0], 'format');
  // Standardregel: erst Bohrungen, Formatfräsen zuletzt – vor der Fräsung wieder "Top"
  const std = convertSolid(solid, {});
  assert.strictEqual(std.groups[std.groups.length - 1], 'format');
  const lines = std.xcs.split('\r\n').filter((l) => l);
  const iTop = lines.indexOf('SelectWorkplane("Top");');
  const iMill = lines.findIndex((l) => l.startsWith('CreateRoughFinish("Milling_1"'));
  assert.ok(iTop > lines.indexOf('SelectWorkplane("Right");') && iTop < iMill, 'Top vor der Fräsung');
  // Eigene Regel: Formatfräsen vor den Kantenbohrungen
  const seq = X.ruleSequence(X.DEFAULTS.orderRule).filter((c) => c !== 'format');
  seq.splice(seq.indexOf('drillSide'), 0, 'format');
  const own = convertSolid(solid, { orderRule: { on: true, seq: seq } });
  assert.strictEqual(own.groups[0], 'format');
  // Reihenfolge je Teil hat Vorrang: rechte Bohrungen vor die linken
  const order = std.groups.slice();
  const [a, b] = [order.findIndex((g) => /^drill:Left/.test(g)), order.findIndex((g) => /^drill:Right/.test(g))];
  [order[a], order[b]] = [order[b], order[a]];
  const swapped = convertSolid(solid, {}, { overrides: { order: order } });
  assert.ok(swapped.xcs.indexOf('SelectWorkplane("Right")') < swapped.xcs.indexOf('SelectWorkplane("Left")'));
  assert.deepStrictEqual(swapped.groups, order);
});

test('Frästiefe je Bearbeitung (Formatfräsen)', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [solid] = readParts(read('step/Oberboden.step'));
  const std = convertSolid(solid, {});
  assert.match(std.xcs, /CreateRoughFinish\("Milling_1", 22,/);
  assert.ok(std.ops.find((o) => o.key === 'format').depthAdjustable);
  const own = convertSolid(solid, {}, { overrides: { depths: { format: 19.5 } } });
  assert.match(own.xcs, /CreateRoughFinish\("Milling_1", 19.5,/);
  assert.deepStrictEqual(own.warnings, []);
  const shallow = convertSolid(solid, { contourExtra: 1 }, { overrides: { depths: { format: 18 } } });
  assert.match(shallow.xcs, /CreateRoughFinish\("Milling_1", 18,/);
  assert.ok(shallow.warnings.some((w) => /nicht durchgefräst/.test(w)));
  assert.match(convertSolid(solid, { contourExtra: 1 }).xcs, /CreateRoughFinish\("Milling_1", 20,/);
});

test('Runde Vertiefung ohne passenden Bohrer wird als Kreistasche gefräst', () => {
  const { convert } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  // Topfband Ø35 × 13 auf der Testplatte – ohne 35er Bohrer in der Liste
  const [part] = convert(read('test/fixtures/testplatte.step'), { toolInfo: toolInfo, drillsVertical: [3, 5, 7, 8], orderRule: { on: false } });
  assert.ok(!/CreateDrill \([^)]*, 35, /.test(part.xcs), 'nicht mehr als Bohrung');
  assert.match(part.xcs, /CreateCircleCenterRadius\("Pocket_\d", 700, 22.5, 17.5, false\);\r\n\r\nResetApproachStrategy\(\);\r\nResetRetractStrategy\(\);\r\nSetPneumaticHoodPosition\(1\);\r\nCreateContourPocket\("Pocketing_\d", 13, "", TypeOfProcess.ConcentricalPocket, "E016"/);
  const op = part.ops.find((o) => o.round);
  assert.strictEqual(op.label, 'Rundtasche Ø35×13');
  assert.ok(!part.warnings.some((w) => /Kein Bohrer Ø35/.test(w)));
  // Mit Bohrer Ø35 in der Liste bleibt es eine Bohrung
  const [drilled] = convert(read('test/fixtures/testplatte.step'), { toolInfo: toolInfo });
  assert.match(drilled.xcs, /CreateDrill \("Drill_Vertical_\d+", 700, 22.5, 13, 35,/);
  // Zu großer Fräser → Hinweis
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [solid] = readParts(read('test/fixtures/testplatte.step'));
  const big = convertSolid(solid, { toolInfo: toolInfo, drillsVertical: [7, 8] }, { overrides: { tools: { [op.key]: 'E014' } } });
  assert.ok(big.warnings.some((w) => /Rundtasche Ø35×13: Fräser E014 .* passt nicht hinein/.test(w)), big.warnings.join('|'));
});
