/*
 * Erzeugt Xilog-Maestro-Skript (.xcs) aus dem Ergebnis von PanelAnalyzer.
 * Format und Konventionen sind aus den Beispielen in maestro/beispiele/ abgeleitet.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XcsWriter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    fieldShort: 'IJ',          // SetMachiningParameters – Arbeitsfeld für kurze Teile
    fieldLong: 'IL',           // … für lange Teile
    fieldThreshold: 1300,      // bis zu dieser Länge (mm) fieldShort, darüber fieldLong
    fieldWideShort: 'AB',      // breite Teile (Y > fieldWidth) bis fieldThreshold lang
    fieldWideLong: 'AD',       // breite und lange Teile
    fieldWidth: 620,           // ab dieser Breite Y (mm) die Felder für breite Teile
    rawOversize: 2,            // CreateRawWorkpiece: Aufmaß je Seite
    contourTool: 'E014',       // Formatfräsen außen
    contourExtra: 3,           // Frästiefe = Dicke + …
    formatTwoStep: false,      // Formatfräsen mit zwei Werkzeugen: vorfräsen mit Aufmaß, nachfräsen auf Endmaß
    formatRoughTool: 'E014',   // Werkzeug 1 (vorfräsen); Werkzeug 2 = contourTool
    formatAllowance: 1,        // Aufmaß beim Vorfräsen in mm (overMaterial)
    cutoutTool: 'E016',        // Ausschnitte / Durchbrüche / Konturabweichungen
    cutoutExtra: 2,
    leadLength: 20,            // Ein-/Auslauf entlang der Kante bei Ausschnitten
    sawTool: '066',            // Nut mit Säge
    sawOverrun: 50,            // Säge-Überlauf an beiden Enden
    maxGrooveWidth: 12,        // breitere Nuten → Warnung
    rebateTool: 'E016',        // Falz
    rebateToolDia: 12,         // nur falls der Fräser nicht in der Werkzeugliste steht
    pocketTool: 'E016',        // Taschen (CreateContourPocket)
    pocketOverlap: 50,         // Überdeckung in %
    pocketStepDown: 0,         // Zustelltiefe je Durchgang bei Taschen in mm (0 = wie stepDown)
    chamferTool: 'E050',       // Fasen (CreateChamfer)
    slantTool: 'E016',         // schräge Kanten / Gehrung (CreateSlantedRoughFinish)
    slantExtra: 2,             // Schrägfräsen: Dicke + …
    slantCut: 'saw',           // schräge Kanten über die ganze Länge: 'saw' = Sägeschnitt (CreateBladeCut), 'mill' = fräsen
    // Gekrümmte Flächen (je Teil einschaltbar, nur wenn erkannt)
    curvedSlantOn: false,      // Schräge an Rundungen 5-achsig fräsen (CreateSlantedRoughFinish entlang der Kontur)
    curvedSurfaceOn: false,    // gewölbte Flächen mit dem Kugelfräser zeilenfräsen (CreateToolpath)
    ballTool: 'E055',          // Kugelfräser
    ballToolDia: 12,           // nur falls der Kugelfräser nicht in der Werkzeugliste steht
    surfStepover: 1.5,         // Zeilenabstand in mm
    surfLayer: 4,              // Zustellung beim Vorfräsen in mm (0 = nur Schlichten)
    surfRes: 1,                // Punktabstand längs der Zeile in mm
    surfTol: 0.02,             // Toleranz beim Zusammenfassen von Punkten in mm
    surfSafe: 5,               // Abheben zwischen den Zeilen: über der Oberseite in mm
    bladeTool: 'E070',         // Säge für Sägeschnitte
    bladeExtra: 2,             // Sägeschnitt: Extra-Tiefe unter der Platte (extraDepth)
    scoreCut: false,           // Sägeschnitt vorritzen (CreateSectioningMillingStrategy)
    scoreDepth: 3,             // Vorritzen: Tiefe des ersten Schnitts in mm
    scoreOut: 10,              // Vorritzen: Abstand nach außen zwischen den Durchgängen in mm
    stepDown: 0,               // Zustellung je Durchgang in mm (0 = in einem Durchgang)
    finishDepth: 0,            // letzte Zustellung in mm (0 = keine eigene)
    contourMode: 'whole',      // Sonderkontur: 'whole' = Außenkontur am Stück, 'rect' = Rechteck + Ausschnitte
    // Reihenfolge-Regel: Bearbeitungsarten in dieser Folge (abschaltbar, vom Benutzer änderbar)
    orderRule: { on: true, seq: ['drillTop', 'drillSide', 'drillSlanted', 'slot', 'pocket', 'rebate', 'chamfer', 'slant',
      'blade', 'slantPlane', 'surface', 'cutout', 'notch', 'format'] },
    throughExtra: 2,           // Durchgangsbohrung: Tiefe = Dicke + …
    drillsVertical: [3, 5, 7, 8, 10, 12, 15, 20, 35],
    drillsHorizontal: [5, 8],
    parkOffset: 1000,          // CreateNullOperation X = Länge + …
    usePatterns: true,
    // X-Konverter (Batch-Datei konvertieren.bat in der ZIP)
    xconverterPath: 'C:\\Program Files\\SCM Group\\Maestro\\XConverter.exe',
    toolsFile: 'C:\\Users\\Public\\Documents\\SCM Group\\Maestro\\Tlgx\\def.tlgx',
    pgmxDir: '',               // leer = Unterordner „pgmx“ neben der .bat
    // Programmkopf
    commentOn: true,           // SetComment / SetDescription: Teil, Herkunft, Maße
    optimizeOn: false,         // SetOptimization(true): Maestro optimiert beim Laden
    autoSetupOn: false,        // SetAutoSetup(true): Tisch beim Laden automatisch einrichten
    workpieceShape: 'box',     // 'box' = Quader, 'contour' = echte Außenkontur (CreateFinishedWorkpieceFromExtrusion)
    // Durchbrüche
    tabsMode: 'off',           // Haltestege (TAB): 'off', 'small' (Innenstück bis tabsMaxSize), 'all'
    tabsMaxSize: 200,          // größte Seite des Innenstücks für 'small' in mm
    tabsCount: 2,              // Stege je Durchbruch
    tabLength: 5,              // Steglänge in mm
    tabHeight: 2,              // Steghöhe (stehen gelassenes Material) in mm
    helixOn: false,            // Durchbrüche/Rundlöcher spiralförmig eintauchen (CreateHelicMillingStrategy)
    helixStep: 5,              // Zustellung je Umlauf der Spirale in mm
    // Bohren
    drillStepFrom: 0,          // ab dieser Bohrtiefe in Stufen bohren (0 = aus)
    drillStep: 15,             // Tiefe je Stufe in mm
    // Sauger (Drehsauger auf Konsolen): automatischer Vorschlag, SetBarPosition / SetSuctionCupPosition
    suctionOn: true,           // Vorschlag ins Programm schreiben
    cupBigCode: 'H75-M-145x145', cupBigX: 145, cupBigY: 145,
    cupSmallCode: 'H75-M-145x55', cupSmallX: 145, cupSmallY: 55,
    cupSmallEcc: 45,           // exzentrisch: Saugfläche 45 mm neben der Drehachse (im Gehäuse 145 × 145 am Rand)
    cupNarrowCode: 'H75-M-145x30', cupNarrowX: 145, cupNarrowY: 30, // für sehr schmale Teile (leer = nicht verwenden)
    cupNarrowEcc: 0,           // Versatz der Saugfläche zur Drehachse in mm (0 = mittig)
    cupHousing: 145,           // Gehäuse der Drehsauger (Mindestabstand auf der Konsole)
    cupAngleCw: false,         // Saugerwinkel in Maestro im Uhrzeigersinn (false = gegen den Uhrzeigersinn)
    barCount: 6,               // Konsolen an der Maschine
    barMinGap: 150,            // kleinster Abstand der Konsolen (Mitte zu Mitte)
    barSpacing: 500,           // angestrebter Abstand der Konsolen
    cupsPerBar: 4,             // höchstens so viele Sauger je Konsole
    cupEdgeMargin: 15,         // Abstand Sauger – Plattenkante (Formatfräser, Säge)
    cupHoleMargin: 10,         // Abstand Sauger – Durchbrüche und Durchgangsbohrungen
  };

  const FACE_NAMES = { Left: 'Left', Right: 'Right', Front: 'Front', Back: 'Back' };

  // Bearbeitungsarten für die Reihenfolge-Regel
  const CATEGORIES = {
    drillTop: 'Bohrungen oben',
    drillSide: 'Bohrungen in der Kante',
    drillSlanted: 'Schräge Bohrungen',
    slot: 'Nuten (Säge)',
    pocket: 'Taschen',
    rebate: 'Falze',
    chamfer: 'Fasen',
    slant: 'Schräge Kanten (fräsen)',
    blade: 'Sägeschnitte',
    slantPlane: 'Bearbeitungen auf schrägen Ebenen',
    surface: 'Gewölbte Flächen (Kugelfräser)',
    cutout: 'Durchbrüche und Rundlöcher',
    notch: 'Konturausschnitte',
    format: 'Formatfräsen',
  };

  function category(op) {
    if (op.plane) return 'slantPlane';
    if (op.kind === 'drill') return op.face === 'Top' ? 'drillTop' : 'drillSide';
    if (op.kind === 'sdrill') return 'drillSlanted';
    const k = op.key || '';
    if (k === 'format') return 'format';
    const prefix = k.split('-')[0];
    return { notch: 'notch', cutout: 'cutout', round: 'cutout', rebate: 'rebate', pocket: 'pocket', rpocket: 'pocket', spocket: 'pocket', chamfer: 'chamfer', chamferpath: 'chamfer',
      slant: 'slant', cslant: 'slant', blade: 'blade', slot: 'slot', surface: 'surface' }[prefix] || 'notch';
  }

  // Vollständige Regel-Reihenfolge (fehlende Arten hinten anhängen, unbekannte entfernen)
  function ruleSequence(rule) {
    const seq = ((rule && rule.seq) || []).filter((c) => CATEGORIES[c]);
    // neue Arten (aus späteren Versionen) an ihrer Standardstelle einfügen, nicht hinten anhängen
    const def = DEFAULTS.orderRule.seq.concat(Object.keys(CATEGORIES).filter((c) => !DEFAULTS.orderRule.seq.includes(c)));
    for (const c of def) {
      if (seq.includes(c)) continue;
      const before = def.slice(0, def.indexOf(c)).reverse().find((x) => seq.includes(x));
      seq.splice(before ? seq.indexOf(before) + 1 : 0, 0, c);
    }
    return seq;
  }

  // Arbeitsfeld nach Teilegröße: Länge X bis 1300 → IJ, darüber IL; Breite Y über 620 → AB bzw. AD
  function autoField(p, cfg) {
    const long = p.L > cfg.fieldThreshold + 1e-6;
    if (p.W > cfg.fieldWidth + 1e-6) return long ? cfg.fieldWideLong : cfg.fieldWideShort;
    return long ? cfg.fieldLong : cfg.fieldShort;
  }

  function fmt(v) {
    let r = Math.round(v * 1000) / 1000;
    if (Object.is(r, -0)) r = 0;
    return String(r);
  }
  const pt = (p) => fmt(p[0]) + ', ' + fmt(p[1]);

  // ---------------------------------------------------------------- Sauger-Vorschlag

  // Kontur (Segmente line/arc) als Punktliste
  function loopPts(segs) {
    const pts = [];
    for (const q of segs) {
      if (q.type === 'arc') {
        let a0 = Math.atan2(q.a[1] - q.c[1], q.a[0] - q.c[0]);
        let sw = q.full ? Math.PI * 2 : Math.atan2(q.b[1] - q.c[1], q.b[0] - q.c[0]) - a0;
        if (!q.full) { if (q.ccw) { while (sw <= 0) sw += Math.PI * 2; } else { while (sw >= 0) sw -= Math.PI * 2; } }
        if (q.full && !q.ccw) sw = -sw;
        const n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 24)));
        for (let i = 0; i < n; i++) pts.push([q.c[0] + q.r * Math.cos(a0 + (sw * i) / n), q.c[1] + q.r * Math.sin(a0 + (sw * i) / n)]);
      } else pts.push(q.a);
    }
    return pts;
  }
  function inPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function distPoly(p, poly) {
    let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j];
      const b = poly[i];
      const ab = [b[0] - a[0], b[1] - a[1]];
      const l2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2));
      d = Math.min(d, Math.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1]));
    }
    return d;
  }

  // Schlägt Konsolen (X) und Sauger (Y, Winkel, Typ) vor. Sauger liegen auf der Unterseite, mit Abstand zu
  // Kanten (Formatfräser, Säge) und zu allem, was durchgeht (Durchbrüche, Durchgangsbohrungen).
  function planSuction(p, cfg) {
    const warnings = [];
    const base = loopPts(p.base || p.outline || []);
    if (base.length < 3) return { bars: [], warnings: ['Sauger: Auflagefläche nicht erkannt – Sauger von Hand setzen.'] };
    const holes = (p.cutouts || []).map(loopPts);
    const circles = (p.drills || []).filter((d) => d.face === 'Top' && d.through).map((d) => ({ c: [d.x, d.y], r: d.d / 2 }));
    const em = cfg.cupEdgeMargin;
    const hm = cfg.cupHoleMargin;
    // Drehsauger: gerade (0°/90°) und parallel zu den Kanten der Auflagefläche
    const angles = [0, 90];
    for (let i = 0; i < base.length; i++) {
      const a = base[i];
      const b = base[(i + 1) % base.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 100) continue;
      let ang = Math.round((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
      ang = ((ang % 180) + 180) % 180;
      if (!angles.some((x) => Math.abs(x - ang) < 2 || Math.abs(x - ang) > 178)) angles.push(ang);
    }
    // Sauger-Arten. Exzentrische Sauger (e > 0): Saugfläche sitzt e neben der Drehachse (bei 0° in +Y) und läuft beim
    // Drehen um sie herum – je Winkel auch die Gegenrichtung (+180°) probieren. Winkel hier mathematisch (gegen den Uhrzeigersinn).
    const types = [];
    const kind = (code, sx, sy, e, ang, w) => ({ code: code, sx: sx, sy: sy, e: e || 0, angles: e > 0 ? [ang, ang + 180] : [ang], w: w });
    for (const ang of angles) if (ang < 90) types.push(kind(cfg.cupBigCode, cfg.cupBigX, cfg.cupBigY, 0, ang, 2));
    for (const ang of angles) types.push(kind(cfg.cupSmallCode, cfg.cupSmallX, cfg.cupSmallY, cfg.cupSmallEcc, ang, 1));
    if (cfg.cupNarrowCode && cfg.cupNarrowY > 0) {
      for (const ang of angles) types.push(kind(cfg.cupNarrowCode, cfg.cupNarrowX, cfg.cupNarrowY, cfg.cupNarrowEcc, ang, 0.5));
    }
    const rad = (a) => (a * Math.PI) / 180;
    // Mitte der Saugfläche zur Drehachse (bx, y) bei Winkel a
    const padAt = (bx, y, t, a) => [bx - t.e * Math.sin(rad(a)), y + t.e * Math.cos(rad(a))];
    // passt die Saugfläche (Rechteck um cx, cy, gedreht um a) auf die Fläche?
    const fits = (cx, cy, t, a) => {
      const ca = Math.cos(rad(a));
      const sa = Math.sin(rad(a));
      const P = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
      const hx = t.sx / 2;
      const hy = t.sy / 2;
      const nx = Math.max(2, Math.ceil(t.sx / 15));
      const ny = Math.max(2, Math.ceil(t.sy / 15));
      const pts = [];
      for (let i = 0; i <= nx; i++) { const u = -hx + (t.sx * i) / nx; pts.push(P(u, -hy), P(u, hy)); }
      for (let j = 1; j < ny; j++) { const v = -hy + (t.sy * j) / ny; pts.push(P(-hx, v), P(hx, v)); }
      for (const q of pts) {
        if (!inPoly(q, base) || distPoly(q, base) < em) return false;
        for (const h of holes) if (inPoly(q, h) || distPoly(q, h) < hm) return false;
        for (const c of circles) if (Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) < c.r + hm) return false;
      }
      // Bohrung oder Durchbruch ganz unter dem Sauger
      const inside = (q) => {
        const dx = q[0] - cx;
        const dy = q[1] - cy;
        return Math.abs(dx * ca + dy * sa) < hx + hm && Math.abs(-dx * sa + dy * ca) < hy + hm;
      };
      if (circles.some((c) => inside(c.c)) || holes.some((h) => h.some(inside))) return false;
      return true;
    };
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const q of base) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    // Sauger entlang einer Konsole bei x: gleichmäßig verteilt, möglichst weit außen (y = Drehachse)
    const orient = (x, y, t) => {
      // passende Winkel; bei zwei Möglichkeiten die Saugfläche näher zur Plattenmitte
      let best = null;
      for (const a of t.angles) {
        const q = padAt(x, y, t, a);
        if (!fits(q[0], q[1], t, a)) continue;
        const d = Math.abs(q[1] - (y0 + y1) / 2);
        if (!best || d < best.d - 1e-9) best = { a: a, q: q, d: d };
      }
      return best;
    };
    const cupsAt = (x, t) => {
      const ys = [];
      for (let y = y0 - t.e; y <= y1 + t.e; y += 5) if (orient(x, y, t)) ys.push(y);
      if (!ys.length) return [];
      const runs = [];
      let run = [ys[0], ys[0]];
      for (let k = 1; k < ys.length; k++) { if (ys[k] - run[1] <= 5.01) run[1] = ys[k]; else { runs.push(run); run = [ys[k], ys[k]]; } }
      runs.push(run);
      // Platzbedarf eines Saugers in Y (gedreht); exzentrische Sauger: ganzes Gehäuse
      const ca = Math.abs(Math.cos(rad(t.angles[0])));
      const sa = Math.abs(Math.sin(rad(t.angles[0])));
      const need = (t.e > 0 ? Math.max(cfg.cupHousing, t.sx * sa + t.sy * ca) : t.sx * sa + t.sy * ca) + 20;
      const size = need - 20; // Sauger dürfen sich auf der Konsole nicht berühren
      let out = [];
      if (t.e > 0) {
        // exzentrisch: die Drehachse kann auch neben der Platte stehen – über alle passenden Stellen gleichmäßig verteilen,
        // jede Stelle mit Abstand zu den schon gewählten
        const lo = ys[0];
        const hi = ys[ys.length - 1];
        const n = Math.max(1, Math.min(cfg.cupsPerBar, 1 + Math.floor((hi - lo) / Math.max(need, 200))));
        for (let k = 0; k < n; k++) {
          const target = n === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * k) / (n - 1);
          let pick = null;
          for (const v of ys) {
            if (out.some((w) => Math.abs(w - v) < need - 1e-6)) continue;
            if (pick === null || Math.abs(v - target) < Math.abs(pick - target)) pick = v;
          }
          if (pick !== null) out.push(pick);
        }
      } else {
        for (const r of runs) {
          const span = r[1] - r[0];
          const n = Math.max(1, Math.min(cfg.cupsPerBar, 1 + Math.floor(span / Math.max(need, 200))));
          for (let k = 0; k < n; k++) out.push(n === 1 ? (r[0] + r[1]) / 2 : r[0] + (span * k) / (n - 1));
        }
      }
      out.sort((a, b) => a - b);
      out = out.filter((y, k) => !out.slice(0, k).some((w) => y - w < size - 1e-6));
      // gleichmäßig verteilte Stellen liegen in einem Lauf passender Stellen; Werte auf das 5-mm-Raster der Suche
      return out.slice(0, cfg.cupsPerBar).map((y) => {
        let o = orient(x, y, t);
        if (!o) { y = ys.reduce((m, v) => (Math.abs(v - y) < Math.abs(m - y) ? v : m), ys[0]); o = orient(x, y, t); }
        const a = ((o.a % 360) + 360) % 360;
        const outA = cfg.cupAngleCw ? (360 - a) % 360 : a; // Winkel so, wie Maestro ihn zählt
        return { y: y, angle: outA, rot: a, code: t.code, sx: t.sx, sy: t.sy, e: t.e, px: o.q[0], py: o.q[1], w: t.w };
      });
    };
    const memo = new Map();
    const bestAt = (x) => {
      const key = Math.round(x);
      if (memo.has(key)) return memo.get(key);
      let best = [];
      let bestScore = 0;
      for (const t of types) {
        const c = cupsAt(x, t);
        const sc = c.reduce((a, q) => a + q.w, 0);
        if (sc > bestScore) { best = c; bestScore = sc; }
        if (t.w === 2 && c.length >= 2) break; // zwei große Sauger: gut genug
      }
      memo.set(key, best);
      return best;
    };
    const score = (cups) => cups.reduce((a, q) => a + q.w, 0);
    const n = Math.max(1, Math.min(cfg.barCount, Math.round((x1 - x0) / cfg.barSpacing) + 1));
    let bars = [];
    const inner0 = x0 + em + cfg.cupBigX / 2;
    const inner1 = x1 - em - cfg.cupBigX / 2;
    for (let k = 0; k < n; k++) {
      const ideal = n === 1 || inner1 <= inner0 ? (x0 + x1) / 2 : inner0 + ((inner1 - inner0) * k) / (n - 1);
      // in der Nähe des Idealpunkts die Stelle mit den meisten Saugern suchen
      let best = null;
      for (let dx = 0; dx <= Math.max(60, cfg.barSpacing / 2); dx += 10) {
        for (const x of dx ? [ideal - dx, ideal + dx] : [ideal]) {
          if (x < x0 || x > x1) continue;
          if (bars.some((b) => Math.abs(b.x - x) < cfg.barMinGap)) continue;
          const cups = bestAt(x);
          if (cups.length && (!best || score(cups) > score(best.cups))) best = { x: x, cups: cups };
        }
        if (best && best.cups.length >= 2 && score(best.cups) >= 4) break; // zwei große Sauger: gut genug
      }
      if (best) bars.push(best);
    }
    // zu wenig Halt (weniger als zwei Sauger): bestes Konsolenpaar über die ganze Länge suchen
    if (bars.reduce((a, b) => a + b.cups.length, 0) < 2 && cfg.barCount >= 1) {
      const xs = [];
      for (let x = x0; x <= x1; x += 10) { const c = bestAt(x); if (c.length) xs.push({ x: x, cups: c }); }
      let pick = bars;
      let pickScore = bars.reduce((a, b) => a + score(b.cups), 0);
      for (const a of xs) {
        if (score(a.cups) > pickScore && a.cups.length >= 2) { pick = [a]; pickScore = score(a.cups); }
        if (cfg.barCount < 2) continue;
        for (const b of xs) {
          if (b.x - a.x < cfg.barMinGap) continue;
          const sc = score(a.cups) + score(b.cups);
          if (sc > pickScore) { pick = [a, b]; pickScore = sc; }
        }
      }
      bars = pick;
    }
    bars.sort((a, b) => a.x - b.x);
    const total = bars.reduce((a, b) => a + b.cups.length, 0);
    if (!total) warnings.push('Sauger: kein Platz für einen Sauger gefunden – Teil von Hand spannen.');
    else if (total < 2) warnings.push('Sauger: nur ein Sauger passt – Spannung prüfen.');
    return { bars: bars, warnings: warnings };
  }

  // ---------------------------------------------------------------- Planung

  function hasDrill(list, d) {
    return list.some((x) => Math.abs(x - d) < 0.05);
  }

  // Wandelt eine Bohrung in lokale Koordinaten der Bearbeitungsebene um.
  function localDrill(p, d) {
    switch (d.face) {
      case 'Top': return { x: d.x, y: d.y };
      case 'Left': return { x: p.W - d.along, y: d.z };
      case 'Right': return { x: d.along, y: d.z };
      case 'Front': return { x: d.along, y: d.z };
      case 'Back': return { x: p.L - d.along, y: d.z };
    }
    return null;
  }

  // Fasst gleichabständige Bohrungen auf einer Linie zu Reihen zusammen.
  function makePatterns(points, enabled) {
    if (!enabled) return points.map((q) => ({ p: q, nX: 1, nY: 1, dX: 0, dY: 0 }));
    const tryOrder = (first) => {
      let rest = points.slice();
      const out = [];
      for (const axis of [first, 1 - first]) {
        const other = 1 - axis;
        const key = (q) => (axis === 0 ? q.y : q.x);
        const pos = (q) => (axis === 0 ? q.x : q.y);
        const lines = [];
        for (const q of rest) {
          let l = lines.find((l) => Math.abs(key(l[0]) - key(q)) < 0.01);
          if (!l) { l = []; lines.push(l); }
          l.push(q);
        }
        rest = [];
        for (const l of lines) {
          l.sort((a, b) => pos(a) - pos(b));
          let i = 0;
          while (i < l.length) {
            let j = i + 1;
            if (j < l.length) {
              const step = pos(l[j]) - pos(l[i]);
              while (j + 1 < l.length && Math.abs(pos(l[j + 1]) - pos(l[j]) - step) < 0.01) j++;
              if (step > 0.01) {
                const n = j - i + 1;
                out.push(axis === 0
                  ? { p: l[i], nX: n, nY: 1, dX: step, dY: 0 }
                  : { p: l[i], nX: 1, nY: n, dX: 0, dY: step });
                i = j + 1;
                continue;
              }
            }
            rest.push(l[i]);
            i++;
          }
        }
        void other;
      }
      return out.concat(rest.map((q) => ({ p: q, nX: 1, nY: 1, dX: 0, dY: 0 })));
    };
    const a = tryOrder(1);
    const b = tryOrder(0);
    return b.length < a.length ? b : a;
  }

  function plan(p, cfg) {
    const ops = [];
    const warnings = p.warnings.slice();
    const T = p.T;
    let nContour = 0;
    let nRound = 0;   // eigene Zähler: Schlüssel bleiben stabil, wenn sich davor etwas ändert (Überschreibungen je Teil)
    let nRPocket = 0;
    let nMill = 0;

    const toolD = (name, fallback) => {
      const t = cfg.toolInfo && cfg.toolInfo[name];
      return t && t.d ? t.d : fallback;
    };

    // Engste Stelle einer Tasche: Halbkreise (Langloch-Enden) geben die Breite vor
    const narrowest = (segs) => {
      let w = Infinity;
      for (const q of segs) {
        if (q.type !== 'arc' || !q.ccw) continue;
        let sw = Math.atan2(q.b[1] - q.c[1], q.b[0] - q.c[0]) - Math.atan2(q.a[1] - q.c[1], q.a[0] - q.c[0]);
        while (sw <= 1e-9) sw += Math.PI * 2;
        if (q.full || sw > Math.PI - 0.01) w = Math.min(w, 2 * q.r);
      }
      return w;
    };
    // Passt der Standardfräser nicht hinein: größten Fräser wählen, der passt (Schneide möglichst ≥ Tiefe)
    const fittingMill = (width, depth, fallback) => {
      const info = cfg.toolInfo || {};
      const fd = toolD(fallback, null);
      if (!fd || fd < width - 1e-6) return fallback;
      const cands = Object.keys(info).filter((n) => info[n].kind === 'mill' && info[n].d > 0 && info[n].d < width - 1e-6);
      cands.sort((a, b) => ((info[b].len || 0) >= depth) - ((info[a].len || 0) >= depth) || info[b].d - info[a].d);
      return cands[0] || fallback;
    };

    // 1) Formatfräsen: Rechteck L×B wie in den Beispielen, bei Sonderkontur die ganze Außenkontur am Stück
    const whole = !p.outlineIsRect && cfg.contourMode !== 'rect';
    if (whole) {
      const path = wholeContour(p.outline);
      ops.push({
        kind: 'contour', key: 'format', toolKind: 'mill', toolDefault: 'contourTool', contour: ++nContour, milling: ++nMill, approach: true,
        start: path.start, segs: path.segs, depth: T + cfg.contourExtra, tool: cfg.contourTool, side: 2, label: 'Formatfräsen (Sonderkontur)',
      });
    } else {
      ops.push({
        kind: 'contour', key: 'format', toolKind: 'mill', toolDefault: 'contourTool', contour: ++nContour, milling: ++nMill, approach: true,
        start: [0, p.W / 2],
        segs: [[0, 0], [p.L, 0], [p.L, p.W], [0, p.W], [0, p.W / 2]].map((q) => ({ type: 'line', to: q })),
        depth: T + cfg.contourExtra, tool: cfg.contourTool, side: 2, label: 'Formatfräsen',
      });
    }
    if (cfg.formatTwoStep) {
      // Vorfräsen mit Werkzeug 1 und Aufmaß, danach Werkzeug 2 auf Endmaß (gleiche Geometrie)
      const f = ops[ops.length - 1];
      f.rough = { tool: cfg.formatRoughTool || cfg.contourTool, allowance: Math.max(0, cfg.formatAllowance || 0) };
      f.label += ' zweistufig';
    }

    // 2) Nuten mit Säge
    for (const g of p.grooves) {
      const width = g.to - g.from;
      if (width > cfg.maxGrooveWidth) warnings.push('Nut ' + fmt(width) + ' mm breit – breiter als ' + cfg.maxGrooveWidth + ' mm, bitte prüfen.');
      // Segment auf der Nutflanke, Nut links der Fahrtrichtung (wie im Beispiel 32_Seitenwand_R)
      const a = g.dir === 'X' ? [-cfg.sawOverrun, g.from] : [g.to, -cfg.sawOverrun];
      const b = g.dir === 'X' ? [p.L + cfg.sawOverrun, g.from] : [g.to, p.W + cfg.sawOverrun];
      ops.push({ kind: 'slot', key: 'slot-' + p.grooves.indexOf(g), toolKind: 'saw', toolDefault: 'sawTool', a: a, b: b, depth: g.depth, width: width, tool: cfg.sawTool,
        label: 'Nut ' + fmt(width) + '×' + fmt(g.depth) });
    }

    // 3) Abweichungen der Außenkontur vom Rechteck (Ausschnitte, Rundungen, Schrägen)
    for (const [i, path] of (whole ? [] : notchPaths(p, cfg)).entries()) {
      ops.push({ kind: 'contour', key: 'notch-' + i, toolKind: 'mill', toolDefault: 'cutoutTool', contour: ++nContour, milling: ++nMill, approach: false,
        start: path.start, segs: path.segs, depth: T + cfg.cutoutExtra, tool: cfg.cutoutTool, side: 1, label: 'Kontur-Ausschnitt' });
    }

    // 4) Durchbrüche (Innenkonturen)
    for (const [i, lp] of p.cutouts.entries()) {
      ops.push({ kind: 'contour', key: 'cutout-' + i, toolKind: 'mill', toolDefault: 'cutoutTool', contour: ++nContour, milling: ++nMill, approach: false,
        start: lp[0].a, segs: lp.map(toPolySeg), depth: T + cfg.cutoutExtra, tool: cfg.cutoutTool, side: 2, label: 'Durchbruch' });
    }

    // 5) Falze
    for (const [ri, r] of p.rebates.entries()) {
      const key = 'rebate-' + ri;
      const rTool = (cfg.toolOverrides && cfg.toolOverrides[key]) || cfg.rebateTool;
      const dia = toolD(rTool, cfg.rebateToolDia);
      const n = Math.max(1, Math.ceil(r.width / (dia * 0.9)));
      if (n > 1) warnings.push('Falz ' + fmt(r.width) + ' mm breiter als Fräser Ø' + fmt(dia) + ' – ' + n + ' Bahnen.');
      for (let i = 0; i < n; i++) {
        const off = (i * r.width) / n;
        let a;
        let b;
        const ll = cfg.leadLength;
        if (r.edge === 'Front') { const y = r.flank - off; a = [-ll, y]; b = [p.L + ll, y]; }
        if (r.edge === 'Back') { const y = r.flank + off; a = [p.L + ll, y]; b = [-ll, y]; }
        if (r.edge === 'Left') { const x = r.flank - off; a = [x, p.W + ll]; b = [x, -ll]; }
        if (r.edge === 'Right') { const x = r.flank + off; a = [x, -ll]; b = [x, p.W + ll]; }
        ops.push({ kind: 'contour', key: key, toolKind: 'mill', toolDefault: 'rebateTool', contour: ++nContour, milling: ++nMill, approach: false,
          start: a, segs: [{ type: 'line', to: b }], depth: r.depth, tool: cfg.rebateTool, side: 2,
          label: 'Falz ' + fmt(r.width) + '×' + fmt(r.depth) });
      }
    }

    // 6) Taschen (flachste zuerst)
    for (const [i, k] of p.pockets.entries()) {
      const key = 'pocket-' + i;
      const kw = Math.min(k.x1 - k.x0, k.y1 - k.y0, narrowest(k.segs));
      const auto = fittingMill(kw, k.depth, cfg.pocketTool);
      const tool = (cfg.toolOverrides && cfg.toolOverrides[key]) || auto;
      const dia = toolD(tool, null);
      const size = fmt(k.x1 - k.x0) + '×' + fmt(k.y1 - k.y0);
      if (dia && kw < dia) warnings.push('Tasche ' + size + ' ist schmaler als Fräser ' + tool + ' (Ø' + fmt(dia) + ').');
      if (dia && k.minRadius < dia / 2 - 0.01) warnings.push('Tasche ' + size + ': Eckenradius R' + fmt(k.minRadius) + ' kleiner als Fräserradius ' + fmt(dia / 2) + ' – Ecken bleiben runder.');
      if (k.open && k.open.length) warnings.push('Tasche ' + size + ' ist zur Kante offen (' + k.open.join(', ') + ') – Anfahrt in Maestro prüfen.');
      ops.push({ kind: 'pocket', key: key, toolKind: 'mill', toolDefault: 'pocketTool', pocket: i + 1, segs: k.segs, islands: k.islands,
        depth: k.depth, tool: auto, label: 'Tasche ' + size + '×' + fmt(k.depth) + (k.islands.length ? ' mit Insel' : '') });
    }

    // 6b) Taschen in den Kanten (Stirn-/Längsseiten, eigene Bearbeitungsebene)
    const SIDE_DE = { Left: 'links', Right: 'rechts', Front: 'vorne', Back: 'hinten' };
    for (const [i, k] of (p.sidePockets || []).entries()) {
      const key = 'spocket-' + i;
      const w = Math.min(k.x1 - k.x0, k.y1 - k.y0, narrowest(k.segs));
      const auto = fittingMill(w, k.depth, cfg.pocketTool);
      const tool = (cfg.toolOverrides && cfg.toolOverrides[key]) || auto;
      const dia = toolD(tool, null);
      const r1 = (v) => fmt(Math.round(v * 10) / 10);
      const label = 'Tasche ' + SIDE_DE[k.face] + ' ' + r1(k.x1 - k.x0) + '×' + r1(k.y1 - k.y0);
      if (dia && w < dia) warnings.push(label + ' ist schmaler (' + fmt(w) + ') als Fräser ' + tool + ' (Ø' + fmt(dia) + ') – kleineren Fräser wählen.');
      else if (dia && k.minRadius < dia / 2 - 0.01) warnings.push(label + ': Eckenradius R' + fmt(k.minRadius) + ' kleiner als Fräserradius ' + fmt(dia / 2) + ' – Ecken bleiben runder.');
      if (k.holes) warnings.push(label + ': Bohrung im Taschenboden wird nicht ausgegeben.');
      ops.push({ kind: 'pocket', face: k.face, key: key, toolKind: 'mill', toolDefault: 'pocketTool', pocket: 0, segs: k.segs, islands: k.islands,
        depth: k.depth, tool: auto, autoTool: auto !== cfg.pocketTool, label: label + (k.islands.length ? ' mit Insel' : '') });
    }

    // 7) Fasen: entlang der Kontur am Stück (auch über Rundungen), sonst einzelne Kanten
    for (const [i, c] of (p.chamferPaths || []).entries()) {
      const path = c.closed ? wholeContour(c.segs) : { start: c.segs[0].a, segs: c.segs.map(toPolySeg) };
      ops.push({ kind: 'chamfer', key: 'chamferpath-' + i, toolKind: 'mill', toolDefault: 'chamferTool', start: path.start, segs: path.segs,
        width: c.width, height: c.height, toolPos: c.side === 'top' ? 2 : 3, tool: cfg.chamferTool,
        label: 'Fase ' + fmt(c.width) + '×' + fmt(c.height) + (c.side === 'top' ? ' oben' : ' unten') + (c.closed ? ' umlaufend' : ' (Kontur)') });
    }
    for (const [i, c] of p.chamfers.entries()) {
      ops.push({ kind: 'chamfer', key: 'chamfer-' + i, toolKind: 'mill', toolDefault: 'chamferTool', a: c.line.a, b: c.line.b,
        width: c.width, height: c.height, toolPos: c.side === 'top' ? 2 : 3, tool: cfg.chamferTool,
        label: 'Fase ' + fmt(c.width) + '×' + fmt(c.height) + (c.side === 'top' ? ' oben' : ' unten') });
    }

    // 7b) Gekrümmte Flächen – nur wenn beim Teil eingeschaltet, sonst Hinweis
    const atEdge = (q) => q[0] < 0.05 || q[0] > p.L - 0.05 || q[1] < 0.05 || q[1] > p.W - 0.05;
    const ovTool = (key, def) => (cfg.toolOverrides && cfg.toolOverrides[key]) || def;
    const curvedFaces = new Set(); // Schrägen, die in der 5-Achs-Bahn an der Rundung mitgefräst werden
    const cSlants = p.curvedSlants || [];
    if (cSlants.length && cfg.curvedSlantOn) {
      for (const [i, c] of cSlants.entries()) {
        const key = 'cslant-' + i;
        const tool = ovTool(key, cfg.slantTool);
        const label = 'Schräge an Rundung ' + fmt(c.tilt) + '° (5-Achs)';
        // Werkzeugmitte: um r / cos(Neigung) zur Abfallseite versetzt (wie bei geraden Schrägen)
        const dt = toolD(tool, 0);
        if (!dt) warnings.push(label + ': Durchmesser von ' + tool + ' unbekannt – Bahn liegt auf der Kante (Werkzeugmitte).');
        const path = offsetRun(c.segs, c.closed, dt ? dt / 2 / Math.cos(c.tilt * Math.PI / 180) : 0, cfg.leadLength, atEdge);
        if (path.error) { warnings.push(label + ': ' + path.error + ' – nicht bearbeitet.'); continue; }
        for (const id of c.faceIds) curvedFaces.add(id);
        ops.push({ kind: 'slantpath', key: key, toolKind: 'mill', toolDefault: 'slantTool', tool: tool, start: path.start, segs: path.segs,
          edge: c.segs, closed: c.closed, angle: c.tilt, approach: c.up ? 2 : 1, depth: T + cfg.slantExtra, label: label });
      }
    } else if (cSlants.length) {
      warnings.push('Schräge an einer Rundung erkannt (' + cSlants.length + '×) – die Rundungen werden nicht bearbeitet. ' +
        'Zum Fräsen beim Teil „Schräge an Rundungen: 5-Achs fräsen“ einschalten.');
    }
    const cSurf = p.curvedSurfaces || [];
    if (cSurf.length && cfg.curvedSurfaceOn) {
      for (const [i, c] of cSurf.entries()) {
        const key = 'surface-' + i;
        const tool = ovTool(key, cfg.ballTool);
        const label = 'Gewölbte Fläche (' + c.kinds.join(', ') + ') zeilenfräsen';
        const info = cfg.toolInfo && cfg.toolInfo[tool];
        if (info && info.body && info.body !== 'BallEndmill') warnings.push(label + ': ' + tool + ' ist kein Kugelfräser – Bahn ist für einen Kugelfräser berechnet.');
        if (info && info.len && c.depth > info.len + 1e-9) warnings.push(label + ': Tiefe ' + fmt(c.depth) + ' mm, Schneidenlänge ' + tool + ' nur ' + fmt(info.len) + ' mm.');
        let passes = [];
        if (!cfg.mesh) {
          warnings.push(label + ': 3D-Netz des Teils fehlt (OpenCascade) – keine Bahn berechnet.');
        } else {
          const r = surfacePasses(cfg.mesh, c, toolD(tool, cfg.ballToolDia) / 2, T, cfg);
          passes = r.passes;
          if (!passes.length) warnings.push(label + ': keine Bahn gefunden – Fläche ist mit ' + tool + ' nicht erreichbar.');
        }
        ops.push({ kind: 'surface', key: key, toolKind: 'mill', toolDefault: 'ballTool', tool: tool, rects: c.rects,
          x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, depth: c.depth, passes: passes, safe: cfg.surfSafe, label: label });
      }
    } else if (cSurf.length) {
      warnings.push('Gewölbte Fläche erkannt (' + cSurf.map((c) => c.kinds.join('/')).join(', ') + ') – nicht bearbeitet. ' +
        'Zum Zeilenfräsen mit dem Kugelfräser beim Teil „Gewölbte Flächen: zeilenfräsen“ einschalten.');
    }

    // 8) Schräge Kanten über die ganze Dicke (5-Achs)
    for (const [i, w] of p.slantWalls.entries()) {
      if (curvedFaces.has(w.faceId)) continue; // in der Bahn an der Rundung enthalten
      const ll = cfg.leadLength;
      const d = [w.top.b[0] - w.top.a[0], w.top.b[1] - w.top.a[1]];
      const l = Math.hypot(d[0], d[1]) || 1;
      const u = [d[0] / l, d[1] / l];
      // Gerader Schnitt von Kante zu Kante: mit der Säge (Schnittfläche wird zur neuen schrägen Ebene)
      if (cfg.slantCut === 'saw' && (w.sawable || (atEdge(w.top.a) && atEdge(w.top.b)))) {
        const so = cfg.sawOverrun;
        ops.push({ kind: 'blade', key: 'blade-' + i, toolKind: 'saw', toolDefault: 'bladeTool',
          a: [w.top.a[0] - u[0] * so, w.top.a[1] - u[1] * so], b: [w.top.b[0] + u[0] * so, w.top.b[1] + u[1] * so],
          a0: w.top.a, b0: w.top.b, tilt: w.angle, leanOut: w.leanOut, depth: T, extra: cfg.bladeExtra, tool: cfg.bladeTool,
          score: cfg.scoreCut ? { depth: cfg.scoreDepth, out: cfg.scoreOut } : null,
          label: 'Sägeschnitt ' + fmt(w.angle) + '°' + (cfg.scoreCut ? ' vorgeritzt' : '') });
        continue;
      }
      ops.push({ kind: 'slant', key: 'slant-' + i, toolKind: 'mill', toolDefault: 'slantTool',
        a: [w.top.a[0] - u[0] * ll, w.top.a[1] - u[1] * ll], b: [w.top.b[0] + u[0] * ll, w.top.b[1] + u[1] * ll],
        angle: w.angle, approach: w.leanOut ? 2 : 1, depth: T + cfg.slantExtra, tool: cfg.slantTool,
        scrap: [u[1], -u[0]], // Abfallseite (rechts der Bahn)
        label: 'Schräge Kante ' + fmt(w.angle) + '°' });
    }

    // 8b) Taschen und Bohrungen auf schrägen Ebenen (eigene Bearbeitungsebene, z. B. Schnittfläche der Säge)
    for (const [j, sp] of (p.slantPlanes || []).entries()) {
      const plane = { name: 'Slanted_' + (j + 1), o: sp.o, zRot: sp.zRot, xRot: sp.xRot, X: sp.X, Y: sp.Y, n: sp.n };
      const where = 'auf Schräge ' + fmt(Math.round(sp.xRot * 10) / 10) + '°';
      for (const [i, k] of sp.pockets.entries()) {
        const key = 'ppocket-' + j + '-' + i;
        const w = Math.min(k.x1 - k.x0, k.y1 - k.y0, narrowest(k.segs));
        const auto = fittingMill(w, k.depth, cfg.pocketTool);
        const tool = (cfg.toolOverrides && cfg.toolOverrides[key]) || auto;
        const dia = toolD(tool, null);
        const r1 = (v) => fmt(Math.round(v * 10) / 10);
        const label = 'Tasche ' + where + ' ' + r1(k.x1 - k.x0) + '×' + r1(k.y1 - k.y0);
        if (dia && w < dia) warnings.push(label + ' ist schmaler (' + fmt(w) + ') als Fräser ' + tool + ' (Ø' + fmt(dia) + ') – kleineren Fräser wählen.');
        else if (dia && k.minRadius < dia / 2 - 0.01) warnings.push(label + ': Eckenradius R' + fmt(k.minRadius) + ' kleiner als Fräserradius ' + fmt(dia / 2) + ' – Ecken bleiben runder.');
        ops.push({ kind: 'pocket', plane: plane, key: key, toolKind: 'mill', toolDefault: 'pocketTool', pocket: 0, segs: k.segs, islands: k.islands,
          depth: k.depth, tool: auto, label: label });
      }
      const byD = new Map();
      for (const d of sp.drills) {
        const k = fmt(d.d) + '|' + fmt(d.depth);
        if (!byD.has(k)) byD.set(k, []);
        byD.get(k).push(d);
      }
      for (const list of byD.values()) {
        for (const d of list) {
          if (!hasDrill(cfg.drillsVertical, d.d)) warnings.push('Kein Bohrer Ø' + fmt(d.d) + ' für die Bohrung ' + where + ' in der Werkzeugliste – Bohrung trotzdem ausgegeben.');
          ops.push({ kind: 'drill', face: plane.name, plane: plane, pattern: { nX: 1, nY: 1, dX: 0, dY: 0 },
            d: { x: d.x, y: d.y, d: d.d, depth: d.depth, tip: 'P' } });
        }
      }
    }

    // 9) Bohrungen
    const drillOps = [];
    for (const d of p.drills) {
      const vertical = d.face === 'Top';
      const list = vertical ? cfg.drillsVertical : cfg.drillsHorizontal;
      if (!hasDrill(list, d.d)) {
        if (vertical && d.through) {
          const r = d.d / 2;
          ops.push({ kind: 'contour', key: 'round-' + (nRound++), toolKind: 'mill', toolDefault: 'cutoutTool', contour: ++nContour, milling: ++nMill, approach: false,
            start: [d.x + r, d.y],
            segs: [
              { type: 'arc', to: [d.x - r, d.y], c: [d.x, d.y], cw: false },
              { type: 'arc', to: [d.x + r, d.y], c: [d.x, d.y], cw: false },
            ],
            depth: T + cfg.cutoutExtra, tool: cfg.cutoutTool, side: 1, label: 'Rundloch Ø' + fmt(d.d) });
          continue;
        }
        if (vertical && !d.through) {
          // Runde Vertiefung ohne passenden Bohrer → als Kreistasche fräsen
          const key = 'rpocket-' + (nRPocket++);
          const r = d.d / 2;
          ops.push({ kind: 'pocket', key: key, toolKind: 'mill', toolDefault: 'pocketTool', pocket: 0,
            segs: [{ type: 'arc', a: [d.x + r, d.y], b: [d.x + r, d.y], c: [d.x, d.y], r: r, ccw: true, full: true }],
            islands: [], depth: d.depth, tool: cfg.pocketTool, round: true,
            label: 'Rundtasche Ø' + fmt(d.d) + '×' + fmt(d.depth) });
          continue;
        }
        warnings.push('Kein Bohrer Ø' + fmt(d.d) + (vertical ? ' (vertikal)' : ' (horizontal)') + ' in der Werkzeugliste – Bohrung trotzdem ausgegeben.');
      }
      const loc = localDrill(p, d);
      drillOps.push({
        face: d.face, x: loc.x, y: loc.y, d: d.d,
        depth: d.through ? T + cfg.throughExtra : d.depth,
        tip: d.through ? 'L' : 'P',
      });
    }
    const faceOrder = ['Top', 'Left', 'Right', 'Front', 'Back'];
    for (const face of faceOrder) {
      const onFace = drillOps.filter((d) => d.face === face);
      const groups = new Map();
      for (const d of onFace) {
        const key = [fmt(d.d), fmt(d.depth), d.tip].join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(d);
      }
      const patterns = [];
      for (const list of groups.values()) {
        for (const pat of makePatterns(list, cfg.usePatterns)) patterns.push(pat);
      }
      patterns.sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y);
      for (const pat of patterns) ops.push({ kind: 'drill', face: face, pattern: pat, d: pat.p });
    }

    // 10) Schräge Bohrungen (5-Achs). Winkel A = Richtung der Werkzeugachse in XY zu X, B = Neigung zu Z.
    for (const sd of p.slantDrills) {
      const v = [-sd.dir[0], -sd.dir[1], -sd.dir[2]];
      const angleB = Math.acos(Math.max(-1, Math.min(1, v[2]))) * 180 / Math.PI;
      let angleA = Math.abs(v[0]) + Math.abs(v[1]) < 1e-9 ? 0 : Math.atan2(v[1], v[0]) * 180 / Math.PI;
      if (angleA < 0) angleA += 360;
      ops.push({ kind: 'sdrill', entry: sd.entry, angleA: angleA, angleB: angleB, d: sd.d,
        depth: sd.through ? sd.depth + cfg.throughExtra : sd.depth, tip: sd.through ? 'L' : 'P' });
    }

    // Reihenfolge: Gruppen (eine Fräsung, ein Falz mit allen Bahnen, gleiche Bohrungen) verschieben
    for (const op of ops) {
      if (op.key) op.group = op.key;
      else if (op.kind === 'drill') op.group = 'drill:' + op.face + '|' + fmt(op.d.d) + '|' + fmt(op.d.depth) + '|' + op.d.tip;
      else if (op.kind === 'sdrill') op.group = 'sdrill:' + fmt(op.d) + '|' + fmt(op.depth) + '|' + fmt(op.angleA) + '|' + fmt(op.angleB);
    }
    const defaultGroups = [];
    for (const op of ops) if (!defaultGroups.includes(op.group)) defaultGroups.push(op.group);
    let order = defaultGroups.slice();
    if (cfg.orderRule && cfg.orderRule.on) {
      const seq = ruleSequence(cfg.orderRule);
      const catOf = new Map(ops.map((op) => [op.group, category(op)]));
      order = order.map((g, i) => ({ g: g, i: i, r: seq.indexOf(catOf.get(g)) }))
        .sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.g);
    }
    const ruleGroups = order.slice();
    if (cfg.order && cfg.order.length) {
      const wanted = cfg.order.filter((g) => defaultGroups.includes(g));
      order = wanted.concat(order.filter((g) => !wanted.includes(g)));
    }
    // Bearbeitungen auf schrägen Ebenen erst nach dem Sägeschnitt, der die Fläche erzeugt (sonst Anfahrt ins Material)
    const catOfG = new Map(ops.map((op) => [op.group, category(op)]));
    const lastBlade = order.reduce((m, g, i) => (catOfG.get(g) === 'blade' ? i : m), -1);
    if (lastBlade >= 0) {
      const early = order.filter((g, i) => i < lastBlade && catOfG.get(g) === 'slantPlane');
      if (early.length) {
        order = order.filter((g) => !early.includes(g));
        const at = order.reduce((m, g, i) => (catOfG.get(g) === 'blade' ? i : m), -1);
        order.splice(at + 1, 0, ...early);
        warnings.push('Bearbeitungen auf der schrägen Ebene wurden hinter den Sägeschnitt gesetzt – die Fläche entsteht erst durch den Schnitt.');
      }
    }
    const rank = new Map(order.map((g, i) => [g, i]));
    const sorted = ops.map((op, i) => ({ op: op, i: i })).sort((a, b) => rank.get(a.op.group) - rank.get(b.op.group) || a.i - b.i)
      .map((x) => x.op);
    ops.length = 0;
    ops.push(...sorted);
    // Namen in Programmreihenfolge durchnummerieren
    let nc = 0;
    let np = 0;
    for (const op of ops) {
      if (op.kind === 'contour') { op.contour = ++nc; op.milling = nc; }
      if (op.kind === 'pocket') op.pocket = ++np;
    }

    // Werkzeug, Tiefe (durchgehende Fräsungen) und Zustellungen je Bearbeitung
    const throughKey = (k) => k === 'format' || /^(notch|cutout|round)-/.test(k);
    const depthWarned = new Set();
    for (const op of ops) {
      if (!op.key) continue;
      if (cfg.toolOverrides && cfg.toolOverrides[op.key]) op.tool = cfg.toolOverrides[op.key];
      op.depthAdjustable = op.kind === 'contour' && throughKey(op.key);
      const dz = cfg.depthOverrides && cfg.depthOverrides[op.key];
      if (op.depthAdjustable && dz > 0) {
        op.depth = dz;
        if (dz < T - 1e-9 && !depthWarned.has(op.key)) {
          depthWarned.add(op.key);
          warnings.push(op.label + ': Tiefe ' + fmt(dz) + ' mm ist kleiner als die Plattendicke ' + fmt(T) + ' mm – es wird nicht durchgefräst.');
        }
      }
      if (/^round-/.test(op.key)) {
        const dt = toolD(op.tool, null);
        const dh = op.segs[0] ? 2 * Math.hypot(op.start[0] - op.segs[0].c[0], op.start[1] - op.segs[0].c[1]) : 0;
        if (dt && dh && dt >= dh - 1e-6) warnings.push(op.label + ': Fräser ' + op.tool + ' (Ø' + fmt(dt) + ') ist nicht kleiner als das Loch – kleineren Fräser wählen.');
      }
      if (op.kind === 'slot') {
        const bt = cfg.toolInfo && cfg.toolInfo[op.tool] && cfg.toolInfo[op.tool].blade;
        op.single = false;
        if (bt) {
          if (Math.abs(op.width - bt) < 0.05) op.single = true;
          else if (op.width < bt) warnings.push(op.label + ': Nut schmaler als das Sägeblatt ' + op.tool + ' (' + fmt(bt) + ' mm) – andere Säge wählen.');
          else if (op.width > 2 * bt + 1e-6) warnings.push(op.label + ': breiter als zwei Schnitte mit ' + op.tool + ' (2 × ' + fmt(bt) + ' mm) – in der Mitte bleibt ein Steg stehen.');
        }
      }
      if (op.round) {
        const info = cfg.toolInfo && cfg.toolInfo[op.tool];
        const dRound = op.segs[0].r * 2;
        if (info && info.d && info.d >= dRound - 1e-6) {
          warnings.push(op.label + ': Fräser ' + op.tool + ' (Ø' + fmt(info.d) + ') passt nicht hinein – kleineren Fräser wählen.');
        }
      }
      if (op.kind === 'contour' && /^(cutout|round)-/.test(op.key)) {
        // Haltestege: Innenstück bleibt hängen (klein oder alle Durchbrüche)
        let lo = [Infinity, Infinity];
        let hi = [-Infinity, -Infinity];
        let prev = op.start;
        for (const q of op.segs) {
          for (const c of q.type === 'arc' ? [q.to, [q.c[0] + Math.hypot(prev[0] - q.c[0], prev[1] - q.c[1]), q.c[1]], [q.c[0] - Math.hypot(prev[0] - q.c[0], prev[1] - q.c[1]), q.c[1]]] : [q.to]) {
            lo = [Math.min(lo[0], c[0]), Math.min(lo[1], c[1])];
            hi = [Math.max(hi[0], c[0]), Math.max(hi[1], c[1])];
          }
          prev = q.to;
        }
        const size = Math.max(hi[0] - lo[0], hi[1] - lo[1]);
        op.tabs = cfg.tabsMode === 'all' || (cfg.tabsMode === 'small' && size <= cfg.tabsMaxSize);
        if (op.tabs && !/Haltestege/.test(op.label)) op.label += ' mit Haltestegen';
        op.helix = !!cfg.helixOn;
      }
      if (op.kind === 'contour' || op.kind === 'pocket') {
        const glob = op.kind === 'pocket' && cfg.pocketStepDown > 0 ? cfg.pocketStepDown : cfg.stepDown;
        const st = cfg.stepOverrides && cfg.stepOverrides[op.key] !== undefined ? cfg.stepOverrides[op.key] : glob;
        op.step = st > 0 && op.depth > st + 1e-9 ? st : 0;
        const info = cfg.toolInfo && cfg.toolInfo[op.tool];
        const pass = op.step || op.depth;
        if (info && info.len && pass > info.len + 1e-9) {
          warnings.push(op.label + ': ' + fmt(pass) + ' mm je Durchgang, Schneidenlänge ' + op.tool + ' nur ' + fmt(info.len) + ' mm – Zustellung verringern.');
        }
        const rinfo = op.rough && cfg.toolInfo && cfg.toolInfo[op.rough.tool];
        if (rinfo && rinfo.len && pass > rinfo.len + 1e-9 && op.rough.tool !== op.tool) {
          warnings.push(op.label + ': ' + fmt(pass) + ' mm je Durchgang, Schneidenlänge Vorfräser ' + op.rough.tool + ' nur ' + fmt(rinfo.len) + ' mm – Zustellung verringern.');
        }
      }
    }

    for (const b of p.bottom) warnings.push(b.text + ' – nicht von oben bearbeitbar (Platte wenden / 2. Programm).');
    return { ops: ops, warnings: warnings, groups: order, defaultGroups: ruleGroups };
  }

  // Bahn einer Schräge an Rundungen (Material links, Abfall rechts) um off zur Abfallseite versetzen.
  // Gerade → parallel verschoben, Bogen → Radius ± off; Außenecken mit Bogen um die Ecke, Innenecken (Geraden) geschnitten.
  // Offene Bahnen laufen an der Plattenkante um ll tangential aus. Ergebnis { start, segs } (Polylinie) oder { error }.
  function offsetRun(segs, closed, off, ll, atEdge) {
    const unit2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const tan = (q, atEnd) => {
      if (q.type === 'line') return unit2([q.b[0] - q.a[0], q.b[1] - q.a[1]]);
      const r = unit2([(atEnd ? q.b : q.a)[0] - q.c[0], (atEnd ? q.b : q.a)[1] - q.c[1]]);
      return q.ccw ? [-r[1], r[0]] : [r[1], -r[0]];
    };
    const out = [];
    for (const q of segs) {
      if (q.type === 'line') {
        const t = tan(q, false);
        const n = [t[1], -t[0]];
        out.push({ type: 'line', a: [q.a[0] + n[0] * off, q.a[1] + n[1] * off], b: [q.b[0] + n[0] * off, q.b[1] + n[1] * off] });
      } else {
        const r = Math.hypot(q.a[0] - q.c[0], q.a[1] - q.c[1]);
        const r2 = q.ccw ? r + off : r - off; // rechts der Bahn: außen bei Linksbogen, innen bei Rechtsbogen
        if (r2 < 0.05) return { error: 'Innenrundung R' + fmt(r) + ' ist enger als der Fräser' };
        const k = r2 / r;
        const sc = (p) => [q.c[0] + (p[0] - q.c[0]) * k, q.c[1] + (p[1] - q.c[1]) * k];
        out.push({ type: 'arc', a: sc(q.a), b: sc(q.b), c: q.c, ccw: q.ccw, full: !!q.full });
      }
    }
    const res = [];
    const n = out.length;
    for (let i = 0; i < n; i++) {
      res.push(out[i]);
      if (i === n - 1 && !closed) break;
      const A = out[i];
      const B = out[(i + 1) % n];
      if (Math.hypot(A.b[0] - B.a[0], A.b[1] - B.a[1]) < 0.01) continue; // tangential
      const t1 = tan(segs[i], true);
      const t2 = tan(segs[(i + 1) % n], false);
      const cr = t1[0] * t2[1] - t1[1] * t2[0];
      if (cr > 1e-9) {
        res.push({ type: 'arc', a: A.b, b: B.a, c: segs[i].b, ccw: true }); // Außenecke: um die Ecke herum
      } else if (cr < -1e-9 && A.type === 'line' && B.type === 'line') {
        // Innenecke: beide Geraden bis zum Schnittpunkt
        const d1 = [A.b[0] - A.a[0], A.b[1] - A.a[1]];
        const d2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]];
        const den = d1[0] * d2[1] - d1[1] * d2[0];
        const s1 = ((B.a[0] - A.a[0]) * d2[1] - (B.a[1] - A.a[1]) * d2[0]) / den;
        const s2 = ((B.a[0] - A.a[0]) * d1[1] - (B.a[1] - A.a[1]) * d1[0]) / den;
        if (!(s1 > 0 && s1 <= 1 + 1e-9 && s2 >= -1e-9 && s2 < 1)) return { error: 'Innenecke zu eng für den Fräser' };
        const X = [A.a[0] + d1[0] * s1, A.a[1] + d1[1] * s1];
        A.b = X;
        B.a = X;
      } else {
        return { error: 'Innenecke an einer Rundung – Bahn nicht eindeutig' };
      }
    }
    const poly = (q) => (q.type === 'line' ? { type: 'line', to: q.b } : { type: 'arc', to: q.b, c: q.c, cw: !q.ccw });
    if (closed) {
      // Start in der Mitte der längsten Geraden; reiner Kreis: zwei Halbkreise
      let k = -1;
      let best = -1;
      res.forEach((q, i) => {
        if (q.type !== 'line') return;
        const l = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]);
        if (l > best) { best = l; k = i; }
      });
      if (k < 0) {
        if (res.length === 1 && res[0].full) {
          const q = res[0];
          const opp = [2 * q.c[0] - q.a[0], 2 * q.c[1] - q.a[1]];
          return { start: q.a, segs: [{ type: 'arc', to: opp, c: q.c, cw: !q.ccw }, { type: 'arc', to: q.a, c: q.c, cw: !q.ccw }] };
        }
        return { start: res[0].a, segs: res.map(poly) };
      }
      const q = res[k];
      const m = [(q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2];
      const segsOut = [{ type: 'line', to: q.b }];
      for (let j = 1; j < res.length; j++) segsOut.push(poly(res[(k + j) % res.length]));
      segsOut.push({ type: 'line', to: m });
      return { start: m, segs: segsOut };
    }
    const segsOut = res.map(poly);
    let start = res[0].a;
    if (atEdge(segs[0].a)) {
      const t = tan(segs[0], false);
      segsOut.unshift({ type: 'line', to: start });
      start = [start[0] - t[0] * ll, start[1] - t[1] * ll];
    }
    if (atEdge(segs[segs.length - 1].b)) {
      const t = tan(segs[segs.length - 1], true);
      const e = res[res.length - 1].b;
      segsOut.push({ type: 'line', to: [e[0] + t[0] * ll, e[1] + t[1] * ll] });
    }
    return { start: start, segs: segsOut };
  }

  // Zeilenfräsen einer gewölbten Fläche (Bahnen je Netz und Einstellung zwischengespeichert)
  const surfCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function surfacePasses(mesh, c, R, T, cfg) {
    const SP = typeof SurfacePath !== 'undefined' ? SurfacePath : require('./surface.js');
    const key = JSON.stringify([c.rects, c.depth, R, cfg.surfStepover, cfg.surfRes, cfg.surfLayer, cfg.surfTol]);
    let m = surfCache && surfCache.get(mesh);
    if (!m) { m = new Map(); if (surfCache) surfCache.set(mesh, m); }
    if (!m.has(key)) {
      m.set(key, SP.compute(mesh, { rects: c.rects, zmin: T - c.depth },
        { R: R, stepover: cfg.surfStepover, res: cfg.surfRes, top: T, layer: cfg.surfLayer, tol: cfg.surfTol }));
    }
    return m.get(key);
  }

  function toPolySeg(s) {
    return s.type === 'arc'
      ? { type: 'arc', to: s.b, c: s.c, cw: !s.ccw }
      : { type: 'line', to: s.b };
  }

  // Geschlossene Kontur als Polylinie, Start in der Mitte der längsten Geraden (wie im Beispiel)
  function wholeContour(loop) {
    let k = -1;
    let best = -1;
    loop.forEach((q, i) => {
      if (q.type !== 'line') return;
      const l = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]);
      if (l > best) { best = l; k = i; }
    });
    if (k < 0) {
      if (loop.length === 1 && loop[0].full) {
        const q = loop[0];
        const opp = [2 * q.c[0] - q.a[0], 2 * q.c[1] - q.a[1]];
        return { start: q.a, segs: [{ type: 'arc', to: opp, c: q.c, cw: !q.ccw }, { type: 'arc', to: q.a, c: q.c, cw: !q.ccw }] };
      }
      return { start: loop[0].a, segs: loop.map(toPolySeg) };
    }
    const q = loop[k];
    const mid = [(q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2];
    const segs = [{ type: 'line', to: q.b }];
    for (let j = 1; j < loop.length; j++) segs.push(toPolySeg(loop[(k + j) % loop.length]));
    segs.push({ type: 'line', to: mid });
    return { start: mid, segs: segs };
  }

  // Liegt ein Liniensegment auf einer Seite des Rechtecks L×B?
  function onRectSide(s, L, W) {
    if (s.type !== 'line') return null;
    const t = 0.01;
    const same = (i, v) => Math.abs(s.a[i] - v) < t && Math.abs(s.b[i] - v) < t;
    if (same(1, 0)) return [1, 0];
    if (same(0, L)) return [0, 1];
    if (same(1, W)) return [-1, 0];
    if (same(0, 0)) return [0, -1];
    return null;
  }

  // Offene Fräsbahnen für alle Abschnitte der Außenkontur, die nicht auf dem Rechteck liegen.
  // Fahrtrichtung im Uhrzeigersinn, Abfall links (Korrektur 1) – wie Milling_2 im Beispiel.
  function notchPaths(p, cfg) {
    if (p.outlineIsRect) return [];
    const segs = p.outline;
    const isB = segs.map((s) => !!onRectSide(s, p.L, p.W) || !!s.inclined);
    if (!isB.some(Boolean)) {
      // Keine einzige Kante auf dem Rechteck: komplette Kontur im Uhrzeigersinn fräsen
      const rev = segs.slice().reverse().map(revSeg);
      return [{ start: rev[0].a, segs: rev.map(toPolySeg) }];
    }
    const n = segs.length;
    const k0 = isB.indexOf(true);
    const paths = [];
    let i = 1;
    while (i <= n) {
      const idx = (k0 + i) % n;
      if (isB[idx]) { i++; continue; }
      const chain = [];
      while (i <= n && !isB[(k0 + i) % n]) { chain.push(segs[(k0 + i) % n]); i++; }
      const prev = segs[(k0 + (i - chain.length) - 1 + n) % n];
      const next = segs[(k0 + i) % n];
      const A = chain[0].a;
      const B = chain[chain.length - 1].b;
      const uPrev = lineDir(prev);
      const uNext = lineDir(next);
      const ll = cfg.leadLength;
      const start = [B[0] + uNext[0] * ll, B[1] + uNext[1] * ll];
      const out = [{ type: 'line', to: B }];
      for (const s of chain.slice().reverse()) out.push(toPolySeg(revSeg(s)));
      out.push({ type: 'line', to: [A[0] - uPrev[0] * ll, A[1] - uPrev[1] * ll] });
      paths.push({ start: start, segs: out });
    }
    return paths;
  }

  function lineDir(s) {
    const d = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
    const l = Math.hypot(d[0], d[1]) || 1;
    return [d[0] / l, d[1] / l];
  }

  function revSeg(s) {
    return s.type === 'arc'
      ? { type: 'arc', a: s.b, b: s.a, c: s.c, r: s.r, ccw: !s.ccw, full: s.full }
      : { type: 'line', a: s.b, b: s.a };
  }

  // ---------------------------------------------------------------- Ausgabe

  // Tasche mit kreisrunder Außenkontur (Kreistasche aus Bohrung oder runder Taschenboden)
  function isRoundPocket(op) {
    return op.kind === 'pocket' && op.segs.length === 1 && op.segs[0].type === 'arc' && !!op.segs[0].full;
  }

  function writePoly(L, name, segs) {
    if (segs.length === 1 && segs[0].type === 'arc' && segs[0].full) {
      const q = segs[0];
      L.push('CreateCircleCenterRadius("' + name + '", ' + pt(q.c) + ', ' + fmt(q.r) + ', ' + (q.ccw ? 'false' : 'true') + ');');
      return;
    }
    L.push('CreatePolyline("' + name + '", ' + pt(segs[0].a) + ');');
    for (const q of segs) {
      if (q.type === 'line') L.push('AddSegmentToPolyline(' + pt(q.b) + ');');
      else L.push('AddArc2PointCenterToPolyline(' + pt(q.b) + ', ' + pt(q.c) + ', ' + (q.ccw ? 'false' : 'true') + ');');
    }
  }

  function write(p, cfgIn, override) {
    const cfg = Object.assign({}, DEFAULTS, cfgIn || {});
    if (override && override.tools) cfg.toolOverrides = override.tools;
    if (override && override.steps) cfg.stepOverrides = override.steps;
    if (override && override.order) cfg.order = override.order;
    if (override && override.depths) cfg.depthOverrides = override.depths;
    if (override && typeof override.twoStep === 'boolean') cfg.formatTwoStep = override.twoStep; // je Teil: normal / zweistufig
    const cv = override && override.curved; // je Teil: gekrümmte Flächen bearbeiten
    if (cv && typeof cv.slant === 'boolean') cfg.curvedSlantOn = cv.slant;
    if (cv && typeof cv.surface === 'boolean') cfg.curvedSurfaceOn = cv.surface;
    if (override && override.mesh) cfg.mesh = override.mesh;
    const { ops, warnings, groups, defaultGroups } = plan(p, cfg);
    const field = (override && override.field) || autoField(p, cfg);
    const L = [];
    const blank = () => L.push('');
    L.push('SetMachiningParameters("' + field + '", 1, 10, 196608, false);'); blank();
    // Programmkopf: Kommentar/Beschreibung (nur ASCII, ohne Anführungszeichen), Optimierung, Tisch einrichten
    const ascii = (t) => String(t).replace(/[äöüÄÖÜß]/g, (c) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' }[c]))
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '');
    if (cfg.commentOn) {
      L.push('SetComment("' + ascii('STEP2XCS: ' + (p.name || 'Teil')) + '");');
      L.push('SetDescription("' + ascii(fmt(p.L) + ' x ' + fmt(p.W) + ' x ' + fmt(p.T) + ' mm, ' + ops.length + ' Bearbeitungen') + '");');
    }
    if (cfg.optimizeOn) L.push('SetOptimization(true);');
    if (cfg.autoSetupOn) L.push('SetAutoSetup(true);');
    if (cfg.commentOn || cfg.optimizeOn || cfg.autoSetupOn) blank();
    // Werkstück: Quader oder echte Außenkontur (nur wenn die Kontur vom Rechteck abweicht)
    if (cfg.workpieceShape === 'contour' && !p.outlineIsRect && p.outline && p.outline.length) {
      writePoly(L, 'Workpiece_Contour', p.outline);
      L.push('CreateFinishedWorkpieceFromExtrusion("Workpiece", ' + fmt(p.T) + ');'); blank();
    } else {
      L.push('CreateFinishedWorkpieceBox("Workpiece", ' + fmt(p.L) + ', ' + fmt(p.W) + ', ' + fmt(p.T) + ');'); blank();
    }
    const o = fmt(cfg.rawOversize);
    L.push('CreateRawWorkpiece("Workpiece", ' + [o, o, o, o].join(', ') + ', 0, 0);'); blank();
    L.push('SetWorkpieceSetupPosition(' + o + ', ' + o + ', 0, 0);'); blank();
    // Sauger-Vorschlag: Konsolen und Drehsauger (Koordinaten zum Werkstück-Nullpunkt)
    const suction = cfg.suctionOn ? planSuction(p, cfg) : { bars: [], warnings: [] };
    warnings.push(...suction.warnings);
    if (suction.bars.length) {
      suction.bars.forEach((b, i) => {
        L.push('SetBarPosition(' + (i + 1) + ', ' + fmt(b.x) + ');');
        b.cups.forEach((c, j) => L.push('SetSuctionCupPosition(' + (j + 1) + ', ' + fmt(c.y) + ', ' + fmt(c.angle) + ', "' + c.code + '");'));
      });
      blank();
    }

    let nSlot = 0;
    let nSeg = 0;
    const nDrill = { V: 0, H: 0 };
    const counts = { chamfer: 0, slant: 0, sdrill: 0, blade: 0, pdrill: 0, surface: 0 };
    let plane = 'Top';
    const madePlanes = new Set();
    let multiStep = false;
    for (const op of ops) {
      // Fräsungen und schräge Bohrungen beziehen sich auf die Oberseite, Kantentaschen auf ihre Kante,
      // Bearbeitungen auf schrägen Ebenen auf eine eigene Ebene (einmal angelegt)
      if (op.plane && !madePlanes.has(op.plane.name)) {
        const q = op.plane;
        if (plane !== 'Top') { L.push('SelectWorkplane("Top");'); blank(); plane = 'Top'; }
        L.push('CreateWorkplane("' + q.name + '", ' + fmt(q.o[0]) + ', ' + fmt(q.o[1]) + ', ' + fmt(q.o[2]) + ', ' + fmt(q.zRot) + ', ' + fmt(q.xRot) + ');');
        blank();
        madePlanes.add(q.name);
      }
      if (op.kind !== 'drill' || op.plane) {
        const want = op.plane ? op.plane.name : (op.kind === 'pocket' && op.face) || 'Top';
        if (plane !== want) {
          L.push('SelectWorkplane("' + (FACE_NAMES[want] || want) + '");');
          blank();
          plane = want;
        }
      }
      if (op.kind === 'contour') {
        // Haltestege in der Mitte der längsten Elemente (Attribut gilt für das zuletzt angefügte Element)
        const tabAt = new Set();
        if (op.tabs) {
          let prev = op.start;
          const lens = op.segs.map((q, i) => {
            let l;
            if (q.type === 'arc') {
              const r = Math.hypot(prev[0] - q.c[0], prev[1] - q.c[1]);
              let sw = Math.atan2(q.to[1] - q.c[1], q.to[0] - q.c[0]) - Math.atan2(prev[1] - q.c[1], prev[0] - q.c[0]);
              if (q.cw) { while (sw >= 0) sw -= Math.PI * 2; } else { while (sw <= 0) sw += Math.PI * 2; }
              l = Math.abs(sw) * r;
            } else l = Math.hypot(q.to[0] - prev[0], q.to[1] - prev[1]);
            prev = q.to;
            return { i: i, l: l };
          });
          lens.sort((a, b) => b.l - a.l).slice(0, Math.max(1, cfg.tabsCount)).forEach((x) => tabAt.add(x.i));
        }
        L.push('CreatePolyline("Contour_' + op.contour + '", ' + pt(op.start) + ');');
        op.segs.forEach((s, i) => {
          if (s.type === 'line') L.push('AddSegmentToPolyline(' + pt(s.to) + ');');
          else L.push('AddArc2PointCenterToPolyline(' + pt(s.to) + ', ' + pt(s.c) + ', ' + (s.cw ? 'true' : 'false') + ');');
          if (tabAt.has(i)) L.push('SetParametricAttribute2("TAB", ' + fmt(cfg.tabLength) + ', ' + fmt(cfg.tabHeight) + ', 0.5);');
        });
        blank();
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        if (op.approach) {
          L.push('SetApproachStrategy(false, true, 2);');
          L.push('SetRetractStrategy(false, true, 2, 0);');
        }
        L.push('SetPneumaticHoodPosition(1);');
        if (op.rough) {
          // Vorfräsen: Werkzeug 1 mit Aufmaß (overMaterial), gleiche Geometrie
          if (op.step) L.push('CreateUnidirectionalMillingStrategy(true, ' + fmt(op.step) + ', ' + fmt(cfg.finishDepth) + ', 1, false);');
          L.push('CreateRoughFinish("Milling_' + op.milling + '_Vor", ' + fmt(op.depth) + ', "", TypeOfProcess.GeneralRouting, "' +
            op.rough.tool + '", "-1", ' + op.side + ', "-1", "-1", "-1", ' + fmt(op.rough.allowance) + ');');
          blank();
          L.push('ResetApproachStrategy();');
          L.push('ResetRetractStrategy();');
          if (op.approach) {
            L.push('SetApproachStrategy(false, true, 2);');
            L.push('SetRetractStrategy(false, true, 2, 0);');
          }
          L.push('SetPneumaticHoodPosition(1);');
        }
        if (op.helix) {
          // spiralförmig eintauchen: Zustellung je Umlauf, letzte Zustellung (Form wie im Handbuch-Beispiel)
          const hs = op.step || cfg.helixStep;
          L.push('CreateHelicMillingStrategy(' + fmt(hs) + ', ' + fmt(cfg.finishDepth) + ', ' + (cfg.finishDepth > 0 ? 'true' : 'false') + ');');
        } else if (op.step) L.push('CreateUnidirectionalMillingStrategy(true, ' + fmt(op.step) + ', ' + fmt(cfg.finishDepth) + ', 1, false);');
        L.push('CreateRoughFinish("Milling_' + op.milling + '", ' + fmt(op.depth) + ', "", TypeOfProcess.GeneralRouting, "' +
          op.tool + '", "-1", ' + op.side + ', "-1", "-1", "-1");');
        blank();
      } else if (op.kind === 'pocket') {
        const names = op.islands.map((isl, j) => 'Island_' + op.pocket + '_' + (j + 1));
        op.islands.forEach((isl, j) => writePoly(L, names[j], isl));
        // Runde Taschen: Kreis im Uhrzeigersinn anlegen
        writePoly(L, 'Pocket_' + op.pocket, isRoundPocket(op) ? [Object.assign({}, op.segs[0], { ccw: false })] : op.segs);
        blank();
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('SetPneumaticHoodPosition(1);');
        if (isRoundPocket(op)) {
          // Runde Taschen immer im Uhrzeigersinn ausräumen (Drehrichtung 0 = Uhrzeigersinn)
          L.push('CreateContourParallelStrategy(true, 0' + (op.step ? ', true, ' + fmt(op.step) + ', ' + fmt(cfg.finishDepth) : '') + ');');
        } else if (op.step) {
          L.push('CreateContourParallelStrategy(true, 1, true, ' + fmt(op.step) + ', ' + fmt(cfg.finishDepth) + ');');
        }
        L.push('CreateContourPocket("Pocketing_' + op.pocket + '", ' + fmt(op.depth) + ', "", TypeOfProcess.ConcentricalPocket, "' +
          op.tool + '", "-1", -1, -1, -1, ' + fmt(cfg.pocketOverlap) + ', false' + names.map((n) => ', "' + n + '"').join('') + ');');
        blank();
      } else if (op.kind === 'chamfer') {
        const n = ++counts.chamfer;
        if (op.segs) {
          L.push('CreatePolyline("ChamferPath_' + n + '", ' + pt(op.start) + ');');
          for (const q of op.segs) {
            if (q.type === 'line') L.push('AddSegmentToPolyline(' + pt(q.to) + ');');
            else L.push('AddArc2PointCenterToPolyline(' + pt(q.to) + ', ' + pt(q.c) + ', ' + (q.cw ? 'true' : 'false') + ');');
          }
        } else {
          L.push('CreateSegment("ChamferSegment_' + n + '", ' + pt(op.a) + ', ' + pt(op.b) + ');');
        }
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('CreateChamfer("Chamfer_' + n + '", ' + fmt(op.width) + ', ' + fmt(op.height) + ', 0, ' + op.toolPos +
          ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", -1, -1, -1, 0);');
        blank();
      } else if (op.kind === 'slant') {
        // CreateSlantedRoughFinish fräst auf Werkzeugmitte: Bahn um r / cos(Neigung) zur Abfallseite versetzen,
        // damit die Werkzeugflanke auf der schrägen Fläche liegt
        const n = ++counts.slant;
        const ti = cfg.toolInfo && cfg.toolInfo[op.tool];
        const off = ti && ti.d ? (ti.d / 2) / Math.cos(op.angle * Math.PI / 180) : 0;
        if (!off) warnings.push(op.label + ': Durchmesser von ' + op.tool + ' unbekannt – Bahn liegt auf der Kante (Werkzeugmitte).');
        const sh = (q) => [q[0] + op.scrap[0] * off, q[1] + op.scrap[1] * off];
        L.push('CreateSegment("SlantSegment_' + n + '", ' + pt(sh(op.a)) + ', ' + pt(sh(op.b)) + ');');
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('CreateSlantedRoughFinish("SlantedMilling_' + n + '", 0, ' + fmt(op.angle) + ', ' + op.approach + ', ' + fmt(op.depth) +
          ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", -1, -1, -1, 0);');
        blank();
      } else if (op.kind === 'slantpath') {
        // Schräge an Rundungen: Kontur (schon um r / cos(Neigung) versetzt), Werkzeug quer zur Bahn geneigt (5-Achs)
        const n = ++counts.slant;
        L.push('CreatePolyline("SlantPath_' + n + '", ' + pt(op.start) + ');');
        for (const q of op.segs) {
          if (q.type === 'line') L.push('AddSegmentToPolyline(' + pt(q.to) + ');');
          else L.push('AddArc2PointCenterToPolyline(' + pt(q.to) + ', ' + pt(q.c) + ', ' + (q.cw ? 'true' : 'false') + ');');
        }
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('CreateSlantedRoughFinish("SlantedMilling_' + n + '", 0, ' + fmt(op.angle) + ', ' + op.approach + ', ' + fmt(op.depth) +
          ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", -1, -1, -1, 0);');
        blank();
      } else if (op.kind === 'surface') {
        // Gewölbte Fläche: Bereich als Geometrie, Fräsung ohne Strategie, dazu die berechnete Bahn (explizite Werkzeugbahn,
        // Z relativ zur Oberseite, Werkzeugspitze). Zwischen den Zeilen über die Oberseite abheben.
        const n = ++counts.surface;
        if (!op.passes.length) continue;
        L.push('CreatePolyline("Surface_Area_' + n + '", ' + fmt(op.x0) + ', ' + fmt(op.y0) + ');');
        L.push('AddSegmentToPolyline(' + fmt(op.x1) + ', ' + fmt(op.y0) + ');');
        L.push('AddSegmentToPolyline(' + fmt(op.x1) + ', ' + fmt(op.y1) + ');');
        L.push('AddSegmentToPolyline(' + fmt(op.x0) + ', ' + fmt(op.y1) + ');');
        L.push('AddSegmentToPolyline(' + fmt(op.x0) + ', ' + fmt(op.y0) + ');');
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('CreateRoughFinish("Surface_' + n + '", ' + fmt(op.depth) + ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", 0, "-1", "-1", "-1");');
        const z = (v) => fmt(v - p.T);
        const up = fmt(op.safe);
        const first = op.passes[0][0];
        L.push('CreateToolpath("Surface_Path_' + n + '", ' + pt(first) + ', ' + up + ');');
        op.passes.forEach((ps, k) => {
          if (k) L.push('AddSegmentToToolpath(' + pt(ps[0]) + ', ' + up + ');');
          for (const q of ps) L.push('AddSegmentToToolpath(' + pt(q) + ', ' + z(q[2]) + ');');
          L.push('AddSegmentToToolpath(' + pt(ps[ps.length - 1]) + ', ' + up + ');');
        });
        blank();
      } else if (op.kind === 'blade') {
        // Sägeschnitt über die ganze Dicke, geneigt. Material links der Schnittrichtung, Säge rechts (Korrektur 2).
        // Winkel zur Senkrechten: 90 = senkrecht; < 90 Platte unten breiter (Schräge zeigt nach oben)
        const n = ++counts.blade;
        const ang = op.leanOut ? 90 - op.tilt : 90 + op.tilt;
        L.push('CreateSegment("Saegeschnitt_Linie_' + n + '", ' + pt(op.a) + ', ' + pt(op.b) + ');');
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        // Vorritzen: erster Schnitt in Ritztiefe, Rückweg auf volle Tiefe
        if (op.score) L.push('CreateSectioningMillingStrategy(' + fmt(op.score.depth) + ', ' + fmt(op.score.out) + ', 0);');
        L.push('CreateBladeCut("Saegeschnitt_' + n + '", "Saegeschnitt ' + fmt(op.tilt) + ' Grad", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", ' + fmt(ang) +
          ', 2, -1, -1, -1, 0, true, true, 0, ' + fmt(op.extra) + ');');
        blank();
      } else if (op.kind === 'sdrill') {
        const e = op.entry;
        L.push('CreateSlantedDrill("Drill_Slanted_' + (++counts.sdrill) + '", ' + fmt(e[0]) + ', ' + fmt(e[1]) + ', ' + fmt(e[2]) + ', ' +
          fmt(op.angleA) + ', ' + fmt(op.angleB) + ', ' + fmt(op.depth) + ', ' + fmt(op.d) +
          ', "", TypeOfProcess.Drilling, "-1", "-1", 1, -1, -1, "' + op.tip + '");');
        blank();
      } else if (op.kind === 'slot') {
        L.push('CreateSegment("SlotSegment_' + (++nSeg) + '", ' + pt(op.a) + ', ' + pt(op.b) + ');');
        L.push('SetMachiningDirection(true);');
        L.push('CreateSlot("Slot_' + (++nSlot) + '", ' + fmt(op.depth) + ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", 1,-1,-1,-1,0);');
        blank();
        if (op.single) continue; // Nut so breit wie das Blatt: ein Schnitt genügt
        L.push('SetMachiningDirection(false);');
        L.push('CreateSlot("Slot_' + (++nSlot) + '", ' + fmt(op.depth) + ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", 2,-1,-1,-1,' + fmt(-op.width) + ');');
        blank();
      } else if (op.kind === 'drill') {
        if (op.face !== plane) {
          L.push('SelectWorkplane("' + (FACE_NAMES[op.face] || op.face) + '");');
          blank();
          plane = op.face;
        }
        const pat = op.pattern;
        const d = op.d;
        const usePat = pat.nX > 1 || pat.nY > 1;
        if (usePat) L.push('CreatePattern(' + pat.nY + ', ' + pat.nX + ', ' + fmt(pat.dY) + ', ' + fmt(pat.dX) + ', 0, 90);');
        // tiefe Bohrung in Stufen mit Rückzug zum Spanen (isStepDepth, Anzahl, Tiefe je Stufe, Rückzug auf Sicherheitshöhe)
        if (cfg.drillStepFrom > 0 && d.depth > cfg.drillStepFrom + 1e-9 && cfg.drillStep > 0) {
          const n = Math.ceil(d.depth / cfg.drillStep - 1e-9);
          L.push('CreateMultiStepDrillingStrategy(true, ' + n + ', ' + fmt(d.depth / n) + ', true);');
          multiStep = true;
        } else if (multiStep) {
          // falls die Stufen-Strategie weiter gilt: für flache Bohrungen zurück auf einen Durchgang
          L.push('CreateSingleStepDrillingStrategy();');
          multiStep = false;
        }
        if (op.plane) {
          L.push('CreateDrill ("Drill_Slanted_Plane_' + (++counts.pdrill) + '", ' + fmt(d.x) + ', ' + fmt(d.y) + ', ' + fmt(d.depth) + ', ' +
            fmt(d.d) + ', "", TypeOfProcess.Drilling, "-1", "-1", 1, -1, -1, "' + d.tip + '");');
        } else if (op.face === 'Top') {
          L.push('CreateDrill ("Drill_Vertical_' + (++nDrill.V) + '", ' + fmt(d.x) + ', ' + fmt(d.y) + ', ' + fmt(d.depth) + ', ' +
            fmt(d.d) + ', "", TypeOfProcess.Drilling, "-1", "-1", 1, -1, -1, "' + d.tip + '");');
        } else {
          L.push('CreateDrill ("Drill_Horizontal_' + (++nDrill.H) + '", ' + fmt(d.x) + ', ' + fmt(d.y) + ', ' + fmt(d.depth) + ', ' +
            fmt(d.d) + ', "", TypeOfProcess.Drilling);');
        }
        if (usePat) L.push('CreatePattern(1, 1, 0, 0, 0, 90);');
        blank();
      }
    }
    L.push('CreateNullOperation("XN", ' + fmt(p.L + cfg.parkOffset) + ', null, 1, 50, false, " ");');
    L.push('');
    return { text: L.join('\r\n'), ops: ops, warnings: warnings, field: field, groups: groups, defaultGroups: defaultGroups, suction: suction };
  }

  return { write: write, plan: plan, planSuction: planSuction, DEFAULTS: DEFAULTS, CATEGORIES: CATEGORIES, ruleSequence: ruleSequence };
});
