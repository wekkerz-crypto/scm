/*
 * Weckwop – Stückliste (05-stueckliste.js)
 * Listen-Einstellungen `lst`, Kantenband, Stückliste (`bomRows`), CSV, Druck A4.
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 13) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
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
const grainOf = (p) => (p && GRAIN_NAMES[p.grain] ? p.grain : (learnedOf(p, 'grain') || {}).grain || 'auto');
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
  const e = (p && p.edges) || (learnedOf(p, 'edges') || {}).edges || (lst.edgeAuto ? autoEdges(p) : null) || {};
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
const partWordsName = (p) => normWord(p.solid ? p.solid.stepName || p.solid.name : p.label);
// passt der Bauteilname zu „Name enthält“ (Wörter mit Komma; ganzes Wort oder ab 4 Buchstaben auch Teil des Namens; * = alle)?
function nameMatches(p, match) {
  const name = partWordsName(p);
  const tokens = name.split(/[^a-z0-9]+/).filter(Boolean);
  const words = String(match || '').split(/[,;]/).map(normWord).filter(Boolean);
  return words.some((w) => w === '*' || tokens.includes(w) || (w.length >= 4 && name.includes(w)));
}
function edgeRuleOf(p) {
  if (!p) return null;
  for (const r of edgeRules()) if (nameMatches(p, r.match)) return r;
  return null;
}
/*
 * Gelernte Regeln (am Gerät, localStorage RULES_KEY, nicht je Projekt): aus Änderungen von Hand in der Stückliste
 * („Als Regel merken“) – je Regel „Name enthält“ und eines oder mehrere von Material (board), Kanten (edges), Faser (grain).
 * Gelten für Teile ohne eigene Wahl; Reihenfolge: je Teil gewählt > Material aus dem Namen > gelernte Regel > Kanten-Regeln/Standard.
 * Neueste Regel zuerst; je Feld gilt die erste passende Regel, die das Feld hat.
 */
