'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { convert } = require('../web/js/convert.js');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
// Reihenfolge und Konturfräsen wie in den Maestro-Beispielen
// (Überlappung beim Verlassen in den alten Beispielen 0, heute Vorgabe 2)
const ORIGINAL_ORDER = { orderRule: { on: false }, contourMode: 'rect', suctionOn: false, commentOn: false, retractOverlap: 0 };
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

test('Umfräsen: Überlappung beim Verlassen (Vorgabe 2, einstellbar)', () => {
  assert.match(one('test/fixtures/oberboden_27.step').xcs, /SetApproachStrategy\(false, true, 2\);\r\nSetRetractStrategy\(false, true, 2, 2\);/);
  assert.match(one('test/fixtures/oberboden_27.step', { retractOverlap: 5 }).xcs, /SetRetractStrategy\(false, true, 2, 5\);/);
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
  const [part] = convert(read('test/fixtures/fuenfachs.step'), { toolInfo: toolInfo, stepDown: 10, slantCut: 'mill' });
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
  const [f] = convert(read('test/fixtures/fuenfachs.step'), { toolInfo: toolInfo, slantCut: 'mill' });
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

test('Sägeschnitt auch nach dem Wenden (Dreieck mit schrägen Kanten)', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [s] = readParts(read('test/fixtures/part7.step'), 'part7.step');
  for (const o of [{ rot: 0, flip: false }, { rot: 0, flip: true }, { rot: 1, flip: true }, { rot: 3, flip: false }]) {
    const r = convertSolid(s, {}, { orientation: o });
    assert.strictEqual(r.ops.filter((x) => x.kind === 'blade').length, 3, JSON.stringify(o));
    assert.ok(!r.ops.some((x) => x.kind === 'slant'), JSON.stringify(o));
  }
  // Einstellung „fräsen“ bleibt möglich
  const m = convertSolid(s, { slantCut: 'mill' }, { orientation: { rot: 0, flip: true } });
  assert.strictEqual(m.ops.filter((x) => x.kind === 'slant').length, 3);
});

test('Sauger-Vorschlag: Konsolen und Drehsauger', () => {
  const { convert } = require('../web/js/convert.js');
  const inside = (p, x, y) => x > 0 && x < p.L && y > 0 && y < p.W;
  for (const f of ['seitenwand_32', 'oberboden_27', 'testplatte', 'holz', 'part7']) {
    const [r] = convert(read('test/fixtures/' + f + '.step'), {}, f + '.step');
    const cups = r.suction.bars.flatMap((b) => b.cups.map((c) => Object.assign({ x: b.x }, c)));
    assert.ok(cups.length >= 2, f + ': mindestens zwei Sauger');
    // Saugfläche ganz auf dem Teil (mit Randabstand); exzentrisch: Fläche 45 mm neben der Drehachse, gedreht mit dem Winkel
    for (const c of cups) {
      const a = (c.rot * Math.PI) / 180;
      assert.ok(Math.abs(c.px - (c.x - c.e * Math.sin(a))) < 1e-6 && Math.abs(c.py - (c.y + c.e * Math.cos(a))) < 1e-6, f);
      assert.strictEqual(c.e, c.code === 'H75-M-145x55' ? 45 : 0, f);
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const qx = c.px + (u * c.sx / 2) * Math.cos(a) - (v * c.sy / 2) * Math.sin(a);
        const qy = c.py + (u * c.sx / 2) * Math.sin(a) + (v * c.sy / 2) * Math.cos(a);
        assert.ok(inside(r.panel, qx, qy), f + ': Saugfläche ragt über das Teil');
      }
    }
    // Sauger auf einer Konsole berühren sich nicht (Gehäuse 145)
    for (const b of r.suction.bars) for (let i = 1; i < b.cups.length; i++) assert.ok(b.cups[i].y - b.cups[i - 1].y >= 145 - 1e-6, f);
    // Konsolen mit Mindestabstand, Ausgabe nach SetWorkpieceSetupPosition
    const xs = r.suction.bars.map((b) => b.x);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 150 - 1e-6);
    assert.ok(/SetWorkpieceSetupPosition\(2, 2, 0, 0\);\r\n\r\nSetBarPosition\(1, /.test(r.xcs), f);
  }
  // großes Teil: große Sauger, schmales Teil: schmale Sauger, Dreieck: gedreht parallel zu den Kanten
  const big = convert(read('test/fixtures/oberboden_27.step'), {}, 'x.step')[0].suction.bars[0].cups;
  assert.ok(big.every((c) => c.code === 'H75-M-145x145'));
  const thin = convert(read('test/fixtures/holz.step'), {}, 'x.step')[0].suction.bars[0].cups;
  assert.ok(thin.every((c) => c.code === 'H75-M-145x55'));
  // sehr schmale Auflage: nur der 145×30 passt
  const narrow = convert(read('test/fixtures/holz.step'), { cupSmallY: 200 }, 'x.step')[0].suction.bars.flatMap((b) => b.cups);
  assert.ok(narrow.length && narrow.every((c) => c.code === 'H75-M-145x30'));
  const tri = convert(read('test/fixtures/part7.step'), {}, 'x.step')[0].suction.bars.flatMap((b) => b.cups);
  assert.ok(tri.some((c) => c.angle % 90 !== 0));
  // Sauger nie über einem Durchbruch: Testplatte hat einen
  const [tp] = convert(read('test/fixtures/testplatte.step'), {}, 'x.step');
  const PA = require('../web/js/panel.js');
  for (const b of tp.suction.bars) for (const c of b.cups) {
    for (const lp of tp.panel.cutouts) {
      const pts = [];
      for (const q of lp) for (const t of PA.segPoints(q)) pts.push(t);
      const xs2 = pts.map((q) => q[0]);
      const ys2 = pts.map((q) => q[1]);
      const free = c.px + c.sx / 2 < Math.min(...xs2) || c.px - c.sx / 2 > Math.max(...xs2) || c.py + c.sy / 2 < Math.min(...ys2) || c.py - c.sy / 2 > Math.max(...ys2);
      assert.ok(free || c.rot % 180 !== 0, 'Sauger über Durchbruch');
    }
  }
  // abschaltbar
  const [off] = convert(read('test/fixtures/holz.step'), { suctionOn: false }, 'x.step');
  assert.ok(!off.xcs.includes('SetBarPosition'));
});

