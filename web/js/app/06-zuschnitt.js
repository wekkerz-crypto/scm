/*
 * Weckwop – Zuschnittplan (06-zuschnitt.js)
 * Zuschnittplan je Material und Dicke, Zeichnung, PDF, Teile von Hand verschieben, Teil von Hand anlegen, Kantenregeln.
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 12) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

// Zuschnittplan je Material und Dicke; von Hand verschobene Pläne (lst.manual) gelten, solange Teile und Platte gleich bleiben
let cutSel = null; // ausgewähltes Teil im Zuschnittplan { grp, uid }
// Anordnung beginnt oben links in der Zeichnung (Werkstatt-Wunsch); Schnittfolge dann ab oben (SAW_CFG.startY 'back')
const cutOpts = () => ({ sheetL: lst.sheetL, sheetW: lst.sheetW, kerf: lst.kerf, trim: lst.trim, dir: lst.dir, goal: lst.goal, fromTop: true });
// Plattenformat je Material/Dicke (lst.groupSheet[Gruppe] = { L, W }), sonst das allgemeine
const fmtOf = (key) => { const f = lst.groupSheet && lst.groupSheet[key]; return f && f.L > 0 && f.W > 0 ? f : { L: lst.sheetL, W: lst.sheetW }; };
const cutOptsOf = (key) => { const f = fmtOf(key); return Object.assign(cutOpts(), { sheetL: f.L, sheetW: f.W }); };
// Schnittfolge einer Platte: automatisch angeordnet → Richtung des Plans, von Hand → Vorzugsrichtung der Einstellung
// Schnittfolge im Plan wie im Sägemodus (Beginn links/rechts, oben/unten, Reihenfolge, Nachschnitte)
// Schnittfolge einer Platte – Plan, PDF, Sägemodus und Streifen-Etiketten rechnen gleich (Richtung auch aus „Erste Schnitte“)
const seqDir = (g, cfg) => (cfg.primary === 'plan' || !cfg.primary ? (g.plan.manual ? lst.dir : g.plan.dir) : cfg.primary);
const seqOf = (s, g) => { const cfg = sawCfg(); return CutPlan.cutSequence(s, Object.assign(cutOpts(), { dir: seqDir(g, cfg),
  flipX: cfg.startX === 'right', flipY: cfg.startY === 'back', order: cfg.order, trims: cfg.trims, trimMax: cfg.trimMax, trimPct: cfg.trimPct })); };
const dirText = (g) => ((d) => (d === 'long' ? ' · erst längs schneiden' : d === 'cross' ? ' · erst quer schneiden' : ''))(g.plan.manual ? lst.dir : g.plan.dir);
function cutGroups() {
  const groups = new Map();
  for (const row of bomRows()) {
    const b = View3D.boardOf(row.board);
    const key = b.id + '|' + fmt(row.T);
    if (!groups.has(key)) groups.set(key, { key: key, name: b.name, T: row.T, board: row.board, grain: b.grain > 0, items: [] });
    const dd = edgeDeduct(row.edges);
    const dims = lst.raw ? row.raw : { L: row.L - dd.L, W: row.W - dd.W };
    // Stück n (uid id#n) → Bauteil: Teile der Position nach ihrer Anzahl aufgereiht
    const pp = [];
    for (const q of row.parts) for (let c = 0; c < qtyOf(q); c++) pp.push(q);
    groups.get(key).items.push({ id: row.nums[0], label: row.names[0], L: dims.L, W: dims.W, qty: row.qty, orient: orientOf(row.parts[0], row.board), pp: pp });
  }
  return Array.from(groups.values()).map((g) => {
    const fm = fmtOf(g.key);
    g.fmt = fm;
    const auto = CutPlan.plan(g.items, cutOptsOf(g.key));
    g.sig = JSON.stringify([((o) => [o.sheetL, o.sheetW, o.kerf, o.trim, o.fromTop])(cutOptsOf(g.key)), g.items.map((i) => [i.id, Math.round(i.L * 10), Math.round(i.W * 10), i.qty, i.orient])]);
    const man = lst.manual && lst.manual[g.key];
    if (man && man.sig === g.sig) {
      // einzelne Platte mit eigenem Format (z. B. Reststück): s.L / s.W
      const sheets = man.sheets.map((s) => ({ L: s.L || fm.L, W: s.W || fm.W, own: !!s.L, parts: s.parts, used: s.parts.reduce((a, p) => a + p.l * p.w, 0) }));
      const used = sheets.reduce((a, s) => a + s.used, 0);
      const area = sheets.reduce((a, s) => a + s.L * s.W, 0);
      g.plan = { sheets: sheets, unplaced: auto.unplaced, waste: area ? 1 - used / area : 0, manual: true };
    } else {
      if (man) delete lst.manual[g.key]; // Teile oder Platte geändert: wieder automatisch
      g.plan = auto;
    }
    return g;
  });
}
// Plan einer Gruppe zum Bearbeiten (beim ersten Verschieben aus dem automatischen übernommen)
function manualOf(g) {
  if (!lst.manual) lst.manual = {};
  if (!lst.manual[g.key] || lst.manual[g.key].sig !== g.sig) {
    lst.manual[g.key] = { sig: g.sig, sheets: g.plan.sheets.map((s) => Object.assign(s.own ? { L: s.L, W: s.W } : {}, { parts: s.parts.map((p) => Object.assign({}, p)) })) };
  }
  return lst.manual[g.key];
}
// Schraffur eines Teils: Holz mit Maserung → Linien in Faserrichtung (längs der langen Seite), Dekor → schräg
const hatchDir = (g, p) => (g.grain ? (p.l >= p.w ? 'h' : 'v') : 'd');
/*
 * Beschriftung eines Teils in der Zeichnung (Plattenkoordinaten, yTop = SVG-Oberkante): immer Nr., Name und Maß, so groß wie
 * es in die Fläche passt – hohe, schmale Teile gedreht; wird es zu eng, erst zwei Zeilen, dann eine („Nr. 4 · 766 × 436“).
 */
