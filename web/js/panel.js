/*
 * Plattenerkennung: aus einem STEP-Volumenkörper (StepReader) die
 * Plattenmaße und 2,5D-Bearbeitungen ableiten.
 *
 * Koordinaten wie in Maestro/Xilog: Ursprung vorne links unten,
 * X = Länge, Y = Breite, Z = Dicke (Oberseite = Bearbeitungsseite).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PanelAnalyzer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TOL = 0.01;      // mm
  const ATOL = 1e-6;     // Richtungen
  const TWO_PI = Math.PI * 2;

  // ---------------------------------------------------------------- Vektoren
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a); return l > 0 ? mul(a, 1 / l) : a; };
  const near = (a, b, t) => Math.abs(a - b) <= (t === undefined ? TOL : t);
  // Minimum/Maximum ohne Spread (große Teile mit vielen Punkten sprengen sonst den Aufrufstapel)
  const minOf = (a) => { let m = Infinity; for (const v of a) if (v < m) m = v; return m; };
  const maxOf = (a) => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };
  const EDGE_R_MAX = 5.5; // Rundungen bis zu diesem Radius an Kanten: Radiusfräser statt Kugelfräser
  const near2 = (p, q, t) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= (t === undefined ? 0.05 : t);

  // ---------------------------------------------------------------- Kanten abtasten (Weltkoordinaten)

  // Abschnitt einer abgetasteten Kurve (B-Spline) zwischen den Eckpunkten der Kante
  function sampleSpline(edge) {
    const s = edge.curve.samples;
    const nearest = (p) => { let bi = 0; let bd = Infinity; s.forEach((q, i) => { const d = len(sub(q, p)); if (d < bd) { bd = d; bi = i; } }); return bi; };
    const fwd = edge.forward !== !!edge.curve.reversed;
    let i0 = nearest(edge.start);
    let i1 = nearest(edge.end);
    const closed = len(sub(edge.start, edge.end)) < 1e-6;
    let pts;
    if (closed) pts = s.slice();
    else if (fwd ? i1 >= i0 : i0 >= i1) pts = fwd ? s.slice(i0, i1 + 1) : s.slice(i1, i0 + 1).reverse();
    else pts = fwd ? s.slice(i0).concat(s.slice(1, i1 + 1)) : s.slice(0, i0 + 1).reverse().concat(s.slice(i1).reverse().slice(1));
    if (closed && !fwd) pts.reverse();
    pts = pts.slice(1, -1);
    return [edge.start].concat(pts, [edge.end]);
  }

  function sampleEdge(edge) {
    const c = edge.curve;
    if (c.type === 'bspline') return sampleSpline(edge);
    if (c.type !== 'circle' && c.type !== 'ellipse') return [edge.start, edge.end];
    const r1 = c.type === 'ellipse' ? c.r1 : c.r;
    const r2 = c.type === 'ellipse' ? c.r2 : c.r;
    const ang = (p) => { const d = sub(p, c.ax.o); return Math.atan2(dot(d, c.ax.y) / r2, dot(d, c.ax.x) / r1); };
    const a0 = ang(edge.start);
    const a1 = ang(edge.end);
    const closed = len(sub(edge.start, edge.end)) < 1e-6;
    let sweep;
    const fwdC = edge.forward !== !!c.reversed;
    if (fwdC) {
      sweep = closed ? TWO_PI : ((a1 - a0) % TWO_PI + TWO_PI) % TWO_PI;
    } else {
      sweep = closed ? -TWO_PI : -(((a0 - a1) % TWO_PI + TWO_PI) % TWO_PI);
    }
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n;
      pts.push(add(c.ax.o, add(mul(c.ax.x, r1 * Math.cos(a)), mul(c.ax.y, r2 * Math.sin(a)))));
    }
    return pts;
  }

  // ---------------------------------------------------------------- Vorbereitung

  function faceNormal(face) {
    return mul(face.surface.ax.z, face.same ? 1 : -1);
  }

  function polyArea2D(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function planeFaceArea(face) {
    const ax = face.surface.ax;
    let area = 0;
    for (const b of face.bounds) {
      const pts = [];
      for (const e of b.edges) {
        for (const p of e.samples.slice(0, -1)) {
          const d = sub(p, ax.o);
          pts.push([dot(d, ax.x), dot(d, ax.y)]);
        }
      }
      const a = Math.abs(polyArea2D(pts));
      area += b.outer ? a : -a;
    }
    return Math.abs(area);
  }

  function prepare(solid) {
    const warnings = [];
    for (const f of solid.faces) {
      for (const b of f.bounds) for (const e of b.edges) e.samples = sampleEdge(e);
      // Falls kein FACE_OUTER_BOUND markiert ist: größten Loop als außen annehmen
      if (f.bounds.length && !f.bounds.some((b) => b.outer)) {
        const size = (b) => {
          const lo = [Infinity, Infinity, Infinity];
          const hi = [-Infinity, -Infinity, -Infinity];
          for (const e of b.edges) for (const p of e.samples) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
          return len(sub(hi, lo));
        };
        f.bounds.reduce((x, y) => (size(y) > size(x) ? y : x)).outer = true;
      }
    }

    // Größte ebene Fläche bestimmt die Plattennormale
    let best = null;
    let bestArea = -1;
    for (const f of solid.faces) {
      if (f.surface.type !== 'plane') continue;
      const a = planeFaceArea(f);
      if (a > bestArea) { bestArea = a; best = f; }
    }
    if (!best) throw new Error('Keine ebene Fläche gefunden – kein Plattenteil?');
    const Z = unit(faceNormal(best));

    // X = Richtung der längsten geraden Kante dieser Fläche
    let X = null;
    let bestLen = -1;
    for (const b of best.bounds) {
      for (const e of b.edges) {
        if (e.curve.type !== 'line') continue;
        const d = sub(e.end, e.start);
        const l = len(d);
        if (l > bestLen && Math.abs(dot(unit(d), Z)) < ATOL) { bestLen = l; X = unit(d); }
      }
    }
    if (!X) X = best.surface.ax.x;
    X = unit(sub(X, mul(Z, dot(X, Z))));
    const Y = cross(Z, X);

    const m = [X, Y, Z];
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const f of solid.faces) for (const b of f.bounds) for (const e of b.edges) for (const p of e.samples) {
      for (let i = 0; i < 3; i++) {
        const v = dot(m[i], p);
        if (v < lo[i]) lo[i] = v;
        if (v > hi[i]) hi[i] = v;
      }
    }
    const base = { m: m, t: [-lo[0], -lo[1], -lo[2]] };
    const dims = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    return { solid: solid, base: base, dims: dims, warnings: warnings };
  }

  // ---------------------------------------------------------------- Transformation in Plattenkoordinaten

  function compose(outer, inner) {
    // Ergebnis: p -> outer(inner(p))
    const m = [0, 1, 2].map((i) => [0, 1, 2].map((j) =>
      outer.m[i][0] * inner.m[0][j] + outer.m[i][1] * inner.m[1][j] + outer.m[i][2] * inner.m[2][j]));
    const t = [0, 1, 2].map((i) => dot(outer.m[i], inner.t) + outer.t[i]);
    return { m: m, t: t };
  }

  function frame(prep, rot, flip) {
    let tf = prep.base;
    let [L, W, T] = prep.dims;
    if (flip) {
      // Platte um die X-Achse wenden
      tf = compose({ m: [[1, 0, 0], [0, -1, 0], [0, 0, -1]], t: [0, W, T] }, tf);
    }
    for (let i = 0; i < ((rot % 4) + 4) % 4; i++) {
      // 90° gegen den Uhrzeigersinn um Z
      tf = compose({ m: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], t: [W, 0, 0] }, tf);
      [L, W] = [W, L];
    }
    return { tf: tf, L: L, W: W, T: T };
  }

  const P = (tf, p) => [dot(tf.m[0], p) + tf.t[0], dot(tf.m[1], p) + tf.t[1], dot(tf.m[2], p) + tf.t[2]];
  const D = (tf, d) => [dot(tf.m[0], d), dot(tf.m[1], d), dot(tf.m[2], d)];

  function transformSolid(prep, fr) {
    const tf = fr.tf;
    return prep.solid.faces.map((f) => {
      const s = f.surface;
      let surf;
      if (s.type === 'plane') {
        surf = { type: 'plane', n: unit(D(tf, faceNormal(f))), p: P(tf, s.ax.o) };
      } else if (s.type === 'cylinder') {
        surf = { type: 'cylinder', a: unit(D(tf, s.ax.z)), o: P(tf, s.ax.o), r: s.r, concave: !f.same };
      } else if (s.type === 'cone') {
        surf = { type: 'cone', a: unit(D(tf, s.ax.z)), o: P(tf, s.ax.o), concave: !f.same };
      } else {
        surf = { type: s.type, name: s.name };
      }
      const bounds = f.bounds.map((b) => ({
        outer: b.outer,
        edges: b.edges.map((e) => {
          const c = e.curve;
          let curve = { type: c.type };
          if (c.type === 'circle') {
            curve = { type: 'circle', c: P(tf, c.ax.o), a: unit(D(tf, c.ax.z)), r: c.r };
          }
          return {
            start: P(tf, e.start),
            end: P(tf, e.end),
            forward: e.forward,
            curve: curve,
            samples: e.samples.map((p) => P(tf, p)),
          };
        }),
      }));
      const pts = [];
      for (const b of bounds) for (const e of b.edges) for (const p of e.samples) pts.push(p);
      return { id: f.id, surf: surf, bounds: bounds, pts: pts };
    });
  }

  // ---------------------------------------------------------------- 2D-Segmente

  function seg2DFromEdge(e) {
    const a = [e.start[0], e.start[1]];
    const b = [e.end[0], e.end[1]];
    if (e.curve.type === 'circle' && Math.abs(Math.abs(e.curve.a[2]) - 1) < ATOL) {
      const ccw = (e.curve.a[2] > 0) === e.forward;
      return { type: 'arc', a: a, b: b, c: [e.curve.c[0], e.curve.c[1]], r: e.curve.r, ccw: ccw,
        full: near2(a, b, 1e-6) };
    }
    return { type: 'line', a: a, b: b };
  }

  function reverseSeg(s) {
    return s.type === 'arc'
      ? { type: 'arc', a: s.b, b: s.a, c: s.c, r: s.r, ccw: !s.ccw, full: s.full }
      : { type: 'line', a: s.b, b: s.a };
  }

  function arcSweep(s) {
    const a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
    const a1 = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]);
    if (s.full) return s.ccw ? TWO_PI : -TWO_PI;
    let d = a1 - a0;
    if (s.ccw) { while (d <= 0) d += TWO_PI; } else { while (d >= 0) d -= TWO_PI; }
    return d;
  }

  function segPoints(s) {
    if (s.type !== 'arc') return [s.a];
    const a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
    const sw = arcSweep(s);
    const n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 36)));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (sw * i) / n;
      pts.push([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]);
    }
    return pts;
  }

  function loopArea(segs) {
    const pts = [];
    for (const s of segs) for (const p of segPoints(s)) pts.push(p);
    return polyArea2D(pts);
  }

  function loopBBox(segs) {
    const lo = [Infinity, Infinity];
    const hi = [-Infinity, -Infinity];
    for (const s of segs) for (const p of segPoints(s).concat([s.b])) {
      lo[0] = Math.min(lo[0], p[0]); lo[1] = Math.min(lo[1], p[1]);
      hi[0] = Math.max(hi[0], p[0]); hi[1] = Math.max(hi[1], p[1]);
    }
    return { x0: lo[0], y0: lo[1], x1: hi[0], y1: hi[1] };
  }

  // Verbindet Segmente (Material links) zu geschlossenen Konturen.
  function chainLoops(segs) {
    const rest = segs.slice();
    const loops = [];
    const chains = [];
    while (rest.length) {
      const loop = [rest.shift()];
      for (;;) {
        const end = loop[loop.length - 1].b;
        if (near2(end, loop[0].a)) break;
        const i = rest.findIndex((s) => near2(s.a, end));
        if (i < 0) break;
        loop.push(rest.splice(i, 1)[0]);
      }
      if (near2(loop[loop.length - 1].b, loop[0].a)) loops.push(mergeCollinear(loop));
      else chains.push(loop);
    }
    // offene Ketten auch rückwärts verlängern (Anfang suchen)
    for (const c of chains) {
      if (!c.length) continue;
      for (;;) {
        const i = chains.findIndex((d) => d !== c && d.length && near2(d[d.length - 1].b, c[0].a));
        if (i < 0) break;
        c.unshift(...chains[i].splice(0));
      }
    }
    return { loops: loops, chains: chains.filter((c) => c.length) };
  }

  function mergeCollinear(loop) {
    const out = [];
    for (const s of loop) {
      const prev = out[out.length - 1];
      if (prev && prev.type === 'line' && s.type === 'line') {
        const d1 = [prev.b[0] - prev.a[0], prev.b[1] - prev.a[1]];
        const d2 = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
        const crs = d1[0] * d2[1] - d1[1] * d2[0];
        if (Math.abs(crs) < 1e-6 * Math.hypot(...d1) * Math.hypot(...d2) && d1[0] * d2[0] + d1[1] * d2[1] > 0) {
          out[out.length - 1] = Object.assign({}, prev, { type: 'line', a: prev.a, b: s.b, inclined: !!(prev.inclined && s.inclined) });
          continue;
        }
      }
      out.push(s);
    }
    // erstes und letztes Segment zusammenführen
    if (out.length > 2) {
      const f = out[0];
      const l = out[out.length - 1];
      if (f.type === 'line' && l.type === 'line') {
        const d1 = [l.b[0] - l.a[0], l.b[1] - l.a[1]];
        const d2 = [f.b[0] - f.a[0], f.b[1] - f.a[1]];
        const crs = d1[0] * d2[1] - d1[1] * d2[0];
        if (Math.abs(crs) < 1e-6 * Math.hypot(...d1) * Math.hypot(...d2) && d1[0] * d2[0] + d1[1] * d2[1] > 0) {
          out.pop();
          out[0] = Object.assign({}, l, { type: 'line', a: l.a, b: f.b, inclined: !!(l.inclined && f.inclined) });
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- Merkmale

  function angularCoverage(face, a, center) {
    // Winkelabdeckung einer Zylinderfläche um die Achse a
    for (const b of face.bounds) for (const e of b.edges) {
      if (/^(circle|ellipse|bspline)$/.test(e.curve.type) && len(sub(e.start, e.end)) < 1e-6) return TWO_PI;
    }
    const u = unit(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    const v = cross(a, u);
    const angs = face.pts.map((p) => {
      const d = sub(p, center);
      return Math.atan2(dot(d, v), dot(d, u));
    }).sort((x, y) => x - y);
    let maxGap = TWO_PI - (angs[angs.length - 1] - angs[0]);
    let gapStart = angs[angs.length - 1];
    for (let i = 1; i < angs.length; i++) {
      const g = angs[i] - angs[i - 1];
      if (g > maxGap) { maxGap = g; gapStart = angs[i - 1]; }
    }
    return { span: TWO_PI - maxGap, start: gapStart + maxGap, u: u, v: v };
  }

  function canonicalAxis(a) {
    let k = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(a[i]) > Math.abs(a[k])) k = i;
    return a[k] < 0 ? mul(a, -1) : a;
  }

  function findHoles(faces) {
    const groups = [];
    for (const f of faces) {
      if (f.surf.type !== 'cylinder' || !f.surf.concave) continue;
      const a = canonicalAxis(f.surf.a);
      const o = f.surf.o;
      const c = sub(o, mul(a, dot(o, a)));
      const cov = angularCoverage(f, a, o);
      const span = typeof cov === 'number' ? cov : cov.span;
      const ts = f.pts.map((p) => dot(p, a));
      const t0 = minOf(ts);
      const t1 = maxOf(ts);
      // gleiche Achse, gleicher Radius und überlappender Bereich entlang der Achse
      let g = groups.find((g) => Math.abs(dot(g.a, a)) > 1 - ATOL && len(sub(g.c, c)) < TOL && near(g.r, f.surf.r) &&
        t0 <= g.t1 + TOL && t1 >= g.t0 - TOL);
      if (!g) { g = { a: a, c: c, r: f.surf.r, span: 0, faces: [], t0: t0, t1: t1 }; groups.push(g); }
      g.span += span;
      g.t0 = Math.min(g.t0, t0);
      g.t1 = Math.max(g.t1, t1);
      g.faces.push(f);
    }
    const holes = [];
    const holeFaceIds = new Set();
    for (const g of groups) {
      if (g.span < TWO_PI - 0.05) continue;
      let tmin = Infinity;
      let tmax = -Infinity;
      for (const f of g.faces) for (const p of f.pts) {
        const t = dot(p, g.a);
        tmin = Math.min(tmin, t); tmax = Math.max(tmax, t);
      }
      g.faces.forEach((f) => holeFaceIds.add(f.id));
      holes.push({ axis: g.a, c: g.c, d: 2 * g.r, tmin: tmin, tmax: tmax, ids: g.faces.map((f) => f.id) });
    }
    return { holes: holes, holeFaceIds: holeFaceIds };
  }

  function wallSegment(f) {
    const zs = f.pts.map((p) => p[2]);
    const zmin = minOf(zs);
    const zmax = maxOf(zs);
    if (f.surf.type === 'plane') {
      const n = f.surf.n;
      if (Math.abs(n[2]) > ATOL) return null;
      const d = [-n[1], n[0]];
      const s = f.surf.p[0] * n[0] + f.surf.p[1] * n[1];
      let tmin = Infinity;
      let tmax = -Infinity;
      for (const p of f.pts) {
        const t = p[0] * d[0] + p[1] * d[1];
        tmin = Math.min(tmin, t); tmax = Math.max(tmax, t);
      }
      const at = (t) => [d[0] * t + n[0] * s, d[1] * t + n[1] * s];
      if (tmax - tmin < TOL) return null;
      return { zmin: zmin, zmax: zmax, seg: { type: 'line', a: at(tmin), b: at(tmax) } };
    }
    if (f.surf.type === 'cylinder') {
      const a = f.surf.a;
      if (Math.abs(Math.abs(a[2]) - 1) > ATOL) return null;
      const c = [f.surf.o[0], f.surf.o[1]];
      const r = f.surf.r;
      const angs = f.pts.map((p) => Math.atan2(p[1] - c[1], p[0] - c[0])).sort((x, y) => x - y);
      let maxGap = TWO_PI - (angs[angs.length - 1] - angs[0]);
      let gapEnd = angs[0];
      for (let i = 1; i < angs.length; i++) {
        const g = angs[i] - angs[i - 1];
        if (g > maxGap) { maxGap = g; gapEnd = angs[i]; }
      }
      const s0 = gapEnd;
      const s1 = gapEnd + (TWO_PI - maxGap);
      const pa = [c[0] + r * Math.cos(s0), c[1] + r * Math.sin(s0)];
      const pb = [c[0] + r * Math.cos(s1), c[1] + r * Math.sin(s1)];
      // ganzer Kreis: geschlossene Kreiskante (die Abtastung lässt sonst eine kleine Lücke)
      const closedEdge = f.bounds.some((b) => b.edges.some((e) => e.curve.type === 'circle' && len(sub(e.start, e.end)) < 1e-6));
      const full = closedEdge || maxGap < 1e-6;
      const seg = full
        ? { type: 'arc', a: [c[0] + r, c[1]], b: [c[0] + r, c[1]], c: c, r: r, ccw: true, full: true }
        : { type: 'arc', a: pa, b: pb, c: c, r: r, ccw: true, full: false };
      return { zmin: zmin, zmax: zmax, seg: f.surf.concave ? reverseSeg(seg) : seg };
    }
    return null;
  }

  function isRectLoop(segs, bb) {
    if (!segs.every((s) => s.type === 'line')) return false;
    const area = Math.abs(loopArea(segs));
    return near(area, (bb.x1 - bb.x0) * (bb.y1 - bb.y0), 0.01 * Math.max(1, area / 1000)) && segs.length === 4;
  }

  function pointInPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  // Kontur in gewünschte Umlaufrichtung bringen (ccw = gegen den Uhrzeigersinn)
  function orient(segs, ccw) {
    const a = loopArea(segs);
    if ((a > 0) === ccw) return segs;
    return segs.slice().reverse().map(reverseSeg);
  }

  // Kleinster Eckenradius einer Tasche (Bögen gegen den Uhrzeigersinn bei Umlauf gegen den Uhrzeigersinn)
  function minConcaveRadius(segs) {
    let r = Infinity;
    for (const s of segs) if (s.type === 'arc' && s.ccw) r = Math.min(r, s.r);
    return r;
  }

  function openSides(bb, L, W) {
    const o = [];
    if (bb.x0 < TOL) o.push('links');
    if (bb.x1 > L - TOL) o.push('rechts');
    if (bb.y0 < TOL) o.push('vorne');
    if (bb.y1 > W - TOL) o.push('hinten');
    return o;
  }

  // Schnitt einer schrägen ebenen Fläche mit der Ebene Z = zs als 2D-Strecke (Material links).
  function inclinedSection(f, zs) {
    const n = f.surf.n;
    const h = Math.hypot(n[0], n[1]);
    if (h < ATOL) return null;
    const d = [-n[1] / h, n[0] / h];
    const pts = [];
    for (const b of f.bounds) for (const e of b.edges) {
      const sm = e.samples;
      for (let i = 0; i + 1 < sm.length; i++) {
        const p = sm[i];
        const q = sm[i + 1];
        if ((p[2] - zs) * (q[2] - zs) > 0) continue;
        if (Math.abs(q[2] - p[2]) < 1e-9) { pts.push(p, q); continue; }
        const t = (zs - p[2]) / (q[2] - p[2]);
        pts.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    if (pts.length < 2) return null;
    let lo = null;
    let hi = null;
    for (const p of pts) {
      const t = p[0] * d[0] + p[1] * d[1];
      if (!lo || t < lo.t) lo = { t: t, p: p };
      if (!hi || t > hi.t) hi = { t: t, p: p };
    }
    if (hi.t - lo.t < TOL) return null;
    return { type: 'line', a: [lo.p[0], lo.p[1]], b: [hi.p[0], hi.p[1]], inclined: Math.abs(n[2]) > ATOL,
      faceId: f.id, tilt: (Math.asin(Math.min(1, Math.abs(n[2]))) * 180) / Math.PI, up: n[2] > 0 };
  }

  // Kegel mit senkrechter Achse über die ganze Dicke (Schräge an einer Rundung): Schnitt auf Höhe zs als Kreisbogen
  function coneSection(f, zs) {
    const a = f.surf.a;
    if (Math.abs(Math.abs(a[2]) - 1) > ATOL) return null;
    const c = [f.surf.o[0], f.surf.o[1]];
    const zs0 = f.pts.map((q) => q[2]);
    const zmin = minOf(zs0);
    const zmax = maxOf(zs0);
    if (zmax - zmin < TOL) return null;
    const rAt = (z) => {
      const near = f.pts.filter((q) => Math.abs(q[2] - z) < 1e-3);
      return near.reduce((s2, q) => s2 + Math.hypot(q[0] - c[0], q[1] - c[1]), 0) / Math.max(1, near.length);
    };
    const rLow = rAt(zmin);
    const rHigh = rAt(zmax);
    const r = rLow + ((rHigh - rLow) * (zs - zmin)) / (zmax - zmin);
    const angs = f.pts.map((q) => Math.atan2(q[1] - c[1], q[0] - c[0])).sort((x, y) => x - y);
    let maxGap = TWO_PI - (angs[angs.length - 1] - angs[0]);
    let gapEnd = angs[0];
    for (let i = 1; i < angs.length; i++) {
      const g = angs[i] - angs[i - 1];
      if (g > maxGap) { maxGap = g; gapEnd = angs[i]; }
    }
    const full = f.bounds.some((b) => b.edges.some((e) => e.curve.type === 'circle' && len(sub(e.start, e.end)) < 1e-6));
    const s0 = gapEnd;
    const s1 = gapEnd + (TWO_PI - maxGap);
    let seg = full
      ? { type: 'arc', a: [c[0] + r, c[1]], b: [c[0] + r, c[1]], c: c, r: r, ccw: true, full: true }
      : { type: 'arc', a: [c[0] + r * Math.cos(s0), c[1] + r * Math.sin(s0)], b: [c[0] + r * Math.cos(s1), c[1] + r * Math.sin(s1)], c: c, r: r, ccw: true, full: false };
    if (f.surf.concave) seg = reverseSeg(seg);
    seg.inclined = true;
    seg.cone = true;
    seg.faceId = f.id;
    seg.tilt = (Math.atan(Math.abs(rHigh - rLow) / (zmax - zmin)) * 180) / Math.PI;
    seg.up = f.surf.concave ? rHigh > rLow : rHigh < rLow;
    return seg;
  }

  // Obere und untere Kante einer schrägen Fläche, Neigung und Bahnrichtung (Abfall rechts).
  function inclinedEdges(f) {
    const zs = f.pts.map((q) => q[2]);
    const zmin = minOf(zs);
    const zmax = maxOf(zs);
    const top = inclinedSection(f, zmax - 1e-6);
    const bottom = inclinedSection(f, zmin + 1e-6);
    if (!top || !bottom) return null;
    const n = f.surf.n;
    const h = Math.hypot(n[0], n[1]);
    const u = [n[0] / h, n[1] / h]; // waagerecht nach außen (Abfallseite)
    // Abstand unten gegenüber oben, positiv = untere Kante liegt weiter außen
    const offset = (bottom.a[0] - top.a[0]) * u[0] + (bottom.a[1] - top.a[1]) * u[1];
    const dir = [-u[1], u[0]]; // Bahnrichtung mit Abfall rechts
    const line = (seg) => {
      const ta = seg.a[0] * dir[0] + seg.a[1] * dir[1];
      const tb = seg.b[0] * dir[0] + seg.b[1] * dir[1];
      return ta <= tb ? { a: seg.a, b: seg.b } : { a: seg.b, b: seg.a };
    };
    const angle = Math.atan2(Math.abs(offset), zmax - zmin) * 180 / Math.PI;
    return { zmin: zmin, zmax: zmax, top: line(top), bottom: line(bottom), topLine: line(top), bottomLine: line(bottom),
      offset: offset, angle: angle, path: dir };
  }

  // Schräge Bohrung: Eintrittspunkt auf einer Plattenfläche, Bohrrichtung und Tiefe.
  function slantedHole(h, L, W, T) {
    const a = h.axis;
    const c = h.c;
    const r = h.d / 2;
    const hits = [];
    const lims = [[0, 0], [0, L], [1, 0], [1, W], [2, 0], [2, T]];
    for (const [i, v] of lims) {
      if (Math.abs(a[i]) < ATOL) continue;
      const t = (v - c[i]) / a[i];
      const p = [c[0] + t * a[0], c[1] + t * a[1], c[2] + t * a[2]];
      if (p[0] < -TOL || p[0] > L + TOL || p[1] < -TOL || p[1] > W + TOL || p[2] < -TOL || p[2] > T + TOL) continue;
      if (t < h.tmin - r - TOL || t > h.tmax + r + TOL) continue;
      if (!hits.some((q) => near(q.t, t))) hits.push({ t: t, p: p });
    }
    if (!hits.length) return null;
    let entry;
    let far;
    let through = false;
    if (hits.length >= 2) {
      hits.sort((x, y) => y.p[2] - x.p[2]); // von oben eintreten
      entry = hits[0];
      far = hits[hits.length - 1].t;
      through = true;
    } else {
      entry = hits[0];
      far = Math.abs(h.tmax - entry.t) > Math.abs(h.tmin - entry.t) ? h.tmax : h.tmin;
    }
    const sgn = far > entry.t ? 1 : -1;
    return { entry: entry.p, dir: [a[0] * sgn, a[1] * sgn, a[2] * sgn], d: h.d, depth: Math.abs(far - entry.t), through: through };
  }

  // ---------------------------------------------------------------- Taschen in den Kanten (Stirn-/Längsseiten)

  // Bearbeitungsebene einer Kante als eigenes Koordinatensystem: lokales X waagerecht, Y = Plattendicke,
  // Z aus der Kante heraus (wie bei den Kantenbohrungen). T' = Abstand bis zur gegenüberliegenden Kante.
  function sideFrame(fr, face) {
    const { L, W, T } = fr;
    const S = {
      Right: { m: [[0, 1, 0], [0, 0, 1], [1, 0, 0]], t: [0, 0, 0], dims: [W, T, L] },
      Left: { m: [[0, -1, 0], [0, 0, 1], [-1, 0, 0]], t: [W, 0, L], dims: [W, T, L] },
      Front: { m: [[1, 0, 0], [0, 0, 1], [0, -1, 0]], t: [0, 0, W], dims: [L, T, W] },
      Back: { m: [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], t: [L, 0, 0], dims: [L, T, W] },
    }[face];
    return { tf: compose({ m: S.m, t: S.t }, fr.tf), L: S.dims[0], W: S.dims[1], T: S.dims[2] };
  }

  // Taschen in einem lokalen System (Kante oder schräge Ebene): Boden parallel zur Bearbeitungsebene z' = sf.T,
  // ringsum geschlossen. Liefert Taschen in lokalen Koordinaten und die beteiligten Flächen.
  function pocketsInFrame(faces, sf, claimed) {
    const out = [];
    const ids = new Set();
    for (const f of faces) {
      if (claimed.has(f.id) || f.surf.type !== 'plane' || f.surf.n[2] < 1 - ATOL) continue;
      const z = f.surf.p[2];
      if (z < TOL || z > sf.T - TOL) continue;
      const ob = f.bounds.find((b) => b.outer) || f.bounds[0];
      const segs = ob.edges.map(seg2DFromEdge);
      if (segs.every((q) => q.type === 'arc')) continue; // Bohrungsgrund
      const bb = loopBBox(segs);
      // ringsum geschlossen: nicht an Ober-/Unterseite oder Nachbarkanten offen (sonst Falz, Nut o. Ä.)
      if (bb.x0 < TOL || bb.y0 < TOL || bb.x1 > sf.L - TOL || bb.y1 > sf.W - TOL) continue;
      const inBox = (q) => q[0] > bb.x0 - TOL && q[0] < bb.x1 + TOL && q[1] > bb.y0 - TOL && q[1] < bb.y1 + TOL &&
        q[2] > z - TOL && q[2] < sf.T + TOL;
      const walls = faces.filter((g) => g !== f && !claimed.has(g.id) && g.pts.length && g.pts.every(inBox) &&
        !(g.surf.type === 'plane' && Math.abs(g.surf.n[2]) > ATOL));
      if (!walls.length || !walls.some((g) => g.pts.some((q) => q[2] > sf.T - TOL))) continue;
      const inner = f.bounds.filter((b) => b !== ob).map((b) => b.edges.map(seg2DFromEdge));
      const islands = inner.filter((lp) => !lp.every((q) => q.type === 'arc'));
      const outerLoop = orient(segs, true);
      out.push({ x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, depth: sf.T - z, segs: outerLoop,
        islands: islands.map((lp) => orient(lp, false)), minRadius: minConcaveRadius(outerLoop), holes: inner.length - islands.length });
      ids.add(f.id);
      for (const g of walls) ids.add(g.id);
    }
    return { pockets: out, faceIds: ids };
  }

  // Sucht Taschen, die von einer Kante aus senkrecht in die Platte gehen.
  function findSidePockets(prep, fr) {
    const out = [];
    const ids = new Set();
    for (const face of ['Left', 'Right', 'Front', 'Back']) {
      const sf = sideFrame(fr, face);
      const r = pocketsInFrame(transformSolid(prep, sf), sf, ids);
      for (const k of r.pockets) out.push(Object.assign({ face: face }, k));
      r.faceIds.forEach((id) => ids.add(id));
    }
    return { pockets: out, faceIds: ids };
  }

  // ---------------------------------------------------------------- Schräge Ebenen (z. B. nach Sägeschnitt)

  // Lokales System einer schrägen Ebene wie Maestro CreateWorkplane(name, X0, Y0, Z0, ZRotation, XRotation):
  // erst um Z drehen, dann um die neue X-Achse kippen. z' = Abstand über der Ebene + T (Materialstärke darunter).
  function slantFrame(fr, f, allPts) {
    const n = f.surf.n;
    const b = Math.acos(Math.max(-1, Math.min(1, n[2])));
    const a = Math.atan2(n[0], -n[1]);
    const X = [Math.cos(a), Math.sin(a), 0];
    const Y = cross(n, X);
    const p0 = f.surf.p;
    const lx = f.pts.map((q) => dot(sub(q, p0), X));
    const ly = f.pts.map((q) => dot(sub(q, p0), Y));
    const o = add(p0, add(mul(X, minOf(lx)), mul(Y, minOf(ly))));
    let T = 0;
    for (const q of allPts) T = Math.max(T, -dot(sub(q, o), n));
    const tf = compose({ m: [X, Y, n], t: [-dot(X, o), -dot(Y, o), -dot(n, o) + T] }, fr.tf);
    return { tf: tf, L: maxOf(lx) - minOf(lx), W: maxOf(ly) - minOf(ly), T: T,
      o: o, X: X, Y: Y, n: n, zRot: a * 180 / Math.PI, xRot: b * 180 / Math.PI };
  }

  // Taschen und Bohrungen senkrecht zu schrägen ebenen Flächen.
  function findSlantPlanes(prep, fr, faces, claimedIn) {
    const claimed = new Set(claimedIn);
    const planes = [];
    const allPts = [];
    for (const f of faces) for (const q of f.pts) allPts.push(q);
    const cands = faces.filter((f) => f.surf.type === 'plane' && Math.abs(f.surf.n[2]) > ATOL && Math.abs(f.surf.n[2]) < 1 - ATOL)
      .map((f) => {
        const n = f.surf.n;
        const u = unit(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0]));
        const v = cross(n, u);
        let area = 0;
        for (const bd of f.bounds) {
          const pts = [];
          for (const e of bd.edges) for (const q of e.samples.slice(0, -1)) pts.push([dot(q, u), dot(q, v)]);
          area += (bd.outer ? 1 : -1) * Math.abs(polyArea2D(pts));
        }
        return { f: f, area: Math.abs(area) };
      })
      .sort((x, y) => y.area - x.area);
    for (const { f } of cands) {
      if (claimed.has(f.id)) continue;
      const ob = f.bounds.find((b) => b.outer) || f.bounds[0];
      if (ob.edges.every((e) => e.curve.type === 'circle')) continue; // Bohrungsgrund
      const sf = slantFrame(fr, f, allPts);
      const lf = transformSolid(prep, sf);
      const pk = pocketsInFrame(lf, sf, claimed);
      const drills = [];
      const { holes } = findHoles(lf.filter((g) => !claimed.has(g.id) && !pk.faceIds.has(g.id)));
      for (const h of holes) {
        if (Math.abs(h.axis[2]) < 1 - ATOL) continue;
        const hf = lf.filter((g) => h.ids.includes(g.id));
        const zs = [];
        for (const g of hf) for (const q of g.pts) zs.push(q[2]);
        const zmax = maxOf(zs);
        const zmin = minOf(zs);
        const c = h.c;
        if (zmax < sf.T - TOL || sf.T - zmin < TOL || c[0] < -TOL || c[0] > sf.L + TOL || c[1] < -TOL || c[1] > sf.W + TOL) continue;
        drills.push({ x: c[0], y: c[1], d: h.d, depth: sf.T - zmin });
        h.ids.forEach((id) => pk.faceIds.add(id));
        // Bohrungsgrund (Kegel/Ebene innerhalb des Lochs) mitnehmen
        for (const g of lf) {
          if (g.pts.length && g.pts.every((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) < h.d / 2 + TOL && q[2] < sf.T + TOL)) pk.faceIds.add(g.id);
        }
      }
      if (!pk.pockets.length && !drills.length) continue;
      pk.faceIds.forEach((id) => claimed.add(id));
      claimed.add(f.id);
      planes.push({ o: sf.o, X: sf.X, Y: sf.Y, n: sf.n, zRot: sf.zRot, xRot: sf.xRot, L: sf.L, W: sf.W,
        up: sf.n[2] > 0, pockets: pk.pockets, drills: drills, faceIds: Array.from(pk.faceIds) });
    }
    return planes;
  }

  function extract(prep, fr) {
    const side = findSidePockets(prep, fr);
    const all = transformSolid(prep, fr);
    const slant = findSlantPlanes(prep, fr, all, side.faceIds);
    const skip = new Set(side.faceIds);
    for (const sp of slant) sp.faceIds.forEach((id) => skip.add(id));
    const faces = all.filter((f) => !skip.has(f.id));
    const L = fr.L;
    const W = fr.W;
    const T = fr.T;
    const warnings = prep.warnings.slice();
    const res = { L: L, W: W, T: T, outline: null, cutouts: [], drills: [], circles: [], grooves: [], rebates: [],
      pockets: [], sidePockets: side.pockets, slantPlanes: slant.filter((sp) => sp.up), chamfers: [], slantWalls: [], slantDrills: [], bottom: [], warnings: warnings };

    // Höhen der nach oben offenen Böden (Taschen, Nuten): Bohrungen dort beginnen „oben“
    const upFloors = faces.filter((f) => f.surf.type === 'plane' && f.surf.n[2] > 1 - ATOL &&
      f.surf.p[2] > TOL && f.surf.p[2] < T - TOL).map((f) => {
      const ob = f.bounds.find((b) => b.outer) || f.bounds[0];
      const poly = [];
      for (const q of ob.edges.map(seg2DFromEdge)) for (const pt of segPoints(q)) poly.push(pt);
      return { z: f.surf.p[2], poly: poly };
    });
    const onUpFloor = (x, y, z) => upFloors.some((fl) => near(fl.z, z) && pointInPoly([x, y], fl.poly));

    for (const sp of slant) {
      if (sp.up) continue;
      res.bottom.push({ kind: 'Ebene', text: 'Schräge Ebene nach unten mit ' + (sp.pockets.length + sp.drills.length) + ' Bearbeitung(en)' });
    }

    // --- Bohrungen
    const { holes, holeFaceIds } = findHoles(faces);
    for (const h of holes) {
      const a = h.axis;
      const d = h.d;
      if (Math.abs(a[2]) > 1 - ATOL) {
        const x = h.c[0];
        const y = h.c[1];
        const atBottom = h.tmin < TOL;
        // oben offen? Öffnung kann auch in einer Fase liegen (dann keine waagerechte Fläche darüber)
        const openAbove = () => !faces.some((f) => {
          if (f.surf.type !== 'plane' || Math.abs(Math.abs(f.surf.n[2]) - 1) > ATOL || f.surf.p[2] < h.tmax + TOL) return false;
          const poly = (b) => { const pts = []; for (const q of b.edges.map(seg2DFromEdge)) for (const t of segPoints(q)) pts.push(t); return pts; };
          const ob = f.bounds.find((b) => b.outer) || f.bounds[0];
          return pointInPoly([x, y], poly(ob)) && !f.bounds.filter((b) => b !== ob).some((b) => pointInPoly([x, y], poly(b)));
        });
        const atTop = h.tmax > T - TOL || onUpFloor(x, y, h.tmax) || (h.tmax > T / 2 && openAbove());
        if (atTop && atBottom) res.drills.push({ face: 'Top', x: x, y: y, d: d, depth: T, through: true });
        else if (atTop) res.drills.push({ face: 'Top', x: x, y: y, d: d, depth: T - h.tmin, through: false });
        else if (atBottom) res.bottom.push({ kind: 'Bohrung', text: 'Bohrung Ø' + fmt(d) + ' von unten bei X=' + fmt(x) + ' Y=' + fmt(y) + ' Tiefe ' + fmt(h.tmax) });
        else warnings.push('Innenliegende Bohrung Ø' + fmt(d) + ' ignoriert.');
      } else if (Math.abs(a[0]) > 1 - ATOL || Math.abs(a[1]) > 1 - ATOL) {
        const alongX = Math.abs(a[0]) > 1 - ATOL;
        const size = alongX ? L : W;
        const along = alongX ? h.c[1] : h.c[0];
        const z = h.c[2];
        const startLow = h.tmin < TOL;
        const startHigh = h.tmax > size - TOL;
        let face = null;
        let depth = 0;
        if (startLow && startHigh) {
          warnings.push('Horizontale Bohrung Ø' + fmt(d) + ' geht ganz durch – als Bohrung von ' + (alongX ? 'links' : 'vorne') + ' ausgegeben.');
        }
        if (startLow) { face = alongX ? 'Left' : 'Front'; depth = h.tmax; } else if (startHigh) { face = alongX ? 'Right' : 'Back'; depth = size - h.tmin; }
        if (!face) {
          warnings.push('Horizontale Bohrung Ø' + fmt(d) + ' beginnt nicht an einer Plattenkante – ignoriert.');
          continue;
        }
        res.drills.push({ face: face, along: along, z: z, d: d, depth: depth, through: false,
          x: alongX ? (face === 'Left' ? 0 : L) : along, y: alongX ? along : (face === 'Front' ? 0 : W) });
      } else {
        const sd = slantedHole(h, L, W, T);
        if (!sd) warnings.push('Schräge Bohrung Ø' + fmt(d) + ' beginnt nicht an einer Plattenfläche – ignoriert.');
        else if (sd.entry[2] < TOL && sd.dir[2] > 0) {
          res.bottom.push({ kind: 'Bohrung', text: 'Schräge Bohrung Ø' + fmt(d) + ' von unten bei X=' + fmt(sd.entry[0]) + ' Y=' + fmt(sd.entry[1]) });
        } else res.slantDrills.push(sd);
      }
    }

    // --- Außenkontur und Durchbrüche aus den senkrechten Wandflächen
    const walls = [];
    for (const f of faces) {
      if (holeFaceIds.has(f.id)) continue;
      const w = wallSegment(f);
      if (w) { w.f = f; walls.push(w); }
    }
    // Ebene Wände auf der jeweiligen Schnitthöhe auswerten (wichtig neben Fasen und Gehrungen)
    const wallAt = (w, zs) => (w.f.surf.type === 'plane' ? inclinedSection(w.f, zs) || w.seg : w.seg);
    const inclined = faces.filter((f) => f.surf.type === 'plane' && Math.abs(f.surf.n[2]) > ATOL &&
      Math.abs(f.surf.n[2]) < 1 - ATOL);
    // Kegel über die ganze Dicke (Schräge an Rundungen) gehören wie schräge Ebenen zur Kontur
    const fullCones = faces.filter((f) => {
      if (f.surf.type !== 'cone' || Math.abs(Math.abs(f.surf.a[2]) - 1) > ATOL) return false;
      const zs = f.pts.map((q) => q[2]);
      return minOf(zs) < TOL && maxOf(zs) > T - TOL;
    });
    const sectionsAt = (zs) => inclined.map((f) => inclinedSection(f, zs)).concat(fullCones.map((f) => coneSection(f, zs))).filter(Boolean);
    const delta = Math.min(0.001, T / 100);
    let outer = null;
    for (const zs of [delta, T / 2, T - delta]) {
      const { loops } = chainLoops(walls.filter((w) => w.zmin <= zs + TOL && w.zmax >= zs - TOL).map((w) => wallAt(w, zs))
        .concat(sectionsAt(zs)));
      for (const lp of loops) {
        const a = loopArea(lp);
        if (a > 0 && (!outer || a > outer.area + TOL)) outer = { segs: lp, area: a };
      }
    }
    if (!outer) {
      warnings.push('Außenkontur konnte nicht geschlossen werden – Rechteck L×B angenommen.');
      outer = { segs: rectLoop(L, W), area: L * W };
    }
    res.outline = outer.segs;
    // Auflagefläche unten (dort sitzen die Sauger): Außenkontur knapp über der Unterseite
    {
      const { loops } = chainLoops(walls.filter((w) => w.zmin <= delta + TOL && w.zmax >= delta - TOL).map((w) => wallAt(w, delta))
        .concat(sectionsAt(delta)));
      let base = null;
      for (const lp of loops) { const a = loopArea(lp); if (a > 0 && (!base || a > base.area)) base = { segs: lp, area: a }; }
      res.base = base ? base.segs : outer.segs;
    }
    // Abschnitte aus Fasen/Gehrungen gelten als Rechteckkante – sie werden separat bearbeitet
    const onSide = (q) => q.type === 'line' && [[0, 0], [0, L], [1, 0], [1, W]].some(([i, v]) =>
      Math.abs(q.a[i] - v) < TOL && Math.abs(q.b[i] - v) < TOL);
    res.outlineIsRect = isRectLoop(outer.segs, { x0: 0, y0: 0, x1: L, y1: W }) ||
      outer.segs.every((q) => onSide(q) || q.inclined);

    const fullInclined = inclined.filter((f) => {
      const zs = f.pts.map((q) => q[2]);
      return minOf(zs) < TOL && maxOf(zs) > T - TOL;
    });
    // Schräge über die ganze Dicke entlang einer Rundung (Kegel, ggf. mit anschließenden schrägen Ebenen):
    // Oberkante als Bahn für 5-Achs-Schrägfräsen (Läufe gleicher Neigung, mindestens ein Kegel)
    res.curvedSlants = [];
    if (fullCones.length) {
      const zt = T - delta;
      const fullIds = new Set(fullInclined.map((f) => f.id).concat(fullCones.map((f) => f.id)));
      const parts = walls.filter((w) => w.zmin <= zt + TOL && w.zmax >= zt - TOL).map((w) => wallAt(w, zt))
        .concat(sectionsAt(zt).filter((q) => fullIds.has(q.faceId)));
      const chained = chainLoops(parts);
      const sameRun = (q, r) => q && r && q.inclined && r.inclined && fullIds.has(q.faceId) && fullIds.has(r.faceId) &&
        Math.abs(q.tilt - r.tilt) < 0.2 && q.up === r.up;
      const runsOf = (lp, closed) => {
        const n = lp.length;
        const ok = (q) => q.inclined && fullIds.has(q.faceId) && q.tilt > 0.05;
        if (closed && lp.every((q) => ok(q) && sameRun(q, lp[0]))) return [{ segs: lp, closed: true }];
        let k0 = 0;
        if (closed) { k0 = lp.findIndex((q, i) => !ok(q) || !sameRun(q, lp[(i - 1 + n) % n])); if (k0 < 0) k0 = 0; }
        const out = [];
        let run = null;
        for (let j = 0; j < n; j++) {
          const q = lp[(k0 + j) % n];
          if (ok(q) && run && sameRun(run.segs[run.segs.length - 1], q)) { run.segs.push(q); continue; }
          if (run) out.push(run);
          run = ok(q) ? { segs: [q], closed: false } : null;
        }
        if (run) out.push(run);
        return out;
      };
      const loops = chained.loops.map((lp) => ({ lp: lp, closed: true })).concat(chained.chains.map((lp) => ({ lp: lp, closed: false })));
      for (const { lp, closed } of loops) {
        for (const run of runsOf(lp, closed)) {
          if (!run.segs.some((q) => q.cone)) continue; // nur gerade Schrägen: wie bisher (Säge / Schrägfräsen)
          res.curvedSlants.push({ segs: run.segs, closed: run.closed, tilt: run.segs[0].tilt, up: run.segs[0].up,
            inner: closed && loopArea(lp) < 0, faceIds: Array.from(new Set(run.segs.map((q) => q.faceId))) });
        }
      }
    }
    // Durchbrüche: Innenkonturen auf mehreren Höhen (auch mit Fase oder Falz am Rand). Ein Durchbruch ist es nur,
    // wenn über und unter der Öffnung keine waagerechte Fläche liegt (sonst Tasche von oben oder unten).
    const flats = faces.filter((f) => f.surf.type === 'plane' && Math.abs(Math.abs(f.surf.n[2]) - 1) < ATOL).map((f) => {
      const poly = (b) => { const pts = []; for (const q of b.edges.map(seg2DFromEdge)) for (const t of segPoints(q)) pts.push(t); return pts; };
      const ob = f.bounds.find((b) => b.outer) || f.bounds[0];
      return { outer: poly(ob), inner: f.bounds.filter((b) => b !== ob).map(poly) };
    });
    const covered = (pt) => flats.some((fl) => pointInPoly(pt, fl.outer) && !fl.inner.some((ip) => pointInPoly(pt, ip)));
    const insidePoint = (lp) => {
      const pts = [];
      for (const q of lp) for (const t of segPoints(q)) pts.push(t);
      const bb = loopBBox(lp);
      const cands = [[(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2]];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l < 1e-6) continue;
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const e = Math.min(0.2, l / 4);
        cands.push([m[0] - (b[1] - a[1]) / l * e, m[1] + (b[0] - a[0]) / l * e], [m[0] + (b[1] - a[1]) / l * e, m[1] - (b[0] - a[0]) / l * e]);
      }
      return cands.find((c) => pointInPoly(c, pts));
    };
    const cand = [];
    for (const zs of [delta, T / 2, T - delta]) {
      const { loops } = chainLoops(walls.filter((w) => w.zmin <= zs + TOL && w.zmax >= zs - TOL).map((w) => wallAt(w, zs)).concat(sectionsAt(zs)));
      for (const lp of loops) {
        if (loopArea(lp) >= 0) continue;
        const ip = insidePoint(lp);
        if (ip && !covered(ip)) cand.push({ lp: lp, area: Math.abs(loopArea(lp)), bb: loopBBox(lp) });
      }
    }
    // gleiche Öffnung auf mehreren Höhen: die engste Kontur fräsen (durch die ganze Dicke)
    cand.sort((a, b) => a.area - b.area);
    const inBB = (a, b) => a.x0 >= b.x0 - 0.05 && a.y0 >= b.y0 - 0.05 && a.x1 <= b.x1 + 0.05 && a.y1 <= b.y1 + 0.05;
    const kept = [];
    for (const c of cand) if (!kept.some((k) => inBB(k.bb, c.bb) || inBB(c.bb, k.bb))) kept.push(c);
    for (const k of kept) res.cutouts.push(k.lp);

    // --- Schräge Flächen: schräge Kanten über die ganze Dicke, Fasen an Geraden (Ebene) und Rundungen (Kegel)
    const chamferFaces = [];
    for (const f of inclined) {
      const e = inclinedEdges(f);
      if (!e) continue;
      const full = e.zmin < TOL && e.zmax > T - TOL;
      if (full) {
        // sägbar: die verlängerte Schnittebene schneidet das Teil nirgends an (alle Punkte auf der Materialseite)
        const n = f.surf.n;
        const p0 = f.surf.p;
        const sawable = faces.every((g) => g.pts.every((q) => (q[0] - p0[0]) * n[0] + (q[1] - p0[1]) * n[1] + (q[2] - p0[2]) * n[2] <= 0.05));
        res.slantWalls.push({ top: e.top, bottom: e.bottom, angle: e.angle, leanOut: e.offset > 0, path: e.path, sawable: sawable, faceId: f.id });
      } else if (e.zmax > T - TOL) {
        chamferFaces.push({ kind: 'line', side: 'top', line: e.bottomLine, width: Math.abs(e.offset), height: T - e.zmin, path: e.path });
      } else if (e.zmin < TOL) {
        chamferFaces.push({ kind: 'line', side: 'bottom', line: e.topLine, width: Math.abs(e.offset), height: e.zmax, path: e.path });
      } else {
        warnings.push('Schräge Fläche ohne Verbindung zu Ober- oder Unterseite (Z ' + fmt(e.zmin) + '–' + fmt(e.zmax) + ') – ignoriert.');
      }
    }
    for (const f of faces) {
      if (f.surf.type !== 'cone' || holeFaceIds.has(f.id)) continue;
      const zs = f.pts.map((q) => q[2]);
      const zmin = minOf(zs);
      const zmax = maxOf(zs);
      if (zmax < T - TOL && zmin > TOL) continue; // Bohrerspitze o. Ä.
      if (Math.abs(Math.abs(f.surf.a[2]) - 1) > ATOL) { warnings.push('Schräge Fase an einer Rundung wird nicht unterstützt.'); continue; }
      const c = [f.surf.o[0], f.surf.o[1]];
      const rAt = (z) => {
        const near = f.pts.filter((q) => Math.abs(q[2] - z) < 1e-3);
        return near.reduce((a, q) => a + Math.hypot(q[0] - c[0], q[1] - c[1]), 0) / Math.max(1, near.length);
      };
      const rLow = rAt(zmin);
      const rHigh = rAt(zmax);
      if (zmax > T - TOL && zmin > TOL) {
        chamferFaces.push({ kind: 'arc', side: 'top', c: c, r: rLow, width: Math.abs(rHigh - rLow), height: T - zmin });
      } else if (zmin < TOL && zmax < T - TOL) {
        chamferFaces.push({ kind: 'arc', side: 'bottom', c: c, r: rHigh, width: Math.abs(rHigh - rLow), height: zmax });
      }
    }
    // Fasen den Kantenabschnitten von Außenkontur und Durchbrüchen zuordnen und am Stück verketten
    const matches = (q, cf) => {
      if (q.type === 'line' && cf.kind === 'line') {
        const d = [q.b[0] - q.a[0], q.b[1] - q.a[1]];
        const l = Math.hypot(d[0], d[1]);
        if (l < TOL) return false;
        const u = [d[0] / l, d[1] / l];
        const off = (pt) => Math.abs((pt[0] - q.a[0]) * u[1] - (pt[1] - q.a[1]) * u[0]);
        const t = (pt) => (pt[0] - q.a[0]) * u[0] + (pt[1] - q.a[1]) * u[1];
        const t0 = Math.min(t(cf.line.a), t(cf.line.b));
        const t1 = Math.max(t(cf.line.a), t(cf.line.b));
        return off(cf.line.a) < 0.05 && off(cf.line.b) < 0.05 && t1 > TOL && t0 < l - TOL;
      }
      if (q.type === 'arc' && cf.kind === 'arc') return near2(q.c, cf.c, 0.05) && near(q.r, cf.r, 0.05);
      return false;
    };
    res.chamferPaths = [];
    for (const lp of [res.outline].concat(res.cutouts)) {
      for (const side of ['top', 'bottom']) {
        const hit = lp.map((q) => {
          const cf = chamferFaces.find((x) => x.side === side && matches(q, x));
          return cf || null;
        });
        if (!hit.some(Boolean)) continue;
        chamferFaces.forEach((cf) => { if (cf.side === side && lp.some((q) => matches(q, cf))) cf.used = true; });
        const same = (a, b) => a && b && near(a.width, b.width, 0.05) && near(a.height, b.height, 0.05);
        const n = lp.length;
        if (hit.every((h) => same(h, hit[0]))) {
          res.chamferPaths.push({ side: side, segs: lp, closed: true, width: hit[0].width, height: hit[0].height });
          continue;
        }
        // offene Abschnitte: am Anfang eines Laufs beginnen
        let k0 = hit.findIndex((h, i) => h && !same(hit[(i - 1 + n) % n], h));
        if (k0 < 0) k0 = 0;
        let run = null;
        for (let j = 0; j < n; j++) {
          const i = (k0 + j) % n;
          if (hit[i] && run && same(run.cf, hit[i])) { run.segs.push(lp[i]); continue; }
          if (run) res.chamferPaths.push({ side: side, segs: run.segs, closed: false, width: run.cf.width, height: run.cf.height });
          run = hit[i] ? { cf: hit[i], segs: [lp[i]] } : null;
        }
        if (run) res.chamferPaths.push({ side: side, segs: run.segs, closed: false, width: run.cf.width, height: run.cf.height });
      }
    }
    // Fasen, die zu keiner Kontur gehören: gerade einzeln, an Rundungen nur Hinweis
    for (const cf of chamferFaces) {
      if (cf.used) continue;
      if (cf.kind === 'line') res.chamfers.push({ side: cf.side, line: cf.line, width: cf.width, height: cf.height, path: cf.path });
      else warnings.push('Fase an einer Rundung (R' + fmt(cf.r) + ') außerhalb der Kontur wird nicht automatisch erzeugt.');
    }

    // --- Kantenrundungen: kleine Radien (bis EDGE_R_MAX) an der Oberkante oder Unterkante der Außenkontur bzw. eines
    // Durchbruchs (Zylinder mit liegender Achse, Torus an den Ecken) – mit dem Radiusfräser entlang der Kontur
    const edgeLoops = [res.outline].concat(res.cutouts);
    const edgeHits = [];
    const segDist = (q, sg) => {
      const pts = segPoints(sg).concat([sg.b]);
      let d = Infinity;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const ab = [b[0] - a[0], b[1] - a[1]];
        const l2 = ab[0] * ab[0] + ab[1] * ab[1];
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / l2)) : 0;
        d = Math.min(d, Math.hypot(q[0] - a[0] - ab[0] * t, q[1] - a[1] - ab[1] * t));
      }
      return d;
    };
    const edgeRound = (f) => {
      const t = f.surf.type;
      const zs = f.pts.map((q) => q[2]);
      const zmin = minOf(zs);
      const zmax = maxOf(zs);
      let r;
      if (t === 'cylinder' && Math.abs(f.surf.a[2]) < ATOL) r = f.surf.r;
      else if (t === 'other' && /TOROID/.test(f.surf.name || '')) r = zmax - zmin;
      else return null;
      if (!(r > TOL && r <= EDGE_R_MAX)) return null;
      const side = zmax > T - TOL && zmin > T - r - 0.1 ? 'top' : zmin < TOL && zmax < r + 0.1 ? 'bottom' : null;
      if (!side) return null;
      const segs = [];
      edgeLoops.forEach((lp, li) => lp.forEach((sg, si) => {
        if (f.pts.every((q) => segDist(q, sg) <= r + 0.15)) segs.push([li, si]);
      }));
      return segs.length ? { r: r, side: side, segs: segs, faceId: f.id } : null;
    };
    const edgeFaceIds = new Set();
    for (const f of faces) {
      if (holeFaceIds.has(f.id)) continue;
      const e = edgeRound(f);
      if (e) { edgeHits.push(e); edgeFaceIds.add(f.id); }
    }
    // je Kontur, Seite und Radius: zusammenhängende Läufe der gerundeten Segmente (Material links)
    res.edgeRounds = [];
    const roundKey = (e) => e.side + '|' + (Math.round(e.r * 20) / 20);
    const byKey = new Map();
    for (const e of edgeHits) for (const [li, si] of e.segs) {
      const k = li + '|' + roundKey(e);
      if (!byKey.has(k)) byKey.set(k, { li: li, side: e.side, r: Math.round(e.r * 20) / 20, idx: new Set(), faceIds: new Set() });
      byKey.get(k).idx.add(si);
      byKey.get(k).faceIds.add(e.faceId);
    }
    for (const g of byKey.values()) {
      const lp = edgeLoops[g.li];
      const n = lp.length;
      const turn = (a, b) => { // Knick von Segment a nach b: > 0 links (Außenecke bei Material links)
        const ta = a.type === 'line' ? [a.b[0] - a.a[0], a.b[1] - a.a[1]] : (a.ccw ? [-(a.b[1] - a.c[1]), a.b[0] - a.c[0]] : [a.b[1] - a.c[1], -(a.b[0] - a.c[0])]);
        const tb = b.type === 'line' ? [b.b[0] - b.a[0], b.b[1] - b.a[1]] : (b.ccw ? [-(b.a[1] - b.c[1]), b.a[0] - b.c[0]] : [b.a[1] - b.c[1], -(b.a[0] - b.c[0])]);
        return ta[0] * tb[1] - ta[1] * tb[0];
      };
      const base = { loop: g.li === 0 ? 'outer' : 'cutout', loopIndex: g.li, side: g.side, r: g.r, faceIds: Array.from(g.faceIds) };
      if (g.idx.size === n) { res.edgeRounds.push(Object.assign(base, { closed: true, segs: lp })); continue; }
      let k0 = 0;
      while (g.idx.has(k0) || !g.idx.has((k0 + 1) % n)) k0 = (k0 + 1) % n; // vor dem Anfang eines Laufs
      let run = null;
      for (let j = 1; j <= n; j++) {
        const k = (k0 + j) % n;
        if (g.idx.has(k)) { if (!run) run = []; run.push(k); continue; }
        if (run) {
          const first = run[0];
          const last = run[run.length - 1];
          res.edgeRounds.push(Object.assign({}, base, { closed: false, segs: run.map((i) => lp[i]),
            // An den Enden tangential auslaufen nur an Außenecken (sonst ginge es ins Material)
            extendStart: turn(lp[(first - 1 + n) % n], lp[first]) > 1e-9, extendEnd: turn(lp[last], lp[(last + 1) % n]) > 1e-9 }));
          run = null;
        }
      }
    }

    // --- Gewölbte Flächen (Kugel, Zylinder/Kegel mit liegender Achse, Freiform): mit dem Kugelfräser von oben
    res.curvedSurfaces = [];
    {
      const cands = [];
      for (const f of faces) {
        if (holeFaceIds.has(f.id) || edgeFaceIds.has(f.id)) continue;
        const t = f.surf.type;
        const vertical = (t === 'cylinder' || t === 'cone') && Math.abs(Math.abs(f.surf.a[2]) - 1) < ATOL;
        if (t === 'plane' || vertical) continue;
        if (!f.pts.length) continue;
        const kind = t === 'cylinder' ? 'Zylinder' : t === 'cone' ? 'Kegel' : /SPHER/.test(f.surf.name || '') ? 'Kugel' : /TOROID/.test(f.surf.name || '') ? 'Torus' : 'Freiform';
        const xs = f.pts.map((q) => q[0]);
        const ys = f.pts.map((q) => q[1]);
        const zs = f.pts.map((q) => q[2]);
        const c = { ids: [f.id], kinds: [kind], x0: minOf(xs), x1: maxOf(xs), y0: minOf(ys), y1: maxOf(ys), zmin: minOf(zs), zmax: maxOf(zs) };
        // senkrechte Freiform-Wand (Kontur aus Splines): jeder Randpunkt hat einen Zwilling darüber oder darunter → Kontur, keine Fläche
        const span = c.zmax - c.zmin;
        if (t !== 'cylinder' && t !== 'cone' && span > TOL &&
          f.pts.every((q) => f.pts.some((r) => Math.abs(r[2] - q[2]) > span * 0.45 && Math.hypot(r[0] - q[0], r[1] - q[1]) < 0.05))) {
          if (t === 'other') warnings.push('Fläche vom Typ ' + f.surf.name + ' wird nicht ausgewertet.');
          continue;
        }
        // reicht die Fläche bis unten, aber nicht bis oben: von unten; sonst von oben (z. B. runder Nut- oder Taschengrund) –
        // was die Kugel von oben nicht erreicht, fräst sie auch nicht (die Bahn berührt nur, was von oben frei liegt)
        if (c.zmax < T - TOL && c.zmin < TOL) {
          res.bottom.push({ kind: 'Fläche', text: 'Gewölbte Fläche (' + kind + ') von unten' });
          continue;
        }
        cands.push(c);
      }
      // Flächen mit gemeinsamer Kante (z. B. Rundung mit Ecken, Mulde mit Auslauf) zu einer Bearbeitung zusammenfassen;
      // der Bereich bleibt die Liste der einzelnen Rechtecke, damit dazwischen nichts anderes mitgefräst wird
      const key = (q) => q.map((v) => Math.round(v * 20)).join(',');
      const edgeKeys = (f) => {
        const out = new Set();
        for (const bd of f.bounds) for (const ed of bd.edges) {
          const m = ed.samples[Math.floor(ed.samples.length / 2)] || ed.start;
          out.add([key(ed.start), key(ed.end)].sort().join('|') + '|' + key(m));
        }
        return out;
      };
      const groups = cands.map((c) => ({ ids: c.ids, kinds: c.kinds, rects: [{ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }],
        zmin: c.zmin, keys: edgeKeys(faces.find((f) => f.id === c.ids[0])) }));
      for (let changed = true; changed;) {
        changed = false;
        for (let i = 0; i < groups.length && !changed; i++) for (let j = i + 1; j < groups.length && !changed; j++) {
          const a = groups[i];
          const b = groups[j];
          if (!Array.from(b.keys).some((k) => a.keys.has(k))) continue;
          groups.splice(j, 1);
          a.ids.push(...b.ids);
          for (const k of b.kinds) if (!a.kinds.includes(k)) a.kinds.push(k);
          a.rects.push(...b.rects);
          for (const k of b.keys) a.keys.add(k);
          a.zmin = Math.min(a.zmin, b.zmin);
          changed = true;
        }
      }
      // Zylinder mit liegender Achse, nach außen gewölbt (allein in der Gruppe): mit dem Schaftfräser 4-achsig abzeilbar
      const cylOf = (g) => {
        if (g.ids.length !== 1) return null;
        const f = faces.find((x) => x.id === g.ids[0]);
        if (f.surf.type !== 'cylinder' || f.surf.concave || Math.abs(f.surf.a[2]) > ATOL) return null;
        const h = Math.hypot(f.surf.a[0], f.surf.a[1]);
        const ax = [f.surf.a[0] / h, f.surf.a[1] / h];
        const u = [-ax[1], ax[0]];
        const o = f.surf.o;
        const phis = f.pts.map((q) => Math.atan2((q[0] - o[0]) * u[0] + (q[1] - o[1]) * u[1], q[2] - o[2]));
        const ts = f.pts.map((q) => (q[0] - o[0]) * ax[0] + (q[1] - o[1]) * ax[1]);
        // Achse nur parallel zu X oder Y (Rohteil-Schnitt bleibt ein Rechteck)
        if (Math.min(Math.abs(ax[0]), Math.abs(ax[1])) > ATOL) return null;
        return { o: o, a: ax, r: f.surf.r, phi0: minOf(phis), phi1: maxOf(phis), t0: minOf(ts), t1: maxOf(ts) };
      };
      res.curvedSurfaces = groups.map((g) => ({ ids: g.ids, kinds: g.kinds, rects: g.rects,
        x0: minOf(g.rects.map((r) => r.x0)), y0: minOf(g.rects.map((r) => r.y0)), x1: maxOf(g.rects.map((r) => r.x1)),
        y1: maxOf(g.rects.map((r) => r.y1)), depth: T - g.zmin, cyl: cylOf(g) }));
    }

    // --- Böden (Nut, Falz, Tasche)
    const floors = [];
    for (const f of faces) {
      if (f.surf.type !== 'plane') continue;
      const n = f.surf.n;
      const z = f.surf.p[2];
      if (Math.abs(Math.abs(n[2]) - 1) > ATOL || z < TOL || z > T - TOL) continue;
      const ob = f.bounds.find((b) => b.outer) || f.bounds[0];
      const segs = ob.edges.map(seg2DFromEdge);
      if (segs.every((s) => s.type === 'arc')) continue; // Bohrungsgrund
      const bb = loopBBox(segs);
      if (n[2] < 0) {
        res.bottom.push({ kind: 'Boden', text: 'Bearbeitung von unten (Boden auf Z=' + fmt(z) + ', ' + fmt(bb.x1 - bb.x0) + '×' + fmt(bb.y1 - bb.y0) + ')' });
        continue;
      }
      const inner = f.bounds.filter((b) => b !== ob).map((b) => b.edges.map(seg2DFromEdge))
        .filter((lp) => !lp.every((q) => q.type === 'arc' && holes.some((h) => Math.abs(h.axis[2]) > 1 - ATOL &&
          near2([h.c[0], h.c[1]], q.c, 0.01) && near(h.d / 2, q.r))));
      floors.push({ z: z, segs: segs, bb: bb, rect: isRectLoop(segs, bb), inner: inner });
    }
    // Endet ein Boden an der Plattenkante oder in einem tieferen Boden (z. B. Nut läuft in Falz)?
    const reaches = (fl, axis, v) => {
      const size = axis === 0 ? L : W;
      if (v < TOL || v > size - TOL) return true;
      const o = 1 - axis;
      const lo = (b, i) => (i === 0 ? b.x0 : b.y0);
      const hi = (b, i) => (i === 0 ? b.x1 : b.y1);
      return floors.some((g) => g !== fl && g.z < fl.z - TOL &&
        lo(g.bb, axis) - TOL <= v && v <= hi(g.bb, axis) + TOL &&
        lo(g.bb, o) <= lo(fl.bb, o) + TOL && hi(g.bb, o) >= hi(fl.bb, o) - TOL);
    };
    for (const fl of floors) {
      const bb = fl.bb;
      const depth = T - fl.z;
      const fullX = reaches(fl, 0, bb.x0) && reaches(fl, 0, bb.x1);
      const fullY = reaches(fl, 1, bb.y0) && reaches(fl, 1, bb.y1);
      if (fl.rect && fullX && !fullY) {
        if (bb.y0 < TOL) res.rebates.push({ edge: 'Front', depth: depth, width: bb.y1, flank: bb.y1 });
        else if (bb.y1 > W - TOL) res.rebates.push({ edge: 'Back', depth: depth, width: W - bb.y0, flank: bb.y0 });
        else res.grooves.push({ dir: 'X', from: bb.y0, to: bb.y1, depth: depth });
      } else if (fl.rect && fullY && !fullX) {
        if (bb.x0 < TOL) res.rebates.push({ edge: 'Left', depth: depth, width: bb.x1, flank: bb.x1 });
        else if (bb.x1 > L - TOL) res.rebates.push({ edge: 'Right', depth: depth, width: L - bb.x0, flank: bb.x0 });
        else res.grooves.push({ dir: 'Y', from: bb.x0, to: bb.x1, depth: depth });
      } else {
        const outerLoop = orient(fl.segs, true);
        res.pockets.push({ x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, depth: depth, segs: outerLoop,
          islands: fl.inner.map((lp) => orient(lp, false)), minRadius: minConcaveRadius(outerLoop),
          open: openSides(bb, L, W) });
      }
    }

    res.pockets.sort((a, b) => a.depth - b.depth);
    if (T > Math.min(L, W) / 3) warnings.push('Teil ist sehr dick (' + fmt(T) + ' mm) – wirklich eine Platte?');
    return res;
  }

  function rectLoop(L, W) {
    const c = [[0, 0], [L, 0], [L, W], [0, W]];
    return c.map((p, i) => ({ type: 'line', a: p, b: c[(i + 1) % 4] }));
  }

  function fmt(v) {
    const r = Math.round(v * 1000) / 1000;
    return String(Object.is(r, -0) ? 0 : r);
  }

  // ---------------------------------------------------------------- Öffentliche API

  function topScore(res) {
    return res.drills.filter((d) => d.face === 'Top' && !d.through).length + res.grooves.length * 3 +
      res.rebates.length * 3 + res.pockets.length * 3 + res.slantDrills.length +
      res.chamfers.filter((c) => c.side === 'top').length * 2 + (res.chamferPaths || []).filter((c) => c.side === 'top').length * 2 +
      (res.curvedSurfaces || []).length * 3 + (res.curvedSlants || []).filter((c) => c.up).length * 2 +
      (res.edgeRounds || []).filter((e) => e.side === 'top').length * 0.5; // bei Gleichstand: Rundungen lieber oben
  }

  /**
   * Analysiert einen Volumenkörper.
   * orientation: { rot: 0..3, flip: bool } – fehlt sie, wird sie automatisch gewählt.
   */
  function analyze(solid, orientation) {
    const prep = prepare(solid);
    let rot;
    let flip;
    if (orientation) {
      rot = orientation.rot || 0;
      flip = !!orientation.flip;
    } else {
      rot = prep.dims[1] > prep.dims[0] + TOL ? 1 : 0;
      const a = extract(prep, frame(prep, rot, false));
      const b = extract(prep, frame(prep, rot, true));
      flip = b.bottom.length < a.bottom.length || (b.bottom.length === a.bottom.length && topScore(b) > topScore(a));
    }
    const fr = frame(prep, rot, flip);
    const res = extract(prep, fr);
    res.tf = fr.tf; // Modell (mm) → Plattenkoordinaten, für die 3D-Ansicht
    res.name = solid.name;
    res.orientation = { rot: rot, flip: flip };
    return res;
  }

  return { analyze: analyze, segPoints: segPoints, arcSweep: arcSweep, loopArea: loopArea, fmt: fmt };
});