test('Handbuch-Funktionen: Kopf, Werkstück-Kontur, Haltestege, Spirale, Stufenbohren', () => {
  const { convert } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const L = (x) => x.split('\r\n').filter((l) => l);
  // Standard: nur Kommentar/Beschreibung neu, sonst wie bisher (Quader, keine Stege, keine Spirale, keine Stufen)
  const [d] = convert(read('test/fixtures/testplatte.step'), { toolInfo: toolInfo, suctionOn: false }, 'testplatte.step');
  const dl = L(d.xcs);
  assert.strictEqual(dl[0].slice(0, 22), 'SetMachiningParameters');
  assert.strictEqual(dl[1], 'SetComment("STEP2XCS: testplatte");');
  assert.ok(/^SetDescription\("900 x 400 x 18 mm, \d+ Bearbeitungen"\);$/.test(dl[2]));
  assert.ok(dl[3].startsWith('CreateFinishedWorkpieceBox('));
  for (const w of ['SetOptimization', 'SetAutoSetup', 'Extrusion', '"TAB"', 'Helic', 'MultiStep']) assert.ok(!d.xcs.includes(w), w);
  // alles an
  const cfg = { toolInfo: toolInfo, suctionOn: false, optimizeOn: true, autoSetupOn: true, workpieceShape: 'contour',
    tabsMode: 'all', tabsCount: 2, tabLength: 6, tabHeight: 1.5, helixOn: true, helixStep: 4, drillStepFrom: 15, drillStep: 10 };
  const [a] = convert(read('test/fixtures/testplatte.step'), cfg, 'testplatte.step');
  const al = L(a.xcs);
  assert.deepStrictEqual(al.slice(3, 5), ['SetOptimization(true);', 'SetAutoSetup(true);']);
  // Rechteck bleibt Quader, auch bei „echte Kontur“
  assert.ok(al[5].startsWith('CreateFinishedWorkpieceBox('));
  // Durchbruch: zwei Stege nach Polylinien-Elementen, Spirale direkt vor dem Fräsen
  const cut = a.ops.find((o) => /^cutout-/.test(o.key));
  const block = a.xcs.slice(a.xcs.indexOf('CreatePolyline("Contour_' + cut.contour + '"'));
  const blk = L(block.slice(0, block.indexOf('CreateRoughFinish(') + 200));
  assert.strictEqual(blk.filter((l) => l === 'SetParametricAttribute2("TAB", 6, 1.5, 0.5);').length, 2);
  assert.ok(/^Add(Segment|Arc)/.test(blk[blk.indexOf('SetParametricAttribute2("TAB", 6, 1.5, 0.5);') - 1]));
  const ih = blk.findIndex((l) => l.startsWith('CreateHelicMillingStrategy('));
  assert.strictEqual(blk[ih], 'CreateHelicMillingStrategy(4, 0, false);');
  assert.ok(blk[ih + 1].startsWith('CreateRoughFinish("Milling_' + cut.milling + '"'));
  // Falz/Formatfräsen ohne Stege und ohne Spirale
  assert.strictEqual((a.xcs.match(/"TAB"/g) || []).length, 2);
  assert.strictEqual((a.xcs.match(/CreateHelicMillingStrategy/g) || []).length, 1);
  // Stufenbohren: nur tiefe Bohrungen, danach zurück auf einen Durchgang
  const i20 = al.findIndex((l) => /CreateDrill \("Drill_Vertical_\d+", 100, 300, 20,/.test(l));
  assert.strictEqual(al[i20 - 1], 'CreateMultiStepDrillingStrategy(true, 2, 10, true);');
  const i13 = al.findIndex((l) => /, 13, 35,/.test(l));
  assert.strictEqual(al[i13 - 1], 'CreateSingleStepDrillingStrategy();');
  // tiefer als die Grenze, aber nicht tiefer als eine Stufe: normal bohren (keine Stufen-Strategie mit 1 Stufe)
  const one = convert(read('test/fixtures/testplatte.step'), { drillStepFrom: 10, drillStep: 25 }, 'tp.step')[0].xcs;
  assert.ok(!/CreateMultiStepDrillingStrategy\(true, 1,/.test(one) && !one.includes('MultiStep'));
  // Animation: Innenstück mit Stegen fällt nicht heraus
  const TP = require('../web/js/toolpath.js');
  assert.ok(!TP.build(a, toolInfo, cfg).some((m) => m.slug));
  assert.ok(TP.build(d, toolInfo, {}).some((m) => m.slug));
  // echte Kontur bei Sonderteil: geschlossene Polylinie gegen den Uhrzeigersinn, dann Extrusion mit Dicke
  const [b] = convert(read('test/fixtures/seitenwand_32.step'), cfg, 'sw.step');
  const bl = L(b.xcs);
  const ie = bl.findIndex((l) => l === 'CreateFinishedWorkpieceFromExtrusion("Workpiece", 19);');
  const ip = bl.findIndex((l) => l.startsWith('CreatePolyline("Workpiece_Contour"'));
  assert.ok(ip > 0 && ie > ip && !b.xcs.includes('CreateFinishedWorkpieceBox'));
  const start = /CreatePolyline\("Workpiece_Contour", ([-\d.]+), ([-\d.]+)\)/.exec(bl[ip]).slice(1).map(Number);
  const last = /\(([-\d.]+), ([-\d.]+)/.exec(bl[ie - 1]).slice(1).map(Number);
  assert.deepStrictEqual(last, start);
  assert.ok(PanelLoopArea(b.panel.outline) > 0);
  assert.ok(bl[ie + 1].startsWith('CreateRawWorkpiece("Workpiece", 2, 2, 2, 2, 0, 0)'));
  // Haltestege „klein“: nur Innenstücke bis zur Grenze
  const [s1] = convert(read('test/fixtures/testplatte.step'), Object.assign({}, cfg, { tabsMode: 'small', tabsMaxSize: 50 }), 't.step');
  assert.ok(!s1.xcs.includes('"TAB"'));
  const [s2] = convert(read('test/fixtures/testplatte.step'), Object.assign({}, cfg, { tabsMode: 'small', tabsMaxSize: 500 }), 't.step');
  assert.ok(s2.xcs.includes('"TAB"'));
  // Kommentar nur ASCII, ohne Anführungszeichen
  const [u] = convert(read('test/fixtures/holz.step'), { suctionOn: false }, 'Tür "Ä" é.step');
  assert.ok(/^SetComment\("STEP2XCS: Tuer_Ae_e"\);$/.test(L(u.xcs)[1]), L(u.xcs)[1]);
});
const PanelLoopArea = (lp) => require('../web/js/panel.js').loopArea(lp);

// ---------------------------------------------------------------- gekrümmte Flächen

// Polylinie aus dem Programm als Punkte (Bögen fein abgetastet)
function polyPoints(xcs, name) {
  const lines = xcs.split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith('CreatePolyline("' + name + '"'));
  assert.ok(i >= 0, name + ' fehlt');
  const num = (l) => l.slice(l.indexOf('(') + 1, l.lastIndexOf(')')).split(',').map((x) => x.trim());
  let cur = num(lines[i]).slice(1).map(Number);
  const pts = [cur];
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.startsWith('AddSegmentToPolyline')) { cur = num(l).map(Number); pts.push(cur); continue; }
    if (!l.startsWith('AddArc2PointCenterToPolyline')) break;
    const [x, y, cx, cy, cw] = num(l);
    const to = [Number(x), Number(y)];
    const c = [Number(cx), Number(cy)];
    const r = Math.hypot(cur[0] - c[0], cur[1] - c[1]);
    assert.ok(Math.abs(Math.hypot(to[0] - c[0], to[1] - c[1]) - r) < 0.01, 'Bogen: Radius am Ende passt nicht');
    const a0 = Math.atan2(cur[1] - c[1], cur[0] - c[0]);
    let sw = Math.atan2(to[1] - c[1], to[0] - c[0]) - a0;
    if (cw === 'true') { while (sw >= -1e-9) sw -= 2 * Math.PI; } else { while (sw <= 1e-9) sw += 2 * Math.PI; }
    for (let j = 1; j <= 32; j++) pts.push([c[0] + r * Math.cos(a0 + (sw * j) / 32), c[1] + r * Math.sin(a0 + (sw * j) / 32)]);
    cur = to;
  }
  return pts;
}

test('Gekrümmte Flächen: Erkennung, Hinweis, aus ohne Änderung', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [sr] = readParts(read('test/fixtures/schraege_rund.step'), 'schraege_rund.step');
  const r = convertSolid(sr, {});
  const p = r.panel;
  assert.strictEqual(p.curvedSlants.length, 1);
  const c = p.curvedSlants[0];
  assert.ok(c.closed && c.up && !c.inner);
  assert.ok(Math.abs(c.tilt - 20) < 0.01);
  assert.strictEqual(c.segs.filter((q) => q.type === 'arc').length, 4);
  assert.strictEqual(p.curvedSurfaces.length, 0);
  // ausgeschaltet: wie bisher Sägeschnitte an den Geraden, Hinweis auf die Rundungen
  assert.strictEqual(r.ops.filter((o) => o.kind === 'blade').length, 4);
  assert.ok(!r.ops.some((o) => o.kind === 'slantpath' || o.kind === 'surface'));
  assert.ok(r.warnings.some((w) => /Schräge an einer Rundung erkannt/.test(w)));

  const [mu] = readParts(read('test/fixtures/mulde.step'), 'mulde.step');
  const m = convertSolid(mu, {});
  assert.deepStrictEqual(m.panel.curvedSurfaces.map((g) => g.kinds.join('+')).sort(), ['Kugel', 'Zylinder']);
  assert.strictEqual(m.panel.curvedSlants.length, 0);
  assert.ok(m.warnings.some((w) => /Gewölbte Fläche erkannt/.test(w)));
  assert.doesNotMatch(m.xcs, /CreateToolpath|CreateSlantedRoughFinish/);
  // gewölbte Flächen oben: Teil liegt richtig herum (Mulde oben)
  assert.ok(m.panel.curvedSurfaces.every((g) => g.depth > 9 && g.depth < 12.1));
});

test('Gekrümmte Flächen: Schräge an Rundungen 5-achsig, Bahn um r / cos(Neigung) versetzt', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [sr] = readParts(read('test/fixtures/schraege_rund.step'), 'schraege_rund.step');
  // Teil-Schalter gewinnt gegen die Einstellung
  assert.ok(!convertSolid(sr, { curvedSlantOn: true, toolInfo }, { overrides: { curved: { slant: false } } }).ops.some((o) => o.kind === 'slantpath'));
  const r = convertSolid(sr, { toolInfo }, { overrides: { curved: { slant: true } } });
  assert.deepStrictEqual(r.ops.map((o) => o.kind), ['slantpath', 'contour']); // keine Sägeschnitte mehr
  assert.deepStrictEqual(r.warnings, []);
  assert.match(r.xcs, /CreateSlantedRoughFinish\("SlantedMilling_1", 0, 20, 2, 21, "", TypeOfProcess\.GeneralRouting, "E016", "-1", -1, -1, -1, 0\);/);
  // jeder Punkt der Bahn liegt im Abstand r / cos 20° neben der Oberkante (abgerundetes Rechteck), geschlossen
  const p = r.panel;
  const off = (toolInfo.E016.d / 2) / Math.cos(20 * Math.PI / 180);
  const x0 = Math.min(...p.curvedSlants[0].segs.map((q) => q.a[0])); // Oberkante links
  const distOut = (q) => {
    // Abstand außerhalb des abgerundeten Rechtecks oben (Ecken um 60/60 … 540/340, Radius 60 − x0)
    const cx = Math.min(Math.max(q[0], 60), 540);
    const cy = Math.min(Math.max(q[1], 60), 340);
    return Math.hypot(q[0] - cx, q[1] - cy) - (60 - x0);
  };
  const pts = polyPoints(r.xcs, 'SlantPath_1');
  assert.ok(Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6);
  for (const q of pts) assert.ok(Math.abs(distOut(q) - off) < 0.01, 'Abstand ' + distOut(q) + ' statt ' + off + ' bei ' + q);
  // Animation: Achse je Punkt, um 20° geneigt, quer zur Bahn zum Material hin; Spitze auf Tiefe
  const mv = require('../web/js/toolpath.js').build(r, toolInfo);
  const cut = mv.find((m) => m.type === 'cut' && m.ax3s);
  assert.ok(cut && cut.ax3s.length === cut.pts3.length);
  assert.ok(!mv.some((m) => m.type === 'rapid' && m.ax3s));
  for (const a of cut.ax3s) assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-9 && Math.abs(a[2] - Math.cos(20 * Math.PI / 180)) < 1e-9);
  assert.ok(cut.pts3.every((q) => Math.abs(q[2] - (p.T - 21)) < 1e-6));
});

