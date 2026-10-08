/*
 * Weckwop – Teile laden, Sitzung, Projektdatei (02-teile-sitzung.js)
 * STEP/DXF laden (`addStep`/`addDxf`), Berechnung je Teil (`compute`), Sitzung im Browser (IndexedDB), Projektdatei .s2m (`projectPayload`/`applyProject`).
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 13) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

// ------------------------------------------------ Teile
// Sitzung im Browser (IndexedDB – Platz auch für große STEP-Dateien): geladene Dateien, Teile mit allen Änderungen
// (Drehung, Feld, Werkzeuge, Reihenfolge, Profil …) und das gewählte Teil. Nach dem Neuladen kommt alles wieder;
// die Beispielteile nur beim allerersten Öffnen.
const srcFiles = new Map();
let srcSeq = 0;
function srcFile(label, kind, text) {
  for (const [id, f] of srcFiles) if (f.kind === kind && f.label === label && f.text === text) return id;
  const id = ++srcSeq;
  srcFiles.set(id, { label: label, kind: kind, text: text });
  return id;
}
const SESSION_KEY = 'session.v1';
let sessionReady = false;
let sessionTimer = null;
function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('kein IndexedDB')); return; }
    const r = indexedDB.open('step2xcs', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const q = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite');
    t.objectStore('kv').put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
function sessionData() {
  const parts = state.parts.filter((p) => p.solid && p.src);
  const used = new Set(parts.map((p) => p.src.file));
  return {
    v: 1,
    sel: state.sel,
    files: Array.from(srcFiles).filter(([id]) => used.has(id)).map(([id, f]) => ({ id: id, label: f.label, kind: f.kind, text: f.text })),
    parts: parts.map((p) => ({ file: p.src.file, idx: p.src.idx, label: p.label, name: p.solid.name, orientation: p.orientation, field: p.field,
      fileName: p.fileName, side: p.side, profile: p.profile, board: p.board || null, qty: p.qty === undefined ? 1 : p.qty, grain: p.grain || null, edges: p.edges || null, overrides: p.overrides, overrides2: p.overrides2 })),
    // Maße aus „Möbel 3D“ (Bemaßen)
    dims: typeof mdl !== 'undefined' ? (mdl.dimsSaved || (mdl.viewer ? mdl.viewer.exportDims() : [])) : [],
  };
}
function writeSession() {
  sessionTimer = null;
  let data;
  try { data = JSON.parse(JSON.stringify(sessionData())); } catch (e) { return; }
  idbSet(SESSION_KEY, data).catch(() => { /* ohne Speicher: nur für diese Sitzung */ });
  projMark();
}
function saveSession() {
  if (!sessionReady) return;
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(writeSession, 150);
}
// beim Neuladen/Schließen noch ausstehendes Speichern sofort anstoßen
window.addEventListener('pagehide', () => { if (sessionTimer) { clearTimeout(sessionTimer); writeSession(); } });
async function restoreSession() {
  let data = null;
  try { data = await idbGet(SESSION_KEY); } catch (e) { data = null; }
  if (!data || data.v !== 1) return false;
  restoreFrom(data);
  return true;
}
// Teile (mit allen Änderungen) aus gespeicherten Daten anhängen – Sitzung oder Projektdatei
function restoreFrom(data) {
  const first = state.parts.length;
  const files = new Map((data.files || []).map((f) => [f.id, f]));
  const solidsOf = new Map();
  for (const sp of data.parts || []) {
    const f = files.get(sp.file);
    if (!f) continue;
    const fileId = srcFile(f.label, f.kind, f.text);
    let solid;
    if (f.kind === 'dxf') solid = { name: sp.name };
    else {
      if (!solidsOf.has(sp.file)) {
        try { solidsOf.set(sp.file, StepToXcs.readParts(f.text, f.label.replace(/^Beispiel: /, ''))); } catch (e) { solidsOf.set(sp.file, []); }
      }
      const base = solidsOf.get(sp.file)[sp.idx];
      if (!base) continue;
      solid = base;
      solid.name = sp.name;
    }
    const part = { label: sp.label || f.label, src: { file: fileId, idx: sp.idx }, solid: solid, orientation: sp.orientation || null,
      field: sp.field || null, fileName: sp.fileName || null, result: null, side: sp.side || 1, profile: sp.profile === undefined ? null : sp.profile, board: sp.board || null, qty: sp.qty === undefined ? 1 : sp.qty, grain: sp.grain || undefined, edges: sp.edges || undefined,
      overrides: sp.overrides || { tools: {}, steps: {}, depths: {} }, overrides2: sp.overrides2 || { tools: {}, steps: {}, depths: {} } };
    if (f.kind === 'dxf') part.dxfText = f.text; else part.stepText = f.text;
    try { compute(part); } catch (e) { continue; }
    state.parts.push(part);
  }
  state.sel = Math.max(0, Math.min(first + (data.sel || 0), state.parts.length - 1));
  if (typeof mdl !== 'undefined' && Array.isArray(data.dims) && data.dims.length) {
    mdl.dimsSaved = data.dims;
    mdl.key = null; // Möbel 3D neu aufbauen, dann Maße setzen
  }
}

