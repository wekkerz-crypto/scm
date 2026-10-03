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
      'blade', 'slantPlane', 'cutout', 'notch', 'format'] },
    throughExtra: 2,           // Durchgangsbohrung: Tiefe = Dicke + …
    drillsVertical: [3, 5, 7, 8, 10, 12, 15, 20, 35],
    drillsHorizontal: [5, 8],
    parkOffset: 1000,          // CreateNullOperation X = Länge + …
    usePatterns: true,
    // X-Konverter (Batch-Datei konvertieren.bat in der ZIP)
    xconverterPath: 'C:\\Program Files\\SCM Group\\Maestro\\XConverter.exe',
    toolsFile: 'C:\\Users\\Public\\Documents\\SCM Group\\Maestro\\Tlgx\\def.tlgx',
    pgmxDir: '',               // leer = Unterordner „pgmx“ neben der .bat
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
      slant: 'slant', blade: 'blade', slot: 'slot' }[prefix] || 'notch';
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

    // 2) Nuten mit Säge
    for (const g of p.grooves) {
      const width = g.to - g.from;
      if (width > cfg.maxGrooveWidth) warnings.push('Nut ' + fmt(width) + ' mm breit – breiter als ' + cfg.maxGrooveWidth + ' mm, bitte prüfen.');
      // Segment auf der Nutflanke, Nut links der Fahrtrichtung (wie im Beispiel 32_Seitenwand_R)
      const a = g.dir === 'X' ? [-cfg.sawOverrun, g.from] : [g.to, -cfg.sawOverrun];
      const b = g.dir === 'X' ? [p.L + cfg.sawOverrun, g.from] : [g.to, p.W + cfg.sawOverrun];
      ops.push({ kind: 'slot', key: 'slot-' + ops.length, toolKind: 'saw', toolDefault: 'sawTool', a: a, b: b, depth: g.depth, width: width, tool: cfg.sawTool,
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

    // 8) Schräge Kanten über die ganze Dicke (5-Achs)
    for (const [i, w] of p.slantWalls.entries()) {
      const ll = cfg.leadLength;
      const d = [w.top.b[0] - w.top.a[0], w.top.b[1] - w.top.a[1]];
      const l = Math.hypot(d[0], d[1]) || 1;
      const u = [d[0] / l, d[1] / l];
      // Gerader Schnitt von Kante zu Kante: mit der Säge (Schnittfläche wird zur neuen schrägen Ebene)
      const atEdge = (q) => q[0] < 0.05 || q[0] > p.L - 0.05 || q[1] < 0.05 || q[1] > p.W - 0.05;
      if (cfg.slantCut === 'saw' && atEdge(w.top.a) && atEdge(w.top.b)) {
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
          ops.push({ kind: 'contour', key: 'round-' + ops.length, toolKind: 'mill', toolDefault: 'cutoutTool', contour: ++nContour, milling: ++nMill, approach: false,
            start: [d.x + r, d.y],
            segs: [
              { type: 'arc', to: [d.x - r, d.y], c: [d.x, d.y], cw: false },
              { type: 'arc', to: [d.x + r, d.y], c: [d.x, d.y], cw: false },
            ],
            depth: T + cfg.cutoutExtra, tool: cfg.cutoutTool, side: 1, label: 'Rundloch Ø' + fmt(d.d) });
          if (d.d < cfg.rebateToolDia) warnings.push('Rundloch Ø' + fmt(d.d) + ' kleiner als Fräser – bitte prüfen.');
          continue;
        }
        if (vertical && !d.through) {
          // Runde Vertiefung ohne passenden Bohrer → als Kreistasche fräsen
          const key = 'rpocket-' + ops.length;
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
      if (op.round) {
        const info = cfg.toolInfo && cfg.toolInfo[op.tool];
        const dRound = op.segs[0].r * 2;
        if (info && info.d && info.d >= dRound - 1e-6) {
          warnings.push(op.label + ': Fräser ' + op.tool + ' (Ø' + fmt(info.d) + ') passt nicht hinein – kleineren Fräser wählen.');
        }
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
      }
    }

    for (const b of p.bottom) warnings.push(b.text + ' – nicht von oben bearbeitbar (Platte wenden / 2. Programm).');
    return { ops: ops, warnings: warnings, groups: order, defaultGroups: ruleGroups };
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
    const { ops, warnings, groups, defaultGroups } = plan(p, cfg);
    const field = (override && override.field) || autoField(p, cfg);
    const L = [];
    const blank = () => L.push('');
    L.push('SetMachiningParameters("' + field + '", 1, 10, 196608, false);'); blank();
    L.push('CreateFinishedWorkpieceBox("Workpiece", ' + fmt(p.L) + ', ' + fmt(p.W) + ', ' + fmt(p.T) + ');'); blank();
    const o = fmt(cfg.rawOversize);
    L.push('CreateRawWorkpiece("Workpiece", ' + [o, o, o, o].join(', ') + ', 0, 0);'); blank();
    L.push('SetWorkpieceSetupPosition(' + o + ', ' + o + ', 0, 0);'); blank();

    let nSlot = 0;
    let nSeg = 0;
    const nDrill = { V: 0, H: 0 };
    const counts = { chamfer: 0, slant: 0, sdrill: 0, blade: 0, pdrill: 0 };
    let plane = 'Top';
    const madePlanes = new Set();
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
        L.push('CreatePolyline("Contour_' + op.contour + '", ' + pt(op.start) + ');');
        for (const s of op.segs) {
          if (s.type === 'line') L.push('AddSegmentToPolyline(' + pt(s.to) + ');');
          else L.push('AddArc2PointCenterToPolyline(' + pt(s.to) + ', ' + pt(s.c) + ', ' + (s.cw ? 'true' : 'false') + ');');
        }
        blank();
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        if (op.approach) {
          L.push('SetApproachStrategy(false, true, 2);');
          L.push('SetRetractStrategy(false, true, 2, 0);');
        }
        L.push('SetPneumaticHoodPosition(1);');
        if (op.step) L.push('CreateUnidirectionalMillingStrategy(true, ' + fmt(op.step) + ', ' + fmt(cfg.finishDepth) + ', 1, false);');
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
        const n = ++counts.slant;
        L.push('CreateSegment("SlantSegment_' + n + '", ' + pt(op.a) + ', ' + pt(op.b) + ');');
        L.push('ResetApproachStrategy();');
        L.push('ResetRetractStrategy();');
        L.push('CreateSlantedRoughFinish("SlantedMilling_' + n + '", 0, ' + fmt(op.angle) + ', ' + op.approach + ', ' + fmt(op.depth) +
          ', "", TypeOfProcess.GeneralRouting, "' + op.tool + '", "-1", 2, -1, -1, -1, 0);');
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
    return { text: L.join('\r\n'), ops: ops, warnings: warnings, field: field, groups: groups, defaultGroups: defaultGroups };
  }

  return { write: write, plan: plan, DEFAULTS: DEFAULTS, CATEGORIES: CATEGORIES, ruleSequence: ruleSequence };
});