test('Gekrümmte Flächen: schräger Ausschnitt und schräges Rundloch (innen)', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [s] = readParts(read('test/fixtures/schraege_innen.step'), 'schraege_innen.step');
  const r = convertSolid(s, { toolInfo }, { overrides: { curved: { slant: true } } });
  const p = r.panel;
  assert.strictEqual(p.curvedSlants.length, 2);
  assert.ok(p.curvedSlants.every((c) => c.closed && c.inner && c.up));
  assert.deepStrictEqual(r.warnings, []);
  assert.ok(!r.ops.some((o) => o.kind === 'slant'), 'gerade Schrägen gehören zur Bahn an der Rundung');
  const off = (toolInfo.E016.d / 2) / Math.cos(15 * Math.PI / 180);
  // Ausschnitt: Bahn liegt innen (Abfall = Öffnung), Abstand off zur Oberkante
  const hole = p.curvedSlants.find((c) => c.segs.length > 1);
  const xs = hole.segs.map((q) => q.a[0]);
  const ys = hole.segs.map((q) => q.a[1]);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const rc = 30 + (box.x1 - box.x0 - 200) / 2; // Eckradius oben (Ausschnitt oben weiter)
  const distIn = (q) => {
    const cx = Math.min(Math.max(q[0], box.x0 + rc), box.x1 - rc);
    const cy = Math.min(Math.max(q[1], box.y0 + rc), box.y1 - rc);
    return rc - Math.hypot(q[0] - cx, q[1] - cy);
  };
  for (const q of polyPoints(r.xcs, 'SlantPath_1')) assert.ok(Math.abs(distIn(q) - off) < 0.02, 'Abstand ' + distIn(q) + ' bei ' + q);
  // Rundloch: Kreis, Radius oben − off, zwei Halbkreise
  const cone = p.curvedSlants.find((c) => c.segs.length === 1).segs[0];
  const off20 = (toolInfo.E016.d / 2) / Math.cos(20 * Math.PI / 180);
  for (const q of polyPoints(r.xcs, 'SlantPath_2')) assert.ok(Math.abs(Math.hypot(q[0] - cone.c[0], q[1] - cone.c[1]) - (cone.r - off20)) < 0.01);
  // ohne Schalter: Durchbrüche wie bisher, Hinweis
  const o = convertSolid(s, { toolInfo });
  assert.ok(o.warnings.some((w) => /Schräge an einer Rundung erkannt \(2×\)/.test(w)));
});

test('Gekrümmte Flächen: Kugelfräser auf Fläche, Kante und Ecke (Drop-Cutter)', () => {
  const S = require('../web/js/surface.js');
  const mesh = (pos, index) => S.prepare({ pos: new Float32Array(pos), index: index }, 6);
  const flat = mesh([0, 0, 5, 100, 0, 5, 100, 100, 5, 0, 100, 5], [0, 1, 2, 0, 2, 3]);
  assert.ok(Math.abs(S.dropCenter(flat, 50, 50) - 11) < 1e-9);               // Fläche
  assert.ok(Math.abs(S.dropCenter(flat, 103, 50) - (5 + Math.sqrt(27))) < 1e-9); // über die Kante hinaus
  assert.strictEqual(S.dropCenter(flat, 107, 50), -Infinity);
  const slope = mesh([0, 0, 0, 100, 0, 50, 100, 100, 50, 0, 100, 0], [0, 1, 2, 0, 2, 3]);
  assert.ok(Math.abs(S.dropCenter(slope, 50, 50) - (25 + 6 * Math.sqrt(1.25))) < 1e-9);
  const ridge = mesh([0, 0, 0, 50, 0, 10, 50, 100, 10, 0, 100, 0, 100, 0, 0, 100, 100, 0], [0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2]);
  assert.ok(Math.abs(S.dropCenter(ridge, 51, 50) - (10 + Math.sqrt(35))) < 1e-9); // Grat (Kante)
  const edge = mesh([0, 50, 0, 100, 50, 50, 100, 50.0001, 50], [0, 1, 2]);
  assert.ok(Math.abs(S.dropCenter(edge, 50, 50) - (25 + 6 * Math.sqrt(1.25))) < 1e-3); // schräge Kante
  // Punkte zusammenfassen: Gerade bleibt zwei Punkte
  assert.strictEqual(S.simplify([[0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 0, 3]], 0.01).length, 2);
});

test('Gekrümmte Flächen: Zeilenfräsen der Mulde mit dem Kugelfräser (OpenCascade-Netz)', async () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const OM = require('../web/js/occtmesh.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const text = read('test/fixtures/mulde.step');
  const occt = await OM.loadNode();
  const [mu] = readParts(text, 'mulde.step');
  // ohne Netz: Hinweis, keine Bahn
  const nm = convertSolid(mu, { toolInfo }, { overrides: { curved: { surface: true } } });
  assert.ok(nm.warnings.some((w) => /3D-Netz/.test(w)));
  assert.doesNotMatch(nm.xcs, /CreateToolpath/);
  const meshes = OM.read(occt, text);
  const r = convertSolid(mu, { toolInfo }, { overrides: { curved: { surface: true } }, meshes: meshes });
  const p = r.panel;
  assert.deepStrictEqual(r.ops.filter((o) => o.kind === 'surface').map((o) => o.tool), ['E055', 'E055']);
  assert.ok(!r.warnings.some((w) => /Gewölbte|3D-Netz|keine Bahn/.test(w)), r.warnings.join(' | '));
  const R = toolInfo.E055.d / 2;
  const lines = r.xcs.split(/\r?\n/);
  // je Fläche: Bereich, Fräsung ohne Strategie, dann die Bahn ab Sicherheitshöhe
  for (const n of [1, 2]) {
    const i = lines.findIndex((l) => l.startsWith('CreateRoughFinish("Surface_' + n + '"'));
    assert.ok(i > 0);
    assert.match(lines[i], /"E055", "-1", 0, "-1", "-1", "-1"\);$/);
    assert.match(lines[i + 1], new RegExp('^CreateToolpath\\("Surface_Path_' + n + '", [-\\d.]+, [-\\d.]+, 5\\);$'));
    assert.ok(lines.slice(i - 8, i).some((l) => l.startsWith('CreatePolyline("Surface_Area_' + n + '"')));
  }
  // jeder Bahnpunkt: Kugel nie im Material (Kugelmulde und Hohlkehle analytisch), nie unter dem tiefsten Punkt.
  // Mit Vorfräsen (Zustellung 4) liegt sie auf der Fläche oder darüber, nur Schlichten (0) genau auf der Fläche
  // (Abweichung ≤ Sehnenfehler des Netzes).
  const check = (xcs, exact) => {
    const pts = xcs.split(/\r?\n/).filter((l) => l.startsWith('AddSegmentToToolpath')).map((l) => l.slice(21, -2).split(',').map(Number));
    assert.ok(pts.length > 500);
    let nSphere = 0;
    let nGroove = 0;
    for (const [x, y, zr] of pts) {
      const z = zr + p.T;
      assert.ok(zr <= 5 + 1e-9 && z >= p.T - 12 - R - 0.1, 'Punkt ' + [x, y, zr]);
      if (zr === 5) continue;
      const cz = z + R; // Kugelmittelpunkt
      if (Math.hypot(x - 380, y - 200) < 50) {
        nSphere++;
        const ds = Math.hypot(x - 380, y - 200, cz - (p.T + 150 - 12)) - (150 - R); // > 0: im Material
        assert.ok(ds < 0.002 && (!exact || ds > -0.1), 'Kugelmulde ' + ds);
      }
      if (Math.abs(x - 120) < 20 - R - 1 && y > 20 && y <= p.W + 1e-6) { // Zeilen längs Y: nach dem Zusammenfassen nur die Enden
        nGroove++;
        const dg = Math.hypot(x - 120, cz - (p.T + 10)) - (20 - R); // Hohlkehle R20, Achse in Y bei X 120, Z = T + 10
        assert.ok(dg < 0.002 && (!exact || dg > -0.1), 'Hohlkehle ' + dg);
      }
    }
    assert.ok(nSphere > 100 && nGroove > 10, nSphere + ' / ' + nGroove);
  };
  check(r.xcs, false);
  // gerundete Oberkante vorne (R10, X 140…600): die Kugel fräst sie bis unten (Spitze neben der Kante auf T − 10 − R)
  const fl = convertSolid(mu, { toolInfo, surfLayer: 0 }, { overrides: { curved: { surface: true } }, meshes: meshes }).xcs.split(/\r?\n/)
    .filter((l) => l.startsWith('AddSegmentToToolpath')).map((l) => l.slice(21, -2).split(',').map(Number)).filter((q) => q[0] > 150 && q[1] < 0);
  assert.ok(fl.length && Math.min(...fl.map((q) => q[2])) < -10 - R + 1.5, 'Rundung unten nicht erreicht');
  const mv = require('../web/js/toolpath.js').build(r, toolInfo);
  const surf = mv.filter((m) => m.type === 'cut' && r.ops[m.op].kind === 'surface');
  assert.ok(surf.length > 50 && surf.every((m) => m.ball && m.pts3.length === m.pts.length));
  check(convertSolid(mu, { toolInfo, surfLayer: 0 }, { overrides: { curved: { surface: true } }, meshes: meshes }).xcs, true);
});

