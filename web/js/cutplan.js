/*
 * Zuschnittplan: Teile (Rechtecke) auf Rohplatten verteilen – Guillotine-Schnitte (durchgehend, wie an der Plattensäge),
 * Schnittfuge und Besäumrand, Faserrichtung (Teil mit der langen Seite längs der Plattenlänge, nicht drehen).
 * plan(items, opts) → { sheets: [{ L, W, parts: [{ uid, id, label, x, y, l, w, rot, grain }], used }], unplaced: [items], waste }
 * fits(sheet, part, opts, skipUid) – passt das Teil dort (innerhalb Besäumen, Abstand Schnittfuge zu allen anderen)?
 *   items: [{ id, label, L, W, qty, orient }]  (orient 'long' | 'cross' | 'free'; alt: grain = true → 'long')
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
    // je Stück eine feste Kennung (uid = id#Stück) – für das Verschieben von Hand
    for (const it of items) for (let q = 0; q < (it.qty === undefined ? 1 : it.qty); q++) list.push(Object.assign({}, it, { uid: it.id + '#' + (q + 1) }));
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
      // Faserrichtung je Teil: 'long' = lange Seite längs der Platte, 'cross' = quer (gedreht), 'free' = beides erlaubt
      const or = it.orient || (it.grain ? 'long' : 'free');
      if (Math.abs(a.l - a.w) < 1e-6 || or === 'long') return [a];
      return or === 'cross' ? [b] : [a, b];
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
      s.parts.push({ uid: it.uid, id: it.id, label: it.label, x: f.x, y: f.y, l: l, w: w, rot: rot, grain: (it.orient || (it.grain ? 'long' : 'free')) !== 'free' });
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

  // Lage prüfen (Verschieben von Hand): innerhalb der besäumten Platte und mit Schnittfuge zu allen anderen Teilen
  function fits(sheet, p, opts, skipUid) {
    const o = Object.assign({ kerf: 4.4, trim: 10 }, opts || {});
    const e = 1e-6;
    if (p.x < o.trim - e || p.y < o.trim - e || p.x + p.l > sheet.L - o.trim + e || p.y + p.w > sheet.W - o.trim + e) return false;
    for (const q of sheet.parts) {
      if (q.uid === skipUid) continue;
      const apart = p.x + p.l + o.kerf <= q.x + e || q.x + q.l + o.kerf <= p.x + e || p.y + p.w + o.kerf <= q.y + e || q.y + q.w + o.kerf <= p.y + e;
      if (!apart) return false;
    }
    return true;
  }

  /*
   * Schnittfolge einer Platte wie an der Plattensäge: durchgehende Schnitte (Guillotine), zuerst längs (waagerecht in der
   * Zeichnung = parallel zur Plattenlänge), den abgetrennten Streifen dann quer, darin wieder längs …; Abfall wird mit
   * abgeschnitten, wo ein Teil kleiner als sein Feld ist. Reihenfolge = Abarbeitung (erst den abgetrennten Streifen fertig,
   * dann weiter am Rest). Ein Schnitt liegt bei c, die Schnittfuge belegt c … c + kerf.
   * → { cuts: [{ n, dir: 'h'|'v', c, from, to }], ok } (ok = false: von Hand so gelegt, dass nicht alles durchgehend trennbar ist)
   */
  function cutSequence(sheet, opts) {
    const o = Object.assign({ kerf: 4.4, trim: 10 }, opts || {});
    const k = Math.max(0, o.kerf);
    const e = 0.5;
    const cuts = [];
    let ok = true;
    const inside = (p, r) => p.x >= r.x0 - e && p.y >= r.y0 - e && p.x + p.l <= r.x1 + e && p.y + p.w <= r.y1 + e;
    // gültige Schnittlagen in Richtung dir ('h' = Linie y = c)
    const candidates = (r, parts, dir) => {
      const lo = dir === 'h' ? r.y0 : r.x0;
      const hi = dir === 'h' ? r.y1 : r.x1;
      const a = (p) => (dir === 'h' ? p.y : p.x);
      const s2 = (p) => (dir === 'h' ? p.w : p.l);
      const cs = [];
      for (const p of parts) cs.push(a(p) + s2(p), a(p) - k);
      return cs.filter((c) => c > lo + e && c + k < hi - e + k && c < hi - e &&
        parts.every((p) => a(p) + s2(p) <= c + e || a(p) >= c + k - e)).sort((x, y) => x - y);
    };
    function run(r, dir, depth) {
      if (depth > 200) { ok = false; return; }
      const parts = sheet.parts.filter((p) => inside(p, r));
      if (!parts.length) return; // Abfall
      if (parts.length === 1) {
        const p = parts[0];
        if (Math.abs(p.x - r.x0) < e && Math.abs(p.y - r.y0) < e && Math.abs(p.x + p.l - r.x1) < e && Math.abs(p.y + p.w - r.y1) < e) return;
      }
      for (const d of [dir, dir === 'h' ? 'v' : 'h']) {
        const cs = candidates(r, parts, d);
        if (!cs.length) continue;
        const c = cs[0];
        cuts.push({ n: cuts.length + 1, dir: d, c: c, from: d === 'h' ? r.x0 : r.y0, to: d === 'h' ? r.x1 : r.y1 });
        const first = d === 'h' ? { x0: r.x0, y0: r.y0, x1: r.x1, y1: c } : { x0: r.x0, y0: r.y0, x1: c, y1: r.y1 };
        const rest = d === 'h' ? { x0: r.x0, y0: c + k, x1: r.x1, y1: r.y1 } : { x0: c + k, y0: r.y0, x1: r.x1, y1: r.y1 };
        run(first, d === 'h' ? 'v' : 'h', depth + 1); // abgetrennten Streifen fertig schneiden (quer dazu)
        run(rest, d, depth + 1); // dann am Rest weiter in derselben Richtung
        return;
      }
      if (parts.length > 1) ok = false; // nicht durchgehend trennbar
    }
    run({ x0: o.trim, y0: o.trim, x1: sheet.L - o.trim, y1: sheet.W - o.trim }, 'h', 0);
    return { cuts: cuts, ok: ok };
  }

  return { plan: plan, fits: fits, cutSequence: cutSequence };
});
