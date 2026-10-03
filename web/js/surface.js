/*
 * Zeilenfräsen gewölbter Flächen mit dem Kugelfräser (3-achsig, von oben).
 *
 * Grundlage ist das Dreiecksnetz des Bauteils in Plattenkoordinaten (aus OpenCascade). Für jeden Punkt einer Zeile
 * wird die Höhe bestimmt, auf der die Kugel das Netz gerade berührt („Drop-Cutter“: Flächen, Kanten, Ecken) –
 * so kann der Fräser nirgends in das Teil schneiden. Zeilen im Zickzack, Punkte ohne Krümmung werden zusammengefasst.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SurfacePath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Netz vorbereiten: Dreiecke mit Normalen und Raster zum schnellen Suchen
  function prepare(mesh, R) {
    const p = mesh.pos;
    const idx = mesh.index;
    const tris = [];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < idx.length; i += 3) {
      const a = [p[idx[i] * 3], p[idx[i] * 3 + 1], p[idx[i] * 3 + 2]];
      const b = [p[idx[i + 1] * 3], p[idx[i + 1] * 3 + 1], p[idx[i + 1] * 3 + 2]];
      const c = [p[idx[i + 2] * 3], p[idx[i + 2] * 3 + 1], p[idx[i + 2] * 3 + 2]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-12) continue;
      n = [n[0] / l, n[1] / l, n[2] / l];
      if (n[2] < 0) n = [-n[0], -n[1], -n[2]]; // für die Kugel von oben zählt die obere Seite
      const t = { a: a, b: b, c: c, n: n,
        x0: Math.min(a[0], b[0], c[0]) - R, x1: Math.max(a[0], b[0], c[0]) + R,
        y0: Math.min(a[1], b[1], c[1]) - R, y1: Math.max(a[1], b[1], c[1]) + R };
      tris.push(t);
      x0 = Math.min(x0, t.x0); y0 = Math.min(y0, t.y0); x1 = Math.max(x1, t.x1); y1 = Math.max(y1, t.y1);
    }
    const cell = Math.max(5, R * 2);
    const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
    const ny = Math.max(1, Math.ceil((y1 - y0) / cell));
    const grid = new Array(nx * ny);
    for (const t of tris) {
      const i0 = Math.max(0, Math.floor((t.x0 - x0) / cell));
      const i1 = Math.min(nx - 1, Math.floor((t.x1 - x0) / cell));
      const j0 = Math.max(0, Math.floor((t.y0 - y0) / cell));
      const j1 = Math.min(ny - 1, Math.floor((t.y1 - y0) / cell));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) (grid[j * nx + i] || (grid[j * nx + i] = [])).push(t);
    }
    return { tris: tris, grid: grid, cell: cell, nx: nx, ny: ny, x0: x0, y0: y0, R: R };
  }

  // höchster Kugelmittelpunkt über (x, y), bei dem die Kugel das Netz berührt (−Infinity: kein Material darunter)
  function dropCenter(m, x, y) {
    const R = m.R;
    const i = Math.floor((x - m.x0) / m.cell);
    const j = Math.floor((y - m.y0) / m.cell);
    if (i < 0 || j < 0 || i >= m.nx || j >= m.ny) return -Infinity;
    const list = m.grid[j * m.nx + i];
    if (!list) return -Infinity;
    let best = -Infinity;
    const R2 = R * R;
    const vert = (v) => {
      const d2 = (x - v[0]) * (x - v[0]) + (y - v[1]) * (y - v[1]);
      if (d2 <= R2) { const z = v[2] + Math.sqrt(R2 - d2); if (z > best) best = z; }
    };
    const edge = (p, q) => {
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const L = Math.hypot(ex, ey);
      if (L < 1e-9) return; // senkrechte Kante: über die Ecken abgedeckt
      const ux = ex / L;
      const uy = ey / L;
      const dperp = Math.abs((x - p[0]) * uy - (y - p[1]) * ux);
      if (dperp >= R) return;
      const r = Math.sqrt(R2 - dperp * dperp); // Kugelschnitt in der senkrechten Ebene durch die Kante
      const s0 = (x - p[0]) * ux + (y - p[1]) * uy;
      const m2 = (q[2] - p[2]) / L;
      const k = Math.sqrt(1 + m2 * m2);
      const st = s0 + (r * m2) / k; // Berührpunkt auf der Kante (Fußpunkt vom Mittelpunkt)
      if (st < 0 || st > L) return;
      const z = p[2] + m2 * s0 + r * k;
      if (z > best) best = z;
    };
    for (const t of list) {
      if (x < t.x0 || x > t.x1 || y < t.y0 || y > t.y1) continue;
      const n = t.n;
      // Fläche: Berührpunkt = Mitte − R·n muss im Dreieck liegen
      if (n[2] > 1e-6) {
        const px = x - R * n[0];
        const py = y - R * n[1];
        const ax = t.a[0], ay = t.a[1], bx = t.b[0], by = t.b[1], cx = t.c[0], cy = t.c[1];
        const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(den) > 1e-12) {
          const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
          const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
          const l3 = 1 - l1 - l2;
          if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) {
            // Höhe des Mittelpunkts aus n·(C − R·n − A) = 0
            const z = t.a[2] + (R - n[0] * (x - t.a[0]) - n[1] * (y - t.a[1])) / n[2];
            if (z > best) best = z;
          }
        }
      }
      edge(t.a, t.b); edge(t.b, t.c); edge(t.c, t.a);
      vert(t.a); vert(t.b); vert(t.c);
    }
    return best;
  }

  // Punkte einer Linie zusammenfassen, solange die Abweichung unter tol bleibt
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      const a = pts[anchor];
      const b = pts[i];
      let ok = true;
      for (let k = anchor + 1; k < i && ok; k++) {
        const q = pts[k];
        const t = ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) || 1);
        const z = a[2] + (b[2] - a[2]) * t;
        if (Math.abs(q[2] - z) > tol) ok = false;
      }
      if (!ok) { out.push(pts[i - 1]); anchor = i - 1; }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /*
   * Bahn für einen Bereich. region: { rects: [{x0,y0,x1,y1}], zmin } (Mittelpunkt der Kugel bleibt in den Rechtecken,
   * tiefer als zmin fährt sie nicht); opt: { R (Radius Kugel), stepover, res (Punktabstand), top (Plattendicke T),
   * layer (Zustellung, 0 = nur Schlichten), tol }
   * Ergebnis: { passes: [[ [x,y,zSpitze], … ], …], zmin } – je Pass ein zusammenhängender Weg in Plattenkoordinaten,
   * zwischen den Pässen wird abgehoben. Werkzeugspitze = tiefster Punkt der Kugel.
   */
  function compute(mesh, region, opt) {
    const R = opt.R;
    const m = prepare(mesh, R);
    const res = Math.max(0.2, opt.res || 1);
    const step = Math.max(0.2, opt.stepover);
    const T = opt.top;
    const tol = opt.tol || 0.02;
    const floor = region.zmin === undefined ? -Infinity : region.zmin - 0.3;
    const cutting = (q) => q && q[2] < T - 0.01;
    // nur dort fahren, wo der Fräser unter der Oberseite schneidet (plus ein Punkt Anlauf)
    const segsOf = (pts) => {
      const out = [];
      let cur = null;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i];
        const near = cutting(q) || cutting(pts[i - 1]) || cutting(pts[i + 1]);
        if (q && near) { if (!cur) { cur = []; out.push(cur); } cur.push(q); } else cur = null;
      }
      return out.filter((sg) => sg.length >= 2);
    };
    let zmin = Infinity;
    const blocks = [];
    for (const rc of region.rects) {
      // Zeilen längs der längeren Seite
      const alongX = rc.x1 - rc.x0 >= rc.y1 - rc.y0;
      const u0 = alongX ? rc.x0 : rc.y0;
      const u1 = alongX ? rc.x1 : rc.y1;
      const v0 = alongX ? rc.y0 : rc.x0;
      const v1 = alongX ? rc.y1 : rc.x1;
      const nv = Math.max(1, Math.ceil((v1 - v0) / step));
      const nu = Math.max(2, Math.ceil((u1 - u0) / res));
      const rows = [];
      for (let k = 0; k <= nv; k++) {
        const v = v0 + ((v1 - v0) * k) / nv;
        const pts = [];
        for (let i = 0; i <= nu; i++) {
          const u = u0 + ((u1 - u0) * i) / nu;
          const x = alongX ? u : v;
          const y = alongX ? v : u;
          const c = dropCenter(m, x, y);
          const z = c - R;
          if (c === -Infinity || z < floor) { pts.push(null); continue; }
          pts.push([x, y, z]);
          if (z < zmin) zmin = z;
        }
        rows.push(pts);
      }
      blocks.push(rows);
    }
    if (zmin === Infinity) return { passes: [], zmin: T, R: R };
    const layers = [];
    if (opt.layer > 0) for (let z = T - opt.layer; z > zmin + 1e-6; z -= opt.layer) layers.push(z);
    layers.push(-Infinity); // Schlichten: Fläche selbst
    const passes = [];
    for (const zl of layers) {
      for (const rows of blocks) {
        let flip = false;
        for (const row of rows) {
          let segs = segsOf(row.map((q) => (q ? [q[0], q[1], Math.max(q[2], zl)] : null)));
          if (flip) segs = segs.reverse().map((sg) => sg.slice().reverse());
          for (const sg of segs) passes.push(simplify(sg, tol));
          if (segs.length) flip = !flip;
        }
      }
    }
    return { passes: passes, zmin: zmin, R: R };
  }

  return { compute: compute, prepare: prepare, dropCenter: dropCenter, simplify: simplify };
});