test('Kantenrundungen R2 mit dem Radiusfräser: oben E061 Tiefe 0, unten E060 Tiefe Dicke + 1', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [s] = readParts(read('test/fixtures/kanten_r2.step'), 'kanten_r2.step');
  const r = convertSolid(s, { toolInfo });
  assert.deepStrictEqual(r.warnings, []); // keine „gewölbte Fläche“ / „von unten“ mehr
  const edge = r.ops.filter((o) => o.profile);
  assert.deepStrictEqual(edge.map((o) => [o.tool, o.depth, o.side]), [['E061', 0, 2], ['E060', 20, 2], ['E061', 0, 2], ['E060', 20, 2]]);
  // nach dem Formatfräsen, ohne Zustellung, umlaufend mit An-/Abfahren wie das Formatfräsen
  const idx = (o) => r.ops.indexOf(o);
  assert.ok(edge.every((o) => idx(o) > r.ops.findIndex((x) => x.key === 'format')));
  assert.ok(edge.every((o) => o.approach && !o.step));
  assert.match(r.xcs, /SetRetractStrategy\(false, true, 2, 2\);\r\nSetPneumaticHoodPosition\(1\);\r\nCreateRoughFinish\("Milling_\d", 0, "", TypeOfProcess\.GeneralRouting, "E061", "-1", 2,/);
  assert.match(r.xcs, /CreateRoughFinish\("Milling_\d", 20, "", TypeOfProcess\.GeneralRouting, "E060", "-1", 2,/);
  // Geometrie = Außenkontur bzw. Durchbruch (wie Formatfräsen / Durchbruch)
  const fmtOp = r.ops.find((o) => o.key === 'format');
  assert.deepStrictEqual(edge[0].segs, fmtOp.segs);
  // stepDown wirkt nicht auf den Radiusfräser
  assert.ok(convertSolid(s, { toolInfo, stepDown: 5 }).ops.filter((o) => o.profile).every((o) => !o.step));

  // offene Kanten: an Außenecken tangential auslaufen; anderer Radius → Hinweis, mit passender Einstellung gefräst
  const [o] = readParts(read('test/fixtures/kanten_r2_offen.step'), 'kanten_r2_offen.step');
  const ro = convertSolid(o, { toolInfo });
  const open = ro.ops.filter((x) => x.profile);
  assert.strictEqual(open.length, 2);
  for (const x of open) {
    const ll = 20;
    assert.strictEqual(x.approach, false);
    const pts = [x.start].concat(x.segs.map((q) => q.to));
    const len = pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
    assert.ok(Math.abs(len - (ro.panel.L + 2 * ll)) < 1e-6, 'Länge ' + len);
  }
  assert.ok(ro.warnings.some((w) => /Kantenrundung R5 .*kein passender Radiusfräser/.test(w)));
  assert.strictEqual(convertSolid(o, { toolInfo, roundRadius: 5 }).ops.filter((x) => x.profile).length, 1);
});

test('Gewölbte Zylinderfläche 4-Achs mit dem Schaftfräser abzeilen', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [s] = readParts(read('test/fixtures/woelbung.step'), 'woelbung.step');
  const r = convertSolid(s, { toolInfo }, { overrides: { curved: { surface: 'flat4' } } });
  const p = r.panel;
  const c = p.curvedSurfaces[0].cyl;
  assert.ok(c && Math.abs(c.r - 309.72) < 0.01);
  const op = r.ops.find((x) => x.kind === 'cyl4');
  assert.ok(op && op.tool === 'E020');
  assert.ok(!r.warnings.some((w) => /Gewölbte|Schneidenlänge E020/.test(w)), r.warnings.join(' | '));
  const D = toolInfo.E020.d;
  const ax = [c.a[0], c.a[1], 0];
  const distAxis = (q) => { const v = [q[0] - c.o[0], q[1] - c.o[1], q[2] - c.o[2]]; const t = v[0] * ax[0] + v[1] * ax[1]; return Math.hypot(v[0] - ax[0] * t, v[1] - ax[1] * t, v[2]); };
  // Programm: je Zeile Ebene (Ursprung, Drehung Z, Neigung X), Gerade längs der Achse, Fräsen Tiefe 0 Werkzeugmitte
  const lines = r.xcs.split(/\r?\n/);
  const planes = lines.filter((l) => l.startsWith('CreateWorkplane("Abzeilen_1_'));
  assert.strictEqual(planes.length, op.passes.length);
  op.passes.forEach((q, k) => {
    const v = planes[k].slice(planes[k].indexOf(',') + 1, -2).split(',').map(Number);
    const [x0, y0, z0, zr, xr] = v;
    assert.ok(Math.abs(distAxis([x0, y0, z0]) - (c.r + q.d)) < 0.01, 'Ursprung auf R + d');
    const a = zr * Math.PI / 180;
    const b = xr * Math.PI / 180;
    const n = [Math.sin(a) * Math.sin(b), -Math.cos(a) * Math.sin(b), Math.cos(b)]; // erst um Z, dann um X
    // Werkzeugachse = Flächennormale (radial nach außen)
    const rad = [x0 - c.o[0], y0 - c.o[1], z0 - c.o[2]];
    const t = rad[0] * ax[0] + rad[1] * ax[1];
    const rv = [rad[0] - ax[0] * t, rad[1] - ax[1] * t, rad[2]];
    const rl = Math.hypot(...rv);
    assert.ok(Math.abs(n[0] - rv[0] / rl) < 1e-3 && Math.abs(n[1] - rv[1] / rl) < 1e-3 && Math.abs(n[2] - rv[2] / rl) < 1e-3, 'Normale ' + k);
    assert.ok(z0 <= p.T + 1e-3, 'Ursprung im Rohteil');
    const i = lines.indexOf(planes[k]);
    assert.strictEqual(lines[i + 1], 'SelectWorkplane("' + planes[k].split('"')[1] + '");');
    const seg = lines[i + 2].slice(lines[i + 2].indexOf(',') + 1, -2).split(',').map(Number);
    assert.ok(Math.abs(seg[3]) < 1e-3 && Math.abs(Math.abs(seg[2]) - (p.L + 2 * (D / 2 + 2 + 5))) < 0.01, 'Gerade längs der Achse über die ganze Länge');
    assert.match(lines[i + 5], /, 0, "", TypeOfProcess\.GeneralRouting, "E020", "-1", 0, "-1", "-1", "-1"\);$/);
  });
  // Schlichten: über die ganze Breite der Fläche, Zeilenabstand ≤ 10 mm, Resthöhe < 0,05 mm
  const fin = op.passes.filter((q) => q.d === 0);
  assert.ok(Math.abs(fin[0].phi - c.phi0) < 1e-9 && Math.abs(fin[fin.length - 1].phi - c.phi1) < 1e-9);
  for (let k = 1; k < fin.length; k++) {
    const st = Math.abs(fin[k].phi - fin[k - 1].phi) * c.r;
    assert.ok(st <= 10 + 1e-9 && c.r * (1 / Math.cos(st / (2 * c.r)) - 1) < 0.05);
  }
  // Vorfräsen in Schichten zu 10 mm von außen nach innen, Zeilenabstand kleiner als der Fräser
  const ds = Array.from(new Set(op.passes.map((q) => q.d)));
  assert.deepStrictEqual(ds, [30, 20, 10, 0]);
  // nach der Ausgabe wieder auf der Oberseite
  assert.match(r.xcs, /CreateRoughFinish\("Abzeilen_1_\d+_Fraesen"[^\n]*\r\n\r\nSelectWorkplane\("Top"\);/);
  // Animation: Werkzeugachse = Normale je Zeile
  const mv = require('../web/js/toolpath.js').build(r, toolInfo).filter((m) => m.type === 'cut' && r.ops[m.op].kind === 'cyl4');
  assert.strictEqual(mv.length, op.passes.length);
  assert.ok(mv.every((m, k) => m.ax3 === op.passes[k].n));
  // Kugelfräser bleibt Standard; nur Zylinder allein bekommen die 4-Achs-Wahl
  assert.ok(!convertSolid(s, { toolInfo }, { overrides: { curved: { surface: true } } }).ops.some((x) => x.kind === 'cyl4'));
  const [mu] = readParts(read('test/fixtures/mulde.step'), 'mulde.step');
  assert.ok(convertSolid(mu, { toolInfo }).panel.curvedSurfaces.every((g) => !g.cyl));
});

test('Prüfung gekrümmte Flächen: Hohlkehle, große Rundung, Teil-Wölbung, Innenecke, Neigungsgrenze, Öffnungen', async () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const OM = require('../web/js/occtmesh.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const occt = await OM.loadNode();
  const part = (f) => { const text = read('test/fixtures/' + f + '.step'); return { s: readParts(text, f)[0], meshes: OM.read(occt, text) }; };
  const path = (xcs) => xcs.split(/\r?\n/).filter((l) => l.startsWith('AddSegmentToToolpath')).map((l) => l.slice(21, -2).split(',').map(Number));
  // Hohlkehle (nach innen gerundet): kein Radiusfräser, sondern gewölbte Fläche
  const h = convertSolid(part('hohlkehle_r2').s, { toolInfo });
  assert.ok(!h.ops.some((o) => o.profile) && (h.panel.edgeRounds || []).length === 0);
  assert.strictEqual(h.panel.curvedSurfaces.length, 1);
  // große Rundung R15 bei 19 mm: Kugel fräst bis fast unten, aber nie unter die Platte
  const v = part('viertelrund');
  const rv = convertSolid(v.s, { toolInfo }, { overrides: { curved: { surface: 'ball' } }, meshes: v.meshes });
  const zs = path(rv.xcs).map((q) => q[2] + rv.panel.T);
  assert.ok(zs.length && Math.min(...zs) >= -1e-9 && Math.min(...zs) < 4 + 0.5, 'tiefste Spitze ' + Math.min(...zs));
  // Wölbung nur auf einem Teil der Länge: kein 4-Achs (fiele durch die Enden), stattdessen Kugelfräser
  const w = part('woelbung_teil');
  const rw = convertSolid(w.s, { toolInfo }, { overrides: { curved: { surface: 'flat4' } }, meshes: w.meshes });
  assert.ok(rw.panel.curvedSurfaces.every((c) => !c.cyl));
  assert.ok(!rw.ops.some((o) => o.kind === 'cyl4') && rw.ops.some((o) => o.kind === 'surface'));
  // Neigungsgrenze: darüber Hinweis und Kugelfräser statt 4-Achs
  const wb = part('woelbung');
  const rt = convertSolid(wb.s, { toolInfo, cyl4MaxTilt: 20 }, { overrides: { curved: { surface: 'flat4' } }, meshes: wb.meshes });
  assert.ok(rt.warnings.some((x) => /mehr als 20° erlaubt, stattdessen Kugelfräser/.test(x)));
  assert.ok(!rt.ops.some((o) => o.kind === 'cyl4') && rt.ops.some((o) => o.kind === 'surface'));
  // Rundung endet an einer Innenecke: kein Auslauf ins Material, Hinweis
  const l = convertSolid(part('l_innen_r2').s, { toolInfo });
  const e = l.ops.find((o) => o.profile);
  assert.ok(e && l.warnings.some((x) => /Innenecke oder mitten in der Kante/.test(x)));
  // gewölbte Flächen erst nach den Durchbrüchen; schräge Durchbrüche: Kugel nicht über der Öffnung
  const m = part('mulde');
  const rm = convertSolid(m.s, { toolInfo }, { overrides: { curved: { surface: 'ball' } }, meshes: m.meshes });
  assert.ok(path(rm.xcs).every((q) => q[2] + rm.panel.T >= -1e-9));
});