function partLabelSvg(p, yTop, bg, f) {
  const cx = p.x + p.l / 2;
  const cy = yTop + p.w / 2;
  const rot = p.w > p.l * 1.25;
  const W = Math.max(10, ((rot ? p.w : p.l) - 24) * 0.94);
  const H = Math.max(10, (rot ? p.l : p.w) - 14);
  const num = 'Nr. ' + p.id;
  const dims = n1(p.l) + ' × ' + n1(p.w);
  const CW = 0.6;
  const fitW = (t, f) => W / (Math.max(3, t.length) * CW * f);
  // Name in Grundschrift (breiter als die Ziffernschrift) – lieber früher kürzen als über den Rand
  const name = (fs, f) => { const n = Math.max(3, Math.floor((W * 0.9) / (fs * f * 0.66))); return p.label.length > n ? p.label.slice(0, n - 1) + '…' : p.label; };
  let lines;
  let fs = Math.min(140, fitW(num, 1.2), fitW(dims, 1), H / (1.2 * 1.2 + 1.2 + 0.72 * 1.2));
  // Name: so groß wie er ganz passt (höchstens 0,72 der Maßschrift), erst unter 0,42 gekürzt
  const nf = (fs2) => Math.max(0.42, Math.min(0.72, (W * 0.9) / (Math.max(3, p.label.length) * 0.66 * fs2)));
  if (fs >= 24) lines = [[num, 1.2, 'pl'], [dims, 1, 'pl'], [name(fs, nf(fs)), nf(fs), 'pn']];
  else {
    const t = num + ' · ' + dims;
    fs = Math.min(140, fitW(t, 1), H / (1.2 + 0.85 * 1.2));
    if (fs >= 18) lines = [[t, 1, 'pl'], [name(fs, 0.85), 0.85, 'pn']];
    else { fs = Math.max(12, Math.min(fitW(t, 1), H / 1.2)); lines = [[t, 1, 'pl']]; }
  }
  const tot = lines.reduce((a, l) => a + l[1] * fs * 1.2, 0);
  let y = cy - tot / 2;
  // Schriftgröße von Hand (f, Zoom „Schrift“): um die Mitte des Teils vergrößert, darf dann über den Rand ragen
  const tf = (rot ? 'rotate(-90 ' + cx + ' ' + cy + ')' : '') + (f && f !== 1 ? ' translate(' + cx + ' ' + cy + ') scale(' + f + ') translate(' + -cx + ' ' + -cy + ')' : '');
  let o = '<g class="plab"' + (tf ? ' transform="' + tf.trim() + '"' : '') + '>';
  if (bg) {
    const bw = Math.min(W + 10, Math.max(...lines.map((l) => l[0].length * CW * l[1] * fs)) + fs * 0.8);
    o += '<rect class="lb" x="' + (cx - bw / 2) + '" y="' + (y - fs * 0.15) + '" width="' + bw + '" height="' + (tot + fs * 0.3) + '" rx="' + fs * 0.25 + '"/>';
  }
  for (const [t, f, c] of lines) {
    o += '<text x="' + cx + '" y="' + (y + f * fs * 0.6) + '" font-size="' + (f * fs).toFixed(1) + '" class="' + c + '">' + esc(t) + '</text>';
    y += f * fs * 1.2;
  }
  return o + '</g>';
}
/*
 * Streifen-Nummern am Rand der Platte (Plattenkoordinaten, SVG y = W − y): Längsstreifen links, Querstreifen vorne (unten),
 * mit Klammer über die Breite des Streifens. st = { cur: Nummer des aktuellen Streifens, done: Set fertiger } (Sägemodus).
 * → { l, b: Rand links / unten, svg }
 */
