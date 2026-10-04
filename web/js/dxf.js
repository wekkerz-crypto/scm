/*
 * DXF (2D) lesen und daraus ein Plattenteil machen – ohne Layer-Steuerung, mit automatischen Vorschlägen.
 *
 * Gelesen werden LINE, ARC, CIRCLE, LWPOLYLINE/POLYLINE (mit Bögen über „bulge“), ELLIPSE und SPLINE (als Geraden
 * angenähert) sowie Blöcke (INSERT mit Verschiebung, Maßstab, Drehung). Maße, Texte und Schraffuren werden übergangen.
 * Die größte geschlossene Kontur ist das Teil; alles darin wird vorgeschlagen:
 *   Kreis mit passendem Bohrer → Bohrung (Sackloch), sonst Rundloch (Durchbruch); geschlossene Kontur → Durchbruch,
 *   innerhalb einer Tasche → Insel. Je Erkennung lässt sich die Art und Tiefe ändern (overrides).
 * Ergebnis im selben Format wie PanelAnalyzer.analyze (Ursprung vorne links unten, X = Länge, Z = Dicke).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DxfReader = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TOL = 0.05;
  const TWO_PI = Math.PI * 2;
  const UNITS = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 }; // $INSUNITS → mm

  // ---------------------------------------------------------------- Einlesen (Gruppencode / Wert)

  function pairs(text) {
    const lines = String(text).split(/\r?\n/);
    const out = [];
    for (let i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
    return out;
  }

  // Entitäten eines Abschnitts als { type, codes: [[code, wert], …] }
  function entitiesOf(list) {
    const out = [];
    let cur = null;
    for (const [c, v] of list) {
      if (c === 0) { cur = { type: v, codes: [] }; out.push(cur); } else if (cur) cur.codes.push([c, v]);
    }
    return out;
  }

  function parse(text) {
    const pr = pairs(text);
    let unit = 1;
    const blocks = {};
    let entities = [];
    // Abschnitte
    for (let i = 0; i < pr.length; i++) {
      if (pr[i][0] !== 0 || pr[i][1] !== 'SECTION') continue;
      const name = pr[i + 1] && pr[i + 1][1];
      let j = i + 2;
      while (j < pr.length && !(pr[j][0] === 0 && pr[j][1] === 'ENDSEC')) j++;
      const body = pr.slice(i + 2, j);
      if (name === 'HEADER') {
        for (let k = 0; k < body.length; k++) {
          if (body[k][0] === 9 && body[k][1] === '$INSUNITS') { const u = parseInt(body[k + 1][1], 10); if (UNITS[u]) unit = UNITS[u]; }
        }
      } else if (name === 'BLOCKS') {
        let blk = null;
        for (const e of entitiesOf(body)) {
          if (e.type === 'BLOCK') {
            const g = (c) => { const x = e.codes.find((q) => q[0] === c); return x ? x[1] : null; };
            blk = { name: g(2), base: [parseFloat(g(10) || 0), parseFloat(g(20) || 0)], ents: [] };
            blocks[blk.name] = blk;
          } else if (e.type === 'ENDBLK') blk = null;
          else if (blk) blk.ents.push(e);
        }
      } else if (name === 'ENTITIES') entities = entitiesOf(body);
      i = j;
    }
    return { unit: unit, blocks: blocks, entities: entities };
  }

  // ---------------------------------------------------------------- Geometrie

  const num = (e, c, def) => { const x = e.codes.find((q) => q[0] === c); return x ? parseFloat(x[1]) : def; };
  const all = (e, c) => e.codes.filter((q) => q[0] === c).map((q) => parseFloat(q[1]));

  // Bogen aus zwei Punkten und „bulge“ (tan(Winkel/4), positiv = gegen den Uhrzeigersinn)
  function bulgeArc(a, b, bulge) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d < 1e-9) return null;
    const th = 4 * Math.atan(bulge);
    const r = d / (2 * Math.sin(Math.abs(th) / 2));
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
    const n = [-(b[1] - a[1]) / d, (b[0] - a[0]) / d]; // links der Sehne
    const s = (bulge > 0 ? 1 : -1) * (Math.abs(th) > Math.PI ? -1 : 1);
    const c = [m[0] + n[0] * h * s, m[1] + n[1] * h * s];
    return { type: 'arc', a: a, b: b, c: c, r: r, ccw: bulge > 0 };
  }

  // B-Spline (de Boor) an t
  function deBoor(k, t, knots, ctrl, w) {
    let s = k;
    while (s < knots.length - k - 2 && t >= knots[s + 1]) s++;
    const d = [];
    for (let j = 0; j <= k; j++) {
      const p = ctrl[s - k + j];
      const ww = w ? w[s - k + j] : 1;
      d.push([p[0] * ww, p[1] * ww, ww]);
    }
    for (let r = 1; r <= k; r++) {
      for (let j = k; j >= r; j--) {
        const i = s - k + j;
        const den = knots[i + k - r + 1] - knots[i];
        const al = den > 0 ? (t - knots[i]) / den : 0;
        for (let q = 0; q < 3; q++) d[j][q] = (1 - al) * d[j - 1][q] + al * d[j][q];
      }
    }
    return [d[k][0] / d[k][2], d[k][1] / d[k][2]];
  }

  /*
   * Entitäten (auch aus Blöcken) in Segmente und Kreise umwandeln. tf: Punkt → Punkt (Einfügung, Einheit),
   * mirror: Spiegelung durch die Abbildung (Bögen drehen die Richtung). Ergebnis: { segs, circles, skipped }
   */
  function collect(doc) {
    const segs = [];
    const circles = [];
    const skipped = {};
    const walk = (ents, tf, mirror, depth) => {
      for (const e of ents) {
        if (num(e, 67, 0) === 1) continue; // Papierbereich (Layout, Zeichnungsrahmen) – nur Modellbereich zählt
        // OCS: Extrusion (0,0,−1) spiegelt X – nur bei Entitäten in Objektkoordinaten (LINE, ELLIPSE, SPLINE: Weltkoordinaten)
        const ez = num(e, 230, 1);
        const isOcs = /^(ARC|CIRCLE|LWPOLYLINE|POLYLINE|INSERT)$/.test(e.type);
        const ocs = ez < 0 && isOcs ? (p) => tf([-p[0], p[1]]) : tf;
        const mir = ez < 0 && isOcs ? !mirror : mirror;
        const P = (x, y) => ocs([x, y]);
        // ungleichmäßig skalierter Block: Kreise werden Ellipsen → als kurze Geraden
        const o0 = ocs([0, 0]);
        const ux = ocs([1, 0]);
        const uy = ocs([0, 1]);
        const uniform = Math.abs(Math.hypot(ux[0] - o0[0], ux[1] - o0[1]) - Math.hypot(uy[0] - o0[0], uy[1] - o0[1])) < 1e-9;
        const arcLines = (c, r, a0, a1) => {
          const n = Math.max(8, Math.ceil(((a1 - a0) / TWO_PI) * 96));
          const pt = (t) => P(c[0] + r * Math.cos(t), c[1] + r * Math.sin(t));
          for (let i = 0; i < n; i++) segs.push({ type: 'line', a: pt(a0 + ((a1 - a0) * i) / n), b: pt(a0 + ((a1 - a0) * (i + 1)) / n), approx: true });
        };
        const arcSeg = (c, r, a0, a1, ccw) => {
          // Punkte gegen den Uhrzeigersinn von a0 nach a1 (Grad) in der Entitätsebene
          const p0 = P(c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0));
          const p1 = P(c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1));
          const cc = P(c[0], c[1]);
          const rr = Math.hypot(p0[0] - cc[0], p0[1] - cc[1]);
          return { type: 'arc', a: p0, b: p1, c: cc, r: rr, ccw: mir ? !ccw : ccw };
        };
        switch (e.type) {
          case 'LINE': {
            const a = P(num(e, 10, 0), num(e, 20, 0));
            const b = P(num(e, 11, 0), num(e, 21, 0));
            if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) segs.push({ type: 'line', a: a, b: b });
            break;
          }
          case 'CIRCLE': {
            if (!uniform) { arcLines([num(e, 10, 0), num(e, 20, 0)], num(e, 40, 0), 0, TWO_PI); break; }
            const c = P(num(e, 10, 0), num(e, 20, 0));
            const q = P(num(e, 10, 0) + num(e, 40, 0), num(e, 20, 0));
            circles.push({ c: c, r: Math.hypot(q[0] - c[0], q[1] - c[1]) });
            break;
          }
          case 'ARC': {
            const a0 = (num(e, 50, 0) * Math.PI) / 180;
            let a1 = (num(e, 51, 0) * Math.PI) / 180;
            while (a1 <= a0) a1 += TWO_PI;
            if (!uniform) { arcLines([num(e, 10, 0), num(e, 20, 0)], num(e, 40, 0), a0, a1); break; }
            if (a1 - a0 >= TWO_PI - 1e-9) {
              const c = P(num(e, 10, 0), num(e, 20, 0));
              const q = P(num(e, 10, 0) + num(e, 40, 0), num(e, 20, 0));
              circles.push({ c: c, r: Math.hypot(q[0] - c[0], q[1] - c[1]) });
              break;
            }
            segs.push(arcSeg([num(e, 10, 0), num(e, 20, 0)], num(e, 40, 0), a0, a1, true));
            break;
          }
          case 'LWPOLYLINE':
          case 'POLYLINE': {
            const flags = num(e, 70, 0);
            if (flags & (16 | 64)) { skipped['3D-Netz'] = (skipped['3D-Netz'] || 0) + 1; break; }
            let vs = [];
            if (e.type === 'LWPOLYLINE') {
              let cur = null;
              for (const [c, v] of e.codes) {
                if (c === 10) { cur = { x: parseFloat(v), y: 0, b: 0 }; vs.push(cur); } else if (c === 20 && cur) cur.y = parseFloat(v);
                else if (c === 42 && cur) cur.b = parseFloat(v);
              }
            } else vs = e.vertices || [];
            const closed = (flags & 1) === 1;
            const n = vs.length;
            for (let i = 0; i < (closed ? n : n - 1); i++) {
              const v0 = vs[i];
              const v1 = vs[(i + 1) % n];
              const a = [v0.x, v0.y];
              const b = [v1.x, v1.y];
              if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
              if (Math.abs(v0.b) > 1e-9) {
                const g = bulgeArc(a, b, v0.b);
                if (g && !uniform) {
                  const a0 = Math.atan2(a[1] - g.c[1], a[0] - g.c[0]);
                  let a1 = Math.atan2(b[1] - g.c[1], b[0] - g.c[0]);
                  if (g.ccw) { while (a1 <= a0) a1 += TWO_PI; arcLines(g.c, g.r, a0, a1); } else {
                    while (a1 >= a0) a1 -= TWO_PI;
                    const n = segs.length;
                    arcLines(g.c, g.r, a1, a0);
                    const part = segs.splice(n).reverse().map(rev);
                    for (const q of part) segs.push(q);
                  }
                } else if (g) segs.push({ type: 'arc', a: P(a[0], a[1]), b: P(b[0], b[1]), c: P(g.c[0], g.c[1]), r: g.r * Math.abs(scaleOf(ocs)), ccw: mir ? !g.ccw : g.ccw });
              } else segs.push({ type: 'line', a: P(a[0], a[1]), b: P(b[0], b[1]) });
            }
            break;
          }
          case 'ELLIPSE': {
            const c = [num(e, 10, 0), num(e, 20, 0)];
            const mj = [num(e, 11, 0), num(e, 21, 0)];
            const ratio = num(e, 40, 1);
            let t0 = num(e, 41, 0);
            let t1 = num(e, 42, TWO_PI);
            while (t1 <= t0) t1 += TWO_PI;
            // kleine Achse = Normale × große Achse (Normale −Z: andere Seite, Umlauf im Uhrzeigersinn)
            const mn = ez < 0 ? [mj[1] * ratio, -mj[0] * ratio] : [-mj[1] * ratio, mj[0] * ratio];
            const N = Math.max(16, Math.ceil(((t1 - t0) / TWO_PI) * 96));
            const pt = (t) => P(c[0] + mj[0] * Math.cos(t) + mn[0] * Math.sin(t), c[1] + mj[1] * Math.cos(t) + mn[1] * Math.sin(t));
            for (let i = 0; i < N; i++) segs.push({ type: 'line', a: pt(t0 + ((t1 - t0) * i) / N), b: pt(t0 + ((t1 - t0) * (i + 1)) / N), approx: true });
            break;
          }
          case 'SPLINE': {
            const k = num(e, 71, 3);
            const knots = all(e, 40);
            const xs = all(e, 10);
            const ys = all(e, 20);
            const w = all(e, 41);
            const ctrl = xs.map((x, i) => [x, ys[i]]);
            let pts = [];
            if (ctrl.length > k && knots.length === ctrl.length + k + 1) {
              const N = Math.max(24, ctrl.length * 12);
              const ta = knots[k];
              const tb = knots[knots.length - k - 1];
              for (let i = 0; i <= N; i++) pts.push(deBoor(k, ta + ((tb - ta) * i) / N - (i === N ? 1e-9 : 0), knots, ctrl, w.length === ctrl.length ? w : null));
            } else {
              const fx = all(e, 11);
              const fy = all(e, 21);
              pts = fx.map((x, i) => [x, fy[i]]);
            }
            for (let i = 0; i + 1 < pts.length; i++) {
              const a = P(pts[i][0], pts[i][1]);
              const b = P(pts[i + 1][0], pts[i + 1][1]);
              if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) segs.push({ type: 'line', a: a, b: b, approx: true });
            }
            break;
          }
          case 'INSERT': {
            const blk = doc.blocks[(e.codes.find((q) => q[0] === 2) || [])[1]];
            if (!blk || depth > 8) break;
            const ins = [num(e, 10, 0), num(e, 20, 0)];
            const sx = num(e, 41, 1);
            const sy = num(e, 42, 1);
            const rot = (num(e, 50, 0) * Math.PI) / 180;
            const ca = Math.cos(rot);
            const sa = Math.sin(rot);
            // MINSERT: Reihen/Spalten (im gedrehten System)
            const cols = Math.max(1, num(e, 70, 1));
            const rows = Math.max(1, num(e, 71, 1));
            const dc = num(e, 44, 0);
            const dr = num(e, 45, 0);
            if (!blk.prepared) { blk.ents = attachVertices(blk.ents); blk.prepared = true; }
            for (let ci = 0; ci < cols; ci++) {
              for (let ri = 0; ri < rows; ri++) {
                const inner = (p) => {
                  const x = (p[0] - blk.base[0]) * sx + ci * dc;
                  const y = (p[1] - blk.base[1]) * sy + ri * dr;
                  return ocs([ins[0] + x * ca - y * sa, ins[1] + x * sa + y * ca]);
                };
                walk(blk.ents, inner, mir !== (sx * sy < 0), depth + 1);
              }
            }
            break;
          }
          case 'VERTEX': case 'SEQEND': break;
          default:
            if (!/^(TEXT|MTEXT|DIMENSION|HATCH|LEADER|MLEADER|POINT|SOLID|ATTDEF|ATTRIB|VIEWPORT|IMAGE|WIPEOUT|ACAD_TABLE)$/.test(e.type)) {
              skipped[e.type] = (skipped[e.type] || 0) + 1;
            }
        }
      }
    };
    walk(attachVertices(doc.entities), (p) => [p[0] * doc.unit, p[1] * doc.unit], false, 0);
    return { segs: segs, circles: circles, skipped: skipped };
  }

  // Maßstab einer Abbildung (für Radien)
  function scaleOf(tf) {
    const o = tf([0, 0]);
    const x = tf([1, 0]);
    return Math.hypot(x[0] - o[0], x[1] - o[1]);
  }

  // POLYLINE: folgende VERTEX-Einträge bis SEQEND an die Polylinie hängen
  function attachVertices(ents) {
    const out = [];
    let poly = null;
    for (const e of ents) {
      if (e.type === 'POLYLINE') { poly = e; poly.vertices = []; out.push(e); continue; }
      if (e.type === 'VERTEX' && poly) { if (num(e, 70, 0) & 16) continue; poly.vertices.push({ x: num(e, 10, 0), y: num(e, 20, 0), b: num(e, 42, 0) }); continue; }
      if (e.type === 'SEQEND') { poly = null; continue; }
      out.push(e);
    }
    return out;
  }

  // ---------------------------------------------------------------- Konturen

  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= TOL;
  const JOIN = 0.15; // Lücke, die beim Verbinden noch überbrückt wird (gerundete Bogenwinkel bei großen Radien)
  const joins = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= JOIN;
  const rev = (s) => (s.type === 'arc' ? { type: 'arc', a: s.b, b: s.a, c: s.c, r: s.r, ccw: !s.ccw, full: s.full } : { type: 'line', a: s.b, b: s.a, approx: s.approx });

  function arcPoints(s) {
    const a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
    let sw = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]) - a0;
    if (s.ccw) { while (sw <= 1e-12) sw += TWO_PI; } else { while (sw >= -1e-12) sw -= TWO_PI; }
    const n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 36)));
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([s.c[0] + s.r * Math.cos(a0 + (sw * i) / n), s.c[1] + s.r * Math.sin(a0 + (sw * i) / n)]);
    return pts;
  }
  const loopPts = (lp) => { const pts = []; for (const s of lp) for (const q of (s.type === 'arc' ? arcPoints(s) : [s.a])) pts.push(q); return pts; };
  function area(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i]; const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  function inPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  // Kontur in die gewünschte Richtung (ccw = gegen den Uhrzeigersinn)
  function orient(lp, ccw) {
    return (area(loopPts(lp)) > 0) === ccw ? lp : lp.slice().reverse().map(rev);
  }

  // Segmente zu geschlossenen Konturen verbinden (Richtung je Segment frei); übrig bleiben offene Ketten
  function chain(segs) {
    const rest = segs.slice();
    const loops = [];
    let open = 0;
    while (rest.length) {
      const lp = [rest.shift()];
      for (;;) {
        const end = lp[lp.length - 1].b;
        if (near(end, lp[0].a) && lp.length > 1) break;
        // erst genau passende Enden, dann kleine Lücken (Anfang des nächsten Segments auf das Ende ziehen)
        let i = rest.findIndex((s) => near(s.a, end));
        let back = false;
        if (i < 0) { i = rest.findIndex((s) => near(s.b, end)); back = i >= 0; }
        if (i < 0 && lp.length > 1 && joins(end, lp[0].a)) break; // schließt sich mit kleiner Lücke
        if (i < 0) i = rest.findIndex((s) => joins(s.a, end));
        if (i < 0) { i = rest.findIndex((s) => joins(s.b, end)); back = i >= 0; }
        if (i >= 0) {
          const s = rest.splice(i, 1)[0];
          lp.push(Object.assign(back ? rev(s) : Object.assign({}, s), { a: end }));
          continue;
        }
        break;
      }
      if (lp.length > 1 && joins(lp[lp.length - 1].b, lp[0].a)) {
        lp[lp.length - 1] = Object.assign({}, lp[lp.length - 1], { b: lp[0].a });
        loops.push(lp);
      } else if (lp.length === 1 && lp[0].type === 'arc' && near(lp[0].a, lp[0].b)) loops.push(lp);
      else open++;
    }
    return { loops: loops, open: open };
  }

  // genaue Umgrenzung aus den Segmenten (Bögen mit ihren Scheitelpunkten, nicht nur Stützpunkte)
  function segBox(segs) {
    const pts = [];
    for (const s of segs) {
      pts.push(s.a, s.b);
      if (s.type !== 'arc') continue;
      if (s.full) { pts.push([s.c[0] - s.r, s.c[1] - s.r], [s.c[0] + s.r, s.c[1] + s.r]); continue; }
      const a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
      let sw = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]) - a0;
      if (s.ccw) { while (sw <= 1e-12) sw += TWO_PI; } else { while (sw >= -1e-12) sw -= TWO_PI; }
      for (let k = 0; k < 4; k++) {
        const t = (k * Math.PI) / 2;
        let d = s.ccw ? t - a0 : a0 - t;
        while (d < 0) d += TWO_PI;
        while (d >= TWO_PI) d -= TWO_PI;
        if (d <= Math.abs(sw)) pts.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]);
      }
    }
    return bbox(pts);
  }

  // Kontur aus Bögen um denselben Mittelpunkt (Kreis aus zwei Halbbögen, Polylinie mit bulge 1) → Kreis
  function asCircle(lp) {
    if (!lp.every((q) => q.type === 'arc')) return null;
    const c = lp[0].c;
    const r = lp[0].r;
    if (!lp.every((q) => near(q.c, c) && Math.abs(q.r - r) <= TOL && q.ccw === lp[0].ccw)) return null;
    return { c: c, r: r };
  }

  function bbox(pts) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }

  /*
   * Plattenteil aus einer DXF. opts: { name, T (Dicke), rot (0–3, sonst automatisch: lange Seite in X),
   * drills (vorhandene Bohrer Ø), features: { id: { kind, depth } } (Änderungen je Erkennung) }
   * Ergebnis: Plattendaten wie PanelAnalyzer.analyze plus dxf: { features: [ { id, shape, kind, depth, … } ], T }.
   */
  function analyze(text, opts) {
    opts = opts || {};
    const doc = parse(text);
    const col = collect(doc);
    const warnings = [];
    const chained = chain(col.segs);
    // Kreise als volle Bögen; größte geschlossene Kontur = Teil
    const circles = col.circles.slice();
    const loops = [];
    for (const lp of chained.loops) { const k = asCircle(lp); if (k) circles.push(k); else loops.push(lp); }
    let shapes = loops.map((lp) => ({ kind: 'loop', segs: lp, pts: loopPts(lp) }))
      .concat(circles.map((c) => ({ kind: 'circle', c: c.c, r: c.r,
        segs: [{ type: 'arc', a: [c.c[0] + c.r, c.c[1]], b: [c.c[0] + c.r, c.c[1]], c: c.c, r: c.r, ccw: true, full: true }],
        pts: Array.from({ length: 72 }, (_, i) => [c.c[0] + c.r * Math.cos((i * TWO_PI) / 72), c.c[1] + c.r * Math.sin((i * TWO_PI) / 72)]) })));
    for (const s of shapes) s.area = Math.abs(area(s.pts));
    if (!shapes.length) throw new Error('Keine geschlossene Kontur in der DXF gefunden.');
    shapes.sort((a, b) => b.area - a.area);
    const outer = shapes[0];
    const bb0 = segBox(outer.segs);
    let L = bb0.x1 - bb0.x0;
    let W = bb0.y1 - bb0.y0;
    // stabile Kennung je Form (Lage in der Zeichnung, unabhängig von Drehen und Dicke) für die Änderungen je Erkennung
    for (const s of shapes) {
      const b = segBox(s.segs);
      s.id = (s.kind === 'circle' ? 'k' : 'f') + Math.round((b.x0 + b.x1 - 2 * bb0.x0) * 5) + '_' + Math.round((b.y0 + b.y1 - 2 * bb0.y0) * 5) + '_' + Math.round(s.area);
    }
    // doppelt gezeichnete Konturen (gleiche Kennung) nur einmal
    const seen = new Set();
    let dup = 0;
    shapes = shapes.filter((x) => { if (seen.has(x.id)) { dup++; return false; } seen.add(x.id); return true; });
    if (dup) warnings.push(dup + ' doppelt gezeichnete Kontur' + (dup === 1 ? '' : 'en') + ' – nur einmal verwendet.');
    // schräg gezeichnetes Teil: längste Gerade der Außenkontur nicht achsparallel
    const longest = outer.segs.filter((q) => q.type === 'line').sort((a, b) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) - Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]))[0];
    if (longest) {
      const ang = (Math.atan2(longest.b[1] - longest.a[1], longest.b[0] - longest.a[0]) * 180) / Math.PI;
      const off = Math.abs(ang - 90 * Math.round(ang / 90));
      if (off > 0.05) warnings.push('Teil liegt in der Zeichnung um ' + Math.round(off * 10) / 10 + '° schräg – in der DXF gerade ausrichten (Rohteil = umschließendes Rechteck).');
    }
    const rot = opts.rot === undefined || opts.rot === null ? (W > L + 1e-6 ? 1 : 0) : ((opts.rot % 4) + 4) % 4;
    // in Plattenkoordinaten: nach vorne links schieben, ggf. um 90° drehen (wie bei STEP: gegen den Uhrzeigersinn)
    let mapP = (p) => [p[0] - bb0.x0, p[1] - bb0.y0];
    for (let i = 0; i < rot; i++) {
      const prev = mapP;
      const w = W;
      mapP = (p) => { const q = prev(p); return [w - q[1], q[0]]; };
      [L, W] = [W, L];
    }
    const mapSeg = (s) => (s.type === 'arc' ? Object.assign({}, s, { a: mapP(s.a), b: mapP(s.b), c: mapP(s.c) }) : Object.assign({}, s, { a: mapP(s.a), b: mapP(s.b) }));
    for (const s of shapes) { s.segs = s.segs.map(mapSeg); s.pts = s.pts.map(mapP); if (s.c) s.c = mapP(s.c); }
    const T = opts.T > 0 ? opts.T : 19;
    const drills = opts.drills || [3, 5, 7, 8, 10, 12, 15, 20, 35];
    // Erkennungen innerhalb der Kontur, verschachtelt (Eltern = kleinste umschließende Kontur)
    const inner = shapes.slice(1).filter((s) => s.pts.every((p) => inPoly(p, outer.pts)) || s.pts.filter((p) => inPoly(p, outer.pts)).length > s.pts.length * 0.9);
    const crossing = inner.filter((s) => !s.pts.every((p) => inPoly(p, outer.pts))).length;
    if (crossing) warnings.push(crossing + ' Kontur' + (crossing === 1 ? '' : 'en') + ' ragt über die Außenkontur – Lage in der DXF prüfen.');
    const outside = shapes.length - 1 - inner.length;
    if (outside) warnings.push(outside + ' Kontur(en) außerhalb des Teils – übergangen.');
    if (chained.open) warnings.push(chained.open + (chained.open === 1 ? ' offener Linienzug' : ' offene Linienzüge') + ' – übergangen (keine geschlossene Kontur).');
    for (const [t, n] of Object.entries(col.skipped)) warnings.push(n + ' × ' + t + ' – übergangen.');
    inner.sort((a, b) => a.area - b.area);
    const feats = [];
    inner.forEach((s) => {
      s.parent = null;
      for (const o of inner) if (o !== s && o.area > s.area && s.pts.every((p) => inPoly(p, o.pts))) { if (!s.parent || o.area < s.parent.area) s.parent = o; }
      s.bb = segBox(s.segs);
    });
    // Vorgabetiefen (dünne Platten: durch)
    const drillDepth = (d) => (T > 4 ? Math.min(d >= 30 ? 13 : 12, T - 2) : T);
    const pocketDepth = () => (T > 4 ? Math.min(5, T - 2) : T / 2);
    // Vorschläge (Kinder vor Eltern sortiert → Eltern zuerst entscheiden)
    const byArea = inner.slice().sort((a, b) => b.area - a.area);
    for (const s of byArea) {
      const ov = (opts.features || {})[s.id] || {};
      const d = s.kind === 'circle' ? 2 * s.r : 0;
      let kind;
      let depth;
      const parentKind = s.parent && s.parent.f ? s.parent.f.kind : null;
      // liegt im herausfallenden Stück (Eltern Durchbruch oder selbst darin)
      const dead = !!(s.parent && s.parent.f && (s.parent.f.kind === 'cutout' || s.parent.f.dead));
      if (dead) kind = 'ignore';
      else if (parentKind === 'pocket') kind = 'island';
      else if (s.kind === 'circle' && drills.some((x) => Math.abs(x - d) < 0.05)) { kind = 'drill'; depth = drillDepth(d); }
      else kind = 'cutout';
      const sug = { kind: kind, depth: depth };
      if (ov.kind && (s.kind === 'circle' || ov.kind !== 'drill')) kind = ov.kind;
      if (kind === 'island' && parentKind !== 'pocket') kind = sug.kind === 'island' ? 'ignore' : sug.kind;
      if (ov.depth > 0) depth = ov.depth;
      if (kind === 'drill' && !(depth > 0)) depth = drillDepth(d);
      if (kind === 'pocket' && !(depth > 0)) depth = pocketDepth();
      s.f = { id: s.id, shape: s.kind, d: d, w: s.bb.x1 - s.bb.x0, h: s.bb.y1 - s.bb.y0, x: (s.bb.x0 + s.bb.x1) / 2, y: (s.bb.y0 + s.bb.y1) / 2,
        kind: kind, depth: depth, suggested: sug.kind, parent: s.parent ? s.parent.id : null, parentKind: parentKind, dead: dead };
      feats.push(s.f);
    }
    // Plattendaten
    const res = { L: L, W: W, T: T, outline: orient(outer.segs, true), cutouts: [], drills: [], circles: [], grooves: [], rebates: [],
      pockets: [], sidePockets: [], slantPlanes: [], chamfers: [], chamferPaths: [], slantWalls: [], slantDrills: [], bottom: [],
      curvedSlants: [], curvedSurfaces: [], edgeRounds: [], warnings: warnings, name: opts.name || 'DXF',
      tf: { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] }, orientation: { rot: rot, flip: false } };
    res.base = res.outline;
    // Rechteck: nur Geraden, jede auf einer der vier Seiten (auch mit Zwischenpunkten)
    res.outlineIsRect = res.outline.every((s) => s.type === 'line' &&
      [[0, 0], [0, L], [1, 0], [1, W]].some(([k, v]) => Math.abs(s.a[k] - v) < TOL && Math.abs(s.b[k] - v) < TOL));
    for (const s of byArea) {
      const f = s.f;
      if (f.kind === 'drill' && s.kind === 'circle') {
        const through = f.depth >= T - 1e-6;
        res.drills.push({ face: 'Top', x: s.c[0], y: s.c[1], d: f.d, depth: through ? T : f.depth, through: through });
      } else if (f.kind === 'cutout') {
        res.cutouts.push(orient(s.segs, false));
      } else if (f.kind === 'pocket') {
        const islands = byArea.filter((c) => c.parent === s && c.f.kind === 'island').map((c) => orient(c.segs, false));
        const segs = orient(s.segs, true);
        let minR = Infinity;
        for (const q of segs) if (q.type === 'arc' && q.ccw && !q.full) minR = Math.min(minR, q.r);
        res.pockets.push({ x0: s.bb.x0, y0: s.bb.y0, x1: s.bb.x1, y1: s.bb.y1, depth: Math.min(f.depth, T), segs: segs, islands: islands,
          minRadius: minR, open: [] });
        if (f.depth >= T - 1e-6) warnings.push('Tasche so tief wie die Platte – besser als Durchbruch.');
      }
    }
    res.pockets.sort((a, b) => a.depth - b.depth);
    if (col.segs.some((s) => s.approx)) warnings.push('Ellipsen, Splines bzw. verzerrte Bögen als kurze Geraden angenähert.');
    res.dxf = { features: feats.sort((a, b) => a.x - b.x || a.y - b.y), T: T };
    return res;
  }

  return { parse: parse, analyze: analyze, chain: chain };
});