// ------------------------------------------------ Projektdatei (.s2m): Dateien, Teile mit allen Änderungen, Farben, Anzahl, Maße
const PROJECT_FORMAT = 'step2maestro-projekt';
// ganzes Projekt als Daten: Teile (session), Stückliste/Zuschnitt (lists), Einstellungen, benutzte eigene Dekor-Bilder, Name/Kunde/Notiz
function projectPayload() {
  const data = { format: PROJECT_FORMAT, saved: new Date().toISOString(), session: JSON.parse(JSON.stringify(sessionData())) };
  // eigene Dekor-Bilder, die die Teile benutzen, gehen mit (auf einem anderen PC sind sie sonst nicht da)
  const used = new Set(state.parts.map((p) => String(boardKeyOf(p)).split('|')[0]).filter((k) => k.slice(0, 4) === 'dek:').map((k) => k.slice(4)));
  const dk = localDecors.filter((x) => used.has(x.key));
  if (dk.length) data.dekore = dk;
  // Stückliste/Zuschnitt (Format, Schnittfuge, Pläne von Hand, Haken im Sägemodus, Kanten) und die Einstellungen gehen mit
  data.lists = projectLists();
  data.settings = JSON.parse(JSON.stringify(state.settings));
  // gelernte Regeln gehen mit (auf einem anderen Gerät werden fehlende dazugenommen)
  if (learn.list.length) data.regeln = JSON.parse(JSON.stringify(learn.list));
  // Zeichnungen (PDF/Bilder) gehören zum Projekt
  if (drw.list.length) data.zeichnungen = drwPayload();
  if (typeof proj !== 'undefined' && proj.name) data.meta = { name: proj.name, kunde: proj.kunde || '', notiz: proj.notiz || '' };
  return data;
}
// Export als Datei (.s2m) – zum Weitergeben oder als Sicherung
function saveProject() {
  if (!state.parts.length) { toast('Keine Teile vorhanden.'); return; }
  const first = state.parts.find((p) => p.label);
  const base = StepToXcs.partName(String(proj.name || (first ? first.label : 'Projekt')).replace(/^Beispiel: /, '').replace(/^.*[\\/]/, '').replace(/\.(step|stp|dxf)$/i, ''));
  const d = new Date();
  const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  saveOne(base + '_' + stamp + '.s2m', JSON.stringify(projectPayload()), 'application/json');
}
// Listen-Werte, die zum Projekt gehören (Ansicht, Zoom und Säge-Einstellungen bleiben am Gerät)
const PROJECT_LST_KEYS = ['group', 'raw', 'sheetL', 'sheetW', 'kerf', 'trim', 'grain', 'cuts', 'dir', 'goal', 'groupSheet', 'manual', 'sawDone', 'saw',
  'edgeMm', 'edgeName1', 'edgeName2', 'edgeColor2', 'edgeExtra', 'edgeDeduct', 'edgeAuto', 'edgeFront', 'edgeRules'];