function stripMarks(strips, sh, st) {
  if (!strips || !strips.length) return { l: 0, b: 0, svg: '' };
  const M = Math.round(Math.max(sh.L, sh.W) * 0.075);
  const hasH = strips.some((q) => q.dir === 'h');
  const hasV = strips.some((q) => q.dir === 'v');
  let o = '<g class="strips">';
  for (const q of strips) {
    const r = q.region;
    const h = q.dir === 'h';
    const a0 = h ? sh.W - r.y1 : r.x0;
    const a1 = h ? sh.W - r.y0 : r.x1;
    const mid = (a0 + a1) / 2;
    const rad = Math.max(30, Math.min(M * 0.4, (a1 - a0) * 0.42));
    const cls = 'sm' + (st && st.cur === q.n ? ' cur' : '') + (st && st.done.has(q.n) ? ' done' : '');
    const bx = h ? -M * 0.12 : null;
    // Klammer über die Breite des Streifens, daneben die Nummer
    o += '<g class="' + cls + '">' + (h ? '<path class="sbr" d="M' + bx + ' ' + (a0 + 8) + 'h' + -M * 0.1 + 'V' + (a1 - 8) + 'h' + M * 0.1 + '"/>'
      : '<path class="sbr" d="M' + (a0 + 8) + ' ' + (sh.W + M * 0.12) + 'v' + M * 0.1 + 'H' + (a1 - 8) + 'v' + -M * 0.1 + '"/>') +
      '<circle class="sc" cx="' + (h ? -M * 0.58 : mid) + '" cy="' + (h ? mid : sh.W + M * 0.58) + '" r="' + rad.toFixed(1) + '"/>' +
      '<text class="st" x="' + (h ? -M * 0.58 : mid) + '" y="' + (h ? mid : sh.W + M * 0.58) + '" font-size="' + (rad * 1.15).toFixed(1) + '">' + q.n + '</text>' +
      '<title>Streifen ' + q.n + ' · ' + q.parts.length + ' Teil' + (q.parts.length === 1 ? '' : 'e') + '</title></g>';
  }
  return { l: hasH ? M : 0, b: hasV ? M : 0, svg: o + '</g>' };
}
function sheetSvg(s, g, si, w) {
  // eindeutige Muster-Kennung je Gruppe und Platte (Schlüssel gehasht – nur Buchstaben/Ziffern wären nicht eindeutig)
  const hid = 'ht' + si + '-' + ((t) => { let h = 0; for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); })(g.key);
  // mit Schnittfolge: Streifen-Nummern am Rand (Platz links / unten)
  const seq = lst.cuts ? seqOf(s, g) : null;
  const mk = stripMarks(seq && seq.strips, s, null);
  const VL = s.L + mk.l;
  const VW = s.W + mk.b;
  // Bildschirm: Breite in px; Druck (w = 0): feste Größe in mm, passt mit Überschrift auf A4 quer
  const mm = Math.min(185 / VL, 140 / VW); // daneben die Teileliste
  // Bildschirm: Breite höchstens so, dass die Höhe ins Fenster passt (sonst leere Ränder neben der Platte)
  let out = '<svg class="sheet" viewBox="' + -mk.l + ' 0 ' + VL + ' ' + VW + '"' + (w ? ' width="' + w + '" height="' + Math.round((VW * w) / VL) + '" style="--ar:' + (VL / VW).toFixed(4) + '"'
    : ' width="' + (VL * mm).toFixed(1) + 'mm" height="' + (VW * mm).toFixed(1) + 'mm"') +
    ' data-grp="' + esc(g.key) + '" data-sheet="' + si + '" role="img" aria-label="Platte ' + (si + 1) + ' ' + fmt(s.L) + ' × ' + fmt(s.W) + '">' +
    '<rect x="0" y="0" width="' + s.L + '" height="' + s.W + '" class="sh"/>' +
    '<rect x="' + lst.trim + '" y="' + lst.trim + '" width="' + (s.L - 2 * lst.trim) + '" height="' + (s.W - 2 * lst.trim) + '" class="trim"/>' +
    '<defs><pattern id="' + hid + 'h" width="40" height="40" patternUnits="userSpaceOnUse"><path class="hl" d="M0 20H40"/></pattern>' +
    '<pattern id="' + hid + 'v" width="40" height="40" patternUnits="userSpaceOnUse"><path class="hl" d="M20 0V40"/></pattern>' +
    '<pattern id="' + hid + 'd" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path class="hl" d="M0 20H40"/></pattern></defs>';
  for (const p of s.parts) {
    // Plattenkoordinaten: y nach oben → SVG y nach unten spiegeln
    const y = s.W - p.y - p.w;
    // ruhiges Feld hinter der Schrift (Schraffur nur außerhalb)
    out += '<g class="cp' + (cutSel && cutSel.grp === g.key && cutSel.uid === p.uid ? ' sel' : '') + '" data-uid="' + esc(p.uid) + '"><rect x="' + p.x + '" y="' + y + '" width="' + p.l + '" height="' + p.w + '" class="pt"/>' +
      '<rect x="' + p.x + '" y="' + y + '" width="' + p.l + '" height="' + p.w + '" class="hatch" fill="url(#' + hid + hatchDir(g, p) + ')"/>' +
      partLabelSvg(p, y, true, lst.cutFont) +
      '<title>' + esc(p.label + ' – ' + n1(p.l) + ' × ' + n1(p.w) + (p.rot ? ' (gedreht)' : '') + ' · ziehen = verschieben, Doppelklick = drehen') + '</title></g>';
  }
  // Schnittfolge: Linien in der Mitte der Schnittfuge, Nummer am Anfang des Schnitts
  if (seq) {
    const k2 = lst.kerf / 2;
    out += mk.svg + '<g class="cuts">';
    for (const c of seq.cuts) {
      const x1 = c.dir === 'h' ? c.from : c.c + k2;
      const x2 = c.dir === 'h' ? c.to : c.c + k2;
      const y1 = s.W - (c.dir === 'h' ? c.c + k2 : c.from);
      const y2 = s.W - (c.dir === 'h' ? c.c + k2 : c.to);
      // Nummer am Schnittanfang (von rechts / hinten begonnen: am anderen Ende)
      const atEnd = c.start !== undefined && Math.abs(c.start - c.to) < 1;
      const lx = c.dir === 'h' ? (atEnd ? x2 - 50 : x1 + 50) : x1;
      const ly = c.dir === 'h' ? y1 : atEnd ? y2 + 50 : y1 - 50;
      out += '<line class="cl" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/><circle class="cn" cx="' + lx + '" cy="' + ly + '" r="40"/>' +
        '<text class="ct" x="' + lx + '" y="' + ly + '">' + c.n + '</text>';
    }
    out += '</g>';
  }
  return out + '</svg>';
}
// Teileliste einer Platte (Nr., Name, Maß, Stück) zum Abhaken
function sheetRows(s) {
  const m = new Map();
  for (const p of s.parts) {
    const key = p.id + '|' + Math.round(Math.max(p.l, p.w) * 10) + '|' + Math.round(Math.min(p.l, p.w) * 10);
    const r = m.get(key) || { id: p.id, label: p.label, l: Math.max(p.l, p.w), w: Math.min(p.l, p.w), n: 0 };
    r.n++;
    m.set(key, r);
  }
  return Array.from(m.values()).sort((a, b) => a.id - b.id);
}
function sheetListHtml(s) {
  return '<table class="sheetlist"><thead><tr><th></th><th>Nr.</th><th>Bezeichnung</th><th class="r">Maß</th><th class="r">Stk.</th></tr></thead><tbody>' +
    sheetRows(s).map((r) => '<tr><td class="ck">☐</td><td>' + r.id + '</td><td>' + esc(r.label) + '</td><td class="r">' + n1(r.l) + ' × ' + n1(r.w) + '</td><td class="r">' + r.n + '</td></tr>').join('') +
    '</tbody></table>';
}
// Übersicht: je Material und Dicke Anzahl Platten, Teile, Ausnutzung – und die Summe
function cutOverview(groups) {
  const rows = groups.map((g) => {
    const full = g.plan.sheets.filter((s) => s.parts.length); // leere Platten (z. B. „+ Platte“) zählen nicht
    const parts = full.reduce((a, s) => a + s.parts.length, 0);
    const used = full.reduce((a, s) => a + s.used, 0);
    const area = full.reduce((a, s) => a + s.L * s.W, 0);
    return { g: g, n: full.length, parts: parts, area: used / 1e6, util: area ? Math.round((used / area) * 100) : 0, miss: g.plan.unplaced.length };
  });
  const sum = rows.reduce((a, r) => ({ n: a.n + r.n, parts: a.parts + r.parts, area: a.area + r.area, miss: a.miss + r.miss }), { n: 0, parts: 0, area: 0, miss: 0 });
  return { rows: rows, sum: sum };
}
// Formate einer Gruppe („2800 × 2070“, bei eigenen Einzelplatten mehrere)
const fmtList = (g) => Array.from(new Set(g.plan.sheets.map((s) => fmt(s.L) + ' × ' + fmt(s.W)))).join(', ') || fmt(g.fmt.L) + ' × ' + fmt(g.fmt.W);
function cutOverviewHtml(groups) {
  const o = cutOverview(groups);
  const m2 = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '<section class="cutover"><h3>Übersicht <small>' + o.sum.n + ' Platte' + (o.sum.n === 1 ? '' : 'n') + ' zu schneiden · ' + o.sum.parts + ' Teile</small></h3>' +
    '<table class="cuttot"><thead><tr><th>Material</th><th class="r">Dicke</th><th class="r">Platten</th><th class="r">Format</th><th class="r">Teile</th><th class="r">Teilefläche</th><th class="r">Ausnutzung</th></tr></thead><tbody>' +
    o.rows.map((r) => '<tr><td>' + boardSwatch(r.g.board) + ' ' + esc(r.g.name) + '</td><td class="r">' + fmt(r.g.T) + ' mm</td><td class="r big">' + r.n + '</td><td class="r">' + fmtList(r.g) +
      '</td><td class="r">' + r.parts + (r.miss ? ' <span class="warn" title="passt nicht auf die Platte">+' + r.miss + ' !</span>' : '') + '</td><td class="r">' + m2(r.area) + ' m²</td><td class="r">' + r.util + ' %</td></tr>').join('') +
    '</tbody><tfoot><tr><td>Summe</td><td></td><td class="r big">' + o.sum.n + '</td><td></td><td class="r">' + o.sum.parts + '</td><td class="r">' + m2(o.sum.area) + ' m²</td><td></td></tr></tfoot></table></section>';
}
function renderCut(forPrint) {
  const groups = cutGroups();
  if (!groups.length) return '<p class="note">Keine Teile geladen.</p>';
  return cutOverviewHtml(groups) + groups.map((g) => {
    const pl = g.plan;
    return '<section class="cutgrp"><h3>' + boardSwatch(g.board) + ' ' + esc(g.name) + ' ' + fmt(g.T) + ' mm <small>' + pl.sheets.length + ' Platte' + (pl.sheets.length === 1 ? '' : 'n') +
      (forPrint ? ' ' + fmt(g.fmt.L) + ' × ' + fmt(g.fmt.W) : '') + ' · Ausnutzung ' + Math.round((1 - pl.waste) * 100) + ' %' + (g.grain && lst.grain ? ' · Maserung längs' : '') + dirText(g) +
      (pl.manual ? ' · von Hand angeordnet' : '') + '</small>' +
      (forPrint ? '' : '<span class="gfmt" title="Plattenformat für ' + esc(g.name + ' ' + fmt(g.T)) + ' mm – ↺ = wieder das allgemeine Format">Format ' +
        '<input type="number" min="100" step="1" data-gfmt="' + esc(g.key) + '" data-f="L" value="' + g.fmt.L + '" aria-label="Plattenlänge ' + esc(g.name) + '"> × ' +
        '<input type="number" min="100" step="1" data-gfmt="' + esc(g.key) + '" data-f="W" value="' + g.fmt.W + '" aria-label="Plattenbreite ' + esc(g.name) + '"> mm' +
        (lst.groupSheet && lst.groupSheet[g.key] ? ' <button type="button" class="btn ghost small" data-gfmtreset="' + esc(g.key) + '" title="Wieder das allgemeine Format ' + fmt(lst.sheetL) + ' × ' + fmt(lst.sheetW) + '">↺</button>' : '') + '</span>') +
      (forPrint ? '' : '<span class="cutact"><button type="button" class="btn ghost small" data-cutadd="' + esc(g.key) + '" title="Leere Platte anhängen, um Teile darauf zu verschieben">+ Platte</button>' +
        (pl.manual ? '<button type="button" class="btn ghost small" data-cutreset="' + esc(g.key) + '" title="Eigene Anordnung verwerfen">Automatisch anordnen</button>' : '') + '</span>') + '</h3>' +
      ((sp) => sp ? '<div class="cutsel"><span>Ausgewählt: <b>' + esc(sp.id + ' · ' + sp.label) + '</b> ' + n1(sp.l) + ' × ' + n1(sp.w) + (sp.rot ? ' (gedreht)' : '') + '</span>' +
        '<button type="button" class="btn small" data-cutrot title="Um 90° drehen (auch Doppelklick)">↻ Drehen</button><button type="button" class="btn ghost small" data-cutunsel>Auswahl aufheben</button></div>' : '')(
        !forPrint && cutSel && cutSel.grp === g.key ? pl.sheets.flatMap((x) => x.parts).find((q) => q.uid === cutSel.uid) : null) +
      (pl.unplaced.length ? '<p class="warn">Passt nicht auf die Platte: ' + pl.unplaced.map((x) => esc(x.label) + ' (' + n1(x.L) + ' × ' + n1(x.W) + ')').join(', ') + '</p>' : '') +
      pl.sheets.map((s, i) => {
        if (forPrint && !s.parts.length) return ''; // leere Platte nicht drucken
        const seq = lst.cuts ? seqOf(s, g) : null;
        // Format dieser einen Platte (z. B. Reststück) – schaltet die Gruppe auf „von Hand“
        const sf = forPrint ? ' · ' + fmt(s.L) + ' × ' + fmt(s.W) : ' · <span class="sfmt' + (s.own ? ' own' : '') + '" title="Format nur dieser Platte (z. B. Reststück)">' +
          '<input type="number" min="100" step="1" data-sfmt="' + esc(g.key) + '" data-si="' + i + '" data-f="L" value="' + s.L + '" aria-label="Länge Platte ' + (i + 1) + '"> × ' +
          '<input type="number" min="100" step="1" data-sfmt="' + esc(g.key) + '" data-si="' + i + '" data-f="W" value="' + s.W + '" aria-label="Breite Platte ' + (i + 1) + '"></span>';
        return '<figure class="sheetfig"><figcaption>Platte ' + (i + 1) + sf + ' · ' + s.parts.length + ' Teile · genutzt ' + Math.round((s.used / (s.L * s.W)) * 100) + ' %' +
          (seq ? ' · ' + seq.cuts.length + ' Schnitte' : '') + (seq && !forPrint && seq.strips.length ? ' <button type="button" class="btn ghost small" data-striplbl="' + esc(g.key) + '" data-si="' + i +
            '" title="Je Streifen ein Etikett zum Zuordnen (Streifen-Nr., Material, Platte)">🏷 ' + seq.strips.length + ' Streifen-Etiketten</button>' : '') + '</figcaption>' +
          (seq && !seq.ok ? '<p class="warn">Nicht alle Teile sind mit durchgehenden Schnitten trennbar – Anordnung prüfen.</p>' : '') +
          '<div class="sheetrow">' + sheetSvg(s, g, i, forPrint ? 0 : 620) + (s.parts.length ? sheetListHtml(s) : '') + '</div></figure>';
      }).join('') + '</section>';
  }).join('');
}

