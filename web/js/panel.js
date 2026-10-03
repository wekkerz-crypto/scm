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
  const near2 = (p, q, t) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= (t === undefined ? 0.05 : t);

  // ---------------------------------------------------------------- Kanten abtasten (Weltkoordinaten)

  function circleAngle(ax, p) {
    const d = sub(p, ax.o);
    return Math.atan2(dot(d, ax.y), dot(d, ax.x));
  }

  function sampleEdge(edge) {
    const c = edge.curve;
    if (c.type !== 'circle') return [edge.start, edge.end];
    const a0 = circleAngle(c.ax, edge.start);
    const a1 = circleAngle(c.ax, edge.end);
    const closed = len(sub(edge.start, edge.end)) < 1e-6;
    let sweep;
    if (edge.forward) {
      sweep = closed ? TWO_PI : ((a1 - a0) % TWO_PI + TWO_PI) % TWO_PI;
    } else {
      sweep = closed ? -TWO_PI : -(((a0 - a1) % TWO_PI + TWO_PI) % TWO_PI);
    }
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n;
      pts.push(add(c.ax.o, add(mul(c.ax.x, c.r * Math.cos(a)), mul(c.ax.y, c.r * Math.sin(a)))));
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
      if (f.surface.type === 'other') warnings.push('Fläche vom Typ ' + f.surface.name + ' wird nicht ausgewertet.');
      // Falls kein FACE_OUTER_BOUND markiert ist: größten Loop als außen annehmen
      if (f.bounds.length && !f.bounds.some((b) => b.outer)) f.bounds[0].outer = true;
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
    let open = 0;
    while (rest.length) {
      const loop = [rest.shift()];
      for (;;) {
        const end = loop[loop.length - 1].b;
        if (near2(end, loop[0].a)) break;
        const i = rest.findIndex((s) => near2(s.a, end));
        if (i < 0) { open++; break; }
        loop.push(rest.splice(i, 1)[0]);
      }
      if (near2(loop[loop.length - 1].b, loop[0].a)) loops.push(mergeCollinear(loop));
    }
    return { loops: loops, open: open };
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
          out[out.length - 1] = { type: 'line', a: prev.a, b: s.b };
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
          out[0] = { type: 'line', a: l.a, b: f.b };
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- Merkmale

  function angularCoverage(face, a, center) {
    // Winkelabdeckung einer Zylinderfläche um die Achse a
    for (const b of face.bounds) for (const e of b.edges) {
      if (e.curve.type === 'circle' && near2(e.start, e.end, 1e-6) && len(sub(e.start, e.end)) < 1e-6) return TWO_PI;
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
      const t0 = Math.min(...ts);
      const t1 = Math.max(...ts);
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
      holes.push({ axis: g.a, c: g.c, d: 2 * g.r, tmin: tmin, tmax: tmax });
    }
    return { holes: holes, holeFaceIds: holeFaceIds };
  }

  function wallSegment(f) {
    const zs = f.pts.map((p) => p[2]);
    const zmin = Math.min(...zs);
    const zmax = Math.max(...zs);
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
      const seg = { type: 'arc', a: pa, b: pb, c: c, r: r, ccw: true, full: maxGap < 1e-6 };
      return { zmin: zmin, zmax: zmax, seg: f.surf.concave ? reverseSeg(seg) : seg };
    }
    return null;
  }

  function isRectLoop(segs, bb) {
    if (!segs.every((s) => s.type === 'line')) return false;
    const area = Math.abs(loopArea(segs));
    return near(area, (bb.x1 - bb.x0) * (bb.y1 - bb.y0), 0.01 * Math.max(1, area / 1000)) && segs.length === 4;
  }

  function extract(prep, fr) {
    const faces = transformSolid(prep, fr);
    const L = fr.L;
    const W = fr.W;
    const T = fr.T;
    const warnings = prep.warnings.slice();
    const res = { L: L, W: W, T: T, outline: null, cutouts: [], drills: [], circles: [], grooves: [], rebates: [],
      pockets: [], bottom: [], warnings: warnings };

    // --- Bohrungen
    const { holes, holeFaceIds } = findHoles(faces);
    for (const h of holes) {
      const a = h.axis;
      const d = h.d;
      if (Math.abs(a[2]) > 1 - ATOL) {
        const x = h.c[0];
        const y = h.c[1];
        const atTop = h.tmax > T - TOL;
        const atBottom = h.tmin < TOL;
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
        warnings.push('Schräge Bohrung Ø' + fmt(d) + ' wird nicht unterstützt.');
      }
    }

    // --- Außenkontur und Durchbrüche aus den senkrechten Wandflächen
    const walls = [];
    for (const f of faces) {
      if (holeFaceIds.has(f.id)) continue;
      const w = wallSegment(f);
      if (w) walls.push(w);
    }
    const delta = Math.min(0.5, T / 10);
    let outer = null;
    for (const zs of [delta, T / 2, T - delta]) {
      const { loops } = chainLoops(walls.filter((w) => w.zmin <= zs + TOL && w.zmax >= zs - TOL).map((w) => w.seg));
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
    res.outlineIsRect = isRectLoop(outer.segs, { x0: 0, y0: 0, x1: L, y1: W });

    const through = chainLoops(walls.filter((w) => w.zmin < TOL && w.zmax > T - TOL).map((w) => w.seg));
    for (const lp of through.loops) if (loopArea(lp) < 0) res.cutouts.push(lp);

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
      floors.push({ z: z, segs: segs, bb: bb, rect: isRectLoop(segs, bb) });
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
        res.pockets.push({ x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, depth: depth, segs: fl.segs });
      }
    }

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
      res.rebates.length * 3 + res.pockets.length * 3;
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
    const res = extract(prep, frame(prep, rot, flip));
    res.name = solid.name;
    res.orientation = { rot: rot, flip: flip };
    return res;
  }

  return { analyze: analyze, segPoints: segPoints, arcSweep: arcSweep, loopArea: loopArea, fmt: fmt };
});