const SETTINGS_LOCAL = ['xconverterPath', 'toolsFile', 'pgmxDir']; // Pfade gehören zum PC
function projectLists() {
  const o = {};
  for (const k of PROJECT_LST_KEYS) if (lst[k] !== undefined) o[k] = lst[k];
  return JSON.parse(JSON.stringify(o));
}
function parseProject(text, name) {
  let data;
  try { data = JSON.parse(text); } catch (e) { toast(name + ': keine gültige Projektdatei.'); return null; }
  if (!data || data.format !== PROJECT_FORMAT || !data.session || data.session.v !== 1) { toast(name + ': keine Weckwop-Projektdatei.'); return null; }
  return data;
}
// Projekt-Daten übernehmen (ersetzt die Teileliste)
function applyProject(data) {
  state.parts = [];
  anim.result = null;
  if (Array.isArray(data.dekore)) mergeDecors(data.dekore);
  if (Array.isArray(data.regeln)) mergeLearned(data.regeln);
  drwSet(data.zeichnungen);
  // Einstellungen des Projekts (Werkzeuge, Regeln, Sauger …): nur nach Nachfrage, wenn sie von den eigenen abweichen
  if (data.settings && typeof data.settings === 'object') {
    const strip = (o) => { const c = Object.assign({}, o); for (const k of SETTINGS_LOCAL) delete c[k]; return JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]])); };
    const mine = Object.assign({}, state.settings);
    const theirs = Object.assign({}, XcsWriter.DEFAULTS, data.settings);
    if (strip(mine) !== strip(theirs) && confirm('Das Projekt wurde mit anderen Einstellungen gespeichert (Werkzeuge, Regeln, Sauger …).\n\nOK = Einstellungen aus dem Projekt übernehmen\nAbbrechen = eigene Einstellungen behalten')) {
      for (const k of SETTINGS_LOCAL) if (mine[k] !== undefined) theirs[k] = mine[k];
      state.settings = theirs;
      saveSettings(); renderSettings(); renderRule(); renderProfileEditor();
    }
  }
  // Listen: Werte aus dem Projekt, fehlende (ältere Dateien) wie neu
  const fresh = { manual: {}, groupSheet: {}, sawDone: {}, saw: null };
  for (const k of PROJECT_LST_KEYS) {
    if (data.lists && typeof data.lists === 'object' && data.lists[k] !== undefined) lst[k] = data.lists[k];
    else if (k in fresh) lst[k] = JSON.parse(JSON.stringify(fresh[k]));
  }
  saveLst();
  syncListInputs();
  // Maße des alten Projekts in Möbel 3D verwerfen (die neuen setzt restoreFrom)
  if (mdl.viewer) mdl.viewer.clearDims();
  mdl.dimsSaved = null;
  restoreFrom(data.session);
}
// .s2m-Datei öffnen (Knopf auf der Projektseite oder auf die Seite gezogen)
function openProject(text, name) {
  const data = parseProject(text, name);
  if (!data) return;
  if (!projLeaveOk('Projekt „' + name + '“ öffnen? Die aktuelle Teileliste wird ersetzt.')) return;
  applyProject(data);
  const m = data.meta || {};
  projSet({ id: null, store: null, name: m.name || String(name).replace(/\.s2m$/i, ''), kunde: m.kunde || '', notiz: m.notiz || '', basis: '', saved: null, sig: null, ordner: '' });
  toast('Projekt geöffnet: ' + state.parts.length + ' Teile');
  render();
}
function addStep(text, label) {
  let solids;
  try { solids = StepToXcs.readParts(text, label.replace(/^Beispiel: /, '')); } catch (e) {
    state.parts.push({ label: label, error: e.message || String(e), result: null });
    return;
  }
  // Namen über alle geladenen Teile eindeutig halten (gleicher Name = gleiche .xcs/.pgmx)
  const taken = new Set(state.parts.filter((p) => p.solid).map((p) => p.solid.name.toLowerCase()));
  for (const s of solids) {
    let k = s.name;
    for (let j = 2; taken.has(k.toLowerCase()); j++) k = s.name + '_' + j;
    taken.add(k.toLowerCase());
    s.name = k;
  }
  const fileId = srcFile(label, 'step', text);
  for (const [idx, s] of solids.entries()) {
    const part = { label: label, src: { file: fileId, idx: idx }, solid: s, stepText: text, orientation: null, field: null, fileName: null, result: null, side: 1,
      profile: state.newProfile,
      overrides: { tools: {}, steps: {}, depths: {} }, overrides2: { tools: {}, steps: {}, depths: {} } };
    compute(part);
    state.parts.push(part);
  }
}
// DXF: ein Teil je Datei (größte Kontur), Dicke und Art je Erkennung im Teil änderbar (overrides.dxf)
function addDxf(text, label, extra) {
  const taken = new Set(state.parts.filter((p) => p.solid).map((p) => p.solid.name.toLowerCase()));
  const base = StepToXcs.partName(label.replace(/^.*[\\/]/, '').replace(/\.dxf$/i, ''));
  let name = base;
  for (let j = 2; taken.has(name.toLowerCase()); j++) name = base + '_' + j;
  const part = { label: label, src: { file: srcFile(label, 'dxf', text), idx: 0 }, solid: { name: name }, dxfText: text, orientation: null, field: null,
    fileName: null, result: null, side: 1,
    profile: state.newProfile, overrides: { tools: {}, steps: {}, depths: {}, dxf: { T: (extra && extra.T) || state.settings.dxfThickness || 19, features: {} } } };
  // von Hand angelegt (Stückliste): Material, Anzahl
  if (extra) { if (extra.board) part.board = extra.board; if (extra.qty) part.qty = extra.qty; }
  compute(part);
  state.parts.push(part);
}
function compute(part) {
  if (!part.solid) return;
  const cfg = Object.assign({}, state.settings, { toolInfo: ToolLibrary.infoMap(state.tools) });
  if (part.dxfText !== undefined) {
    const dx = Object.assign({}, part.overrides.dxf, { rot: part.orientation ? part.orientation.rot : null });
    part.res = StepToXcs.convertDxf(part.dxfText, part.solid.name, cfg, { field: part.field, profile: part.profile,
      overrides: Object.assign({}, part.overrides, { dxf: dx }) });
    if (part.res.panel && !part.orientation) part.orientation = Object.assign({}, part.res.panel.orientation);
    if (!part.fileName) part.fileName = part.res.fileName;
    part.side = 1;
    part.result = part.res;
    return;
  }
  part.res = StepToXcs.convertSolid(part.solid, cfg, { orientation: part.orientation, field: part.field, overrides: part.overrides,
    overrides2: part.overrides2, meshes: part.occtMeshes || null, profile: part.profile });
  if (part.res.panel && !part.orientation) part.orientation = Object.assign({}, part.res.panel.orientation);
  if (!part.fileName) part.fileName = part.res.fileName;
  if (!part.res.side2) part.side = 1;
  part.result = part.side === 2 ? part.res.side2 : part.res; // angezeigte Seite
  if (!part.result.panel) return;
  const cs = curvedState(part);
  if (cs.surface && !(cs.mode === 'flat4' && cs.hasCyl && part.result.panel.curvedSurfaces.every((x) => x.cyl)) && !part.occtMeshes) loadMesh(part);
}