// Zuschnittplan als PDF-Datei (eine Platte je Seite, A4 quer) – geht ohne Druckdialog
function cutPdf(ret) {
  const groups = cutGroups();
  const d = MiniPdf.doc(297, 210);
  const date = new Date().toLocaleDateString('de-DE');
  const info = 'Schnittfuge ' + fmt(lst.kerf) + ' mm · Besäumen ' + fmt(lst.trim) + ' mm · ' + (lst.raw ? 'Rohmaß (mit Aufmaß)' : 'Fertigmaß') + ' · ' + date;
  let total = 0;
  for (const g of groups) total += g.plan.sheets.filter((s) => s.parts.length).length;
  let page = 0;
  // erste Seite: Übersicht (Platten je Material, Summe)
  if (groups.length) {
    const o = cutOverview(groups);
    total++;
    d.page();
    page++;
    d.text(12, 16, 'Zuschnittplan – Übersicht', { size: 15, bold: true });
    d.text(12, 24, o.sum.n + ' Platte' + (o.sum.n === 1 ? '' : 'n') + ' zu schneiden · ' + o.sum.parts + ' Teile', { size: 12, bold: true });
    const m2 = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m²';
    const y = d.table(12, 32, [{ t: 'Material', w: 90 }, { t: 'Dicke', w: 20, align: 'right' }, { t: 'Platten', w: 22, align: 'right' }, { t: 'Format', w: 32, align: 'right' },
      { t: 'Teile', w: 20, align: 'right' }, { t: 'Teilefläche', w: 30, align: 'right' }, { t: 'Ausnutzung', w: 26, align: 'right' }],
      o.rows.map((r) => [r.g.name, fmt(r.g.T) + ' mm', String(r.n), fmtList(r.g), String(r.parts) + (r.miss ? ' (+' + r.miss + ' passt nicht)' : ''), m2(r.area), r.util + ' %'])
        .concat([['Summe', '', String(o.sum.n), '', String(o.sum.parts), m2(o.sum.area), '']]), { size: 10 });
    d.line(12, y - 6.2, 252, y - 6.2, { lw: 0.35 }); // über der Summe (Zeilenhöhe bei Schrift 10)
    d.text(285, 203, info + ' · Seite 1/' + total, { size: 7.5, align: 'right', color: [0.35, 0.35, 0.35] });
  }
  for (const g of groups) {
    g.plan.sheets.forEach((s, i) => {
      if (!s.parts.length) return; // leere Platte: keine Seite
      d.page();
      page++;
      d.text(12, 16, 'Zuschnittplan – ' + g.name + ' ' + fmt(g.T) + ' mm', { size: 15, bold: true });
      d.text(12, 23, 'Platte ' + (i + 1) + ' von ' + g.plan.sheets.length + ' · ' + fmt(s.L) + ' × ' + fmt(s.W) + ' mm · ' + s.parts.length + ' Teile · genutzt ' +
        Math.round((s.used / (s.L * s.W)) * 100) + ' %' + (g.grain && lst.grain ? ' · Maserung längs' : '') + dirText(g), { size: 9.5, color: [0.25, 0.25, 0.25] });
      d.text(285, 203, info + ' · Seite ' + page + '/' + total, { size: 7.5, align: 'right', color: [0.35, 0.35, 0.35] });
      // links die Platte, rechts die Teileliste zum Abhaken
      // mit Schnittfolge: Streifen-Nummern links (Längsstreifen) bzw. unten (Querstreifen)
      const strips = lst.cuts ? seqOf(s, g).strips : [];
      const ml = strips.some((q) => q.dir === 'h') ? 9 : 0;
      const mb = strips.some((q) => q.dir === 'v') ? 9 : 0;
      const sc = Math.min((190 - ml) / s.L, (168 - mb) / s.W);
      const ox = 12 + ml;
      const oy = 30;
      const X = (x) => ox + x * sc;
      const Y = (y) => oy + (s.W - y) * sc; // Plattenkoordinaten (y nach oben) → Seite (y nach unten)
      d.rect(ox, oy, s.L * sc, s.W * sc, { stroke: [0, 0, 0], lw: 0.4 });
      const blue = [0.12, 0.37, 0.75];
      for (const q of strips) {
        const r = q.region;
        const h = q.dir === 'h';
        const a0 = h ? Y(r.y1) : X(r.x0);
        const a1 = h ? Y(r.y0) : X(r.x1);
        const m = (a0 + a1) / 2;
        if (h) d.line(ox - 1.5, a0 + 0.6, ox - 1.5, a1 - 0.6, { lw: 0.5, stroke: blue });
        else d.line(a0 + 0.6, oy + s.W * sc + 1.5, a1 - 0.6, oy + s.W * sc + 1.5, { lw: 0.5, stroke: blue });
        const cx = h ? ox - 5.5 : m;
        const cy = h ? m : oy + s.W * sc + 5.5;
        d.rect(cx - 3, cy - 3, 6, 6, { fill: [1, 1, 1], stroke: blue, lw: 0.4 });
        d.text(cx, cy + 1.3, String(q.n), { size: 10, bold: true, align: 'center', color: blue });
      }
      d.rect(X(lst.trim), Y(s.W - lst.trim), (s.L - 2 * lst.trim) * sc, (s.W - 2 * lst.trim) * sc, { stroke: [0.5, 0.5, 0.5], lw: 0.2, dash: [1.5, 1] });
      for (const p of s.parts) {
        const pw = p.l * sc;
        const ph = p.w * sc;
        d.rect(X(p.x), Y(p.y + p.w), pw, ph, { fill: [0.95, 0.95, 0.95] });
        d.schraffur(X(p.x), Y(p.y + p.w), pw, ph, hatchDir(g, p), 2.2, { stroke: [0.7, 0.7, 0.7], lw: 0.12 });
        d.rect(X(p.x), Y(p.y + p.w), pw, ph, { stroke: [0, 0, 0], lw: 0.3 });
        const size = Math.max(4.5, Math.min(10, ph * 0.9)) * (lst.cutFont || 1);
        const cx = X(p.x) + pw / 2;
        const cy = Y(p.y + p.w) + ph / 2;
        // Feld hinter der Schrift
        const l1 = p.id + ' · ' + n1(p.l) + ' × ' + n1(p.w);
        const l2 = p.label + (p.rot ? ' (gedreht)' : '');
        if (ph > 4) {
          const tw = Math.min(pw - 1.5, Math.max(d.textWidth(l1, size, true), ph > 10 ? d.textWidth(l2, size * 0.78) : 0) + 2.5);
          const th = ph > 10 ? size * 0.8 + 2 : size * 0.42 + 1.4;
          d.rect(cx - tw / 2, cy - (ph > 10 ? size * 0.36 + 1.2 : size * 0.21 + 0.7), tw, th, { fill: [0.95, 0.95, 0.95] });
        }
        if (ph > 4) d.text(cx, cy + (ph > 10 ? -0.5 : size * 0.12), l1, { size: size, bold: true, align: 'center', maxW: pw - 1.5 });
        if (ph > 10) d.text(cx, cy + size * 0.42, l2, { size: size * 0.78, align: 'center', maxW: pw - 1.5, color: [0.2, 0.2, 0.2] });
      }
      // Schnittfolge
      if (lst.cuts) {
        const seq = seqOf(s, g);
        const red = [0.78, 0.22, 0.1];
        const k2 = lst.kerf / 2;
        for (const c of seq.cuts) {
          const x1 = X(c.dir === 'h' ? c.from : c.c + k2);
          const x2 = X(c.dir === 'h' ? c.to : c.c + k2);
          const y1 = Y(c.dir === 'h' ? c.c + k2 : c.from);
          const y2 = Y(c.dir === 'h' ? c.c + k2 : c.to);
          d.line(x1, y1, x2, y2, { lw: 0.35, stroke: red });
          const atEnd = c.start !== undefined && Math.abs(c.start - c.to) < 1;
          const lx = c.dir === 'h' ? (atEnd ? x2 - 3.2 : x1 + 3.2) : x1;
          const ly = c.dir === 'h' ? y1 : atEnd ? y2 + 3.2 : y1 - 3.2;
          const bw = String(c.n).length * 1.6 + 2;
          d.rect(lx - bw / 2, ly - 1.8, bw, 3.6, { fill: [1, 1, 1], stroke: red, lw: 0.25 });
          d.text(lx, ly + 1.05, String(c.n), { size: 7.5, bold: true, align: 'center', color: red });
        }
        if (!seq.ok) d.text(12, 30 + s.W * sc + 5, 'Achtung: nicht alle Teile sind mit durchgehenden Schnitten trennbar – Anordnung prüfen.', { size: 8.5, color: red });
      }
      // Teileliste
      d.table(208, 30, [{ t: '', w: 5 }, { t: 'Nr.', w: 8 }, { t: 'Bezeichnung', w: 34 }, { t: 'Maß', w: 20, align: 'right' }, { t: 'Stk.', w: 10, align: 'right' }],
        sheetRows(s).map((r) => ['\u25a1', String(r.id), r.label, n1(r.l) + ' × ' + n1(r.w), String(r.n)]), { size: 7.5 });
    });
  }
  if (!page) { if (ret === true) return null; toast('Keine Teile für den Zuschnitt.'); return; }
  if (ret === true) return d.save();
  saveOne('zuschnittplan.pdf', d.save(), 'application/pdf');
}