test('Zweiseitig: Seite 1 mit Formatfräsen, Seite 2 um Y gewendet ohne Rohteil-Versatz', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const PA = require('../web/js/panel.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [s] = readParts(read('test/fixtures/zweiseitig.step'), 'zweiseitig.step');
  // einseitig: Bearbeitungen von unten nur als Hinweis, Name ohne _S1
  const one = convertSolid(s, { toolInfo });
  assert.ok(one.canTwoSided && !one.side2 && one.fileName === 'zweiseitig.xcs');
  assert.ok(one.warnings.some((w) => /von unten.*Zweiseitig einschalten/.test(w)));
  const r = convertSolid(s, { toolInfo }, { overrides: { twoSided: true } });
  const s2 = r.side2;
  assert.strictEqual(r.fileName, 'zweiseitig_S1.xcs');
  assert.strictEqual(s2.fileName, 'zweiseitig_S2.xcs');
  assert.ok(r.warnings.filter((w) => /von unten/.test(w)).every((w) => /wird auf Seite 2 bearbeitet/.test(w)));
  // Seite 1: mit Rohteil-Aufmaß und Formatfräsen
  assert.match(r.xcs, /CreateRawWorkpiece\("Workpiece", 2, 2, 2, 2, 0, 0\);/);
  assert.ok(r.ops.some((o) => o.key === 'format'));
  // Seite 2: Lage = Seite 1 um Y gewendet (X → L − x, Y bleibt, Z → T − z)
  const p1 = r.panel;
  const p2 = s2.panel;
  const o2 = PA.turnOverY(s, p1.orientation);
  assert.deepStrictEqual(p2.orientation, o2);
  const q = [123, 45, 6];
  const ap = [0, 1, 2].map((i) => p1.tf.m[i][0] * q[0] + p1.tf.m[i][1] * q[1] + p1.tf.m[i][2] * q[2] + p1.tf.t[i]);
  const bp = [0, 1, 2].map((i) => p2.tf.m[i][0] * q[0] + p2.tf.m[i][1] * q[1] + p2.tf.m[i][2] * q[2] + p2.tf.t[i]);
  assert.ok(Math.abs(bp[0] - (p1.L - ap[0])) < 1e-6 && Math.abs(bp[1] - ap[1]) < 1e-6 && Math.abs(bp[2] - (p1.T - ap[2])) < 1e-6);
  // Seite 2: ohne Rohteil-Versatz, ohne Formatfräsen und ohne alles Durchgehende – nur die Bearbeitungen von unten
  assert.match(s2.xcs, /CreateRawWorkpiece\("Workpiece", 0, 0, 0, 0, 0, 0\);\r\n\r\nSetWorkpieceSetupPosition\(0, 0, 0, 0\);/);
  assert.ok(!s2.ops.some((o) => o.key === 'format' || /^(cutout|notch|round|edge)-/.test(o.key || '')));
  assert.ok(!s2.ops.some((o) => o.kind === 'drill' && (o.face !== 'Top' || o.d.tip === 'L')));
  assert.deepStrictEqual(s2.warnings, []);
  // jede Bearbeitung von unten auf Seite 1 kommt auf Seite 2 an der gespiegelten Stelle vor
  const below = r.warnings.map((w) => /Bohrung Ø[\d.]+ von unten bei X=([\d.]+) Y=([\d.]+)/.exec(w)).filter(Boolean).map((m) => [+m[1], +m[2]]);
  const holes2 = p2.drills.filter((d) => d.face === 'Top' && !d.through);
  assert.ok(below.length === 2 && holes2.length === 2);
  for (const d of holes2) assert.ok(below.some((h) => Math.abs(h[0] - (p1.L - d.x)) < 1e-3 && Math.abs(h[1] - d.y) < 1e-3), 'Bohrung ' + d.x + '/' + d.y);
  const drillsOut = s2.xcs.split(/\r\n/).filter((l) => l.startsWith('CreateDrill'));
  assert.strictEqual(drillsOut.length, 1); // Lochreihe aus zwei Sacklöchern
  assert.ok(s2.ops.some((o) => o.kind === 'pocket'));
  // Sauger: nie über offenen Stellen der Gegenseite (Taschen, Sacklöcher, Nuten) – mit Abstand
  const zones = (p) => {
    const z = [];
    for (const k of p.pockets) z.push({ x0: k.x0, y0: k.y0, x1: k.x1, y1: k.y1 });
    for (const d of p.drills) if (d.face === 'Top' && !d.through) z.push({ x0: d.x - d.d / 2, y0: d.y - d.d / 2, x1: d.x + d.d / 2, y1: d.y + d.d / 2 });
    return z.map((b) => ({ x0: p.L - b.x1, x1: p.L - b.x0, y0: b.y0, y1: b.y1 })); // gespiegelt auf die andere Seite
  };
  const free = (res, zs) => res.suction.bars.every((b) => b.cups.every((c) => {
    const a = (c.rot * Math.PI) / 180;
    const hx = (Math.abs(Math.cos(a)) * c.sx + Math.abs(Math.sin(a)) * c.sy) / 2;
    const hy = (Math.abs(Math.sin(a)) * c.sx + Math.abs(Math.cos(a)) * c.sy) / 2;
    return zs.every((z) => c.px + hx <= z.x0 || c.px - hx >= z.x1 || c.py + hy <= z.y0 || c.py - hy >= z.y1);
  }));
  assert.ok(r.suction.bars.length && free(r, zones(p2)), 'Seite 1: Sauger über einer offenen Stelle von Seite 2');
  assert.ok(s2.suction.bars.length && free(s2, zones(p1)), 'Seite 2: Sauger über einer offenen Stelle von Seite 1');
  // eigene Einstellungen je Seite: Werkzeug auf Seite 2 ändern lässt Seite 1 unberührt
  const pk = s2.ops.find((o) => o.kind === 'pocket').key;
  const r2 = convertSolid(s, { toolInfo }, { overrides: { twoSided: true }, overrides2: { tools: { [pk]: 'E010' } } });
  assert.ok(r2.side2.ops.find((o) => o.key === pk).tool === 'E010' && r2.xcs === r.xcs);
});