// Überschreibungen der angezeigten Seite (Werkzeuge, Zustellung, Tiefe, Reihenfolge, Unterdrücken)
function ovOf(part) {
  if (part.side === 2) return part.overrides2 || (part.overrides2 = { tools: {}, steps: {}, depths: {} });
  return part.overrides;
}
// Dateiname je Seite: zweiseitig Name_S1.xcs / Name_S2.xcs (gleich für .pgmx)
function sideFile(part, side) {
  const base = part.fileName.replace(/\.xcs$/i, '');
  return part.res && part.res.side2 ? base + '_S' + side + '.xcs' : base + '.xcs';
}
function partFiles(part) {
  if (!part.res || !part.res.panel) return [];
  const out = [{ name: sideFile(part, 1), text: part.res.xcs }];
  if (part.res.side2) out.push({ name: sideFile(part, 2), text: part.res.side2.xcs });
  return out;
}

// Gekrümmte Flächen: Schalter je Teil (sonst Einstellung), nur sinnvoll, wenn welche erkannt wurden
function curvedState(part) {
  const p = part.result && part.result.panel;
  const ov = (part.overrides && part.overrides.curved) || {};
  const pick = (k, def) => (typeof ov[k] === 'boolean' ? ov[k] : typeof ov[k] === 'string' ? true : !!def);
  return {
    hasSlant: !!(p && p.curvedSlants && p.curvedSlants.length),
    hasSurface: !!(p && p.curvedSurfaces && p.curvedSurfaces.length),
    slant: !!(p && p.curvedSlants && p.curvedSlants.length) && pick('slant', state.settings.curvedSlantOn),
    surface: !!(p && p.curvedSurfaces && p.curvedSurfaces.length) && pick('surface', state.settings.curvedSurfaceOn),
    hasCyl: !!(p && p.curvedSurfaces && p.curvedSurfaces.some((c) => c.cyl)),
    // Art: 'ball' (Kugelfräser) oder 'flat4' (4-Achs, Schaftfräser)
    mode: typeof ov.surface === 'string' ? ov.surface : state.settings.curvedSurfaceMode || 'ball',
  };
}