// Teile im Zuschnittplan mit der Maus verschieben (auch auf eine andere Platte derselben Gruppe), Doppelklick dreht
(function cutDrag() {
  const host = $('cutsheets');
  let drag = null;
  const svgPt = (svg, e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const groupOf = (key) => cutGroups().find((g) => g.key === key);
  // an Plattenrand (Besäumen) und Nachbarteilen (mit Schnittfuge) einrasten
  function snap(s, p, tol) {
    const xs = [lst.trim, s.L - lst.trim - p.l];
    const ys = [lst.trim, s.W - lst.trim - p.w];
    for (const q of s.parts) {
      if (q.uid === p.uid) continue;
      xs.push(q.x + q.l + lst.kerf, q.x - lst.kerf - p.l, q.x, q.x + q.l - p.l);
      ys.push(q.y + q.w + lst.kerf, q.y - lst.kerf - p.w, q.y, q.y + q.w - p.w);
    }
    const best = (v, list) => { let b = v; let dmin = tol; for (const c of list) { const dd = Math.abs(c - v); if (dd < dmin) { dmin = dd; b = c; } } return b; };
    return { x: best(p.x, xs), y: best(p.y, ys) };
  }
  host.addEventListener('pointerdown', (e) => {
    const gEl = e.target.closest('g.cp');
    const svg = gEl && gEl.closest('svg.sheet');
    if (!gEl || !svg || e.button > 0) return;
    const g = groupOf(svg.dataset.grp);
    const s = g && g.plan.sheets[+svg.dataset.sheet];
    const p = s && s.parts.find((q) => q.uid === gEl.dataset.uid);
    if (!p) return;
    e.preventDefault();
    const at = svgPt(svg, e);
    drag = { g: g, si: +svg.dataset.sheet, p: p, el: gEl, svg: svg, at: at, grab: { x: at.x - p.x, y: at.y - (s.W - p.y - p.w) }, moved: false, tol: 10 / (svg.getScreenCTM().a || 1) };
    gEl.classList.add('drag');
    gEl.setPointerCapture(e.pointerId);
  });
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const at = svgPt(drag.svg, e);
    const dx = at.x - drag.at.x;
    const dy = at.y - drag.at.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    const s = drag.g.plan.sheets[drag.si];
    const c = snap(s, Object.assign({}, drag.p, { x: drag.p.x + dx, y: drag.p.y - dy }), drag.tol);
    drag.el.setAttribute('transform', 'translate(' + (c.x - drag.p.x) + ' ' + (drag.p.y - c.y) + ')');
    drag.el.classList.toggle('bad', !CutPlan.fits(s, Object.assign({}, drag.p, c), cutOpts(), drag.p.uid));
  });
  const finish = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('drag');
    if (!d.moved) { cutSel = cutSel && cutSel.uid === d.p.uid ? null : { grp: d.g.key, uid: d.p.uid }; renderLists(); return; } // Klick = auswählen
    // Ziel: Platte unter dem Mauszeiger (gleiche Gruppe), sonst die eigene
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const tSvg = over && over.closest && over.closest('svg.sheet');
    const sameGrp = tSvg && tSvg.dataset.grp === d.g.key;
    const ti = sameGrp ? +tSvg.dataset.sheet : d.si;
    const svg = sameGrp ? tSvg : d.svg;
    const tS = d.g.plan.sheets[ti];
    const at = svgPt(svg, e);
    let cand = Object.assign({}, d.p, { x: at.x - d.grab.x, y: tS.W - (at.y - d.grab.y) - d.p.w });
    cand = Object.assign(cand, snap(ti === d.si ? tS : { L: tS.L, W: tS.W, parts: tS.parts }, cand, d.tol));
    if (!CutPlan.fits(tS, cand, cutOpts(), d.p.uid)) { toast('Passt dort nicht – überlappt ein anderes Teil oder ragt über den Rand.'); renderLists(); return; }
    const man = manualOf(d.g);
    const src = man.sheets[d.si].parts;
    const k = src.findIndex((q) => q.uid === d.p.uid);
    const moved = src.splice(k, 1)[0];
    moved.x = cand.x;
    moved.y = cand.y;
    man.sheets[ti].parts.push(moved);
    saveLst();
    renderLists();
  };
  host.addEventListener('pointerup', finish);
  host.addEventListener('pointercancel', () => { drag = null; renderLists(); });
  host.addEventListener('dblclick', (e) => {
    const gEl = e.target.closest('g.cp');
    const svg = gEl && gEl.closest('svg.sheet');
    if (gEl && svg) rotatePart(svg.dataset.grp, gEl.dataset.uid);
  });
  // Teil um 90° drehen (am Platz; passt es nicht, Hinweis)
  function rotatePart(key, uid) {
    const g = groupOf(key);
    const si = g ? g.plan.sheets.findIndex((s) => s.parts.some((q) => q.uid === uid)) : -1;
    if (si < 0) return;
    const p = g.plan.sheets[si].parts.find((q) => q.uid === uid);
    // gedreht: erst am selben Eck, sonst um die Mitte, jeweils notfalls nach innen gerückt
    const sh = g.plan.sheets[si];
    const clampIn = (c) => Object.assign(c, { x: Math.max(lst.trim, Math.min(sh.L - lst.trim - c.l, c.x)), y: Math.max(lst.trim, Math.min(sh.W - lst.trim - c.w, c.y)) });
    const base = { l: p.w, w: p.l };
    const tries = [Object.assign({}, p, base), Object.assign({}, p, base, { x: p.x + (p.l - p.w) / 2, y: p.y + (p.w - p.l) / 2 })];
    const cand = tries.concat(tries.map((c) => clampIn(Object.assign({}, c)))).find((c) => CutPlan.fits(sh, c, cutOpts(), p.uid));
    if (!cand) { toast('Gedreht passt es hier nicht – erst Platz schaffen oder verschieben.'); return; }
    const man = manualOf(g);
    const q = man.sheets[si].parts.find((x) => x.uid === p.uid);
    q.l = cand.l;
    q.w = cand.w;
    q.x = cand.x;
    q.y = cand.y;
    q.rot = !q.rot;
    if (q.grain) toast('Gedreht – Achtung: Maserung jetzt ' + (q.rot ? 'quer' : 'längs') + '.');
    saveLst();
    renderLists();
  }
  host.addEventListener('click', (e) => {
    const sl = e.target.closest('[data-striplbl]');
    if (sl) { const g = groupOf(sl.dataset.striplbl); if (g) printStripLabels(stripsOf(g, +sl.dataset.si)); return; }
    const gr = e.target.closest('[data-gfmtreset]');
    if (gr) { delete lst.groupSheet[gr.dataset.gfmtreset]; saveLst(); renderLists(); return; }
    const add = e.target.closest('[data-cutadd]');
    const rst = e.target.closest('[data-cutreset]');
    if (add) { const g = groupOf(add.dataset.cutadd); manualOf(g).sheets.push({ parts: [] }); saveLst(); renderLists(); }
    if (rst) { delete lst.manual[rst.dataset.cutreset]; saveLst(); renderLists(); }
    const rot = e.target.closest('[data-cutrot]');
    if (rot && cutSel) rotatePart(cutSel.grp, cutSel.uid);
    if (e.target.closest('[data-cutunsel]')) { cutSel = null; renderLists(); }
  });
  // Plattenformat: je Material/Dicke (neu anordnen) oder nur für eine Platte (Teile müssen weiter passen)
  host.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-gfmt], [data-sfmt]');
    if (!inp) return;
    const v = Math.round(parseFloat(String(inp.value).replace(',', '.')) || 0);
    if (v < 100) { toast('Format bitte mindestens 100 mm.'); renderLists(); return; }
    if (inp.dataset.gfmt !== undefined) {
      const key = inp.dataset.gfmt;
      const f = Object.assign({}, fmtOf(key));
      f[inp.dataset.f] = v;
      if (!lst.groupSheet) lst.groupSheet = {};
      if (f.L === lst.sheetL && f.W === lst.sheetW) delete lst.groupSheet[key];
      else lst.groupSheet[key] = { L: f.L, W: f.W };
    } else {
      const g = groupOf(inp.dataset.sfmt);
      const si = +inp.dataset.si;
      if (!g || !g.plan.sheets[si]) return;
      const cur = g.plan.sheets[si];
      const L = inp.dataset.f === 'L' ? v : cur.L;
      const W = inp.dataset.f === 'W' ? v : cur.W;
      const dW = W - cur.W; // Teile liegen oben: um die Änderung der Breite mitschieben
      const moved = cur.parts.map((p) => Object.assign({}, p, { y: p.y + dW }));
      const test = { L: L, W: W, parts: moved };
      const out = moved.filter((p) => !CutPlan.fits(test, p, cutOpts(), p.uid));
      if (out.length) {
        toast('Passt nicht – ' + out.length + ' Teil' + (out.length === 1 ? '' : 'e') + ' ragen dann über den Rand. Erst verschieben (z. B. auf „+ Platte“).');
        renderLists();
        return;
      }
      const sh = manualOf(g).sheets[si];
      if (dW) for (const p of sh.parts) p.y += dW;
      if (L === g.fmt.L && W === g.fmt.W) { delete sh.L; delete sh.W; } else { sh.L = L; sh.W = W; }
    }
    saveLst();
    renderLists();
  });
})();
/*
 * Teil von Hand anlegen (Stückliste): Rechteck L × B als kleine DXF – wird wie ein DXF-Teil gerechnet, also nur die Platte
 * mit Formatfräsen (umfräst). Material, Anzahl, Dicke am Teil; mit der Projektdatei gespeichert.
 */