test('Erkannte Bearbeitung löschen (unterdrücken) und wiederherstellen', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [s] = readParts(read('test/fixtures/testplatte.step'), 'tp.step');
  const all = convertSolid(s, { toolInfo });
  const pocket = all.ops.find((o) => o.kind === 'pocket');
  const drill = all.ops.find((o) => o.kind === 'drill');
  const r = convertSolid(s, { toolInfo }, { overrides: { suppress: [pocket.group, drill.group] } });
  assert.ok(!r.ops.some((o) => o.group === pocket.group || o.group === drill.group));
  assert.ok(!r.groups.includes(pocket.group) && !r.groups.includes(drill.group));
  assert.deepStrictEqual(r.suppressed.map((g) => g.group).sort(), [pocket.group, drill.group].sort());
  assert.ok(r.suppressed.find((g) => g.group === pocket.group).label === pocket.label);
  // nicht im Programm, Nummerierung lückenlos, übrige Bearbeitungen unverändert
  assert.ok(!/CreateContourPocket/.test(r.xcs) || all.ops.filter((o) => o.kind === 'pocket').length > 1);
  const mill = r.xcs.split(/\r\n/).filter((l) => /^CreateRoughFinish\("Milling_\d+"/.test(l)).map((l) => +/Milling_(\d+)/.exec(l)[1]);
  assert.deepStrictEqual(mill, mill.map((_, i) => i + 1));
  assert.match(r.xcs, /SetDescription\("[^"]*, \d+ Bearbeitungen"\)/);
  assert.strictEqual(r.ops.length, all.ops.length - all.ops.filter((o) => o.group === pocket.group || o.group === drill.group).length);
  // Animation ohne die gelöschten
  const mv = require('../web/js/toolpath.js').build(r, toolInfo);
  assert.ok(mv.every((m) => m.op < 0 || ![pocket.group, drill.group].includes(r.ops[m.op].group)));
  // wiederherstellen = Liste leer
  assert.strictEqual(convertSolid(s, { toolInfo }, { overrides: { suppress: [] } }).xcs, all.xcs);
});

test('Werkstück-Profile: Werkzeuge/Strategie je Material, Teil-Änderung geht vor', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const X = require('../web/js/xcs.js');
  const T = require('../web/js/tools.js');
  const toolInfo = T.infoMap(T.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [s] = readParts(read('test/fixtures/testplatte.step'), 'tp.step');
  const base = convertSolid(s, { toolInfo });
  // ohne Profil (null) = wie bisher
  assert.strictEqual(convertSolid(s, { toolInfo }, { profile: null }).xcs, base.xcs);
  // Massivholz (Vorgabe): zweistufig, Name im Kommentar
  const mh = convertSolid(s, { toolInfo }, { profile: 1 });
  assert.match(mh.xcs, /CreateRoughFinish\("Milling_\d+_Vor"/);
  assert.match(mh.xcs, /SetComment\("STEP2XCS: tp - Profil Massivholz"\);/);
  // eigenes Profil: Formatfräser und Taschenfräser; leere Werte = wie Einstellung
  const profiles = X.DEFAULTS.profiles.map((p) => ({ name: p.name, values: Object.assign({}, p.values) }));
  profiles[2] = { name: 'Spanplatte T114', values: { contourTool: 'E020', pocketTool: 'E010', stepDown: '' } };
  const r = convertSolid(s, { toolInfo, profiles: profiles }, { profile: 2 });
  assert.strictEqual(r.ops.find((o) => o.key === 'format').tool, 'E020');
  assert.ok(r.ops.filter((o) => o.kind === 'pocket').every((o) => o.tool === 'E010'));
  assert.ok(r.ops.filter((o) => /^cutout-/.test(o.key)).every((o) => o.tool === 'E016')); // nicht gesetzt → Einstellung
  assert.ok(!/_Vor"/.test(r.xcs));
  // Änderung am Teil geht dem Profil vor
  const own = convertSolid(s, { toolInfo, profiles: profiles }, { profile: 2, overrides: { tools: { format: 'E022' }, twoStep: true } });
  assert.strictEqual(own.ops.find((o) => o.key === 'format').tool, 'E022');
  assert.match(own.xcs, /_Vor"/);
  // Vorgabe bleibt unverändert (Profile werden nicht verändert)
  assert.deepStrictEqual(X.DEFAULTS.profiles[2].values, {});
});

test('DXF: größte Kontur = Teil, Vorschläge je Erkennung, Änderungen per overrides', () => {
  const { convertDxf } = require('../web/js/convert.js');
  const D = require('../web/js/dxf.js');
  const text = read('test/fixtures/platte.dxf');
  const r = convertDxf(text, 'Platte Küche.dxf', {});
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.fileName, 'Platte_Kueche.xcs');
  const p = r.panel;
  assert.deepStrictEqual([p.L, p.W, p.T], [600, 400, 19]);
  assert.ok(!p.outlineIsRect); // Ecke R20 (bulge) → Sonderkontur
  assert.match(r.xcs, /AddArc2PointCenterToPolyline\(580, 400, 580, 380, false\);/);
  const by = (k) => r.dxf.features.filter((f) => f.kind === k);
  // Ø8 ×3, Ø35 (Topf 13 tief), Ø5 aus dem Block → Bohrungen; Ø50, Rechteck, Langloch, Ellipse → Durchbrüche
  assert.deepStrictEqual(by('drill').map((f) => f.d).sort((a, b) => a - b), [5, 8, 8, 8, 35]);
  assert.strictEqual(by('drill').find((f) => f.d === 35).depth, 13);
  assert.strictEqual(by('cutout').length, 4);
  assert.strictEqual(drillSet(r.xcs).length, 5);
  assert.strictEqual(r.ops.filter((o) => /^cutout-/.test(o.key)).length, 4);
  // ganzer Kreis als Durchbruch: zwei Halbkreise (Anfang ≠ Ende)
  assert.match(r.xcs, /AddArc2PointCenterToPolyline\(275, 300, 300, 300, true\);\r\nAddArc2PointCenterToPolyline\(325, 300, 300, 300, true\);/);
  assert.ok(r.warnings.some((w) => /offener Linienzug/.test(w)));
  assert.ok(!r.warnings.some((w) => /TEXT|DIMENSION/.test(w))); // Texte/Maße still übergangen
  // Änderungen: Rechteck → Tasche 8 tief, Ø50 → ignorieren, Dicke 25, gedreht
  const rect = r.dxf.features.find((f) => f.shape === 'loop' && f.w === 120);
  const hole = r.dxf.features.find((f) => f.d === 50);
  const r2 = convertDxf(text, 'p.dxf', {}, { overrides: { dxf: { T: 25, rot: 1, features: { [rect.id]: { kind: 'pocket', depth: 8 }, [hole.id]: { kind: 'ignore' } } } } });
  assert.deepStrictEqual([r2.panel.L, r2.panel.W, r2.panel.T], [400, 600, 25]);
  assert.strictEqual(r2.ops.filter((o) => o.kind === 'pocket').length, 1);
  assert.strictEqual(r2.ops.find((o) => o.kind === 'pocket').depth, 8);
  assert.strictEqual(r2.ops.filter((o) => /^cutout-/.test(o.key)).length, 2);
  // Kennungen bleiben beim Drehen gleich
  assert.deepStrictEqual(r2.dxf.features.map((f) => f.id).sort(), r.dxf.features.map((f) => f.id).sort());
  // Insel: Kreis in einer Tasche
  const nest = ['0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '90', '4', '70', '1', '10', '0', '20', '0', '10', '500', '20', '0', '10', '500', '20', '300', '10', '0', '20', '300',
    '0', 'LWPOLYLINE', '90', '4', '70', '1', '10', '100', '20', '100', '10', '300', '20', '100', '10', '300', '20', '200', '10', '100', '20', '200',
    '0', 'CIRCLE', '10', '200', '20', '150', '40', '20', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const a = D.analyze(nest, {});
  const frame = a.dxf.features.find((f) => f.shape === 'loop');
  assert.strictEqual(frame.kind, 'cutout');
  assert.strictEqual(a.dxf.features.find((f) => f.shape === 'circle').kind, 'ignore'); // fällt mit heraus
  const b = D.analyze(nest, { features: { [frame.id]: { kind: 'pocket' } } });
  assert.strictEqual(b.dxf.features.find((f) => f.shape === 'circle').kind, 'island');
  assert.strictEqual(b.pockets.length, 1);
  assert.strictEqual(b.pockets[0].islands.length, 1);
  assert.strictEqual(b.pockets[0].depth, 5);
  // ohne geschlossene Kontur: Fehler statt Programm
  assert.ok(convertDxf('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n', 'leer.dxf', {}).error);
});

test('DXF: Sonderfälle (Weltkoordinaten, Papierbereich, Bogen-Scheitel, doppelt, verschachtelt, Kreis aus Bögen)', () => {
  const D = require('../web/js/dxf.js');
  const dxf = (...ents) => ['0', 'SECTION', '2', 'ENTITIES'].concat(...ents, ['0', 'ENDSEC', '0', 'EOF']).join('\n');
  const rect = (x0, y0, x1, y1, extra) => ['0', 'LWPOLYLINE', '90', '4', '70', '1'].concat(extra || [],
    ['10', x0, '20', y0, '10', x1, '20', y0, '10', x1, '20', y1, '10', x0, '20', y1].map(String));
  const line = (a, b, extra) => ['0', 'LINE'].concat(extra || [], ['10', a[0], '20', a[1], '11', b[0], '21', b[1]].map(String));
  const part = rect(0, 0, 600, 400);
  // LINE mit Extrusion −Z: Weltkoordinaten, nicht gespiegelt
  const neg = ['210', '0', '220', '0', '230', '-1'];
  let r = D.analyze(dxf(part, line([100, 100], [200, 100], neg), line([200, 100], [200, 200], neg), line([200, 200], [100, 200], neg), line([100, 200], [100, 100], neg)), {});
  assert.strictEqual(r.cutouts.length, 1);
  assert.strictEqual(r.dxf.features[0].x, 150);
  // Papierbereich (Code 67 = 1) zählt nicht
  r = D.analyze(dxf(part, rect(-100, -100, 1900, 900, ['67', '1'])), {});
  assert.deepStrictEqual([r.L, r.W], [600, 400]);
  // Bogen-Scheitel bestimmt die Breite (nicht die Stützpunkte)
  const b = Math.tan(Math.atan(0.1));
  r = D.analyze(dxf(['0', 'LWPOLYLINE', '90', '4', '70', '1', '10', '0', '20', '0', '10', '1000', '20', '0', '10', '1000', '20', '400', '42', String(b), '10', '0', '20', '400']), {});
  assert.ok(Math.abs(r.W - 450) < 1e-6, 'W ' + r.W);
  // doppelt gezeichneter Kreis → eine Bohrung
  const circ = ['0', 'CIRCLE', '10', '50', '20', '50', '40', '4'];
  r = D.analyze(dxf(part, circ, circ), {});
  assert.strictEqual(r.drills.length, 1);
  assert.ok(r.warnings.some((w) => /doppelt/.test(w)));
  // Durchbruch ⊃ Kontur ⊃ Kreis: alles darin fällt heraus
  r = D.analyze(dxf(part, rect(100, 100, 300, 300), rect(150, 150, 250, 250), ['0', 'CIRCLE', '10', '200', '20', '200', '40', '4']), {});
  assert.deepStrictEqual(r.dxf.features.map((f) => f.kind).sort(), ['cutout', 'ignore', 'ignore']);
  assert.strictEqual(r.drills.length, 0);
  // Kreis als Polylinie aus zwei Halbbögen (bulge 1) → Bohrung
  r = D.analyze(dxf(part, ['0', 'LWPOLYLINE', '90', '2', '70', '1', '10', '46', '20', '50', '42', '1', '10', '54', '20', '50', '42', '1']), {});
  assert.strictEqual(r.drills.length, 1);
  assert.strictEqual(r.drills[0].d, 8);
  // Rechteck mit Zwischenpunkt bleibt Rechteck
  r = D.analyze(dxf(['0', 'LWPOLYLINE', '90', '5', '70', '1', '10', '0', '20', '0', '10', '300', '20', '0', '10', '600', '20', '0', '10', '600', '20', '400', '10', '0', '20', '400']), {});
  assert.ok(r.outlineIsRect);
});

test('Wiederhergestellte Bearbeitung kommt an ihren Platz (nicht hinter das Formatfräsen)', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [s] = readParts(read('test/fixtures/testplatte.step'), 'tp.step');
  const base = convertSolid(s, {});
  const g = base.groups;
  const drill = g.find((x) => /^drill:/.test(x));
  // eigene Reihenfolge ohne die (gelöschte) Bohrung, dann wiederhergestellt
  const own = g.filter((x) => x !== drill);
  [own[0], own[1]] = [own[1], own[0]];
  const r = convertSolid(s, {}, { overrides: { order: own } });
  assert.ok(r.groups.indexOf(drill) < r.groups.indexOf('format'), r.groups.join(' '));
  assert.strictEqual(r.groups[r.groups.length - 1], g[g.length - 1]);
});

test('Oszillieren (Formatfräsen) und Schleifen mit der Schleifwalze', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const Tl = require('../web/js/tools.js');
  const toolInfo = Tl.infoMap(Tl.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [s] = readParts(read('test/fixtures/testplatte.step'), 'tp.step'); // 900 × 400 × 18
  const r = convertSolid(s, { toolInfo, oscMill: true, sandOn: true, sandPasses: 2, sandAllowance: 0.3 });
  assert.strictEqual(r.error, null);
  // Reihenfolge: Schleifen nach dem Formatfräsen
  assert.ok(r.groups.indexOf('sand') > r.groups.indexOf('format'));
  const block = (name) => { const i = r.xcs.indexOf('CreateRoughFinish("' + name + '"'); const j = r.xcs.lastIndexOf('CreatePolyline', i); return r.xcs.slice(j, r.xcs.indexOf('\n', i)); };
  const depths = (b) => [...b.matchAll(/Set(?:Parametric)?Attribute\("DEPTH", ([\d.]+)[,)]/g)].map((m) => +m[1]);
  const f = r.ops.find((o) => o.key === 'format');
  const fb = block('Milling_' + f.contour);
  const fd = depths(fb);
  // Fräser: Dicke + 2 … Dicke + 8, Start oben, Ende wieder oben (ganze Schwingungen), keine Zustellung
  assert.deepStrictEqual([Math.min(...fd), Math.max(...fd)], [20, 26]);
  assert.strictEqual(fd[fd.length - 1], 20);
  assert.match(fb, /CreateRoughFinish\("Milling_\d+", 20, .*"E014", "-1", 2, "-1", "-1", "-1", 0\.3\);/); // Schleifzugabe bleibt stehen
  assert.doesNotMatch(fb, /CreateUnidirectionalMillingStrategy/);
  // Schleifwalze: 10 … 30 unter der Platte, Bogen an/ab, zwei Umläufe (zweiter beginnt unten)
  const sOp = r.ops.find((o) => o.key === 'sand');
  const s1 = block('Milling_' + sOp.contour);
  const s2 = block('Milling_' + sOp.contour + '_2');
  assert.deepStrictEqual([Math.min(...depths(s1)), Math.max(...depths(s1))], [28, 48]);
  assert.match(s1, /SetApproachStrategy\(false, true, 1\);\r?\nSetRetractStrategy\(false, true, 1, 20\);/);
  assert.match(s1, /CreateRoughFinish\("Milling_\d+", 28, .*"E091", "-1", 2, "-1", "-1", "-1"\);/);
  assert.match(s2, /CreateRoughFinish\("Milling_\d+_2", 48, .*"E091"/);
  assert.ok(!r.warnings.some((w) => /Schneidenlänge|Walze/.test(w)), r.warnings.join(' | '));
  // zu tief für die Schneide → Hinweis; Walze kommt nicht in Innenecken → Hinweis
  const deep = convertSolid(s, { toolInfo, oscMill: true, oscMillMax: 15 });
  assert.ok(deep.warnings.some((w) => /Schneidenlänge E014 nur 28 mm – Höchstwert verringern \(höchstens 10 mm/.test(w)));
  const [l] = readParts(read('test/fixtures/l_innen_r2.step'), 'l.step');
  assert.ok(convertSolid(l, { toolInfo, sandOn: true }).warnings.some((w) => /erreicht die Walze nicht/.test(w)));
  // ohne Optionen: Programm unverändert (kein DEPTH)
  assert.doesNotMatch(convertSolid(s, { toolInfo }).xcs, /DEPTH/);
});

test('Vorschub/Drehzahl: aus der Werkzeugdatei gelesen, je Bearbeitung einstellbar', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const Tl = require('../web/js/tools.js');
  const tools = Tl.parseTlgx(read('maestro/werkzeuge/def.tlgx'));
  // Standard, min, max: Vorschub/Eintauchen m/min, Drehzahl U/min
  assert.deepStrictEqual(tools.find((t) => t.name === 'E014').tech, { feed: [12, 8, 15], rot: [15000, 12000, 15000], descent: [3, 2, 3] });
  assert.deepStrictEqual(tools.find((t) => t.name === 'E091').tech.rot, [1500, 1500, 1500]);
  const toolInfo = Tl.infoMap(tools);
  const [s] = readParts(read('test/fixtures/testplatte.step'), 'tp.step');
  const base = convertSolid(s, { toolInfo });
  assert.match(base.xcs, /"E014", "-1", 2, "-1", "-1", "-1"\);/); // ohne eigene Werte: -1 = Werkzeugdatei
  const drill = base.groups[0];
  const r = convertSolid(s, { toolInfo }, { overrides: { tech: { format: { feed: 14, rot: 14000, descent: 2.5 }, 'pocket-0': { feed: 6 },
    [drill]: { rot: 4500, feed: 3 }, 'slot-0': { rot: 6500 } } } });
  assert.match(r.xcs, /CreateRoughFinish\("Milling_\d+", 21, "", TypeOfProcess\.GeneralRouting, "E014", "-1", 2, 2\.5, 14000, 14\);/);
  assert.match(r.xcs, /CreateContourPocket\("Pocketing_1", 5, "", TypeOfProcess\.ConcentricalPocket, "E016", "-1", -1, -1, 6, 50, false\);/);
  assert.match(r.xcs, /CreateDrill \("Drill_Vertical_1", [^;]*, "-1", "-1", 1, 4500, 3, "L"\);/);
  assert.match(r.xcs, /CreateSlot\("Slot_1", 6, "", TypeOfProcess\.GeneralRouting, "066", "-1", 1,-1,6500,-1,0\);/);
  assert.ok(!r.warnings.some((w) => /außerhalb/.test(w)));
  // außerhalb des Bereichs → Hinweis
  const w = convertSolid(s, { toolInfo }, { overrides: { tech: { format: { feed: 20 } } } }).warnings;
  assert.ok(w.some((x) => /Formatfräsen: Vorschub 20 m\/min außerhalb 8–15 \(Werkzeugdatei E014\)/.test(x)));
  // andere Bearbeitungen unverändert
  assert.match(r.xcs, /CreateDrill \("Drill_Vertical_2", [^;]*, 1, -1, -1, "P"\);/);
});

test('Werkzeug fehlt in der Werkzeugdatei → Hinweis; geschliffen wird nur die Außenkontur', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const Tl = require('../web/js/tools.js');
  const all = Tl.parseTlgx(read('maestro/werkzeuge/def.tlgx'));
  const [s] = readParts(read('test/fixtures/testplatte.step'), 'tp.step');
  const ok = convertSolid(s, { toolInfo: Tl.infoMap(all), sandOn: true });
  assert.ok(!ok.warnings.some((w) => /steht nicht in der Werkzeugdatei/.test(w)));
  const miss = convertSolid(s, { toolInfo: Tl.infoMap(all.filter((t) => t.name !== 'E014')) });
  assert.strictEqual(miss.warnings.filter((w) => /Werkzeug E014 steht nicht in der Werkzeugdatei/.test(w)).length, 1);
  // Schleifen: genau eine Bearbeitung, gleiche Geometrie wie das Formatfräsen (Durchbrüche/Taschen nie)
  const sand = ok.ops.filter((o) => o.sand);
  const fmtOp = ok.ops.find((o) => o.key === 'format');
  assert.strictEqual(sand.length, 1);
  assert.deepStrictEqual(sand[0].segs, fmtOp.segs);
  assert.ok(ok.ops.some((o) => /^cutout-/.test(o.key)) && !ok.ops.some((o) => o.sand && o.key !== 'sand'));
});

test('Clamex-Nuten direkt (Kreissegment R50): Kante von oben, Fläche von der Seite, nicht als Tasche/Wölbung', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const Tl = require('../web/js/tools.js');
  const toolInfo = Tl.infoMap(Tl.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [a, b] = readParts(read('test/fixtures/schrank1.step'), 'schrank1.step');
  // Teil 1: drei Nuten in der Vorderkante, Scheibe waagerecht → Ebene oben, Tiefe bis zur Blattmitte (Z 9,5)
  const r1 = convertSolid(a, { toolInfo, clamexMode: 'direct' });
  assert.strictEqual(r1.error, null);
  assert.deepStrictEqual([r1.panel.pockets.length, r1.panel.bottom.length, r1.panel.curvedSurfaces.length], [0, 0, 0]);
  assert.strictEqual(r1.panel.clamex.length, 3);
  const g = r1.panel.clamex[0];
  assert.deepStrictEqual([+g.w.toFixed(3), +g.depth.toFixed(3), +g.r.toFixed(3)], [6, 14, 50]);
  assert.match(r1.xcs, /CreatePolyline\("ClamexPath_1", 250, -55\);\r?\nAddSegmentToPolyline\(250, -36\);\r?\nAddSegmentToPolyline\(250, -55\);/);
  assert.match(r1.xcs, /CreateRoughFinish\("Clamex_1", 9\.5, "", TypeOfProcess\.GeneralRouting, "E030", "-1", 0, "-1", "-1", "-1"\);/);
  assert.ok(r1.groups.indexOf('clamex-0') > r1.groups.indexOf('format'));
  assert.ok(!r1.warnings.some((w) => /Clamex/.test(w)), r1.warnings.join(' | '));
  // Teil 2: drei Nuten in der Fläche nahe der linken Kante, Scheibe senkrecht → Ebene Left, Werkzeug waagerecht
  const r2 = convertSolid(b, { toolInfo, clamexMode: 'direct' });
  assert.strictEqual(r2.panel.clamex.length, 3);
  assert.deepStrictEqual([r2.panel.pockets.length, r2.panel.curvedSurfaces.length], [0, 0]);
  assert.match(r2.xcs, /SelectWorkplane\("Left"\);\r?\n\r?\nCreatePolyline\("ClamexPath_1", 50, 74\);\r?\nAddSegmentToPolyline\(50, 55\);/);
  assert.match(r2.xcs, /CreateRoughFinish\("Clamex_3", 9\.5, [^;]*"E030", "-1", 0,/);
  assert.ok(!r2.warnings.some((w) => /Reichweite/.test(w)));
});

test('Clamex über das SCM-Makro SawCut_Lamello: Parameterliste wie in der Werkstatt, Lage/Winkel/Richtung eingesetzt', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [a, b] = readParts(read('test/fixtures/schrank1.step'), 'schrank1.step');
  const r1 = convertSolid(a, {});
  // Kante vorne: Start = Ende an der Nutmitte auf der Kante, gerade (90°), Richtung 0° → 360°, sonst wie im Werkstatt-Programm
  assert.match(r1.xcs, /CreateMacro\("SawCut_Lamello_1", "SawCut_Lamello", 250, 0, 250, 0, 90, 1, 19, 1, 5, 3, 0\.05, 150, 150, null, null, 3, "-1", "E071", null, "-1", "E030", null, '2', 0, false, -1, 0, 4, 0, false, "-1", "E031", null, null, null, 0, 0, 0, null, 2, 10, 1\.4, "10", 0, "-1", "E030", 360, null\);/);
  assert.strictEqual((r1.xcs.match(/CreateMacro\(/g) || []).length, 3);
  assert.doesNotMatch(r1.xcs, /ClamexPath_|SetMacroParam/);
  // Parameterliste wie in 38_SW-Schrag.xcs: gleiche Anzahl Werte (48)
  const args = /CreateMacro\("SawCut_Lamello_1", "SawCut_Lamello", (.*)\);/.exec(r1.xcs)[1].split(',');
  assert.strictEqual(args.length, 48);
  // Richtung gegen den Uhrzeigersinn wie in der Werkstatt: links −90, rechts 90, hinten 180 (Teil gedreht)
  const r1b = convertSolid(a, {}, { orientation: { rot: 2, flip: false } });
  assert.match(r1b.xcs, /"E030", 180, null\);/);
  // Nuten in der Fläche: über das Makro noch nicht → Hinweis, kein Aufruf
  const r2 = convertSolid(b, {});
  assert.doesNotMatch(r2.xcs, /CreateMacro/);
  assert.ok(r2.warnings.some((w) => /Clamex-Nut in der Fläche .*nicht ausgegeben/.test(w)));
  // eigene Vorlage
  const r3 = convertSolid(a, { clamexTemplate: '{sx}, {sy}, {ex}, {ey}, {angle}, {angleZ}' });
  assert.match(r3.xcs, /CreateMacro\("SawCut_Lamello_1", "SawCut_Lamello", 250, 0, 250, 0, 90, 360\);/);
});

test('Gehrung mit Zapfen: Vorschnitt parallel um Zapfenhöhe, dann Tasche auf der geneigten Ebene (Zapfen = Insel)', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const Tl = require('../web/js/tools.js');
  const toolInfo = Tl.infoMap(Tl.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const [s] = readParts(read('test/fixtures/zapfen.step'), 'zapfen.step'); // Meter-STEP: 400 × 200 × 30, Gehrung 45°, Zapfen 8 mm
  const r = convertSolid(s, { toolInfo }); // E020 Ø17,31 → Tasche rundum r + 1 = 9,655 größer
  assert.deepStrictEqual([r.panel.L, r.panel.W, Math.round(r.panel.T)], [400, 200, 30]);
  assert.strictEqual(r.panel.orientation.flip, true); // Gehrung zeigt nach oben
  assert.strictEqual(r.panel.bottom.length, 0);
  const w = r.panel.slantWalls[0];
  assert.ok(w.boss && Math.abs(w.boss.height - 8) < 1e-6);
  assert.ok(!r.warnings.some((x) => /ohne Verbindung|nicht ausgegeben/.test(x)), r.warnings.join(' | '));
  assert.ok(r.warnings.some((x) => /taucht an der Unterkante der Schräge bis ≈6\.8 mm unter die Platte/.test(x)));
  // 1) Vorschnitt: Oberkante 370 + 8/sin45 = 381,32
  assert.match(r.xcs, /CreateSegment\("Saegeschnitt_Linie_1", 381\.32, -50, 381\.32, 250\);/);
  // 2) Ebene auf Höhe der Zapfenoberseite, 45° geneigt, Normale nach oben außen
  assert.match(r.xcs, /CreateWorkplane\("Zapfen_1", 405\.658, 0, 5\.656, 90, 45\.008\);/);
  // Zapfen als Insel (im Uhrzeigersinn), Tasche größer als die Fläche, 8 tief mit E020
  assert.match(r.xcs, /CreatePolyline\("Island_1_1", 167\.242, 28\.297\);\r?\nAddSegmentToPolyline\(167\.242, 14\.461\);\r?\nAddSegmentToPolyline\(32\.758, 14\.461\);/);
  assert.match(r.xcs, /CreatePolyline\("Pocket_1", -9\.655, -9\.655\);\r?\nAddSegmentToPolyline\(209\.655, -9\.655\);/);
  assert.match(r.xcs, /CreateContourPocket\("Pocketing_1", 8, "", TypeOfProcess\.ConcentricalPocket, "E020", "-1", -1, -1, -1, 50, false, "Island_1_1"\);/);
  // Reihenfolge: erst Vorschnitt, dann Tasche
  assert.ok(r.xcs.indexOf('CreateBladeCut') < r.xcs.indexOf('CreateContourPocket'));
  // Zugabe: Vorschnitt weiter außen, zuerst die Zapfenoberseite plan
  const z = convertSolid(s, { tenonAllowance: 0.5 });
  assert.match(z.xcs, /CreateContourPocket\("Pocketing_1", 0\.5, [^;]*false\);[\s\S]*CreateContourPocket\("Pocketing_2", 8\.5, [^;]*"Island_2_1"\);/);
  // Vorschnitt gefräst statt gesägt
  const m = convertSolid(s, { tenonPrecut: 'mill' });
  assert.match(m.xcs, /CreateSlantedRoughFinish/);
  assert.doesNotMatch(m.xcs, /CreateBladeCut/);
  // Platte falsch herum (Zapfen nach unten): nichts schneiden, Hinweis
  const d = convertSolid(s, {}, { orientation: { rot: 0, flip: false } });
  assert.doesNotMatch(d.xcs, /CreateBladeCut|Zapfen_1/);
  assert.ok(d.warnings.some((x) => /Zapfen auf einer Schräge nach unten – nicht von oben bearbeitbar/.test(x)), d.warnings.join(' | '));
  // zweiseitig: Seite 2 (Zapfen zeigt dort nach oben) macht Vorschnitt und Tasche
  const two = convertSolid(s, {}, { orientation: { rot: 0, flip: false }, overrides: { twoSided: true } });
  assert.ok(two.side2 && /CreateBladeCut/.test(two.side2.xcs) && /CreateWorkplane\("Zapfen_1"/.test(two.side2.xcs));
  assert.strictEqual(two.warnings.filter((x) => /Zapfen/.test(x)).length, 1);
});

test('Zapfen auf Schräge: Sonderfälle (30°, bis an den Rand, Feder ganze Länge, Tasche daneben, zwei Höhen, nah an der Kante)', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const Tl = require('../web/js/tools.js');
  const toolInfo = Tl.infoMap(Tl.parseTlgx(read('maestro/werkzeuge/def.tlgx')));
  const run = (f) => convertSolid(readParts(read('test/fixtures/zapfen/' + f + '.step'), f + '.step')[0], { toolInfo });
  // 30°: Ebene 60° geneigt, Tasche so tief wie der Zapfen (6)
  const t30 = run('t30');
  assert.match(t30.xcs, /CreateWorkplane\("Zapfen_1", [^)]*, 90, 60\);/);
  assert.match(t30.xcs, /CreateContourPocket\("Pocketing_1", 6, [^;]*"Island_1_1"\);/);
  // bis an den Rand / Feder über die ganze Länge: nichts schneiden, klarer Hinweis
  for (const f of ['t45end', 't45full']) {
    const r = run(f);
    assert.doesNotMatch(r.xcs, /CreateBladeCut|CreateSlantedRoughFinish|CreateChamfer|Zapfen_1/, f);
    assert.ok(r.warnings.some((x) => /Feder\/Zapfen .*bis an den Rand – nicht automatisch/.test(x)), f + ': ' + r.warnings.join(' | '));
    assert.ok(!r.warnings.some((x) => /ohne Verbindung/.test(x)), f);
  }
  // Tasche neben dem Zapfen in derselben Schräge: nur der Zapfen ist Insel, die Tasche wird auf der Schräge gefräst
  const grv = run('t45grv');
  assert.match(grv.xcs, /CreateContourPocket\("Pocketing_1", 8, [^;]*"Island_1_1"\);/);
  assert.doesNotMatch(grv.xcs, /Island_1_2/);
  assert.match(grv.xcs, /CreateWorkplane\("Slanted_1"/);
  // zwei Zapfen 8 und 5 mm: erst bis 5 (nur der hohe als Insel), dann ringsum mit beiden
  const two = run('t45twoh');
  assert.match(two.xcs, /CreateContourPocket\("Pocketing_1", 3, [^;]*"Island_1_1"\);\r?\n[\s\S]*CreateContourPocket\("Pocketing_2", 8, [^;]*"Island_2_1", "Island_2_2"\);/);
  // Zapfen 2 mm über der Unterkante: Rand unten so groß, dass der Fräser (Ø17,31) dazwischen passt
  const low = run('t45low');
  const yMin = +/CreatePolyline\("Pocket_1", [-\d.]+, (-[\d.]+)\);/.exec(low.xcs)[1];
  assert.ok(yMin <= -(17.31 + 1 - 2) + 1e-6, String(yMin));
});

test('Tiefen-Attribut wahlweise vor dem Element (Handbuch uneindeutig)', () => {
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [s] = readParts(read('test/fixtures/testplatte.step'), 'tp.step');
  const after = convertSolid(s, { oscMill: true, oscSplit: true }).xcs;
  const before = convertSolid(s, { oscMill: true, oscSplit: true, attrPlacement: 'before' }).xcs;
  assert.match(after, /CreatePolyline\("Contour_\d+", 0, 200\);\r?\nAddSegmentToPolyline\(0, 55\.556\);\r?\nSetAttribute\("DEPTH", 26\);/);
  assert.match(before, /CreatePolyline\("Contour_\d+", 0, 200\);\r?\nSetAttribute\("DEPTH", 26\);\r?\nAddSegmentToPolyline\(0, 55\.556\);/);
  assert.strictEqual((after.match(/SetAttribute/g) || []).length, (before.match(/SetAttribute/g) || []).length);
});

test('Oszillieren: Kontur bleibt wie ohne Oszillation, Wendepunkte als SetParametricAttribute', () => {
  // zerteilte Elemente brachen in Maestro die Werkzeugkorrektur (Bahn quer durchs Teil, Kontur nicht geschlossen)
  const { readParts, convertSolid } = require('../web/js/convert.js');
  const [s] = readParts(read('test/fixtures/testplatte.step'), 'tp.step');
  const geo = (x) => x.split(/\r?\n/).filter((l) => /^(CreatePolyline|AddSegmentToPolyline|AddArc)/.test(l)).join('\n');
  const plain = convertSolid(s, {}).xcs;
  const osc = convertSolid(s, { oscMill: true }).xcs;
  assert.strictEqual(geo(osc), geo(plain));
  const marks = [...osc.matchAll(/SetParametricAttribute\("DEPTH", ([\d.]+), ([\d.]+)\);/g)];
  assert.ok(marks.length > 4);
  for (const m of marks) { assert.ok(+m[1] >= 20 && +m[1] <= 26); assert.ok(+m[2] > 0 && +m[2] < 1); }
  // Bögen (Halbkreis-Ausschnitt) bleiben ganz
  const split = convertSolid(s, { oscMill: true, oscSplit: true }).xcs;
  assert.ok(geo(split).split('\n').length > geo(osc).split('\n').length);
});
