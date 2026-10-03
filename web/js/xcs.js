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
    fieldThreshold: 1500,      // ab dieser Länge (mm) → fieldLong
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
    rebateToolDia: 12,
    throughExtra: 2,           // Durchgangsbohrung: Tiefe = Dicke + …
    drillsVertical: [3, 5, 7, 8, 10, 12, 15, 20, 35],
    drillsHorizontal: [5, 8],
    parkOffset: 1000,          // CreateNullOperation X = Länge + …
    usePatterns: true,
  };

  const FACE_NAMES = { Left: 'Left', Right: 'Right', Front: 'Front', Back: 'Back' };

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

    // 1) Formatfräsen (immer Rechteck L×B wie in den Beispielen)
    ops.push({
      kind: 'contour', contour: ++nContour, milling: ++nMill, approach: true,
      start: [0, p.W / 2],
      segs: [[0, 0], [p.L, 0], [p.L, p.W], [0, p.W], [0, p.W / 2]].map((q) => ({ type: 'line', to: q })),
      depth: T + cfg.contourExtra, tool: cfg.contourTool, side: 2, label: 'Formatfräsen',
    });

    // 2) Nuten mit Säge
    for (const g of p.grooves) {
      const width = g.to - g.from;
      if (width > cfg.maxGrooveWidth) warnings.push('Nut ' + fmt(width) + ' mm breit – breiter als ' + cfg.maxGrooveWidth + ' mm, bitte prüfen.');
      // Segment auf der Nutflanke, Nut links der Fahrtrichtung (wie im Beispiel 32_Seitenwand_R)
      const a = g.dir === 'X' ? [-cfg.sawOverrun, g.from] : [g.to, -cfg.sawOverrun];
      const b = g.dir === 'X' ? [p.L + cfg.sawOverrun, g.from] : [g.to, p.W + cfg.sawOverrun];
      ops.push({ kind: 'slot', a: a, b: b, depth: g.depth, width: width, tool: cfg.sawTool,
        label: 'Nut ' + fmt(width) + '×' + fmt(g.depth) });
    }

    // 3) Abweichungen der Außenkontur vom Rechteck (Ausschnitte, Rundungen, Schrägen)
    for (const path of notchPaths(p, cfg)) {
      ops.push({ kind: 'contour', contour: ++nContour, milling: ++nMill, approach: false,
        start: path.start, segs: path.segs, depth: T + cfg.cutoutExtra, tool: cfg.cutoutTool, side: 1, label: 'Kontur-Ausschnitt' });
    }

    // 4) Durchbrüche (Innenkonturen)
    for (const lp of p.cutouts) {
      ops.push({ kind: 'contour', contour: ++nContour, milling: ++nMill, approach: false,
        start: lp[0].a, segs: lp.map(toPolySeg), depth: T + cfg.cutoutExtra, tool: cfg.cutoutTool, side: 2, label: 'Durchbruch' });
    }

    // 5) Falze
    for (const r of p.rebates) {
      const n = Math.max(1, Math.ceil(r.width / (cfg.rebateToolDia * 0.9)));
      if (n > 1) warnings.push('Falz ' + fmt(r.width) + ' mm breiter als Fräser Ø' + cfg.rebateToolDia + ' – ' + n + ' Bahnen.');
      for (let i = 0; i < n; i++) {
        const off = (i * r.width) / n;
        let a;
        let b;
        const ll = cfg.leadLength;
        if (r.edge === 'Front') { const y = r.flank - off; a = [-ll, y]; b = [p.L + ll, y]; }
        if (r.edge === 'Back') { const y = r.flank + off; a = [p.L + ll, y]; b = [-ll, y]; }
        if (r.edge === 'Left') { const x = r.flank - off; a = [x, p.W + ll]; b = [x, -ll]; }
        if (r.edge === 'Right') { const x = r.flank + off; a = [x, -ll]; b = [x, p.W + ll]; }
        ops.push({ kind: 'contour', contour: ++nContour, milling: ++nMill, approach: false,
          start: a, segs: [{ type: 'line', to: b }], depth: r.depth, tool: cfg.rebateTool, side: 2,
          label: 'Falz ' + fmt(r.width) + '×' + fmt(r.depth) });
      }
    }

    // 6) Taschen – nur Hinweis
    for (const k of p.pockets) {
      warnings.push('Tasche ' + fmt(k.x1 - k.x0) + '×' + fmt(k.y1 - k.y0) + ' Tiefe ' + fmt(k.depth) + ' bei X=' + fmt(k.x0) +
        ' Y=' + fmt(k.y0) + ' wird nicht automatisch erzeugt – bitte in Maestro ergänzen.');
    }

    // 7) Bohrungen
    const drillOps = [];
    for (const d of p.drills) {
      const vertical = d.face === 'Top';
      const list = vertical ? cfg.drillsVertical : cfg.drillsHorizontal;
      if (!hasDrill(list, d.d)) {
        if (vertical && d.through) {
          const r = d.d / 2;
          ops.push({ kind: 'contour', contour: ++nContour, milling: ++nMill, approach: false,
            start: [d.x + r, d.y],
            segs: [
              { type: 'arc', to: [d.x - r, d.y], c: [d.x, d.y], cw: false },
              { type: 'arc', to: [d.x + r, d.y], c: [d.x, d.y], cw: false },
            ],
            depth: T + cfg.cutoutExtra, tool: cfg.cutoutTool, side: 1, label: 'Rundloch Ø' + fmt(d.d) });
          if (d.d < cfg.rebateToolDia) warnings.push('Rundloch Ø' + fmt(d.d) + ' kleiner als Fräser – bitte prüfen.');
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

    for (const b of p.bottom) warnings.push(b.text + ' – nicht von oben bearbeitbar (Platte wenden / 2. Programm).');
    return { ops: ops, warnings: warnings };
  }

  function toPolySeg(s) {
    return s.type === 'arc'
      ? { type: 'arc', to: s.b, c: s.c, cw: !s.ccw }
      : { type: 'line', to: s.b };
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
    const isB = segs.map((s) => !!onRectSide(s, p.L, p.W));
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
      const uPrev = onRectSide(prev, p.L, p.W);
      const uNext = onRectSide(next, p.L, p.W);
      const ll = cfg.leadLength;
      const start = [B[0] + uNext[0] * ll, B[1] + uNext[1] * ll];
      const out = [{ type: 'line', to: B }];
      for (const s of chain.slice().reverse()) out.push(toPolySeg(revSeg(s)));
      out.push({ type: 'line', to: [A[0] - uPrev[0] * ll, A[1] - uPrev[1] * ll] });
      paths.push({ start: start, segs: out });
    }
    return paths;
  }

  function revSeg(s) {
    return s.type === 'arc'
      ? { type: 'arc', a: s.b, b: s.a, c: s.c, r: s.r, ccw: !s.ccw, full: s.full }
      : { type: 'line', a: s.b, b: s.a };
  }

  // ---------------------------------------------------------------- Ausgabe

  function write(p, cfgIn, override) {
    const cfg = Object.assign({}, DEFAULTS, cfgIn || {});
    const { ops, warnings } = plan(p, cfg);
    const field = (override && override.field) || (p.L >= cfg.fieldThreshold ? cfg.fieldLong : cfg.fieldShort);
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
    let plane = 'Top';
    for (const op of ops) {
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
        L.push('CreateRoughFinish("Milling_' + op.milling + '", ' + fmt(op.depth) + ', "", TypeOfProcess.GeneralRouting, "' +
          op.tool + '", "-1", ' + op.side + ', "-1", "-1", "-1");');
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
        if (op.face === 'Top') {
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
    return { text: L.join('\r\n'), ops: ops, warnings: warnings, field: field };
  }

  return { write: write, plan: plan, DEFAULTS: DEFAULTS };
});