const rectDxf = (L, W) => ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LWPOLYLINE', '8', 'Kontur', '90', '4', '70', '1', '10', '0', '20', '0', '10', String(L), '20', '0', '10', String(L), '20', String(W), '10', '0', '20', String(W),
  '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';
function addManualPart(o) {
  addDxf(rectDxf(o.L, o.W), o.name, { T: o.T, board: o.board || null, qty: o.qty });
}
function renderBomNew() {
  const el = $('bomnew');
  if (el.hidden) return;
  const boards = [];
  for (const r of bomRows()) if (!boards.some((b) => b[0] === r.board)) boards.push([r.board, r.T]);
  const def = boardKeyOf(null);
  if (!boards.some((b) => b[0] === def)) boards.push([def, 19]);
  const last = lst.newPart || {};
  const bsel = last.board && boards.some((b) => b[0] === last.board) ? last.board : boards[0][0];
  el.innerHTML = '<h4>Neues Bauteil anlegen</h4><p class="note">Wird als Platte mit Formatfräsen (umfräst) zum Programm – auch in Zuschnitt, Sägen und Etiketten. ' +
    'Kanten danach in der Liste setzen.</p><div class="row">' +
    '<label>Name <input type="text" id="np-name" value="' + esc(last.name || '') + '" placeholder="z. B. Fachboden" aria-label="Name des Teils"></label>' +
    '<label>Länge <input type="number" id="np-L" min="10" step="0.1" value="' + esc(last.L || '') + '" aria-label="Länge"> mm</label>' +
    '<label>Breite <input type="number" id="np-W" min="10" step="0.1" value="' + esc(last.W || '') + '" aria-label="Breite"> mm</label>' +
    '<label>Dicke <input type="number" id="np-T" min="1" step="0.1" value="' + esc(last.T || 19) + '" aria-label="Dicke"> mm</label>' +
    '<label>Anzahl <input type="number" id="np-qty" min="1" step="1" value="1" aria-label="Anzahl"></label>' +
    '<label>Material <select id="np-board" aria-label="Material">' + boards.map(([k, T]) => '<option value="' + esc(k) + '" data-t="' + T + '"' + (k === bsel ? ' selected' : '') + '>' + esc(boardName(k)) + '</option>').join('') + '</select></label>' +
    '</div><div class="row"><button type="button" class="btn" id="np-add">Anlegen</button><button type="button" class="btn ghost small" id="np-close">Schließen</button></div>';
  $('np-board').addEventListener('change', (e) => { const t = e.target.selectedOptions[0].dataset.t; if (t) $('np-T').value = t; });
  $('np-close').addEventListener('click', () => { el.hidden = true; $('bomnewbtn').setAttribute('aria-expanded', 'false'); });
  $('np-add').addEventListener('click', () => {
    const num = (id) => parseFloat(String($(id).value).replace(',', '.'));
    const o = { name: $('np-name').value.trim() || 'Teil', L: num('np-L'), W: num('np-W'), T: num('np-T'), qty: Math.max(1, Math.round(num('np-qty') || 1)), board: $('np-board').value };
    if (!(o.L >= 10 && o.W >= 10 && o.T > 0)) { toast('Bitte Länge, Breite (ab 10 mm) und Dicke eingeben.'); return; }
    lst.newPart = { name: '', L: o.L, W: o.W, T: o.T, board: o.board };
    saveLst();
    addManualPart(o);
    render();
    toast(o.qty + ' × „' + o.name + '“ ' + n1(o.L) + ' × ' + n1(o.W) + ' × ' + n1(o.T) + ' angelegt.');
  });
}
$('bomnewbtn').addEventListener('click', () => { const el = $('bomnew'); el.hidden = !el.hidden; $('bomnewbtn').setAttribute('aria-expanded', String(!el.hidden)); renderBomNew(); });
// Kanten-Regeln bearbeiten (Feld unter der Leiste der Stückliste)
// gelernte Regeln (Material, Kanten, Faser nach Stichwort im Bauteilnamen) – oben im Feld „Regeln …“
function learnedHtml() {
  const L = learn.list;
  return '<h4>Gelernte Regeln <small>' + L.length + '</small></h4>' +
    '<div class="row"><label><input type="checkbox" id="lrnon"' + (learn.on ? ' checked' : '') + '> Gelernte Regeln anwenden</label>' +
    '<label><input type="checkbox" id="lrnask"' + (learn.ask ? ' checked' : '') + '> Nach Änderungen in der Stückliste fragen, ob gemerkt werden soll</label></div>' +
    (L.length ? '<table class="lrntbl"><thead><tr><th>#</th><th>Name enthält</th><th>Material</th><th>Kanten</th><th>Faser</th><th>Teile hier</th><th></th></tr></thead><tbody>' +
      L.map((r, i) => '<tr><td>' + (i + 1) + '</td><td><input type="text" data-lr="' + i + '" value="' + esc(r.match || '') + '" aria-label="Gelernte Regel ' + (i + 1) + ' Name enthält"></td>' +
        '<td>' + (r.board != null ? '<button type="button" class="btn ghost small boardbtn" id="lrb' + i + '" data-lrb="' + i + '" aria-expanded="false" title="Material ändern">' + boardChip(r.board) + '</button>' +
          '<button type="button" class="btn ghost small" data-lrx="' + i + '" data-f="board" aria-label="Material aus Regel ' + (i + 1) + ' entfernen">✕</button>'
          : '<button type="button" class="btn ghost small" id="lrb' + i + '" data-lrb="' + i + '" aria-expanded="false">+ Material</button>') + '</td>' +
        '<td>' + (r.edges ? '<span class="lrnedge">' + esc(edgeText(r.edges) || 'keine') + '</span> <button type="button" class="btn ghost small" data-lrx="' + i + '" data-f="edges" aria-label="Kanten aus Regel ' + (i + 1) + ' entfernen">✕</button>' : '<span class="note">–</span>') + '</td>' +
        '<td><select data-lrg="' + i + '" aria-label="Gelernte Regel ' + (i + 1) + ' Faser"><option value="">–</option>' + ['long', 'cross', 'free'].map((g) => '<option value="' + g + '"' + (r.grain === g ? ' selected' : '') + '>' + GRAIN_NAMES[g] + '</option>').join('') + '</select></td>' +
        '<td class="r">' + state.parts.filter((p) => String(r.match || '').trim() && nameMatches(p, r.match)).length + '</td>' +
        '<td><button type="button" class="btn ghost small" data-lrdel="' + i + '" aria-label="Gelernte Regel ' + (i + 1) + ' löschen">✕</button></td></tr>').join('') + '</tbody></table>'
      : '<p class="note">Noch keine. In der Stückliste Material, Kanten oder Faser eines Teils ändern – dann erscheint „Als Regel merken“.</p>') +
    '<div class="row"><button type="button" class="btn small" id="lrnadd">+ Gelernte Regel</button></div>' +
    '<p class="note">Gelten in allen Projekten an diesem Gerät für Teile ohne eigene Wahl (Projektdateien nehmen sie mit). Neueste zuerst; ' +
    'Material im Bauteilnamen (z. B. „U708 ST9“) und von Hand Gewähltes gehen vor.</p><hr>';
}
function learnedWire(el) {
  const upd = () => { saveLearn(); applyBoards(); renderEdgeRules(); };
  $('lrnon').addEventListener('change', (e) => { learn.on = e.target.checked; upd(); });
  $('lrnask').addEventListener('change', (e) => { learn.ask = e.target.checked; saveLearn(); });
  $('lrnadd').addEventListener('click', () => { learn.list.unshift({ match: '' }); upd(); const f = el.querySelector('[data-lr="0"]'); if (f) f.focus(); });
  el.querySelectorAll('[data-lr]').forEach((inp) => inp.addEventListener('change', () => { learn.list[+inp.dataset.lr].match = inp.value.trim(); upd(); }));
  el.querySelectorAll('[data-lrg]').forEach((sel) => sel.addEventListener('change', () => { const r = learn.list[+sel.dataset.lrg]; if (sel.value) r.grain = sel.value; else delete r.grain; upd(); }));
  el.querySelectorAll('[data-lrx]').forEach((b) => b.addEventListener('click', () => { delete learn.list[+b.dataset.lrx][b.dataset.f]; upd(); }));
  el.querySelectorAll('[data-lrdel]').forEach((b) => b.addEventListener('click', () => { learn.list.splice(+b.dataset.lrdel, 1); upd(); }));
  el.querySelectorAll('[data-lrb]').forEach((b) => b.addEventListener('click', (e) => {
    const r = learn.list[+b.dataset.lrb];
    boardPicker(e.currentTarget, r.board || state.settings.boardMaterial, null, (k) => { if (k) { r.board = k; saveLearn(); applyBoards(); } });
  }));
}
function renderEdgeRules() {
  const el = $('erpanel');
  if (el.hidden) return;
  const rules = edgeRules();
  el.innerHTML = learnedHtml() + '<h4>Kanten automatisch vorbelegen</h4>' +
    '<div class="row"><label><input type="checkbox" id="erauto"' + (lst.edgeAuto ? ' checked' : '') + '> Kanten nach Regeln vorbelegen (Teile ohne eigene Kanten)</label>' +
    '<label>Möbel vorne <select id="erfront">' + Object.entries(FRONT_DIRS).map(([k, v]) => '<option value="' + k + '"' + (k === lst.edgeFront ? ' selected' : '') + '>' + v[0] + '</option>').join('') + '</select></label></div>' +
    '<table><thead><tr><th>#</th><th>Name enthält</th><th>Kanten</th><th>Dekor</th><th></th></tr></thead><tbody>' +
    rules.map((r, i) => '<tr><td>' + (i + 1) + '</td><td><input type="text" data-er="' + i + '" data-f="match" value="' + esc(r.match || '') + '" aria-label="Regel ' + (i + 1) + ' Name enthält"></td>' +
      '<td><select data-er="' + i + '" data-f="sides" aria-label="Regel ' + (i + 1) + ' Kanten">' + Object.entries(EDGE_RULE_SIDES).map(([k, v]) => '<option value="' + k + '"' + (k === r.sides ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></td>' +
      '<td><select data-er="' + i + '" data-f="deco" aria-label="Regel ' + (i + 1) + ' Dekor"><option value="1"' + (r.deco !== 2 ? ' selected' : '') + '>Dekor 1</option><option value="2"' + (r.deco === 2 ? ' selected' : '') + '>Dekor 2</option></select></td>' +
      '<td><button type="button" class="btn ghost small" data-erdel="' + i + '" aria-label="Regel ' + (i + 1) + ' löschen">✕</button></td></tr>').join('') + '</tbody></table>' +
    '<div class="row"><button type="button" class="btn small" id="eradd">+ Regel</button><button type="button" class="btn ghost small" id="erdefault">Standardregeln</button>' +
    '<button type="button" class="btn ghost small" id="erreset" title="Von Hand gesetzte Kanten aller Teile verwerfen – dann gilt wieder die Regel">Eigene Kanten aller Teile löschen</button>' +
    '<button type="button" class="btn ghost small" id="erclose">Schließen</button></div>' +
    '<p class="note">Erste passende Regel gilt (Bauteilname aus der STEP, Wörter mit Komma, * = alle übrigen). „Vorderkante im Möbel“ = die Schmalseite, die zur ' +
    'Möbelvorderseite zeigt; Teile, die mit der Fläche nach vorne zeigen (Türen, Fronten), bekommen dabei keine. Von Hand gesetzte Kanten gehen vor (in der Liste ohne „Regel“).</p>';
  const upd = (fn) => { const list = edgeRules().map((r) => Object.assign({}, r)); fn(list); lst.edgeRules = list; saveLst(); applyBoards(); renderEdgeRules(); };
  el.querySelectorAll('[data-er]').forEach((inp) => inp.addEventListener('change', () => upd((list) => {
    const r = list[+inp.dataset.er];
    r[inp.dataset.f] = inp.dataset.f === 'deco' ? +inp.value : inp.value;
  })));
  el.querySelectorAll('[data-erdel]').forEach((b) => b.addEventListener('click', () => upd((list) => list.splice(+b.dataset.erdel, 1))));
  // neue Regel vor die „*“-Regel (die fängt alle übrigen)
  $('eradd').addEventListener('click', () => upd((list) => {
    const star = list.findIndex((r) => String(r.match || '').trim() === '*');
    list.splice(star < 0 ? list.length : star, 0, { match: '', sides: 'all', deco: 1 });
  }));
  $('erdefault').addEventListener('click', () => { lst.edgeRules = null; saveLst(); applyBoards(); renderEdgeRules(); });
  $('erreset').addEventListener('click', () => { for (const p of state.parts) delete p.edges; applyBoards(); renderEdgeRules(); toast('Eigene Kanten gelöscht – es gelten wieder die Regeln.'); });
  $('erclose').addEventListener('click', () => { el.hidden = true; $('erules').setAttribute('aria-expanded', 'false'); });
  learnedWire(el);
  $('erauto').addEventListener('change', (e) => { lst.edgeAuto = e.target.checked; saveLst(); applyBoards(); });
  $('erfront').addEventListener('change', (e) => { lst.edgeFront = e.target.value; saveLst(); applyBoards(); });
}
$('erules').addEventListener('click', () => { const el = $('erpanel'); el.hidden = !el.hidden; $('erules').setAttribute('aria-expanded', String(!el.hidden)); renderEdgeRules(); });
