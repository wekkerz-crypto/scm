/*
 * Step2Maestro – Stückliste (05-stueckliste.js)
 * Listen-Einstellungen `lst`, Kantenband, Stückliste (`bomRows`), CSV, Druck A4.
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 12) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

// ------------------------------------------------ Listen: Stückliste und Zuschnittplan
// Datei speichern (CSV, Projekt …): direkt als Download bzw. im claude.ai-Artifact über die downloads-Fähigkeit
async function saveOne(name, text, mime) {
  if (claudeHost) {
    if (!downloadsCap) { toast('Speichern ist hier nicht verfügbar.'); return; }
    try { await downloadsCap.save({ filename: name, data: new Blob([text], { type: mime }) }); toast('Gespeichert: ' + name); } catch (e) {
      if (e && e.code !== 'declined') toast('Speichern nicht möglich (' + (e.code || 'Fehler') + ').');
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
// Seiten in A4 drucken (Browser: „Als PDF speichern“ möglich)
function printA4(html, landscape) {
  let area = $('printarea');
  if (!area) { area = document.createElement('div'); area.id = 'printarea'; document.body.appendChild(area); }
  area.innerHTML = '<div class="a4">' + html + '</div>';
  let pg = $('labelpage');
  if (!pg) { pg = document.createElement('style'); pg.id = 'labelpage'; document.head.appendChild(pg); }
  pg.textContent = '@page { size: A4' + (landscape ? ' landscape' : '') + '; margin: 12mm; }';
  window.print();
}
// Stückzahl eines Teils (Stückliste; ohne Angabe 1, 0 = nicht fertigen)
const qtyOf = (p) => (p.qty === undefined || p.qty === null ? 1 : Math.max(0, Math.round(p.qty)));
// Faserrichtung je Teil für den Zuschnitt: auto (nach Material), long (längs), cross (quer), free (drehen erlaubt)
const GRAIN_NAMES = { auto: 'Auto', long: 'längs', cross: 'quer', free: 'frei' };
const grainOf = (p) => (p && GRAIN_NAMES[p.grain] ? p.grain : 'auto');
function orientOf(p, board) {
  const g = grainOf(p);
  if (g !== 'auto') return g;
  return lst.grain && View3D.boardOf(board).grain > 0 ? 'long' : 'free';
}
const LIST_KEY = 'step2xcs.lists.v1';
const lst = Object.assign({ tab: 'bom', group: true, raw: true, sheetL: 2800, sheetW: 2070, kerf: 4.4, trim: 10, grain: true, cuts: true, dir: 'auto', goal: 'waste', edgeMm: 1, edgeName1: '', edgeName2: 'Dekor 2', edgeColor2: '#5b4a3a', edgeExtra: 50, edgeDeduct: false,
  edgeAuto: true, edgeFront: '-y', edgeRules: null, cutZoom: 0.7, cutFont: 1, sawZoom: 1, sawFont: 1, sawDone: {} }, loadJson(LIST_KEY, {}) || {});
const saveLst = () => storeJson(LIST_KEY, lst);

/*
 * Kantenband je Teil: part.edges = { l1, l2, b1, b2 } mit 0 = keine, 1 = Dekor 1, 2 = Dekor 2 (Namen lst.edgeName1/2, Dekor 1 leer =
 * wie die Platte); alle Kanten gleich dick (lst.edgeMm, Vorgabe 1 mm).
 * L1 = vorne (Y = 0), L2 = hinten (Y = B) – die langen Seiten der Länge L; B1 = links (X = 0), B2 = rechts (X = L).
 */