// OpenCascade-Netze je STEP-Datei nur einmal berechnen (3D-Ansicht, Möbel 3D, Zeilenfräsen); höchstens 12 Dateien merken
const meshCache = new Map();
function meshesOf(occt, text) {
  let m = meshCache.get(text);
  if (!m) {
    m = View3D.stepMeshes(occt, text);
    if (meshCache.size >= 12) meshCache.delete(meshCache.keys().next().value);
    meshCache.set(text, m);
  }
  return m;
}

// Dreiecksnetz aus OpenCascade für das Zeilenfräsen (einmal je Teil, wie die 3D-Ansicht)
function loadMesh(part) {
  if (part.meshState === 'loading' || part.meshState === 'error' || !part.stepText) return;
  part.meshState = 'loading';
  View3D.load().then((occt) => {
    part.occtMeshes = meshesOf(occt, part.stepText);
    part.meshState = 'ok';
  }).catch((e) => {
    part.meshState = 'error';
    part.meshError = e.message || String(e);
  }).then(() => {
    compute(part);
    if (state.parts[state.sel] === part) render();
  });
}

// DXF: Dicke und Vorschläge je Erkennung (Art, Tiefe) – ohne Layer, alles innerhalb der größten Kontur
const DXF_KIND = { drill: 'Bohrung', cutout: 'Durchbruch', pocket: 'Tasche', island: 'Insel', ignore: 'ignorieren' };
function dxfBox(part) {
  const dx = part.res && part.res.dxf;
  if (part.dxfText === undefined || !dx) return '';
  const feats = dx.features;
  const kinds = (f) => (f.shape === 'circle' ? ['drill'] : []).concat(['cutout', 'pocket'], f.parentKind === 'pocket' ? ['island'] : [], ['ignore']);
  const what = (f) => (f.shape === 'circle' ? 'Kreis Ø' + fmt(f.d) : 'Kontur ' + fmt(f.w) + '×' + fmt(f.h)) + ' · ' + fmt(f.x) + ' / ' + fmt(f.y);
  let html = '<details class="curved dxf" id="dxfbox" open><summary><span class="cap">DXF-Erkennung</span><span class="note">' + feats.length +
    ' Kontur' + (feats.length === 1 ? '' : 'en') + ' im Teil · Vorschläge änderbar</span></summary>' +
    '<div class="row"><label for="dxfT" class="cap">Plattendicke</label><span><input id="dxfT" type="number" min="1" step="0.5" value="' + dx.T + '"> mm</span></div>';
  if (feats.length) {
    html += '<ul class="dxft">' + feats.map((f) => '<li><span class="w">' + esc(what(f)) + (f.kind !== f.suggested ? ' <em>geändert</em>' : '') + '</span>' +
      '<span class="c"><select data-dxfkind="' + esc(f.id) + '" aria-label="Art für ' + esc(what(f)) + '" title="Vorschlag: ' + DXF_KIND[f.suggested] + '">' +
      kinds(f).map((k) => '<option value="' + k + '"' + (k === f.kind ? ' selected' : '') + '>' + DXF_KIND[k] + (k === f.suggested ? ' ✓' : '') + '</option>').join('') +
      '</select>' + (f.kind === 'drill' || f.kind === 'pocket'
      ? '<label class="d">T <input type="number" min="0.5" step="0.5" data-dxfdepth="' + esc(f.id) + '" value="' + f.depth + '" aria-label="Tiefe für ' + esc(what(f)) + '" title="Tiefe in mm (= Dicke: durch)"> mm</label>'
      : '') + '</span></li>').join('') + '</ul><span class="note">✓ = Vorschlag · Bohrung so tief wie die Platte = durch</span>';
  }
  return html + '</details>';
}

