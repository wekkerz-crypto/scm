/*
 * Zuschnittplan: Teile (Rechtecke) auf Rohplatten verteilen – Guillotine-Schnitte (durchgehend, wie an der Plattensäge),
 * Schnittfuge und Besäumrand, Faserrichtung (Teil mit der langen Seite längs der Plattenlänge, nicht drehen).
 * plan(items, opts) → { sheets: [{ L, W, parts: [{ id, label, x, y, l, w, rot }], used }], unplaced: [items], waste }
 *   items: [{ id, label, L, W, qty, grain }]  (grain: Maserung beachten → nicht drehen)
 *   opts:  { sheetL, sheetW, kerf, trim }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CutPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function plan(items, opts) {
    const o = Object.assign({ sheetL: 2800, sheetW: 2070, kerf: 4.4, trim: 10 }, opts || {});
    const UL = o.sheetL - 2 * o.trim;
    const UW = o.sheetW - 2 * o.trim;
    const k = Math.max(0, o.kerf);
    // Einzelteile, größte zuerst (lange Seite, dann Fläche)
    const list = [];
    for (const it of items) for (let q = 0; q < (it.qty === undefined ? 1 : it.qty); q++) list.push(it);
    list.sort((a, b) => Math.max(b.L, b.W) - Math.max(a.L, a.W) || b.L * b.W - a.L * a.W);
    const sheets = [];
    const unplaced = [];
    const newSheet = () => {
      const s = { L: o.sheetL, W: o.sheetW, parts: [], free: [{ x: o.trim, y: o.trim, l: UL, w: UW }], used: 0 };
      sheets.push(s);
      return s;
    };
    // Lagen eines Teils: mit Maserung lange Seite längs der Plattenlänge, sonst beide
    const orients = (it) => {
      const a = { l: Math.max(it.L, it.W), w: Math.min(it.L, it.W), rot: it.L < it.W };
      const b = { l: a.w, w: a.l, rot: !a.rot };
      return it.grain || Math.abs(a.l - a.w) < 1e-6 ? [a] : [a, b];
    };
    // bester freier Platz (kürzester Rest an der kürzeren Seite) in einer Platte
    const best = (s, it) => {
      let r = null;
      s.free.forEach((f, i) => {
        for (const or of orients(it)) {
          if (or.l <= f.l + 1e-6 && or.w <= f.w + 1e-6) {
            const score = Math.min(f.l - or.l, f.w - or.w);
            const score2 = Math.max(f.l - or.l, f.w - or.w);
            if (!r || score < r.score - 1e-6 || (Math.abs(score - r.score) <= 1e-6 && score2 < r.score2)) r = { i: i, or: or, score: score, score2: score2 };
          }
        }
      });
      return r;
    };
    for (const it of list) {
      let s = null;
      let pick = null;
      for (const sh of sheets) { const r = best(sh, it); if (r) { s = sh; pick = r; break; } }
      if (!pick) {
        const sh = newSheet();
        const r = best(sh, it);
        if (!r) { sheets.pop(); unplaced.push(it); continue; }
        s = sh;
        pick = r;
      }
      const f = s.free.splice(pick.i, 1)[0];
      const { l, w, rot } = pick.or;
      s.parts.push({ id: it.id, label: it.label, x: f.x, y: f.y, l: l, w: w, rot: rot });
      s.used += l * w;
      // Guillotine-Teilung des Rests (Schnittfuge abziehen): entlang der kürzeren Restseite schneiden
      const rl = f.l - l - k;
      const rw = f.w - w - k;
      const splitAlongL = rl < rw; // waagerechter Schnitt über die ganze freie Länge
      const right = { x: f.x + l + k, y: f.y, l: rl, w: splitAlongL ? w : f.w };
      const top = { x: f.x, y: f.y + w + k, l: splitAlongL ? f.l : l, w: rw };
      for (const n of [right, top]) if (n.l > 1 && n.w > 1) s.free.push(n);
    }
    let usedAll = 0;
    for (const s of sheets) { delete s.free; usedAll += s.used; }
    const areaAll = sheets.length * o.sheetL * o.sheetW;
    return { sheets: sheets, unplaced: unplaced, waste: areaAll ? 1 - usedAll / areaAll : 0 };
  }

  return { plan: plan };
});