const EDGE_SIDES = [['l1', 'L1', 'vorne'], ['l2', 'L2', 'hinten'], ['b1', 'B1', 'links'], ['b2', 'B2', 'rechts']];
const edgesOf = (p) => {
  const e = (p && p.edges) || (lst.edgeAuto ? autoEdges(p) : null) || {};
  return { l1: e.l1 | 0, l2: e.l2 | 0, b1: e.b1 | 0, b2: e.b2 | 0 };
};
/*
 * Vorbelegung nach Regeln (lst.edgeRules, erste passende gilt) für Teile ohne eigene Kanten (part.edges): Name enthält eines der
 * Wörter (Komma getrennt, ganzes Wort oder ab 4 Buchstaben auch Teil des Namens, Umlaute egal; * = alle) → Seiten + Dekor.
 * Seiten 'all' ringsum, 'front' = Vorderkante im Möbel (Schmalfläche, die nach lst.edgeFront zeigt), 'long' L1 + L2, 'none'.
 */
const EDGE_RULES_DEFAULT = [{ match: 'Tür, Front, Blende, Klappe, Schublade', sides: 'all', deco: 1 }, { match: 'RW, Rückwand', sides: 'none', deco: 1 },
  { match: '*', sides: 'front', deco: 1 }];
const EDGE_RULE_SIDES = { all: 'ringsum', front: 'Vorderkante im Möbel', long: 'Längsseiten (L1 + L2)', none: 'keine' };
const FRONT_DIRS = { '-y': ['−Y (Onshape vorne)', [0, -1, 0]], '+y': ['+Y', [0, 1, 0]], '-x': ['−X', [-1, 0, 0]], '+x': ['+X', [1, 0, 0]] };
const edgeRules = () => (Array.isArray(lst.edgeRules) ? lst.edgeRules : EDGE_RULES_DEFAULT);
const normWord = (w) => String(w || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').trim();
function edgeRuleOf(p) {
  if (!p) return null;
  const name = normWord(p.solid ? p.solid.stepName || p.solid.name : p.label);
  const tokens = name.split(/[^a-z0-9]+/).filter(Boolean);
  for (const r of edgeRules()) {
    const words = String(r.match || '').split(/[,;]/).map(normWord).filter(Boolean);
    if (words.some((w) => w === '*' || tokens.includes(w) || (w.length >= 4 && name.includes(w)))) return r;
  }
  return null;
}
function autoEdges(p) {
  const r = edgeRuleOf(p);
  if (!r || r.sides === 'none') return null;
  const v = r.deco === 2 ? 2 : 1;
  if (r.sides === 'all') return { l1: v, l2: v, b1: v, b2: v };
  if (r.sides === 'long') return { l1: v, l2: v };
  const res = p.res || p.result;
  const m = res && res.panel && res.panel.tf && res.panel.tf.m;
  if (!m) return null;
  const d = (FRONT_DIRS[lst.edgeFront] || FRONT_DIRS['-y'])[1];
  const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  const px = dot(m[0]);
  const py = dot(m[1]);
  if (Math.abs(dot(m[2])) > 0.7) return null; // zeigt mit der Fläche nach vorne (Front, Tür) – keine Vorderkante
  const sd = Math.abs(py) >= Math.abs(px) ? (py < 0 ? 'l1' : 'l2') : (px < 0 ? 'b1' : 'b2');
  return { [sd]: v };
}
const edgeMm = (v) => (v ? +lst.edgeMm || 0 : 0);
const decoName = (v, board) => (v === 2 ? String(lst.edgeName2 || '').trim() || 'Dekor 2' : String(lst.edgeName1 || '').trim() || (board ? View3D.boardOf(board).name : 'Dekor 1'));
const edgeSig = (e) => EDGE_SIDES.map(([k]) => e[k]).join('');
// kurz für Listen: „L1 D1 · L2 D2 · B1 D1“ – Dekor hinter der Seite
function edgeText(e) {
  const on = EDGE_SIDES.filter(([k]) => e[k]);
  if (!on.length) return '';
  return on.map(([k, t]) => t + ' D' + e[k]).join(' · ');
}
// Abzug der Kantendicke vom Zuschnitt (Einstellung): Länge um B1 + B2, Breite um L1 + L2
const edgeDeduct = (e) => (lst.edgeDeduct ? { L: edgeMm(e.b1) + edgeMm(e.b2), W: edgeMm(e.l1) + edgeMm(e.l2) } : { L: 0, W: 0 });
// Rohmaß (Zuschnitt) eines Teils: Fertigmaß + Rohteil-Aufmaß (Profil mit gesägten Stirnseiten: nur in der Länge), ggf. ohne Kantendicke
// Zuschnittmaß eines Teils wie im Zuschnittplan: Rohmaß (mit Aufmaß) oder Fertigmaß, jeweils ohne Kantendicke wenn eingestellt
function cutDimsOf(part) {
  const r = part.res || part.result;
  if (lst.raw) return rawDims(r, part);
  const dd = edgeDeduct(edgesOf(part));
  return { L: r.panel.L - dd.L, W: r.panel.W - dd.W };
}
function rawDims(r, p) {
  const o = state.settings.rawOversize || 0;
  const prof = r.panel.profile && state.settings.profileRule !== 'off';
  const d = edgeDeduct(edgesOf(p));
  return { L: r.panel.L + 2 * o - d.L, W: r.panel.W + (prof ? 0 : 2 * o) - d.W };
}
// Kantenband-Laufmeter einer Position nach Dekor: Seitenlänge + Zugabe je Kante, mal Anzahl
function edgeMeters(r) {
  const e = edgesOf(r.parts[0]);
  const out = new Map();
  for (const [k] of EDGE_SIDES) {
    if (!e[k]) continue;
    const key = decoName(e[k], r.board) + ' · ' + fmt(edgeMm(e[k])) + ' mm';
    const len = (k.charAt(0) === 'l' ? r.L : r.W) + (+lst.edgeExtra || 0);
    out.set(key, (out.get(key) || 0) + (len * r.qty) / 1000);
  }
  return out;
}
// Schaltfläche je Seite (Klick: keine → Dekor 1 → Dekor 2)
function edgeWidget(e, k, board, rule) {
  const st = (v) => (v ? 'Dekor ' + v + ' (' + decoName(v, board) + ')' : 'keine');
  return '<span class="edgecell"><span class="edgew">' + EDGE_SIDES.map(([s2, t, w]) => '<button type="button" class="' + s2 + ' e' + e[s2] + '" data-bomedge="' + k + '" data-side="' + s2 +
    '" title="Kante ' + t + ' (' + w + '): ' + st(e[s2]) + ' – Klick wechselt" aria-label="Position ' + (k + 1) + ' Kante ' + t + ' ' + w + ': ' + st(e[s2]) + '"></button>').join('') +
    '<button type="button" class="pc' + (EDGE_SIDES.every(([s2]) => e[s2]) ? ' all' : '') + '" data-bomedge="' + k + '" data-side="all" title="Alle vier Kanten ringsum – Klick wechselt keine → Dekor 1 → Dekor 2" aria-label="Position ' +
    (k + 1) + ' alle Kanten ringsum">ringsum<small>L ↔</small></button></span><span class="et">' +
    esc(edgeText(e)).split(' · ').map((t, i, a) => '<span>' + t + (i < a.length - 1 ? ' ·' : '') + '</span>').join(' ') + '</span>' +
    (rule ? '<small class="eauto" title="Vorbelegt nach Regel „' + esc(rule.match) + '“ → ' + esc(EDGE_RULE_SIDES[rule.sides] || '') + ' – Klick auf eine Seite setzt die Kanten von Hand">Regel</small>' : '') + '</span>';
}
// Positionen der Stückliste: gleiche Teile (Maße, Plattenfarbe, gleiches Programm) zusammengefasst
function bomRows() {
  const rows = [];
  const byKey = new Map();
  state.parts.forEach((p, i) => {
    const r = p.res || p.result;
    if (!r || !r.panel) return;
    const name = p.solid ? p.solid.name : p.label;
    const board = boardKeyOf(p);
    // Programm ohne die Zeile mit dem Teilenamen (SetComment) – sonst würde ein kurzer Name („B“) auch in anderen Texten ersetzt
    const noName = (x) => String(x || '').replace(/^SetComment\("STEP2XCS: .*$/m, '');
    const prog = noName(r.xcs) + (r.side2 ? noName(r.side2.xcs) : '');
    // Faserrichtung gehört dazu: sonst würden Teile mit anderer Faser zusammengefasst und im Zuschnitt gleich gelegt
    const key = lst.group ? [Math.round(r.panel.L * 10), Math.round(r.panel.W * 10), Math.round(r.panel.T * 10), board, edgeSig(edgesOf(p)), grainOf(p), prog].join('|') : 'p' + i;
    let row = byKey.get(key);
    if (!row) {
      row = { parts: [], nums: [], names: [], qty: 0, L: r.panel.L, W: r.panel.W, T: r.panel.T, raw: rawDims(r, p), board: board, time: partTime(p),
        edges: edgesOf(p), files: [] };
      byKey.set(key, row);
      rows.push(row);
    }
    row.parts.push(p);
    row.nums.push(i + 1);
    if (!row.names.includes(name)) row.names.push(name);
    row.qty += qtyOf(p);
    const fn = p.fileName || r.fileName;
    if (fn && !row.files.includes(fn)) row.files.push(fn);
  });
  return rows;
}
function bomTotals(rows) {
  const byMat = new Map();
  const bands = new Map();
  let qty = 0;
  let time = 0;
  for (const r of rows) {
    for (const [k, v] of edgeMeters(r)) bands.set(k, (bands.get(k) || 0) + v);
    qty += r.qty;
    if (r.time) time += r.time.total * r.qty;
    const k = View3D.boardOf(r.board).name + ' ' + fmt(r.T) + ' mm';
    byMat.set(k, (byMat.get(k) || 0) + (r.L * r.W * r.qty) / 1e6);
  }
  return { qty: qty, time: time, byMat: byMat, bands: bands };
}
function renderBom() {
  const rows = bomRows();
  const tot = bomTotals(rows);
  if (!rows.length) { $('bomview').innerHTML = '<p class="note">Keine Teile geladen.</p>'; return; }
  $('bomview').innerHTML = '<div class="tblwrap"><table class="bom"><thead><tr><th>Pos.</th><th class="r">Anzahl</th><th>Bezeichnung</th><th class="r">Länge</th><th class="r">Breite</th>' +
    '<th class="r">Dicke</th><th>Material / Kanten</th><th title="Kantenband je Seite: L1 vorne, L2 hinten (lange Seiten), B1 links, B2 rechts – Klick: keine → Dekor 1 (schwarz) → Dekor 2 (gestreift); Mitte = ringsum">Kantenband</th><th class="r">Zuschnitt (roh)</th><th class="r">m²</th><th class="r">Zeit je Stück</th><th title="Faserrichtung im Zuschnitt: Auto = nach Material (Maserung längs), längs, quer (gedreht) oder frei">Faser</th><th>Programm</th><th><span class="sr">Löschen</span></th></tr></thead><tbody>' +
    rows.map((r, k) => '<tr><td class="no">' + (k + 1) + '</td>' +
      '<td class="r"><input type="number" min="0" step="1" value="' + r.qty + '" data-bomqty="' + k + '" aria-label="Anzahl Position ' + (k + 1) + '"></td>' +
      '<td><b>' + r.names.map(esc).join(', ') + '</b><div class="sub">Bauteil ' + r.nums.join(', ') + '</div></td>' +
      '<td class="r">' + n1(r.L) + '</td><td class="r">' + n1(r.W) + '</td><td class="r">' + n1(r.T) + '</td>' +
      '<td>' + boardSwatch(r.board) + ' ' + esc(boardName(r.board)) + '</td>' +
      '<td>' + edgeWidget(r.edges, k, r.board, !r.parts[0].edges && lst.edgeAuto ? edgeRuleOf(r.parts[0]) : null) + '</td>' +
      '<td class="r">' + n1(r.raw.L) + ' × ' + n1(r.raw.W) + '</td>' +
      '<td class="r">' + fmt(Math.round((r.L * r.W * r.qty) / 1e4) / 100) + '</td>' +
      '<td class="r">' + (r.time ? '<span title="' + esc(timeTitle(r.time)) + '">' + Toolpath.fmtTime(r.time.total) + '</span>' : '–') + '</td>' +
      '<td><select data-bomgrain="' + k + '" aria-label="Faserrichtung Position ' + (k + 1) + '">' + Object.entries(GRAIN_NAMES).map(([v, t]) => '<option value="' + v + '"' +
        (grainOf(r.parts[0]) === v ? ' selected' : '') + '>' + t + (v === 'auto' ? ' (' + GRAIN_NAMES[orientOf(r.parts[0], r.board)] + ')' : '') + '</option>').join('') + '</select></td>' +
      '<td class="files">' + r.files.map(esc).join('<br>') + '</td>' +
      '<td><button type="button" class="btn ghost small bomdel" data-bomdel="' + k + '" title="Position löschen (' + r.parts.length + ' Bauteil' + (r.parts.length === 1 ? '' : 'e') + ') – zweimal klicken" aria-label="Position ' + (k + 1) + ' löschen">' + ICON_TRASH + '</button></td></tr>').join('') +
    '</tbody></table></div>' +
    '<div class="bomsum"><span><b>' + tot.qty + '</b> Teile</span>' +
    Array.from(tot.byMat).map(([k, v]) => '<span>' + esc(k) + ': <b>' + fmt(Math.round(v * 100) / 100) + ' m²</b></span>').join('') +
    Array.from(tot.bands).map(([k, v]) => '<span>Kante ' + esc(k) + ': <b>' + fmt(Math.round(v * 10) / 10) + ' m</b></span>').join('') +
    '<span>Bearbeitungszeit gesamt: <b>' + Toolpath.fmtTime(tot.time) + '</b> <small>(geschätzt, inkl. Auflegen)</small></span></div>';
  $('bomview').querySelectorAll('[data-bomedge]').forEach((b) => b.addEventListener('click', () => {
    const r = rows[+b.dataset.bomedge];
    const cur = edgesOf(r.parts[0]);
    const sd = b.dataset.side;
    // ringsum: alle gleich → nächste Stufe für alle (keine → Dekor 1 → Dekor 2), sonst alle auf Dekor 1
    const vals = EDGE_SIDES.map(([k2]) => cur[k2]);
    const v = sd === 'all' ? (vals.every((x) => x === vals[0]) ? (vals[0] + 1) % 3 : 1) : (cur[sd] + 1) % 3;
    for (const p of r.parts) { p.edges = edgesOf(p); for (const [k2] of EDGE_SIDES) if (sd === 'all' || sd === k2) p.edges[k2] = v; }
    applyBoards();
  }));
  // Löschen: erster Klick fragt („Löschen?“), zweiter löscht alle Bauteile der Position (auch aus den Programmen)
  $('bomview').querySelectorAll('[data-bomdel]').forEach((b) => b.addEventListener('click', () => {
    if (!b.classList.contains('arm')) {
      b.classList.add('arm');
      b.innerHTML = 'Löschen?';
      setTimeout(() => { if (b.isConnected) { b.classList.remove('arm'); b.innerHTML = ICON_TRASH; } }, 4000);
      return;
    }
    const r = rows[+b.dataset.bomdel];
    const cur = state.parts[state.sel];
    state.parts = state.parts.filter((p) => !r.parts.includes(p));
    const at = state.parts.indexOf(cur);
    state.sel = at >= 0 ? at : Math.min(state.sel, Math.max(0, state.parts.length - 1));
    anim.result = null;
    anim.playing = false;
    toast(r.names.join(', ') + ' gelöscht.');
    render();
  }));
  $('bomview').querySelectorAll('[data-bomgrain]').forEach((sel) => sel.addEventListener('change', () => {
    for (const p of rows[+sel.dataset.bomgrain].parts) p.grain = sel.value === 'auto' ? undefined : sel.value;
    render();
  }));
  $('bomview').querySelectorAll('[data-bomqty]').forEach((inp) => inp.addEventListener('change', () => {
    const r = rows[+inp.dataset.bomqty];
    const v = parseFloat(String(inp.value).replace(',', '.'));
    if (!(v >= 0)) { inp.value = r.qty; return; } // leer / ungültig: nichts ändern
    // Anzahl der Position: das erste Teil trägt den Rest; reicht das nicht, werden die übrigen von hinten verringert
    let rest = Math.round(v);
    const others = r.parts.slice(1);
    let oth = others.reduce((a, p) => a + qtyOf(p), 0);
    for (let k = others.length - 1; k >= 0 && oth > rest; k--) { const q = qtyOf(others[k]); const cut = Math.min(q, oth - rest); others[k].qty = q - cut; oth -= cut; }
    r.parts[0].qty = Math.max(0, rest - oth);
    render();
  }));
}
function bomCsv() {
  const rows = bomRows();
  const c = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const num = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  const lines = [['Pos', 'Anzahl', 'Bezeichnung', 'Bauteil-Nr', 'Länge mm', 'Breite mm', 'Dicke mm', 'Material', 'Kanten', 'Kante L1', 'Kante L2', 'Kante B1', 'Kante B2',
    'Kantendicke mm', 'Kantenband m', 'Zuschnitt Länge mm', 'Zuschnitt Breite mm', 'Fläche m²', 'Zeit je Stück min', 'Programm'].map(c).join(';')];
  rows.forEach((r, k) => {
    const b = View3D.boardOf(r.board);
    lines.push([k + 1, r.qty, c(r.names.join(', ')), c(r.nums.join(', ')), num(r.L), num(r.W), num(r.T), c(b.name), c(b.edgeName),
      ...EDGE_SIDES.map(([k2]) => (r.edges[k2] ? c(decoName(r.edges[k2], r.board)) : '')), EDGE_SIDES.some(([k2]) => r.edges[k2]) ? num(+lst.edgeMm || 0) : '', num(Array.from(edgeMeters(r).values()).reduce((a, v) => a + v, 0)), num(r.raw.L), num(r.raw.W),
      String(Math.round((r.L * r.W * r.qty) / 1e4) / 100).replace('.', ','), r.time ? String(Math.round(r.time.total / 6) / 10).replace('.', ',') : '', c(r.files.join(', '))].join(';'));
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}
function bomPrintHtml() {
  const rows = bomRows();
  const tot = bomTotals(rows);
  const d = new Date();
  return '<h1>Stückliste</h1><p class="meta">' + d.toLocaleDateString('de-DE') + ' · ' + tot.qty + ' Teile · Bearbeitungszeit ≈ ' + Toolpath.fmtTime(tot.time) + '</p>' +
    '<table class="pbom"><thead><tr><th>Pos.</th><th>Anz.</th><th>Bezeichnung</th><th>L</th><th>B</th><th>D</th><th>Material / Kanten</th><th>Kantenband</th><th>Zuschnitt</th><th>Zeit</th></tr></thead><tbody>' +
    rows.map((r, k) => '<tr><td>' + (k + 1) + '</td><td>' + r.qty + '</td><td>' + r.names.map(esc).join(', ') + ' <small>(' + r.nums.join(', ') + ')</small></td><td>' + n1(r.L) +
      '</td><td>' + n1(r.W) + '</td><td>' + n1(r.T) + '</td><td>' + esc(boardName(r.board)) + '</td><td>' + esc(edgeText(r.edges)) + '</td><td>' + n1(r.raw.L) + ' × ' + n1(r.raw.W) + '</td><td>' +
      (r.time ? Toolpath.fmtTime(r.time.total) : '–') + '</td></tr>').join('') + '</tbody></table>' +
    '<p class="meta">' + Array.from(tot.byMat).map(([k, v]) => esc(k) + ': ' + fmt(Math.round(v * 100) / 100) + ' m²').join(' · ') +
    Array.from(tot.bands).map(([k, v]) => ' · Kante ' + esc(k) + ': ' + fmt(Math.round(v * 10) / 10) + ' m').join('') + '</p>';
}