function curvedBox(part) {
  const c = curvedState(part);
  if (!c.hasSlant && !c.hasSurface) return '';
  const mode = c.surface ? (c.mode === 'flat4' && c.hasCyl ? 'flat4' : 'ball') : 'off';
  const seg = (k, on, a, b, label) => '<span class="seg small" role="group" aria-label="' + esc(label) + '">' +
    '<button type="button" data-curved="' + k + '" data-on="0" aria-pressed="' + !on + '">' + a + '</button>' +
    '<button type="button" data-curved="' + k + '" data-on="1" aria-pressed="' + on + '">' + b + '</button></span>';
  let html = '<div class="curved" id="curvedbox">';
  if (c.hasSlant) {
    html += '<div class="row"><span class="cap">Schräge an Rundungen</span>' + seg('slant', c.slant, 'Aus', '5-Achs fräsen', 'Schräge an Rundungen') + '</div>';
  }
  if (c.hasSurface) {
    const b3 = (v, t) => '<button type="button" data-curved="surface" data-on="' + v + '" aria-pressed="' + (mode === v) + '">' + t + '</button>';
    html += '<div class="row"><span class="cap">Gewölbte Flächen</span><span class="seg small" role="group" aria-label="Gewölbte Flächen">' +
      b3('off', 'Aus') + b3('ball', 'Kugelfräser') + (c.hasCyl ? b3('flat4', '4-Achs Schaftfräser') : '') + '</span></div>';
    if (mode !== 'off' && part.meshState === 'loading') html += '<span class="note">3D-Netz wird geladen, Bahn wird berechnet …</span>';
    if (mode !== 'off' && part.meshState === 'error') html += '<span class="note">3D-Netz nicht verfügbar: ' + esc(part.meshError || '') + '</span>';
  }
  return html + '</div>';
}

async function loadFiles(list) {
  const proj = Array.from(list).find((f) => /\.s2m$/i.test(f.name));
  if (proj) { openProject(await proj.text(), proj.name); return; }
  const files = Array.from(list).filter((f) => /\.(step|stp|dxf)$/i.test(f.name));
  if (!files.length) { toast('Bitte .step-, .stp-, .dxf- oder .s2m-Dateien (Projekt) wählen.'); return; }
  const first = state.parts.length;
  for (const f of files) {
    if (/\.dxf$/i.test(f.name)) addDxf(await f.text(), f.name);
    else addStep(await f.text(), f.name);
  }
  state.sel = first;
  render();
}
