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
    const step = Math.max(0.5, 2 * r * (1 - (overlap || 50) / 100));
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

  function build(result, toolInfo, cfg) {
    const p = result.panel;
    const ops = result.ops;
    cfg = cfg || {};
    const info = (name) => (toolInfo && toolInfo[name]) || {};
    const moves = [];
    let pos = [-60, -60];
    const go = (pts, d, label, tool, opIndex) => {
      if (!pts.length) return;
      if (Math.hypot(pos[0] - pts[0][0], pos[1] - pts[0][1]) > 1e-6) {
        moves.push({ type: 'rapid', pts: [pos, pts[0]], d: d, label: label, tool: tool, op: opIndex });
      }
      if (pts.length === 1) moves.push({ type: 'plunge', pts: [pts[0]], d: d, label: label, tool: tool, op: opIndex });
      else moves.push({ type: 'cut', pts: pts, d: d, label: label, tool: tool, op: opIndex });
      pos = pts[pts.length - 1];
    };

    ops.forEach((op, i) => {
      if (op.kind === 'contour') {
        const d = info(op.tool).d || 10;
        go(offsetPath(samplePoly(op.start, op.segs), d / 2, op.side), d, op.label, op.tool, i);
      } else if (op.kind === 'pocket') {
        const d = info(op.tool).d || 10;
        const outer = sampleLoop(op.segs);
        const isl = op.islands.map(sampleLoop);
        const pm = pocketMoves(outer, isl, d / 2, cfg.pocketOverlap);
        for (const row of pm.rows) go(row, d, op.label, op.tool, i);
        for (const f of pm.finish) go(f, d, op.label, op.tool, i);
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
        go([op.a, op.b], Math.max(op.width, 1) * 2, op.label, op.tool, i);
      } else if (op.kind === 'slant') {
        go([op.a, op.b], info(op.tool).d || 10, op.label, op.tool, i);
      } else if (op.kind === 'drill') {
        const pat = op.pattern;
        const d = op.d;
        const label = 'Bohrung Ø' + Math.round(d.d * 100) / 100;
        for (let r = 0; r < pat.nY; r++) for (let c = 0; c < pat.nX; c++) {
          const lx = d.x + c * pat.dX;
          const ly = d.y + r * pat.dY;
          if (op.face === 'Top') go([[lx, ly]], d.d, label + ' oben', 'Bohrer', i);
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
        go([[e[0], e[1]], end, [e[0], e[1]]], op.d, 'Schräge Bohrung Ø' + Math.round(op.d * 100) / 100, 'Bohrer', i);
      }
    });
    moves.push({ type: 'rapid', pts: [pos, [-60, -60]], d: 0, label: 'Parkposition', tool: '', op: -1 });
    return moves;
  }

  return { build: build, samplePoly: samplePoly, offsetPath: offsetPath };
});
