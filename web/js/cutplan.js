/*
 * Zuschnittplan: Teile (Rechtecke) auf Rohplatten verteilen – Guillotine-Schnitte (durchgehend, wie an der Plattensäge),
 * Schnittfuge und Besäumrand, Faserrichtung (Teil mit der langen Seite längs der Plattenlänge, nicht drehen).
 * plan(items, opts) → { sheets: [{ L, W, parts: [{ uid, id, label, x, y, l, w, rot, grain }], used }], unplaced: [items], waste }
 *   opts.dir 'auto' | 'long' | 'cross' (erster Schnitt längs/quer bevorzugt), opts.goal 'waste' | 'cuts' (Verschnitt oder Schnitte),
 *   opts.fromTop = Teile oben links beginnen (in der Zeichnung; Plattenkoordinaten y nach oben → an der hinteren Kante)
 * fits(sheet, part, opts, skipUid) – passt das Teil dort (innerhalb Besäumen, Abstand Schnittfuge zu allen anderen)?
 *   items: [{ id, label, L, W, qty, orient }]  (orient 'long' | 'cross' | 'free'; alt: grain = true → 'long')
 *   opts:  { sheetL, sheetW, kerf, trim }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CutPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Lagen eines Teils: mit Maserung lange Seite längs der Plattenlänge, sonst beide
  function orients(it) {
    const a = { l: Math.max(it.L, it.W), w: Math.min(it.L, it.W), rot: it.L < it.W };
    const b = { l: a.w, w: a.l, rot: !a.rot };
    // Faserrichtung je Teil: 'long' = lange Seite längs der Platte, 'cross' = quer (gedreht), 'free' = beides erlaubt
    const or = orientOf(it);
    if (Math.abs(a.l - a.w) < 1e-6 || or === 'long') return [a];
    return or === 'cross' ? [b] : [a, b];
  }
  const orientOf = (it) => it.orient || (it.grain ? 'long' : 'free');
  const partOf = (it, x, y, or) => ({ uid: it.uid, id: it.id, label: it.label, x: x, y: y, l: or.l, w: or.w, rot: or.rot, grain: orientOf(it) !== 'free' });

  // freie Aufteilung (Guillotine, Rest entlang der kürzeren Seite teilen) – Richtung ergibt sich je Teil
  function packFree(list, o) {
    const UL = o.sheetL - 2 * o.trim;
    const UW = o.sheetW - 2 * o.trim;
    const k = Math.max(0, o.kerf);
    const sheets = [];
    const unplaced = [];
    const newSheet = () => {
      const s = { L: o.sheetL, W: o.sheetW, parts: [], free: [{ x: o.trim, y: o.trim, l: UL, w: UW }], used: 0 };
      sheets.push(s);
      return s;
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
      const { l, w } = pick.or;
      s.parts.push(partOf(it, f.x, f.y, pick.or));
      s.used += l * w;
      // Guillotine-Teilung des Rests (Schnittfuge abziehen): entlang der kürzeren Restseite schneiden
      const rl = f.l - l - k;
      const rw = f.w - w - k;
      const splitAlongL = rl < rw; // waagerechter Schnitt über die ganze freie Länge
      const right = { x: f.x + l + k, y: f.y, l: rl, w: splitAlongL ? w : f.w };
      const top = { x: f.x, y: f.y + w + k, l: splitAlongL ? f.l : l, w: rw };
      for (const n of [right, top]) if (n.l > 1 && n.w > 1) s.free.push(n);
    }
    for (const s of sheets) delete s.free;
    return { sheets: sheets, unplaced: unplaced, dir: 'auto' };
  }

  /*
   * Streifen wie an der Plattensäge: dir 'long' = erst Längsschnitte (Streifen über die ganze Plattenlänge), darin quer
   * ablängen; 'cross' = erst Querschnitte (Streifen über die ganze Plattenbreite), darin längs. Gerechnet wird in
   * Streifen-Koordinaten (a = längs des Streifens, h = Streifenbreite), danach zurück auf die Platte.
   *   v: { pref: 'flat' | 'tall' (Lage beim Anlegen eines neuen Streifens), stack (Teile im Feld übereinander), exact (nur gleich breite Teile in einen Streifen) }
   */
  function packStrips(list, o, dir, v) {
    const UL = o.sheetL - 2 * o.trim;
    const UW = o.sheetW - 2 * o.trim;
    const k = Math.max(0, o.kerf);
    const cross = dir === 'cross';
    const A = cross ? UW : UL;
    const B = cross ? UL : UW;
    const e = 1e-6;
    const ors = (it) => orients(it).map((or) => ({ or: or, a: cross ? or.w : or.l, h: cross ? or.l : or.w }));
    const sheets = [];
    const unplaced = [];
    for (const it of list) {
      const opts = ors(it);
      let done = false;
      // 1. in ein vorhandenes Feld stapeln, 2. in einen vorhandenen Streifen anhängen (am besten passende Breite)
      for (const sh of sheets) {
        let best = null;
        for (const st of sh.strips) {
          for (const c of opts) {
            if (c.h > st.h + e) continue;
            const gap = st.h - c.h;
            if (v.exact && gap > e) continue;
            if (v.stack) {
              for (const col of st.cols) {
                if (c.a <= col.a + e && col.fill + k + c.h <= st.h + e) {
                  const sc = [0, col.a - c.a, st.h - col.fill - k - c.h];
                  if (!best || less(sc, best.sc)) best = { sc: sc, st: st, col: col, c: c };
                }
              }
            }
            if (st.usedA + c.a <= A + e) {
              const sc = [1, gap, A - st.usedA - c.a];
              if (!best || less(sc, best.sc)) best = { sc: sc, st: st, c: c };
            }
          }
        }
        if (best) {
          const { st, c } = best;
          if (best.col) {
            best.col.items.push({ it: it, c: c, a: best.col.pos, b: st.pos + best.col.fill + k });
            best.col.fill += k + c.h;
          } else {
            st.cols.push({ pos: st.usedA, a: c.a, fill: c.h, items: [{ it: it, c: c, a: st.usedA, b: st.pos }] });
            st.usedA += c.a + k;
          }
          done = true;
          break;
        }
        // 3. neuer Streifen auf dieser Platte
        const fit = opts.filter((c) => c.a <= A + e && sh.usedB + c.h <= B + e);
        if (fit.length) { newStrip(sh, fit); done = true; break; }
      }
      if (done) continue;
      const fit = opts.filter((c) => c.a <= A + e && c.h <= B + e);
      if (!fit.length) { unplaced.push(it); continue; }
      const sh = { strips: [], usedB: 0 };
      sheets.push(sh);
      newStrip(sh, fit);

      function newStrip(sh2, fit2) {
        fit2.sort((p, q) => (v.pref === 'tall' ? q.h - p.h : p.h - q.h));
        const c = fit2[0];
        const st = { pos: sh2.usedB, h: c.h, usedA: c.a + k, cols: [{ pos: 0, a: c.a, fill: c.h, items: [{ it: it, c: c, a: 0, b: sh2.usedB }] }] };
        sh2.strips.push(st);
        sh2.usedB += c.h + k;
      }
    }
    return {
      sheets: sheets.map((sh) => {
        const parts = [];
        for (const st of sh.strips) for (const col of st.cols) for (const p of col.items) {
          parts.push(partOf(p.it, o.trim + (cross ? p.b : p.a), o.trim + (cross ? p.a : p.b), p.c.or));
        }
        return { L: o.sheetL, W: o.sheetW, parts: parts, used: parts.reduce((s2, p) => s2 + p.l * p.w, 0) };
      }),
      unplaced: unplaced,
      dir: dir,
    };
  }
  // lexikografischer Vergleich von Bewertungen
  function less(p, q) {
    for (let i = 0; i < p.length; i++) {
      if (p[i] < q[i] - 1e-6) return true;
      if (p[i] > q[i] + 1e-6) return false;
    }
    return false;
  }

  /*
   * Zuschnittplan. opts.dir: 'auto' (frei), 'long' (Längsschnitte zuerst – Streifen über die Plattenlänge) oder 'cross'
   * (Querschnitte zuerst); opts.goal: 'waste' (wenig Verschnitt: wenig Platten, großes Reststück) oder 'cuts' (wenig
   * Schnitte, einfach zu sägen). Es werden mehrere Varianten gerechnet und die beste nach dem Ziel genommen.
   */
  function plan(items, opts) {
    const o = Object.assign({ sheetL: 2800, sheetW: 2070, kerf: 4.4, trim: 10, dir: 'auto', goal: 'waste' }, opts || {});
    // Einzelteile; je Stück eine feste Kennung (uid = id#Stück) – für das Verschieben von Hand
    const list = [];
    for (const it of items) for (let q = 0; q < (it.qty === undefined ? 1 : it.qty); q++) list.push(Object.assign({}, it, { uid: it.id + '#' + (q + 1) }));
    const big = (a, b) => Math.max(b.L, b.W) - Math.max(a.L, a.W) || b.L * b.W - a.L * a.W;
    const sorts = [
      big,
      (a, b) => b.L * b.W - a.L * a.W || big(a, b),
      (a, b) => Math.min(b.L, b.W) - Math.min(a.L, a.W) || big(a, b),
    ];
    const cands = [];
    if (o.dir === 'auto') cands.push(packFree(list.slice().sort(big), o));
    const dirs = o.dir === 'auto' ? ['long', 'cross'] : [o.dir];
    for (const d of dirs) for (const so of sorts) for (const pref of ['flat', 'tall']) for (const stack of [true, false]) for (const exact of [false, true]) {
      if (exact && stack) continue;
      cands.push(packStrips(list.slice().sort(so), o, d, { pref: pref, stack: stack, exact: exact }));
    }
    const UL = o.sheetL - 2 * o.trim;
    const UW = o.sheetW - 2 * o.trim;
    let best = null;
    for (const c of cands) {
      // Reststück der letzten Platte (größtes Rechteck hinter oder über den Teilen)
      const last = c.sheets[c.sheets.length - 1];
      let rest = 0;
      if (last) {
        const mx = Math.max(...last.parts.map((p) => p.x + p.l)) - o.trim;
        const my = Math.max(...last.parts.map((p) => p.y + p.w)) - o.trim;
        rest = Math.max((UL - mx) * UW, (UW - my) * UL);
      }
      const cuts = c.sheets.reduce((s2, sh) => s2 + cutSequence(sh, Object.assign({}, o, { dir: c.dir })).cuts.length, 0);
      const sc = o.goal === 'cuts' ? [c.unplaced.length, c.sheets.length, cuts, -rest] : [c.unplaced.length, c.sheets.length, -rest, cuts];
      if (!best || less(sc, best.sc)) best = { sc: sc, c: c, cuts: cuts };
    }
    const r = best.c;
    const usedAll = r.sheets.reduce((s2, sh) => s2 + sh.used, 0);
    const areaAll = r.sheets.length * o.sheetL * o.sheetW;
    // fromTop: Anordnung beginnt oben links (an der hinteren Kante, y gespiegelt) statt unten links
    if (o.fromTop) for (const sh of r.sheets) for (const p of sh.parts) p.y = sh.W - p.y - p.w;
    return { sheets: r.sheets, unplaced: r.unplaced, waste: areaAll ? 1 - usedAll / areaAll : 0, dir: r.dir, cuts: best.cuts };
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
   * → { cuts: [{ n, dir: 'h'|'v', c, from, to, level, kind, size, rest, parts, done }], ok } (ok = false: von Hand so gelegt, dass
   *   nicht alles durchgehend trennbar ist). Für den Sägemodus je Schnitt: level 0 = Streifen von der Platte, 1 = quer im Streifen,
   *   2 … = wieder längs; kind 'strip' | 'cross' | 'trim' (Nachschnitt: nur noch ein Teil im Stück, Überstand ab) | 'waste'
   *   (vorn liegt nur Abfall); size = Maß des abgetrennten Stücks ab Anschlag (c − Stückanfang), rest = was danach übrig bleibt
   *   (restParts = Teile darin; 0 = Reststück/Abfall),
   *   parts = Teile im abgetrennten Stück (uid), done = Teile, die mit diesem Schnitt fertig sind, side 'lo' | 'hi' = Lage des
   *   abgetrennten Stücks (hi = bei höheren Koordinaten, wenn von rechts/hinten begonnen wird), sn = Nummer des Streifens.
   *   strips: [{ n, region, dir, parts }] = Streifen von der Platte (Ebene 0) in Schnittreihenfolge.
   * Einstellbar (Sägemodus): flipX / flipY = am rechten / hinteren Rand beginnen; order 'depth' (jeden Streifen gleich fertig) |
   * 'strips' (erst alle Streifen abtrennen, dann quer); trims 'now' | 'strip' (Nachschnitte nach dem Streifen) | 'end' (am Schluss);
   * trimMax (mm) / trimPct (%) = bis zu welchem Überstand ein Schnitt Nachschnitt heißt.
   */
  function cutSequence(sheet, opts) {
    const o = Object.assign({ kerf: 4.4, trim: 10, order: 'depth', trims: 'now', trimMax: 150, trimPct: 30 }, opts || {});
    // von rechts / hinten beginnen: Platte gespiegelt rechnen, Schnitte danach zurückspiegeln
    if (o.flipX || o.flipY) {
      const fx = !!o.flipX;
      const fy = !!o.flipY;
      const mir = { L: sheet.L, W: sheet.W, parts: sheet.parts.map((p) => Object.assign({}, p, { x: fx ? sheet.L - p.x - p.l : p.x, y: fy ? sheet.W - p.y - p.w : p.y })) };
      const res = cutSequence(mir, Object.assign({}, o, { flipX: false, flipY: false }));
      const kk = Math.max(0, o.kerf);
      for (const c of res.cuts) {
        const flipC = c.dir === 'h' ? fy : fx; // Schnittlage gespiegelt → abgetrenntes Stück liegt oben/rechts
        const flipA = c.dir === 'h' ? fx : fy; // Schnitt läuft in der anderen Achse gespiegelt
        const S = c.dir === 'h' ? sheet.W : sheet.L;
        const A = c.dir === 'h' ? sheet.L : sheet.W;
        if (flipC) c.c = S - c.c - kk;
        if (flipA) { const f = c.from; c.from = A - c.to; c.to = A - f; }
        c.side = flipC ? 'hi' : 'lo';
        c.start = flipA ? c.to : c.from;
        const r = c.region;
        c.region = { x0: fx ? sheet.L - r.x1 : r.x0, x1: fx ? sheet.L - r.x0 : r.x1, y0: fy ? sheet.W - r.y1 : r.y0, y1: fy ? sheet.W - r.y0 : r.y1 };
      }
      for (const st of res.strips) {
        const r = st.region;
        st.region = { x0: fx ? sheet.L - r.x1 : r.x0, x1: fx ? sheet.L - r.x0 : r.x1, y0: fy ? sheet.W - r.y1 : r.y0, y1: fy ? sheet.W - r.y0 : r.y1 };
      }
      return res;
    }
    const k = Math.max(0, o.kerf);
    const e = 0.5;
    const cuts = [];
    // Streifen = Stücke, die direkt von der Platte kommen (Ebene 0), in Schnittreihenfolge; id = Schnitt, der ihn abtrennt
    const strips = [];
    const addStrip = (id, r, d) => strips.push({ id: id, region: r, dir: d, parts: sheet.parts.filter((p) => inside(p, r)).map((p) => p.uid) });
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
    // erst alle Streifen, dann quer: die Stücke der Streifen-Ebene werden später geschnitten
    const later = [];
    // by = Nummer (Index) des Schnitts, der das Stück r abgetrennt hat – ein Teil ist fertig, sobald sein Stück genau passt;
    // ctx = { strip: Streifen-Schnitt darüber, tg: Nachschnitt darüber (Gruppe, die beim Umsortieren zusammenbleibt) }
    function run(r, dir, depth, level, by, ctx) {
      ctx = ctx || { strip: -1, tg: -1 };
      if (depth > 200) { ok = false; return; }
      const parts = sheet.parts.filter((p) => inside(p, r));
      if (!parts.length) return; // Abfall
      if (parts.length === 1) {
        const p = parts[0];
        if (Math.abs(p.x - r.x0) < e && Math.abs(p.y - r.y0) < e && Math.abs(p.x + p.l - r.x1) < e && Math.abs(p.y + p.w - r.y1) < e) {
          if (by >= 0) cuts[by].done.push(p.uid);
          if (level === 0 && depth > 0) addStrip('r' + by, r, dir); // letzter Streifen passt genau – kein eigener Schnitt
          return;
        }
      }
      for (const d of [dir, dir === 'h' ? 'v' : 'h']) {
        const cs = candidates(r, parts, d);
        if (!cs.length) continue;
        const c = cs[0];
        const first = d === 'h' ? { x0: r.x0, y0: r.y0, x1: r.x1, y1: c } : { x0: r.x0, y0: r.y0, x1: c, y1: r.y1 };
        const rest = d === 'h' ? { x0: r.x0, y0: c + k, x1: r.x1, y1: r.y1 } : { x0: c + k, y0: r.y0, x1: r.x1, y1: r.y1 };
        const lo = d === 'h' ? r.y0 : r.x0;
        const hi = d === 'h' ? r.y1 : r.x1;
        const inFirst = parts.filter((p) => inside(p, first)).map((p) => p.uid);
        // Querrichtung gewechselt (keine Lage in der Vorzugsrichtung): gleiche Ebene, sonst eine tiefer
        const lv = d === dir ? level : level + 1;
        const restLen = Math.max(0, hi - c - k);
        // Nachschnitt: nur noch ein Teil im Stück und wenig Überstand (bis 150 mm bzw. 30 % des Maßes)
        const kind = !inFirst.length ? 'waste' : parts.length === 1 && restLen <= Math.max(+o.trimMax || 0, ((+o.trimPct || 0) / 100) * (c - lo)) ? 'trim' : lv === 0 ? 'strip' : 'cross';
        const i = cuts.length;
        // Ebene 0: dieser Schnitt trennt einen Streifen ab; geht es am Rest nur noch quer weiter, ist der Rest der letzte Streifen
        const strip = lv === 0 || (level === 0 && d !== dir) ? i : ctx.strip;
        if (lv === 0 && inFirst.length) addStrip(i, first, d);
        else if (level === 0 && d !== dir) addStrip(i, r, dir);
        const tg = kind === 'trim' && ctx.tg < 0 ? i : ctx.tg;
        cuts.push({ n: i + 1, dir: d, c: c, from: d === 'h' ? r.x0 : r.y0, to: d === 'h' ? r.x1 : r.y1, start: d === 'h' ? r.x0 : r.y0, side: 'lo', level: lv, kind: kind,
          size: c - lo, rest: restLen, restParts: parts.length - inFirst.length, parts: inFirst, done: [], region: r, strip: strip, tg: tg });
        const sub = () => run(first, d === 'h' ? 'v' : 'h', depth + 1, lv + 1, i, { strip: strip, tg: tg }); // abgetrenntes Stück fertig schneiden (quer dazu)
        if (o.order === 'strips' && lv === 0) later.push(sub); else sub();
        run(rest, d, depth + 1, lv, i, { strip: lv === 0 ? ctx.strip : strip, tg: tg }); // dann am Rest weiter in derselben Richtung
        return;
      }
      if (parts.length > 1) ok = false; // nicht durchgehend trennbar
    }
    const go = (d) => {
      cuts.length = 0;
      strips.length = 0;
      later.length = 0;
      ok = true;
      run({ x0: o.trim, y0: o.trim, x1: sheet.L - o.trim, y1: sheet.W - o.trim }, d, 0, 0, -1);
      while (later.length) later.shift()();
      // Nachschnitte (mit allem, was danach am selben Stück geschnitten wird) nach dem Streifen bzw. ans Ende
      let out = cuts.slice();
      if (o.trims === 'end') out = out.filter((c) => c.tg < 0).concat(out.filter((c) => c.tg >= 0));
      else if (o.trims === 'strip') {
        const res = [];
        let i = 0;
        while (i < out.length) {
          let j = i;
          while (j < out.length && out[j].strip === out[i].strip) j++;
          const seg = out.slice(i, j);
          res.push(...seg.filter((c) => c.tg < 0), ...seg.filter((c) => c.tg >= 0));
          i = j;
        }
        out = res;
      }
      out.forEach((c, k) => { c.n = k + 1; });
      // Streifen nummerieren (1, 2, … ab Anschlag), jeder Schnitt kennt seinen Streifen (sn; 0 = keiner)
      const sl = strips.map((st, k) => ({ n: k + 1, id: st.id, region: st.region, dir: st.dir, parts: st.parts }));
      const byId = new Map(sl.map((st) => [st.id, st.n]));
      for (const c of out) c.sn = byId.get(c.strip) || 0;
      return { cuts: out, ok: ok, dir: d === 'h' ? 'long' : 'cross', strips: sl };
    };
    // Vorzugsrichtung: 'long' = erst Längsschnitte, 'cross' = erst Querschnitte, sonst die mit weniger Schnitten
    if (o.dir === 'long' || o.dir === 'cross') return go(o.dir === 'long' ? 'h' : 'v');
    const h = go('h');
    const v = go('v');
    return (v.ok && !h.ok) || (v.ok === h.ok && v.cuts.length < h.cuts.length) ? v : h;
  }

  return { plan: plan, fits: fits, cutSequence: cutSequence };
});
