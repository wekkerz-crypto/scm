/*
 * Vereinfachte Werkzeugbahnen für die Animation im Web-Tool (Draufsicht, Plattenkoordinaten).
 * Kein Ersatz für die Bahnberechnung von Maestro – dient nur zur Kontrolle von Reihenfolge,
 * Werkzeugseite und Lage der Bearbeitungen.
 *
 * Ergebnis: Liste von Bewegungen { type: 'rapid'|'cut'|'plunge', pts: [[x,y],…], d, label, tool, op }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Toolpath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TWO_PI = Math.PI * 2;

  // Polylinie (start + segs mit line/arc) in Punkte zerlegen
  function samplePoly(start, segs) {
    const pts = [start.slice()];
    let cur = start;
    for (const s of segs) {
      if (s.type === 'line') {
        pts.push(s.to.slice());
      } else {
        const r = Math.hypot(cur[0] - s.c[0], cur[1] - s.c[1]);
        const a0 = Math.atan2(cur[1] - s.c[1], cur[0] - s.c[0]);
        const a1 = Math.atan2(s.to[1] - s.c[1], s.to[0] - s.c[0]);
        let sw = a1 - a0;
        if (s.cw) { while (sw >= -1e-9) sw -= TWO_PI; } else { while (sw <= 1e-9) sw += TWO_PI; }
        const n = Math.max(4, Math.ceil(Math.abs(sw) / (Math.PI / 24)));
        for (let i = 1; i <= n; i++) {
          const a = a0 + (sw * i) / n;
          pts.push([s.c[0] + r * Math.cos(a), s.c[1] + r * Math.sin(a)]);
        }
      }
      cur = s.to;
    }
    return dedupe(pts);
  }

  // Geschlossene Kontur (Segmente mit a/b aus der Analyse) in Punkte zerlegen
  function sampleLoop(segs) {
    if (!segs || !segs.length) return [];
    if (segs.length === 1 && segs[0].type === 'arc' && segs[0].full) {
      const q = segs[0];
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const a = (q.ccw ? 1 : -1) * (TWO_PI * i) / 48;
        pts.push([q.c[0] + q.r * Math.cos(a), q.c[1] + q.r * Math.sin(a)]);
      }
      return pts;
    }
    return samplePoly(segs[0].a, segs.map((s) => (s.type === 'arc' ? { type: 'arc', to: s.b, c: s.c, cw: !s.ccw } : { type: 'line', to: s.b })));
  }

  function dedupe(pts) {
    const out = [];
    for (const p of pts) {
      const l = out[out.length - 1];
      if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 1e-6) out.push(p);
    }
    return out;
  }

  // Mittelpunktsbahn mit Radiuskorrektur: side 1 = links, 2 = rechts, sonst Mitte
  function offsetPath(pts, r, side) {
    if (!side || r <= 0 || pts.length < 2) return pts;
    const sgn = side === 1 ? 1 : -1;
    const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6;
    const segs = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 1e-9) continue;
      const n = [(-(b[1] - a[1]) / l) * sgn * r, ((b[0] - a[0]) / l) * sgn * r];
      segs.push([[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]]]);
    }
    if (!segs.length) return pts;
    const out = [segs[0][0]];
    const join = (s1, s2) => {
      const p = intersect(s1, s2);
      if (p && Math.hypot(p[0] - s1[1][0], p[1] - s1[1][1]) < 3 * r) return [p];
      return [s1[1], s2[0]];
    };
    for (let i = 0; i + 1 < segs.length; i++) out.push(...join(segs[i], segs[i + 1]));
    if (closed) {
      const j = join(segs[segs.length - 1], segs[0]);
      out[0] = j[j.length - 1];
      out.push(...j);
    } else {
      out.push(segs[segs.length - 1][1]);
    }
    return out;
  }

  function intersect(s1, s2) {
    const [p, p2] = s1;
    const [q, q2] = s2;
    const r = [p2[0] - p[0], p2[1] - p[1]];
    const s = [q2[0] - q[0], q2[1] - q[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
    return [p[0] + t * r[0], p[1] + t * r[1]];
  }

  // Abstand Punkt–Polygonrand
  function distToPoly(p, poly) {
    let d = Infinity;
    for (let i = 0; i + 1 < poly.length; i++) {
      const a = poly[i];
      const b = poly[i + 1];
      const ab = [b[0] - a[0], b[1] - a[1]];
      const l2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2));
      d = Math.min(d, Math.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1]));
    }
    return d;
  }

  function inside(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  // Tasche: Zeilen im Zickzack (Abstand = Ø × (1 − Überdeckung)), danach eine Bahn entlang der Kontur
  function pocketMoves(outer, islands, r, overlap) {
    const step = Math.max(0.5, 2 * r * (1 - (overlap ?? 50) / 100));
    let y0 = Infinity;
    let y1 = -Infinity;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const p of outer) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
    const ok = (p) => inside(p, outer) && distToPoly(p, outer) >= r - 1e-6 &&
      islands.every((isl) => !inside(p, isl) && distToPoly(p, isl) >= r - 1e-6);
    const res = Math.max(0.5, r / 4);
    const rows = [];
    let flip = false;
    for (let y = y0 + r; y <= y1 - r + 1e-6; y += step) {
      const runs = [];
      let run = null;
      for (let x = x0; x <= x1 + 1e-6; x += res) {
        if (ok([x, y])) { if (!run) run = [x, x]; run[1] = x; } else if (run) { runs.push(run); run = null; }
      }
      if (run) runs.push(run);
      for (const ru of runs) rows.push(flip ? [[ru[1], y], [ru[0], y]] : [[ru[0], y], [ru[1], y]]);
      flip = !flip;
    }
    const finish = [offsetInward(outer, r)].concat(islands.map((isl) => offsetInward(isl, -r)));
    return { rows: rows, finish: finish };
  }

  // Kontur um r nach innen versetzen (r < 0: nach außen); Umlaufsinn wird erkannt
  function offsetInward(loop, r) {
    let a = 0;
    for (let i = 0; i + 1 < loop.length; i++) a += loop[i][0] * loop[i + 1][1] - loop[i + 1][0] * loop[i][1];
    const ccw = a > 0;
    const side = (ccw ? 1 : 2);
    return r >= 0 ? offsetPath(loop, r, side) : offsetPath(loop, -r, side === 1 ? 2 : 1);
  }

  const EDGE_AXIS = { Left: [1, 0], Right: [-1, 0], Front: [0, 1], Back: [0, -1] };

  function build(result, toolInfo, cfg) {
    const p = result.panel;
    const ops = result.ops;
    cfg = cfg || {};
    const info = (name) => (toolInfo && toolInfo[name]) || {};
    const moves = [];
    let pos = [-60, -60];
    // meta: z = Frästiefe, kind = Darstellungsart (mill, saw, drill, edge, chamfer)
    let meta = {};
    let mapPt = null; // Bearbeitung auf schräger Ebene: lokale Koordinaten → Draufsicht
    // 3D (für die 3D-Ansicht): Werkzeugspitze je Punkt, Werkzeugachse (Spitze → Spindel), Rückzug
    const UP = [0, 0, 1];
    let pos3 = [-60, -60, p.T + 60];
    let lastAx = UP;
    let lastBack = 10;
    const plus = (a, v, k) => [a[0] + v[0] * k, a[1] + v[1] * k, a[2] + v[2] * k];
    let lastTool = null;
    let lastD = 0;
    const go = (pts, d, label, tool, opIndex, pts3In) => {
      if (!pts.length) return;
      const to3 = meta.to3 || ((q) => [q[0], q[1], p.T - (meta.z || 0)]);
      const pts3 = pts3In || pts.map(to3);
      const ax3 = meta.ax3 || UP;
      const back = meta.back !== undefined ? meta.back : (meta.z || 0) + 10;
      if (mapPt) pts = pts.map(mapPt);
      const extra = { z: meta.z || 0, through: (meta.z || 0) >= p.T - 1e-6, kind: meta.kind || 'mill',
        group: ops[opIndex] ? ops[opIndex].group : '' };
      if (meta.axis) extra.axis = meta.axis;
      if (meta.axisScale) extra.axisScale = meta.axisScale;
      if (meta.blade) extra.blade = meta.blade;
      extra.ax3 = ax3;
      if (meta.ax3s) extra.ax3s = meta.ax3s; // Achse je Punkt (5-Achs entlang einer Rundung)
      if (meta.ball) extra.ball = true;
      if (meta.disc) extra.disc = meta.disc;
      if (meta.len3) extra.len3 = meta.len3;
      if (meta.stage) extra.stage = meta.stage; // zweistufig: 'rough' (vorfräsen) / 'finish' (nachfräsen)
      // Werkzeugwechsel (Fräsaggregat; Bohrungen laufen über das Bohraggregat): zum Wechselplatz hinter der Platte,
      // dort wechseln – in der Animation eine eigene Bewegung mit Pause
      if (tool && extra.kind !== 'drill' && extra.kind !== 'edge') {
        if (lastTool && lastTool !== tool) {
          const park = [-30, p.W / 2];
          const park3 = [park[0], park[1], p.T + 150];
          moves.push({ type: 'rapid', change: { from: lastTool, to: tool, dFrom: lastD, dTo: d }, pts: [pos, park], d: lastD,
            label: 'Werkzeugwechsel ' + lastTool + ' → ' + tool, tool: tool, op: opIndex, z: 0, kind: 'mill', group: extra.group,
            stage: extra.stage, ax3: UP, pts3: [pos3, plus(pos3, lastAx, lastBack), park3] });
          pos = park;
          pos3 = park3;
          lastAx = UP;
          lastBack = 0;
        }
        lastTool = tool;
        lastD = d;
      }
      const start3 = pts3[0];
      if (Math.hypot(pos[0] - pts[0][0], pos[1] - pts[0][1]) > 1e-6 || Math.hypot(pos3[0] - start3[0], pos3[1] - start3[1], pos3[2] - start3[2]) > 1e-6) {
        // Eilgang: zurückziehen, über dem Teil hinfahren, anstellen
        const up0 = plus(pos3, lastAx, lastBack);
        const up1 = plus(start3, ax3, back);
        moves.push(Object.assign({ type: 'rapid', pts: [pos, pts[0]], d: d, label: label, tool: tool, op: opIndex }, extra,
          { pts3: [pos3, up0, up1, start3], ax3s: undefined }));
      }
      if (pts.length === 1) {
        // Bohren: von der Oberfläche auf Tiefe (in 3D sichtbar)
        moves.push(Object.assign({ type: 'plunge', pts: [pts[0]], d: d, label: label, tool: tool, op: opIndex }, extra,
          { pts3: [plus(start3, ax3, meta.z || 0), start3] }));
      } else moves.push(Object.assign({ type: 'cut', pts: pts, d: d, label: label, tool: tool, op: opIndex }, extra, { pts3: pts3 }));
      pos = pts[pts.length - 1];
      pos3 = pts3[pts3.length - 1];
      lastAx = ax3;
      lastBack = back;
    };

    ops.forEach((op, i) => {
      meta = { z: op.depth || 0, kind: 'mill' };
      if (op.kind === 'slot') meta.kind = 'saw';
      if (op.kind === 'chamfer') meta = { z: op.height, kind: 'chamfer' };
      if (op.kind === 'drill') meta = { z: op.d.depth, kind: op.face === 'Top' || op.plane ? 'drill' : 'edge' };
      mapPt = null;
      if (op.plane) {
        // Werkzeug steht senkrecht zur schrägen Ebene: von oben gesehen gekippt
        const q = op.plane;
        mapPt = (l) => [q.o[0] + q.X[0] * l[0] + q.Y[0] * l[1], q.o[1] + q.X[1] * l[0] + q.Y[1] * l[1]];
        const h = Math.hypot(q.n[0], q.n[1]) || 1;
        meta.axis = [-q.n[0] / h, -q.n[1] / h];
        meta.axisScale = h; // sin(Neigung)
        meta.ax3 = q.n;
        meta.to3 = (l) => {
          const z = meta.z || 0;
          return [q.o[0] + q.X[0] * l[0] + q.Y[0] * l[1] - q.n[0] * z, q.o[1] + q.X[1] * l[0] + q.Y[1] * l[1] - q.n[1] * z,
            q.o[2] + q.X[2] * l[0] + q.Y[2] * l[1] - q.n[2] * z];
        };
      }
      if (op.kind === 'blade') {
        // Sägeschnitt: Abtrag = Keil zwischen Ober- und Unterkante der Schräge
        meta = { z: p.T * 0.3, kind: 'saw', blade: { tilt: op.tilt } };
      }
      // Bearbeitung von der Kante: Werkzeug liegt waagerecht, axis = Richtung in die Platte (Draufsicht)
      if (op.face && op.face !== 'Top' && EDGE_AXIS[op.face]) {
        meta.axis = EDGE_AXIS[op.face];
        // Höhe der Werkzeugachse: Bohrung lokal y, Kantentasche Mitte der Tasche
        let hgt = p.T / 2;
        if (op.kind === 'drill') hgt = op.d.y;
        else if (op.segs && op.segs.length) { const ys = op.segs.flatMap((q) => [q.a[1], q.b[1]]); hgt = (Math.min(...ys) + Math.max(...ys)) / 2; }
        meta.to3 = (q) => [q[0], q[1], hgt];
        meta.ax3 = [-meta.axis[0], -meta.axis[1], 0];
        meta.back = 10;
        meta.len3 = (op.depth || (op.d && op.d.depth) || 10) + 8;
      }
      if (op.kind === 'slot') {
        // Nutsäge: senkrechtes Blatt in Fahrtrichtung
        const ti = info(op.tool);
        meta.to3 = (q) => [q[0], q[1], p.T];
        meta.disc = { d: ti.d || 120, thick: ti.blade || 4, reach: op.depth, up: UP };
        meta.back = 10;
      }
      if (op.kind === 'slant') {
        // geneigter Fräser (5-Achs): Achse parallel zur schrägen Fläche
        const a = op.angle * Math.PI / 180;
        const sdir = op.scrap || [1, 0];
        const lean = op.approach === 2;
        const ax = lean ? [-sdir[0] * Math.sin(a), -sdir[1] * Math.sin(a), Math.cos(a)] : [sdir[0] * Math.sin(a), sdir[1] * Math.sin(a), Math.cos(a)];
        const dd = (op.depth || p.T) / Math.cos(a);
        meta.ax3 = ax;
        meta.to3 = (q) => [q[0] - ax[0] * dd, q[1] - ax[1] * dd, p.T - ax[2] * dd];
        meta.back = dd + 10;
      }
      if (op.kind === 'blade') {
        const info0 = info(op.tool);
        const dir = [op.b[0] - op.a[0], op.b[1] - op.a[1]];
        const l = Math.hypot(dir[0], dir[1]) || 1;
        const right = [dir[1] / l, -dir[0] / l]; // Abfallseite
        const w = Math.tan(op.tilt * Math.PI / 180) * p.T; // waagerechter Versatz der Schräge
        const off = op.leanOut ? w / 2 : -w / 2;
        const sh = (q) => [q[0] + right[0] * off, q[1] + right[1] * off];
        meta.blade.d = info0.d || 300;
        meta.blade.thick = info0.blade || 3;
        const a0 = op.a0 || op.a;
        const b0 = op.b0 || op.b;
        // 3D: Blatt in der Ebene der Schräge, Linie an der Oberseite
        const ta = op.tilt * Math.PI / 180;
        const up = op.leanOut ? [-right[0] * Math.sin(ta), -right[1] * Math.sin(ta), Math.cos(ta)] : [right[0] * Math.sin(ta), right[1] * Math.sin(ta), Math.cos(ta)];
        const line3 = (q) => [q[0], q[1], p.T];
        meta.disc = { d: info0.d || 300, thick: info0.blade || 3, reach: p.T / Math.cos(ta) + (op.extra || 0), up: up };
        meta.ax3 = up;
        meta.back = 10;
        const goB = (pts2, z, w2, lab) => {
          meta.z = z;
          meta.disc = Object.assign({}, meta.disc, { reach: z === p.T * 0.3 ? p.T / Math.cos(ta) + (op.extra || 0) : z });
          go(pts2, w2, lab, op.tool, i, pts2 === null ? null : [line3(pts2.src[0]), line3(pts2.src[1])]);
        };
        const pair = (x, y, src) => { const r = [x, y]; r.src = src; return r; };
        if (op.score) {
          // Vorritzen: dünner Schnitt in Ritztiefe, zurück auf volle Tiefe
          goB(pair(a0, b0, [a0, b0]), op.score.depth, info0.blade || 3, op.label + ' – vorritzen');
          goB(pair(sh(b0), sh(a0), [b0, a0]), p.T * 0.3, Math.max(w, info0.blade || 3), op.label);
        } else {
          goB(pair(sh(a0), sh(b0), [a0, b0]), p.T * 0.3, Math.max(w, info0.blade || 3), op.label);
        }
        return;
      }
      if (op.kind === 'sdrill') meta = { z: op.depth * Math.cos(op.angleB * Math.PI / 180), kind: 'drill' };
      if (op.kind === 'slantpath') {
        // geneigter Fräser entlang der Rundung: Achse quer zur Bahn, je Punkt neu (Werkzeugmitte = versetzte Bahn)
        const a = op.angle * Math.PI / 180;
        const pts = dedupe(samplePoly(op.start, op.segs));
        const lean = op.approach === 2;
        const axes = pts.map((q, k) => {
          const u = pts[Math.min(k + 1, pts.length - 1)];
          const v = pts[Math.max(k - 1, 0)];
          const dx = u[0] - v[0];
          const dy = u[1] - v[1];
          const l = Math.hypot(dx, dy) || 1;
          const sc = [dy / l, -dx / l]; // Abfallseite (rechts)
          return lean ? [-sc[0] * Math.sin(a), -sc[1] * Math.sin(a), Math.cos(a)] : [sc[0] * Math.sin(a), sc[1] * Math.sin(a), Math.cos(a)];
        });
        const dd = (op.depth || p.T) / Math.cos(a);
        meta.ax3 = axes[0];
        meta.ax3s = axes;
        meta.back = dd + 10;
        go(pts, info(op.tool).d || 10, op.label, op.tool, i, pts.map((q, k) => [q[0] - axes[k][0] * dd, q[1] - axes[k][1] * dd, p.T - axes[k][2] * dd]));
        return;
      }
      if (op.kind === 'clamex') {
        // Clamex-Nut in der Draufsicht: Kante – Fläche der Nut (Sehne × Tiefe), Fläche/Schräge – Sehne in Nutbreite;
        // Makro: alle Verbinder der Kante/Linie
        for (const g of op.grooves || [op.groove]) {
        const dist = g.r - g.depth;
        const s0 = [g.c[0] - g.n[0] * dist, g.c[1] - g.n[1] * dist]; // Mitte der Öffnung
        meta.kind = 'edge';
        if (Math.abs(g.n[2]) < 0.5) {
          const deep = [g.c[0] - g.n[0] * g.r, g.c[1] - g.n[1] * g.r];
          meta.z = p.T - g.c[2];
          go([s0, deep], g.chord, op.label, op.tool, i);
        } else {
          const u = [g.a[1] * g.n[2] - g.a[2] * g.n[1], g.a[2] * g.n[0] - g.a[0] * g.n[2]];
          const ul = Math.hypot(u[0], u[1]) || 1;
          const h = g.chord / 2 / ul;
          meta.z = g.depth;
          go([[s0[0] - u[0] * h, s0[1] - u[1] * h], [s0[0] + u[0] * h, s0[1] + u[1] * h]], g.w, op.label, op.tool, i);
        }
        }
        return;
      }
      if (op.kind === 'cyl4') {
        // 4-Achs abzeilen: Fräser senkrecht auf der Fläche, je Zeile eine gerade Fahrt längs der Achse
        const d = info(op.tool).d || 16;
        for (const q of op.passes) {
          meta.ax3 = q.n;
          meta.z = Math.max(0, p.T - Math.min(q.a[2], q.b[2]));
          meta.back = 20;
          go([[q.a[0], q.a[1]], [q.b[0], q.b[1]]], d, op.label, op.tool, i, [q.a, q.b]);
        }
        return;
      }
      if (op.kind === 'surface') {
        // Kugelfräser: Zeilen mit Spitze auf der Fläche, dazwischen abheben
        const d = info(op.tool).d || 12;
        meta.ball = true;
        for (const ps of op.passes) {
          const zmin = Math.min(...ps.map((q) => q[2]));
          meta.z = p.T - zmin;
          meta.back = p.T + (op.safe || 5) - zmin;
          go(ps.map((q) => [q[0], q[1]]), d, op.label, op.tool, i, ps.map((q) => [q[0], q[1], q[2]]));
        }
        return;
      }
      if (op.kind === 'contour') {
        const d = info(op.tool).d || 10;
        const raw = samplePoly(op.start, op.segs);
        if (op.rough) {
          // Vorfräsen mit Werkzeug 1, Aufmaß bleibt stehen
          const d1 = info(op.rough.tool).d || 10;
          meta.stage = 'rough';
          go(offsetPath(raw, d1 / 2 + op.rough.allowance, op.side), d1, op.label + ' – vorfräsen', op.rough.tool, i);
          meta.stage = 'finish';
        }
        go(offsetPath(raw, d / 2, op.side), d, op.label + (op.rough ? ' – nachfräsen' : ''), op.tool, i);
        delete meta.stage;
        // Durchbruch/Rundloch: nach dem letzten Schnitt fällt das Innenstück heraus
        if (/^(cutout|round)-/.test(op.key || '') && !op.tabs && moves.length) moves[moves.length - 1].slug = raw; // mit Haltestegen bleibt es hängen
      } else if (op.kind === 'pocket' && op.face && op.face !== 'Top') {
        // Tasche in der Kante: in der Draufsicht als Ein- und Ausfahren über die Taschenbreite
        meta.kind = 'edge';
        meta.axis = EDGE_AXIS[op.face];
        const d = info(op.tool).d || 10;
        const xs = op.segs.flatMap((q) => [q.a[0], q.b[0]]);
        const x0 = Math.min(...xs) + d / 2;
        const x1 = Math.max(...xs) - d / 2;
        const n = Math.max(1, Math.ceil((x1 - x0) / (d * 0.5)));
        const at = (lx, t) => {
          if (op.face === 'Left') return [t, p.W - lx];
          if (op.face === 'Right') return [p.L - t, lx];
          if (op.face === 'Front') return [lx, t];
          return [p.L - lx, p.W - t];
        };
        const pts = [];
        for (let k = 0; k <= n; k++) {
          const lx = x1 > x0 ? x0 + ((x1 - x0) * k) / n : (x0 + x1) / 2;
          pts.push(at(lx, 0), at(lx, op.depth), at(lx, 0));
        }
        go(pts, d, op.label, op.tool, i);
      } else if (op.kind === 'pocket') {
        const d = info(op.tool).d || 10;
        const q0 = op.segs[0];
        if (op.segs.length === 1 && q0.type === 'arc' && q0.full && !op.islands.length) {
          // Kreistasche: Kreise von innen nach außen, im Uhrzeigersinn (wie im Programm)
          const rMax = q0.r - d / 2;
          const step = Math.max(0.5, d * (1 - (cfg.pocketOverlap ?? 50) / 100));
          const rings = [];
          for (let rr = Math.min(step, rMax); rr < rMax - 1e-6; rr += step) rings.push(rr);
          if (rMax > 0) rings.push(rMax);
          if (rMax <= 0) go([[q0.c[0], q0.c[1]]], d, op.label, op.tool, i);
          for (const rr of rings) {
            const pts = [];
            for (let k = 0; k <= 48; k++) {
              const a = -(Math.PI * 2 * k) / 48; // negativ = im Uhrzeigersinn
              pts.push([q0.c[0] + rr * Math.cos(a), q0.c[1] + rr * Math.sin(a)]);
            }
            go(pts, d, op.label, op.tool, i);
          }
        } else {
          const outer = sampleLoop(op.segs);
          const isl = op.islands.map(sampleLoop);
          const pm = pocketMoves(outer, isl, d / 2, cfg.pocketOverlap);
          for (const row of pm.rows) go(row, d, op.label, op.tool, i);
          for (const f of pm.finish) go(f, d, op.label, op.tool, i);
        }
      } else if (op.kind === 'slot') {
        const b = info(op.tool).blade || 4;
        const dir = [op.b[0] - op.a[0], op.b[1] - op.a[1]];
        const l = Math.hypot(dir[0], dir[1]) || 1;
        const n = [-dir[1] / l, dir[0] / l]; // links der Fahrtrichtung
        const off1 = b / 2;
        const off2 = op.width - b / 2;
        go([[op.a[0] + n[0] * off1, op.a[1] + n[1] * off1], [op.b[0] + n[0] * off1, op.b[1] + n[1] * off1]], b, op.label, op.tool, i);
        go([[op.b[0] + n[0] * off2, op.b[1] + n[1] * off2], [op.a[0] + n[0] * off2, op.a[1] + n[1] * off2]], b, op.label, op.tool, i);
      } else if (op.kind === 'chamfer') {
        const pts = op.segs ? samplePoly(op.start, op.segs) : [op.a, op.b];
        go(pts, Math.max(op.width, 1) * 2, op.label, op.tool, i);
      } else if (op.kind === 'slant') {
        go([op.a, op.b], info(op.tool).d || 10, op.label, op.tool, i);
      } else if (op.kind === 'drill') {
        const pat = op.pattern;
        const d = op.d;
        const label = 'Bohrung Ø' + Math.round(d.d * 100) / 100;
        for (let r = 0; r < pat.nY; r++) for (let c = 0; c < pat.nX; c++) {
          const lx = d.x + c * pat.dX;
          const ly = d.y + r * pat.dY;
          if (op.plane) go([[lx, ly]], d.d, label + ' auf Schräge', 'Bohrer', i);
          else if (op.face === 'Top') go([[lx, ly]], d.d, label + ' oben', 'Bohrer', i);
          else {
            // lokale Kantenkoordinate → Draufsicht
            let a;
            let b;
            if (op.face === 'Left') { const y = p.W - lx; a = [0, y]; b = [d.depth, y]; }
            if (op.face === 'Right') { const y = lx; a = [p.L, y]; b = [p.L - d.depth, y]; }
            if (op.face === 'Front') { const x = lx; a = [x, 0]; b = [x, d.depth]; }
            if (op.face === 'Back') { const x = p.L - lx; a = [x, p.W]; b = [x, p.W - d.depth]; }
            go([a, b, a], d.d, label + ' Kante', 'Bohrer', i);
          }
        }
      } else if (op.kind === 'sdrill') {
        const e = op.entry;
        const a = op.angleA * Math.PI / 180;
        const b = op.angleB * Math.PI / 180;
        const h = Math.sin(b) * op.depth; // waagerechter Anteil der Bohrung
        const end = [e[0] - Math.cos(a) * h, e[1] - Math.sin(a) * h];
        const dir3 = [-Math.cos(a) * Math.sin(b), -Math.sin(a) * Math.sin(b), -Math.cos(b)];
        const e3 = [e[0], e[1], e[2]];
        const end3 = plus(e3, dir3, op.depth);
        meta.ax3 = [-dir3[0], -dir3[1], -dir3[2]];
        meta.back = 10;
        go([[e[0], e[1]], end, [e[0], e[1]]], op.d, 'Schräge Bohrung Ø' + Math.round(op.d * 100) / 100, 'Bohrer', i, [e3, end3, e3]);
      }
    });
    mapPt = null;
    moves.push({ type: 'rapid', pts: [pos, [-60, -60]], d: 0, label: 'Parkposition', tool: '', op: -1, z: 0, kind: 'mill', group: '',
      ax3: UP, pts3: [pos3, plus(pos3, lastAx, lastBack), [-60, -60, p.T + 60]] });
    return moves;
  }

  return { build: build, samplePoly: samplePoly, offsetPath: offsetPath };
});
