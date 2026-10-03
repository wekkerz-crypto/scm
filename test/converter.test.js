'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { convert } = require('../web/js/convert.js');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
// Reihenfolge und Konturfräsen wie in den Maestro-Beispielen
const ORIGINAL_ORDER = { orderRule: { on: false }, contourMode: 'rect' };
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
  assert.strictEqual(part.name, 'kp1_-_Oberboden');
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

test('Arbeitsfeld: bis 1300 mm IJ, darüber IL; breiter als 620 mm AB bzw. AD', () => {
  const X = require('../web/js/xcs.js');
  const panel = (L, W) => ({ L: L, W: W || 500, T: 19, outline: [], outlineIsRect: true, cutouts: [], drills: [], grooves: [], rebates: [],
    pockets: [], chamfers: [], slantWalls: [], slantDrills: [], bottom: [], warnings: [] });
  const field = (L, W) => /SetMachiningParameters\("(\w+)"/.exec(X.write(panel(L, W)).text)[1];
  assert.strictEqual(field(612), 'IJ');
  assert.strictEqual(field(1300), 'IJ');
  assert.strictEqual(field(1300.5), 'IL');
  assert.strictEqual(field(2305), 'IL');
  assert.strictEqual(field(2305, 620), 'IL');
  assert.strictEqual(field(1000, 620.5), 'AB');
  assert.strictEqual(field(1300, 800), 'AB');
  assert.strictEqual(field(1300.5, 621), 'AD');
  assert.strictEqual(field(2800, 1200), 'AD');
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
  assert.match(part.xcs, /CreateCircleCenterRadius\("Pocket_\d", 700, 22.5, 17.5, true\);\r\n\r\nResetApproachStrategy\(\);\r\nResetRetractStrategy\(\);\r\nSetPneumaticHoodPosition\(1\);\r\nCreateContourParallelStrategy\(true, 0\);\r\nCreateContourPocket\("Pocketing_\d", 13, "", TypeOfProcess.ConcentricalPocket, "E016"/);
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

test('Sonderkontur am Stück, Fase entlang der Kontur über Rundungen (Nachbau seite4)', () => {
  const { convert } = require('../web/js/convert.js');
  const [part] = convert(read('test/fixtures/seite4.step'));
  const x = part.xcs;
  assert.deepStrictEqual(part.warnings, []);
  // eine Fasen-Bahn mit dem Bogen um den Ausschnitt, keine Einzelstücke
  assert.strictEqual((x.match(/CreateChamfer\(/g) || []).length, 1);
  const chamferPath = ['CreatePolyline("ChamferPath_1", 0, 400);', 'AddSegmentToPolyline(0, 0);', 'AddSegmentToPolyline(241.433, 0);',
    'AddArc2PointCenterToPolyline(658.567, 0, 450, -70, true);', 'AddSegmentToPolyline(800, 0);', 'AddSegmentToPolyline(800, 400);'].join('\r\n');
  assert.ok(x.includes(chamferPath), 'Fasen-Bahn über den Bogen');
  assert.match(x, /CreateChamfer\("Chamfer_1", 10, 10, 0, 2,/);
  // Formatfräsen: ganze Außenkontur als eine Bahn, kein Konturausschnitt
  const fmt = part.ops.find((o) => o.key === 'format');
  assert.strictEqual(fmt.label, 'Formatfräsen (Sonderkontur)');
  assert.ok(fmt.segs.some((q) => q.type === 'arc'));
  assert.ok(!part.ops.some((o) => /^notch-/.test(o.key || '')));
  // alte Variante weiterhin wählbar
  const [rect] = convert(read('test/fixtures/seite4.step'), { contourMode: 'rect' });
  assert.ok(rect.ops.some((o) => /^notch-/.test(o.key || '')));
});

test('Umlaufende Fase über Geraden, Ausschnitt und Eckradien als geschlossene Bahn', () => {
  const { convert } = require('../web/js/convert.js');
  const [part] = convert(read('test/fixtures/sonderkontur.step'));
  assert.deepStrictEqual(part.warnings, []);
  const op = part.ops.find((o) => o.kind === 'chamfer');
  assert.strictEqual(op.label, 'Fase 3×3 oben umlaufend');
  assert.strictEqual(part.ops.filter((o) => o.kind === 'chamfer').length, 1);
  assert.deepStrictEqual(op.start, op.segs[op.segs.length - 1].to); // geschlossen
  assert.strictEqual(op.segs.filter((q) => q.type === 'arc').length, 3);
});

test('Runde Taschen immer im Uhrzeigersinn', () => {
  const { convert, readParts, convertSolid } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const TP = require('../web/js/toolpath.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [part] = convert(read('test/fixtures/seite4.step'), { toolInfo: toolInfo });
  const rounds = part.ops.filter((o) => o.round);
  assert.strictEqual(rounds.length, 2);
  // Kreis im Uhrzeigersinn, Strategie mit Drehrichtung 0 direkt vor dem Ausräumen
  const blocks = part.xcs.split('CreateCircleCenterRadius("Pocket_').slice(1);
  assert.strictEqual(blocks.length, 2);
  for (const b of blocks) {
    const head = b.split('\r\n')[0];
    assert.ok(head.endsWith(', true);'), 'Kreis im Uhrzeigersinn: ' + head);
    assert.ok(b.includes('SetPneumaticHoodPosition(1);\r\nCreateContourParallelStrategy(true, 0);\r\nCreateContourPocket('), 'Strategie Uhrzeigersinn');
  }
  // mit Zustellung: Uhrzeigersinn bleibt, Mehrfachdurchgänge dazu
  const [solid] = readParts(read('test/fixtures/seite4.step'));
  const st = convertSolid(solid, { toolInfo: toolInfo, stepDown: 2 });
  assert.ok(st.xcs.includes('CreateContourParallelStrategy(true, 0, true, 2, 0);'));
  // Animation: Kreise im Uhrzeigersinn (Fläche der Bahn negativ)
  const moves = TP.build(part, toolInfo, {}).filter((m) => m.type === 'cut' && /^Rundtasche/.test(m.label));
  const area = (pts) => pts.reduce((a, q, k) => (k ? a + pts[k - 1][0] * q[1] - q[0] * pts[k - 1][1] : 0), 0);
  assert.ok(moves.length > 2 && moves.every((m) => area(m.pts) < 0));
});

test('Taschen in den Stirnseiten (Spante)', () => {
  const T = require('../web/js/tools.js');
  const TP = require('../web/js/toolpath.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const part = one('test/fixtures/spante.step', { toolInfo: toolInfo });
  const side = part.ops.filter((o) => o.kind === 'pocket' && o.face);
  assert.deepStrictEqual(side.map((o) => o.face).sort(), ['Left', 'Right']);
  for (const o of side) {
    assert.strictEqual(o.depth, 20);
    // Langloch 11 mm breit: E016 (Ø11,38) passt nicht, es wird automatisch ein kleinerer Fräser gewählt
    assert.ok(toolInfo[o.tool].d < 11, o.tool);
  }
  assert.ok(!part.warnings.some((w) => /Schräge Fläche ohne Verbindung/.test(w)), part.warnings.join('\n'));
  // eigene Bearbeitungsebene je Kante, danach zurück auf die Oberseite
  const x = part.xcs;
  const iL = x.indexOf('SelectWorkplane("Left");');
  const iR = x.indexOf('SelectWorkplane("Right");');
  assert.ok(iL > 0 && iR > 0);
  assert.ok(x.indexOf('CreateContourPocket(', iL) > iL);
  assert.ok(x.indexOf('SelectWorkplane("Top");', Math.max(iL, iR)) > 0);
  // lokale Koordinaten: innerhalb der Kante (Breite 120, Dicke 30)
  for (const o of side) for (const q of o.segs) for (const pt of [q.a, q.b]) {
    assert.ok(pt[0] > 0 && pt[0] < 120 && pt[1] > 0 && pt[1] < 30);
  }
  // Animation zeigt die Kantentaschen als Ein-/Ausfahren an der Kante
  const moves = TP.build(part, toolInfo, {}).filter((m) => m.kind === 'edge');
  assert.ok(moves.length >= 2);
});

test('Schräge Enden sägen, Tasche und Bohrungen auf der schrägen Ebene (Holz)', () => {
  const T = require('../web/js/tools.js');
  const TP = require('../web/js/toolpath.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const part = one('test/fixtures/holz.step', { toolInfo: toolInfo });
  const x = part.xcs;
  assert.ok(!part.warnings.some((w) => /Schräge Bohrung|Schräge Fläche/.test(w)), part.warnings.join('\n'));
  // zwei Sägeschnitte 45° über die ganze Breite, Material links, Säge rechts
  const cuts = x.match(/CreateBladeCut\([^)]*\);/g) || [];
  assert.strictEqual(cuts.length, 2);
  for (const c of cuts) assert.ok(c.includes('"E070", "-1", 45, 2,'), c);
  // je Schräge eine eigene Ebene, erst nach den Sägeschnitten
  const planes = x.match(/CreateWorkplane\("Slanted_\d", [^)]*\);/g) || [];
  assert.strictEqual(planes.length, 2);
  assert.ok(x.lastIndexOf('CreateBladeCut(') < x.indexOf('CreateWorkplane('));
  assert.ok(planes.every((pl) => / 45\);$/.test(pl)));
  // Bohrungen Ø10 senkrecht zur Schräge, Langloch als Tasche mit passendem Fräser
  const drills = part.ops.filter((o) => o.kind === 'drill' && o.plane);
  assert.strictEqual(drills.length, 2);
  for (const d of drills) assert.ok(Math.abs(d.d.depth - 15) < 1e-6);
  const pk = part.ops.filter((o) => o.kind === 'pocket' && o.plane);
  assert.strictEqual(pk.length, 1);
  assert.ok(Math.abs(pk[0].depth - 10) < 1e-6);
  assert.ok(toolInfo[pk[0].tool].d < 11);
  assert.ok(/SelectWorkplane\("Slanted_\d"\);\r\n\r\nCreatePolyline\("Pocket_1"/.test(x));
  // mit Einstellung „fräsen“ wieder 5-Achs-Fräsen statt Säge
  const milled = one('test/fixtures/holz.step', { toolInfo: toolInfo, slantCut: 'mill' });
  assert.ok(!milled.xcs.includes('CreateBladeCut') && milled.xcs.includes('CreateSlantedRoughFinish'));
  // Animation läuft durch
  assert.ok(TP.build(part, toolInfo, {}).some((m) => m.blade));
});

test('Teilename aus der STEP, bereinigt, gleich für .xcs', () => {
  const { convert, partName } = require('../web/js/convert.js');
  // Onshape-Standardname „Part 1“ → Name der STEP-Datei
  const [sp] = convert(read('test/fixtures/spante.step'), {}, 'spante.step');
  assert.strictEqual(sp.name, 'spante');
  assert.strictEqual(sp.fileName, 'spante.xcs');
  // sprechender Teilename aus der STEP bleibt, Leerzeichen → _
  const [ob] = convert(read('step/Oberboden.step'), {}, 'Oberboden.step');
  assert.strictEqual(ob.fileName, ob.name + '.xcs');
  assert.ok(!/\s/.test(ob.name));
  // Umlaute und Sonderzeichen
  assert.strictEqual(partName('Tür Öffnung groß'), 'Tuer_Oeffnung_gross');
  assert.strictEqual(partName('Schublade  Front/links'), 'Schublade_Front_links');
  assert.strictEqual(partName('Café'), 'Cafe');
  assert.strictEqual(partName('  '), 'Teil');
  // Sägeschnitt heißt auch im Programm so
  const [hz] = convert(read('test/fixtures/holz.step'), {}, 'holz.step');
  assert.strictEqual(hz.name, 'holz');
  assert.ok(hz.xcs.includes('CreateBladeCut("Saegeschnitt_1", "Saegeschnitt 45 Grad",'));
  assert.ok(hz.ops.filter((o) => o.kind === 'blade').every((o) => o.label === 'Sägeschnitt 45°'));
});

test('Zustelltiefe Taschen, Extra-Tiefe Säge, Vorritzen', () => {
  const { convert } = require('../web/js/convert.js');
  // Taschen eigene Zustelltiefe, Konturen weiter mit der allgemeinen
  const [f] = convert(read('test/fixtures/fuenfachs.step'), { stepDown: 6, pocketStepDown: 3 });
  assert.ok(f.xcs.includes('CreateContourParallelStrategy(true, 1, true, 3, 0);'), 'Tasche mit 3 mm');
  assert.ok(f.xcs.includes('CreateUnidirectionalMillingStrategy(true, 6, 0, 1, false);'), 'Formatfräsen mit 6 mm');
  // 0 = wie Fräsen
  const [g] = convert(read('test/fixtures/fuenfachs.step'), { stepDown: 6, pocketStepDown: 0 });
  assert.ok(g.xcs.includes('CreateContourParallelStrategy(true, 1, true, 6, 0);'));
  // Säge: eigene Extra-Tiefe, Vorritzen vor dem Schnitt
  const [h] = convert(read('test/fixtures/holz.step'), { bladeExtra: 5, scoreCut: true, scoreDepth: 2.5, scoreOut: 12 });
  const cuts = h.xcs.match(/CreateSectioningMillingStrategy\(2\.5, 12, 0\);\r\nCreateBladeCut\([^)]*, 5\);/g) || [];
  assert.strictEqual(cuts.length, 2, h.xcs);
  const [k] = convert(read('test/fixtures/holz.step'), {});
  assert.ok(!k.xcs.includes('CreateSectioningMillingStrategy'));
});

test('Prüfung: Befehlsparameter, stabile Schlüssel, Sägeblatt, Dateinamen', () => {
  const { convert, partName, makeBatch, readParts, convertSolid } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  // CreateSlantedRoughFinish: nach dem Kopf nur inputSpeed, rotSpeed, speed, overMaterial (keine Korrektur)
  const [f] = convert(read('test/fixtures/fuenfachs.step'), { toolInfo: toolInfo });
  assert.ok(/CreateSlantedRoughFinish\("SlantedMilling_1", 0, 30, 2, 21, "", TypeOfProcess\.GeneralRouting, "E016", "-1", -1, -1, -1, 0\);/.test(f.xcs));
  // Bahn auf Werkzeugmitte: um r / cos(30°) zur Abfallseite versetzt (Oberkante X = 589.03, E016 Ø11.38)
  const m = /CreateSegment\("SlantSegment_1", ([\d.]+),/.exec(f.xcs);
  assert.ok(Math.abs(parseFloat(m[1]) - (589.03 + 11.38 / 2 / Math.cos(Math.PI / 6))) < 0.05, m[1]);
  // Formatfräsen zweistufig: Vorfräsen mit Aufmaß, Nachfräsen auf Endmaß, gleiche Geometrie
  const [two] = convert(read('test/fixtures/seitenwand_32.step'), { toolInfo: toolInfo, formatTwoStep: true, formatRoughTool: 'E022', formatAllowance: 1.5 });
  const iv = two.xcs.indexOf('CreateRoughFinish("Milling_1_Vor", ');
  const ie = two.xcs.indexOf('CreateRoughFinish("Milling_1", ');
  assert.ok(iv > 0 && ie > iv);
  assert.ok(two.xcs.includes('"E022", "-1", 2, "-1", "-1", "-1", 1.5);'));
  // Bearbeitungen auf schräger Ebene bleiben hinter dem Sägeschnitt, auch bei anderer Reihenfolge
  const [s] = readParts(read('test/fixtures/holz.step'), 'holz.step');
  const base = convertSolid(s, {}).groups;
  const bad = base.filter((g) => /ppocket|Slanted/.test(g)).concat(base.filter((g) => !/ppocket|Slanted/.test(g)));
  const r = convertSolid(s, {}, { overrides: { order: bad } });
  assert.ok(r.xcs.lastIndexOf('CreateBladeCut(') < r.xcs.indexOf('CreateWorkplane('));
  // Dateinamen: unter Windows reservierte Namen
  assert.strictEqual(partName('CON'), 'CON_');
  assert.strictEqual(partName('nul.txt'), 'nul_.txt');
  // .bat: Umlaute im Pfad → UTF-8-Konsole, sonst reines ASCII
  assert.ok(makeBatch({ toolsFile: 'C:\\Users\\Jürgen\\def.tlgx' }).includes('chcp 65001') );
  assert.ok(/^[\x00-\x7f]*$/.test(makeBatch({})) && !makeBatch({}).includes('chcp'));
});

test('Prüfung: Geometrie-Sonderfälle', () => {
  const { convert } = require('../web/js/convert.js');
  const one = (n) => convert(read('test/fixtures/pruefung/' + n + '.step'), {}, n + '.step')[0];
  // schräge Durchgangsbohrung (Zylinder nur von Ellipsen begrenzt)
  const a = one('A_slant_through');
  assert.ok(a.xcs.includes('CreateSlantedDrill('), 'schräge Bohrung erkannt');
  // runde Platte: Kreis statt Rechteck
  const h = one('H_disc');
  assert.ok(!h.warnings.some((w) => /Rechteck L×B angenommen/.test(w)));
  assert.ok(/CreatePolyline\("Contour_1", 600, 300\);\r\nAddArc2PointCenterToPolyline/.test(h.xcs));
  // Durchbruch mit Fase oben / mit Glasfalz rundum: Durchbruch wird gefräst
  for (const n of ['K_cutout_chamfer', 'L_cutout_rebate']) {
    const k = one(n);
    assert.strictEqual(k.panel.cutouts.length, 1, n);
    assert.ok(k.ops.some((o) => /^cutout-/.test(o.key)), n);
  }
  // Loch ganz in der Fase: durchgehend, nicht als Tasche
  const nh = one('N_hole_fully_in_chamfer');
  assert.ok(nh.ops.some((o) => /^round-/.test(o.key)) && !nh.ops.some((o) => o.round));
  // Zoll-Datei, deren mm-Basiseinheit vor der Zoll-Einheit steht: Einheit aus dem Kontext
  const c = one('C_inch2');
  assert.ok(Math.abs(c.panel.L - 600 * 25.4) < 0.01, String(c.panel.L));
});

test('Formatfräsen je Teil umschaltbar: normal / zweistufig', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [s] = readParts(read('test/fixtures/seitenwand_32.step'), 'x.step');
  const vor = (cfg, ov) => convertSolid(s, cfg, { overrides: ov || {} }).xcs.includes('_Vor"');
  assert.strictEqual(vor({}), false);
  assert.strictEqual(vor({ formatTwoStep: true }), true);
  assert.strictEqual(vor({}, { twoStep: true }), true);           // Teil zweistufig, Einstellung normal
  assert.strictEqual(vor({ formatTwoStep: true }, { twoStep: false }), false); // Teil normal, Einstellung zweistufig
});