const RULES_KEY = 'step2xcs.regeln.v1';
const learn = Object.assign({ on: true, ask: true, list: [] }, loadJson(RULES_KEY, {}) || {});
if (!Array.isArray(learn.list)) learn.list = [];
const saveLearn = () => storeJson(RULES_KEY, learn);
function learnedOf(p, field) {
  if (!p || !learn.on) return null;
  for (const r of learn.list) if (r[field] != null && String(r.match || '').trim() && String(r.match).trim() !== '*' && nameMatches(p, r.match)) return r;
  return null;
}
// Stichwort aus dem Namen vorschlagen: erstes sinnvolles Wort (ohne Nummern, Dekor-Codes wie W1000/ST9, „KP“, „Teil“) –
// bei mehreren Teilen das erste Wort, das alle gemeinsam haben
const LEARN_SKIP = new Set(['kp', 'teil', 'part', 'body', 'koerper', 'bauteil', 'platte', 'links', 'rechts', 'oben', 'unten', 'vorne', 'hinten', 'mitte', 'linke', 'rechte', 'obere', 'untere', 'vordere', 'hintere', 'mittlere', 'innen', 'aussen']);
function learnWord(parts) {
  const words = (p) => partWordsName(p).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/\d/.test(w) && !LEARN_SKIP.has(w) && !/^[a-z]{1,2}\d+$/.test(w));
  const first = words(parts[0]);
  const common = first.filter((w) => parts.every((p) => words(p).includes(w)));
  return common[0] || first[0] || '';
}
// neue Regel bzw. Felder in eine Regel mit gleichem Stichwort übernehmen (die rückt nach vorne)
function learnAdd(match, fields) {
  const m = String(match || '').trim();
  if (!m) return null;
  const at = learn.list.findIndex((r) => normWord(r.match) === normWord(m));
  const r = Object.assign(at >= 0 ? learn.list.splice(at, 1)[0] : { match: m }, fields, { when: new Date().toISOString().slice(0, 10) });
  learn.list.unshift(r);
  saveLearn();
  return r;
}
// Regeln aus einer Projektdatei dazunehmen (nur Stichwörter, die es hier noch nicht gibt)
function mergeLearned(list) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const r of list) {
    if (!r || !String(r.match || '').trim() || learn.list.some((x) => normWord(x.match) === normWord(r.match))) continue;
    learn.list.push({ match: String(r.match), board: r.board != null ? String(r.board) : undefined, edges: r.edges || undefined,
      grain: GRAIN_NAMES[r.grain] && r.grain !== 'auto' ? r.grain : undefined, when: r.when });
    n++;
  }
  if (n) saveLearn();
  return n;
}
const learnText = (r) => [r.board != null ? 'Material ' + boardName(r.board) : '', r.edges ? 'Kanten ' + (edgeText(r.edges) || 'keine') : '',
  r.grain ? 'Faser ' + GRAIN_NAMES[r.grain] : ''].filter(Boolean).join(' · ');
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
    (rule ? '<small class="eauto" title="Vorbelegt nach ' + (rule.learned ? 'gelernter Regel „' + esc(rule.match) + '“' : 'Regel „' + esc(rule.match) + '“ → ' + esc(EDGE_RULE_SIDES[rule.sides] || '')) + ' – Klick auf eine Seite setzt die Kanten von Hand">Regel</small>' : '') + '</span>';
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
// Auswahl in der Stückliste (Bauteile, nicht Zeilen – Zeilen entstehen bei jedem Zeichnen neu)
const bomSel = new Set();
let bomLast = -1; // zuletzt angeklickte Zeile (Umschalt-Klick wählt den Bereich)
// Material für mehrere Bauteile: Farbauswahl öffnen, Wahl gilt sofort für alle (null = wie Einstellung / Name)
function bomBoardPick(anchor, parts, value, learnIt) {
  boardPicker(anchor, value, state.settings.boardMaterial, (k) => {
    for (const p of parts) p.board = k || null;
    if (learnIt && k) learnOffer(parts, { board: k });
    applyBoards();
  });
}
// nach einer Änderung von Hand: anbieten, sie als Regel zu merken (Leiste über der Stückliste)
let bomLearn = null;
function learnOffer(parts, fields) {
  if (!learn.ask || !parts.length) return;
  const same = bomLearn && bomLearn.parts.length === parts.length && parts.every((p) => bomLearn.parts.includes(p));
  if (same) Object.assign(bomLearn.fields, fields);
  else bomLearn = { parts: parts.slice(), fields: Object.assign({}, fields), word: learnWord(parts) };
}
function learnBarHtml() {
  if (!bomLearn) return '';
  if (!bomLearn.parts.every((p) => state.parts.includes(p))) { bomLearn = null; return ''; }
  const hits = state.parts.filter((p) => nameMatches(p, bomLearn.word)).length;
  return '<div class="bomlearn" role="status"><span>Für ähnliche Teile merken – Name enthält</span>' +
    '<input type="text" id="lrnword" value="' + esc(bomLearn.word) + '" aria-label="Stichwort im Bauteilnamen" title="Wörter mit Komma; ganzes Wort oder ab 4 Buchstaben auch Teil des Namens">' +
    '<span>→ <b>' + esc(learnText(bomLearn.fields)) + '</b> <small id="lrnhits">(' + hits + ' Teil' + (hits === 1 ? '' : 'e') + ' hier)</small></span>' +
    '<button type="button" class="btn small" id="lrnsave">Als Regel merken</button><button type="button" class="btn ghost small" id="lrnno">Nein</button>' +
    '<button type="button" class="btn ghost small" id="lrnoff" title="Nicht mehr fragen – wieder einschalten unter „Regeln …“">Nicht mehr fragen</button></div>';
}
function learnBarWire() {
  if (!$('lrnsave')) return;
  $('lrnword').addEventListener('input', (e) => {
    bomLearn.word = e.target.value;
    const hits = e.target.value.trim() ? state.parts.filter((p) => nameMatches(p, e.target.value)).length : 0;
    $('lrnhits').textContent = '(' + hits + ' Teil' + (hits === 1 ? '' : 'e') + ' hier)';
  });
  const save = () => {
    const w = String(bomLearn.word || '').trim();
    if (!w || w === '*') { toast('Bitte ein Stichwort aus dem Bauteilnamen eingeben.'); $('lrnword').focus(); return; }
    const r = learnAdd(w, bomLearn.fields);
    bomLearn = null;
    toast('Regel gemerkt: „' + r.match + '“ → ' + learnText(r));
    applyBoards();
    if (!$('erpanel').hidden) renderEdgeRules();
  };
  $('lrnsave').addEventListener('click', save);
  $('lrnword').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  $('lrnno').addEventListener('click', () => { bomLearn = null; renderBom(); });
  $('lrnoff').addEventListener('click', () => { bomLearn = null; learn.ask = false; saveLearn(); renderBom(); toast('Es wird nicht mehr gefragt – einschalten unter „Regeln …“.'); });
}
function renderBom() {
  const rows = bomRows();
  const tot = bomTotals(rows);
  for (const p of Array.from(bomSel)) if (!state.parts.includes(p)) bomSel.delete(p);
  if (!rows.length) { $('bomview').innerHTML = '<p class="note">Keine Teile geladen.</p>'; return; }
  const isSel = (r) => r.parts.every((p) => bomSel.has(p));
  const selRows = rows.filter(isSel);
  const selParts = selRows.reduce((a, r) => a.concat(r.parts), []);
  // Materialien im Projekt (für „Material tauschen“): Schlüssel → Bauteile
  const mats = new Map();
  for (const r of rows) { const m = mats.get(r.board) || { key: r.board, parts: [], qty: 0 }; m.parts.push(...r.parts); m.qty += r.qty; mats.set(r.board, m); }
  const matList = Array.from(mats.values());
  const allSel = selRows.length === rows.length;
  $('bomview').innerHTML = learnBarHtml() + '<div class="bombar">' +
    (selRows.length ? '<span class="bomselinfo"><b>' + selRows.length + '</b> Position' + (selRows.length === 1 ? '' : 'en') + ' gewählt (' + selParts.reduce((a, p) => a + qtyOf(p), 0) + ' Teile)</span>' +
      '<button type="button" class="btn small" id="bomselmat" aria-expanded="false" title="Material für alle gewählten Positionen ändern">Material ändern …</button>' +
      '<button type="button" class="btn ghost small" id="bomselnone">Auswahl aufheben</button>'
      : '<span class="note">Material je Position: Klick auf das Material · mehrere: Haken setzen (Umschalt + Klick = Bereich)</span>') +
    '<span class="bomswap"><span class="swl">Material tauschen:</span>' + matList.map((m, i) => '<span class="bomswapk"><button type="button" class="btn small boardbtn" id="bomswap' + i + '" data-bomswap="' + i +
      '" aria-expanded="false" title="Alle ' + m.parts.length + ' Bauteile mit „' + esc(boardName(m.key)) + '“ auf ein anderes Material umstellen">' + boardChip(m.key) + ' <small>' + m.qty + '</small></button>' +
      '<button type="button" class="btn ghost small" data-bomselk="' + i + '" title="Alle Positionen mit diesem Material auswählen" aria-label="Positionen mit ' + esc(boardName(m.key)) + ' auswählen">☑</button></span>').join('') + '</span></div>' +
    '<div class="tblwrap"><table class="bom"><thead><tr><th class="ck"><input type="checkbox" id="bomselall" aria-label="Alle Positionen auswählen"' + (allSel ? ' checked' : '') + '></th><th>Pos.</th><th class="r">Anzahl</th><th>Bezeichnung</th><th class="r">Länge</th><th class="r">Breite</th>' +
    '<th class="r">Dicke</th><th>Material / Kanten</th><th title="Kantenband je Seite: L1 vorne, L2 hinten (lange Seiten), B1 links, B2 rechts – Klick: keine → Dekor 1 (schwarz) → Dekor 2 (gestreift); Mitte = ringsum">Kantenband</th><th class="r">Zuschnitt (roh)</th><th class="r">m²</th><th class="r">Zeit je Stück</th><th title="Faserrichtung im Zuschnitt: Auto = nach Material (Maserung längs), längs, quer (gedreht) oder frei">Faser</th><th>Programm</th><th><span class="sr">Löschen</span></th></tr></thead><tbody>' +
    rows.map((r, k) => '<tr' + (isSel(r) ? ' class="sel"' : '') + '><td class="ck"><input type="checkbox" data-bomsel="' + k + '"' + (isSel(r) ? ' checked' : '') + ' aria-label="Position ' + (k + 1) + ' auswählen"></td><td class="no">' + (k + 1) + '</td>' +
      '<td class="r"><input type="number" min="0" step="1" value="' + r.qty + '" data-bomqty="' + k + '" aria-label="Anzahl Position ' + (k + 1) + '"></td>' +
      '<td><b>' + r.names.map(esc).join(', ') + '</b><div class="sub">Bauteil ' + r.nums.join(', ') + '</div></td>' +
      '<td class="r">' + n1(r.L) + '</td><td class="r">' + n1(r.W) + '</td><td class="r">' + n1(r.T) + '</td>' +
      '<td><button type="button" class="btn ghost small boardbtn bommat" id="bommat' + k + '" data-bommat="' + k + '" aria-expanded="false" title="' +
        (isSel(r) && selRows.length > 1 ? 'Material für alle ' + selRows.length + ' gewählten Positionen ändern' : 'Material ändern') + (r.parts.some((p) => p.board) ? '' : ' (jetzt: ' + (nameBoard(r.parts[0]) ? 'aus dem Namen' : learnedOf(r.parts[0], 'board') ? 'gelernte Regel „' + learnedOf(r.parts[0], 'board').match + '“' : 'Standard') + ')') + '">' + boardChip(r.board) + '</button>' +
        (!r.parts.some((p) => p.board) && !nameBoard(r.parts[0]) && learnedOf(r.parts[0], 'board') ? ' <small class="eauto" title="Aus der gelernten Regel „' + esc(learnedOf(r.parts[0], 'board').match) + '“">Regel</small>' : '') + '</td>' +
      '<td>' + edgeWidget(r.edges, k, r.board, r.parts[0].edges ? null : learnedOf(r.parts[0], 'edges') ? { match: learnedOf(r.parts[0], 'edges').match, learned: true } : lst.edgeAuto ? edgeRuleOf(r.parts[0]) : null) + '</td>' +
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
  // Auswahl
  const selSet = (r, on) => { for (const p of r.parts) { if (on) bomSel.add(p); else bomSel.delete(p); } };
  $('bomview').querySelectorAll('[data-bomsel]').forEach((c) => c.addEventListener('click', (e) => {
    const k = +c.dataset.bomsel;
    if (e.shiftKey && bomLast >= 0) for (let j = Math.min(k, bomLast); j <= Math.max(k, bomLast); j++) selSet(rows[j], c.checked);
    else selSet(rows[k], c.checked);
    bomLast = k;
    renderBom();
    const again = $('bomview').querySelector('[data-bomsel="' + k + '"]');
    if (again) again.focus();
  }));
  $('bomselall').addEventListener('change', (e) => { for (const r of rows) selSet(r, e.target.checked); renderBom(); $('bomselall').focus(); });
  const sa = $('bomselall');
  sa.indeterminate = selRows.length > 0 && !allSel;
  if ($('bomselnone')) $('bomselnone').addEventListener('click', () => { bomSel.clear(); renderBom(); });
  learnBarWire();
  if ($('bomselmat')) $('bomselmat').addEventListener('click', (e) => bomBoardPick(e.currentTarget, selParts, selRows[0].board, true));
  // Material je Position (gehört die Zeile zur Auswahl: für alle gewählten)
  $('bomview').querySelectorAll('[data-bommat]').forEach((b) => b.addEventListener('click', (e) => {
    const r = rows[+b.dataset.bommat];
    bomBoardPick(e.currentTarget, isSel(r) && selRows.length > 1 ? selParts : r.parts, r.board, true);
  }));
  // Material tauschen: alle Bauteile mit diesem Material
  $('bomview').querySelectorAll('[data-bomswap]').forEach((b) => b.addEventListener('click', (e) => {
    const m = matList[+b.dataset.bomswap];
    bomBoardPick(e.currentTarget, m.parts, m.key);
  }));
  $('bomview').querySelectorAll('[data-bomselk]').forEach((b) => b.addEventListener('click', () => {
    const m = matList[+b.dataset.bomselk];
    bomSel.clear();
    for (const p of m.parts) bomSel.add(p);
    renderBom();
  }));
  $('bomview').querySelectorAll('[data-bomedge]').forEach((b) => b.addEventListener('click', () => {
    const r = rows[+b.dataset.bomedge];
    const cur = edgesOf(r.parts[0]);
    const sd = b.dataset.side;
    // ringsum: alle gleich → nächste Stufe für alle (keine → Dekor 1 → Dekor 2), sonst alle auf Dekor 1
    const vals = EDGE_SIDES.map(([k2]) => cur[k2]);
    const v = sd === 'all' ? (vals.every((x) => x === vals[0]) ? (vals[0] + 1) % 3 : 1) : (cur[sd] + 1) % 3;
    for (const p of r.parts) { p.edges = edgesOf(p); for (const [k2] of EDGE_SIDES) if (sd === 'all' || sd === k2) p.edges[k2] = v; }
    learnOffer(r.parts, { edges: Object.assign({}, r.parts[0].edges) });
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
    const parts = rows[+sel.dataset.bomgrain].parts;
    for (const p of parts) p.grain = sel.value === 'auto' ? undefined : sel.value;
    if (sel.value !== 'auto') learnOffer(parts, { grain: sel.value });
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
