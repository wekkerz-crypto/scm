/*
 * Weckwop – Projekte und Start (13-projekte-start.js)
 * Projektseite (Server/Browser), Projektordner, Sicherungsordner, STEP aktualisieren – und der Start des Programms (läuft als letztes).
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 13) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

// ------------------------------------------------ Projekte (Startseite): verwalten, speichern, öffnen
/*
 * Ablage auf dem Server (projekte/api.php – Diskstation/Docker oder Webspace, für alle Geräte) oder in diesem Browser
 * (IndexedDB). Aktuelles Projekt in proj (gemerkt in localStorage): id + store ('server'|'local'), Name, Kunde, Notiz,
 * basis = Stand auf dem Server (Konflikt-Prüfung), sig = Prüfsumme beim Speichern (ungespeicherte Änderungen).
 */
const PROJ_KEY = 'step2xcs.project.v1';
const LOCAL_PROJ = 'projekte.v1';
const proj = Object.assign({ id: null, store: null, name: '', kunde: '', notiz: '', basis: '', saved: null, sig: null }, loadJson(PROJ_KEY, {}) || {});
const srv = { checked: false, ok: false, login: false, offen: false, passwort: false, csrf: '', list: [], err: '' };
const kiSrv = { aktiv: false, zugang: false, csrf: '' };
const pst = { tab: null, q: '', local: [], del: null, busy: false };
const serverPossible = () => /^https?:$/.test(location.protocol);
function projSet(o) { Object.assign(proj, o); storeJson(PROJ_KEY, proj); projMark(); }
// Prüfsumme des Projekts (ohne Auswahl): gleich = nichts geändert seit dem Speichern
function projSig() {
  const d = sessionData();
  delete d.sel;
  const t = JSON.stringify([d, projectLists(), proj.name, proj.kunde, proj.notiz, drw.list.map((z) => z.id + ':' + z.name + ':' + z.size)]);
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + t.length;
}
const projDirty = () => state.parts.length > 0 && proj.sig !== projSig();
// vor dem Wechsel: ungespeicherte Änderungen nachfragen
function projLeaveOk(msg) {
  if (!projDirty()) return true;
  return confirm('Das aktuelle Projekt' + (proj.name ? ' „' + proj.name + '“' : '') + ' hat ungespeicherte Änderungen – sie gehen verloren.\n\n' + (msg || 'Trotzdem fortfahren?'));
}
// Knopf oben: Speichern (• = ungespeicherte Änderungen)
let markTimer = null;
function projMark() {
  clearTimeout(markTimer);
  markTimer = setTimeout(() => {
    const d = projDirty();
    $('projsave').classList.toggle('dirty', d);
    $('projsave').title = (proj.name ? 'Projekt „' + proj.name + '“ speichern' : 'Projekt speichern (Name auf der Projektseite)') + (d ? ' – ungespeicherte Änderungen' : '');
    if (state.page === 'start') renderStartHead();
  }, 300);
}
// gzip (Server-Ablage)
async function gzBlob(text) { return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); }
async function ungz(blob) { return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
// Kurzinfo für die Liste
function projInfo() {
  const mats = new Set();
  let stueck = 0;
  for (const p of state.parts) { if (p.res || p.result) { stueck += qtyOf(p); const r = p.res || p.result; if (r.panel) mats.add(View3D.boardOf(boardKeyOf(p)).name + ' ' + fmt(r.panel.T)); } }
  let platten = 0;
  try { platten = cutOverview(cutGroups()).sum.n; } catch (e) { platten = 0; }
  return { teile: state.parts.length, stueck: stueck, platten: platten, materialien: Array.from(mats).slice(0, 12), zeit: Math.round(bomTotals(bomRows()).time) };
}

// --- Server
async function srvCall(a, opts) {
  const r = await fetch('projekte/api.php?a=' + a + (opts && opts.q ? '&' + opts.q : ''), Object.assign({ credentials: 'same-origin', cache: 'no-store' },
    opts && opts.body ? { method: 'POST', body: opts.body, headers: { 'X-CSRF': srv.csrf } } : {}));
  return r;
}
async function srvJson(r) {
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  if (!j) throw new Error('Server antwortet nicht wie erwartet (' + r.status + ').');
  return j;
}
async function srvRefresh() {
  if (!serverPossible()) { srv.checked = true; srv.ok = false; return; }
  try {
    const j = await srvJson(await srvCall('list'));
    srv.ok = !!j.ok; srv.login = !!j.login; srv.offen = !!j.offen; srv.passwort = !!j.passwort; srv.csrf = j.csrf || ''; srv.list = j.projekte || []; srv.err = '';
  } catch (e) { srv.ok = false; srv.err = ''; }
  srv.checked = true;
  // KI über den Server (Schlüssel auf der Diskstation)?
  try {
    const r = await fetch('ki/openai.php', { credentials: 'same-origin', cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    kiSrv.aktiv = !!(j && j.aktiv); kiSrv.zugang = !!(j && j.zugang); kiSrv.csrf = (j && j.csrf) || '';
  } catch (e) { kiSrv.aktiv = false; }
}
async function srvLogin(pw) {
  const fd = new FormData();
  fd.append('a', 'login');
  fd.append('passwort', pw);
  const j = await srvJson(await fetch('dekore/api.php', { method: 'POST', body: fd, credentials: 'same-origin' }));
  if (!j.ok) throw new Error(j.fehler || 'Anmeldung fehlgeschlagen.');
  await srvRefresh();
}
// --- Browser (IndexedDB)
async function localList() { try { return (await idbGet(LOCAL_PROJ)) || []; } catch (e) { return []; } }
async function localPut(meta, data) {
  const list = (await localList()).filter((m) => m.id !== meta.id);
  await idbSet('projekt:' + meta.id, data);
  list.unshift(meta);
  await idbSet(LOCAL_PROJ, list);
}

// --- Speichern: dorthin, wo das Projekt liegt; neue Projekte auf den Server, wenn er da ist (sonst Browser)
async function projSave(opts) {
  opts = opts || {};
  if (!state.parts.length) { toast('Keine Teile – nichts zu speichern.'); return false; }
  const name = String(opts.name !== undefined ? opts.name : proj.name || '').trim();
  if (!name) { setPage('start'); toast('Bitte zuerst einen Projektnamen eingeben.'); setTimeout(() => { const n = $('pj-name'); if (n) n.focus(); }, 50); return false; }
  // Sicherungsordner am PC: Zugriff gleich nach dem Klick erfragen (später geht es nicht mehr)
  const bkp = backup.handle ? backupReady(true) : Promise.resolve(false);
  const asNew = !!opts.asNew || !proj.id;
  const store = asNew ? (opts.store || (srv.ok && srv.login ? 'server' : 'local')) : proj.store;
  const meta = { name: name, kunde: opts.kunde !== undefined ? opts.kunde : proj.kunde || '', notiz: opts.notiz !== undefined ? opts.notiz : proj.notiz || '' };
  projSet(meta); // Name gehört in die Prüfsumme und ins Projekt
  const data = projectPayload();
  const sig = projSig();
  const info = projInfo();
  pst.busy = true;
  try {
    if (store === 'server') {
      const fd = new FormData();
      fd.append('a', 'save');
      if (!asNew) { fd.append('id', proj.id); if (!opts.force) fd.append('basis', proj.basis || ''); }
      fd.append('name', meta.name); fd.append('kunde', meta.kunde); fd.append('notiz', meta.notiz);
      fd.append('info', JSON.stringify(info));
      fd.append('geraet', (navigator.platform || '').slice(0, 30));
      fd.append('datei', await gzBlob(JSON.stringify(data)), 'projekt.s2m.gz');
      const r = await srvCall('save', { body: fd });
      const j = await srvJson(r);
      if (r.status === 409) {
        pst.busy = false;
        if (confirm(j.fehler + '\n\nOK = trotzdem überschreiben\nAbbrechen = nicht speichern (z. B. erst als neues Projekt speichern)')) return projSave(Object.assign({}, opts, { force: true }));
        return false;
      }
      if (!j.ok) throw new Error(j.fehler || 'Speichern fehlgeschlagen.');
      projSet({ id: j.projekt.id, store: 'server', basis: j.projekt.geaendert, saved: j.projekt.geaendert, sig: sig });
      // lesbarer Projektordner auf dem Server (STEP, Programme, Listen) – Fehler hier verhindern das Speichern nicht
      try { projSet({ ordner: await srvFolder(j.projekt.id, data) }); } catch (e) { toast('Projekt gespeichert, Projektordner aber nicht: ' + (e.message || e)); }
      await srvRefresh();
      pst.tab = 'server';
    } else {
      const id = asNew ? 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) : proj.id;
      const now = new Date().toISOString();
      const old = (await localList()).find((m) => m.id === id);
      await localPut(Object.assign({ id: id, erstellt: old ? old.erstellt : now }, meta, info, { geaendert: now }), data);
      projSet({ id: id, store: 'local', basis: now, saved: now, sig: sig });
      pst.local = await localList();
      pst.tab = 'local';
    }
    let bk = '';
    if (await bkp) { try { bk = await backupWrite(data); } catch (e) { toast('Sicherungsordner nicht geschrieben: ' + (e.message || e)); } }
    toast('💾 Gespeichert: ' + meta.name + (store === 'server' ? ' (Server' + (proj.ordner ? ', Ordner „' + proj.ordner + '“' : '') + ')' : ' (dieser Browser)') +
      (bk ? ' + Sicherung „' + backup.name + '/' + bk + '“' : ''));
    return true;
  } catch (e) {
    toast('Speichern nicht möglich: ' + (e.message || e));
    return false;
  } finally {
    pst.busy = false;
    if (state.page === 'start') renderStart();
  }
}
async function projOpen(store, id) {
  const meta = (store === 'server' ? srv.list : pst.local).find((m) => m.id === id);
  if (!meta) return;
  if (proj.id === id && proj.store === store && !projDirty()) { toast('Projekt ist schon offen.'); setPage(lastWorkPage()); return; }
  if (!projLeaveOk()) return;
  let data = null;
  try {
    if (store === 'server') {
      const r = await srvCall('get', { q: 'id=' + encodeURIComponent(id) });
      if (!r.ok) throw new Error((await srvJson(r)).fehler || 'nicht gefunden');
      data = parseProject(await ungz(await r.blob()), meta.name);
    } else data = await idbGet('projekt:' + id);
  } catch (e) { toast('Öffnen nicht möglich: ' + (e.message || e)); return; }
  if (!data || data.format !== PROJECT_FORMAT) { toast('Projektdaten fehlen oder sind beschädigt.'); return; }
  applyProject(data);
  projSet({ id: id, store: store, name: meta.name, kunde: meta.kunde || '', notiz: meta.notiz || '', basis: meta.geaendert || '', saved: meta.geaendert || '', ordner: meta.ordner || '' });
  projSet({ sig: projSig() });
  toast('Projekt geöffnet: ' + meta.name);
  render();
  setPage(lastWorkPage());
}
function projNew() {
  if (!projLeaveOk('Neues Projekt beginnen? Die aktuelle Teileliste wird geleert.')) return;
  state.parts = [];
  state.sel = 0;
  anim.result = null;
  for (const [k, v] of Object.entries({ manual: {}, groupSheet: {}, sawDone: {}, saw: null })) lst[k] = v;
  saveLst();
  if (mdl.viewer) mdl.viewer.clearDims();
  mdl.dimsSaved = null;
  drwSet([]);
  projSet({ id: null, store: null, name: '', kunde: '', notiz: '', basis: '', saved: null, sig: null, ordner: '' });
  render();
  renderStart();
  toast('Neues Projekt – STEP/DXF laden (Programme) oder Teile in der Stückliste anlegen.');
}
async function projDelete(store, id) {
  if (pst.del !== store + id) { pst.del = store + id; renderStart(); return; } // zweiter Klick löscht
  pst.del = null;
  try {
    if (store === 'server') {
      const fd = new FormData(); fd.append('a', 'delete'); fd.append('id', id);
      const j = await srvJson(await srvCall('delete', { body: fd }));
      if (!j.ok) throw new Error(j.fehler);
      await srvRefresh();
    } else {
      await idbSet(LOCAL_PROJ, (await localList()).filter((m) => m.id !== id));
      await idbSet('projekt:' + id, null);
      pst.local = await localList();
    }
    if (proj.id === id && proj.store === store) projSet({ id: null, store: null, basis: '', saved: null, sig: null });
    toast('Projekt gelöscht' + (store === 'server' ? ' (liegt im Papierkorb auf dem Server)' : '.'));
  } catch (e) { toast('Löschen nicht möglich: ' + (e.message || e)); }
  renderStart();
}
async function projCopy(store, id) {
  try {
    if (store === 'server') {
      const fd = new FormData(); fd.append('a', 'copy'); fd.append('id', id);
      const j = await srvJson(await srvCall('copy', { body: fd }));
      if (!j.ok) throw new Error(j.fehler);
      await srvRefresh();
    } else {
      const m = pst.local.find((x) => x.id === id);
      const data = await idbGet('projekt:' + id);
      const nid = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const now = new Date().toISOString();
      await localPut(Object.assign({}, m, { id: nid, name: m.name + ' (Kopie)', erstellt: now, geaendert: now }), data);
      pst.local = await localList();
    }
    toast('Kopie angelegt.');
  } catch (e) { toast('Kopieren nicht möglich: ' + (e.message || e)); }
  renderStart();
}
async function projExport(store, id) {
  const meta = (store === 'server' ? srv.list : pst.local).find((m) => m.id === id);
  try {
    let text;
    if (store === 'server') { const r = await srvCall('get', { q: 'id=' + encodeURIComponent(id) }); text = await ungz(await r.blob()); }
    else text = JSON.stringify(await idbGet('projekt:' + id));
    saveOne(StepToXcs.partName(meta.name || 'Projekt') + '.s2m', text, 'application/json');
  } catch (e) { toast('Export nicht möglich: ' + (e.message || e)); }
}
/*
 * Lesbarer Projektordner (Sicherung, ohne Programm zu öffnen): Projekt.s2m (alles, unverschlüsselt JSON), Info.txt,
 * STEP/ (Originale), Programme/ (.xcs + konvertieren.bat), Stueckliste.csv/.pdf, Zuschnittplan.pdf.
 * Auf dem Server nach jedem Speichern (projekte/api.php a=ordner), am PC in einen gewählten Sicherungsordner (Chrome/Edge).
 */
const fileSafe = (s) => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, 80) || 'Projekt';
function projFolderFiles(data) {
  const files = [{ name: 'Projekt.s2m', text: JSON.stringify(data, null, 1) }];
  const d = new Date();
  files.push({ name: 'Info.txt', text: ['Projekt: ' + (proj.name || ''), 'Kunde/Auftrag: ' + (proj.kunde || ''), 'Notiz: ' + (proj.notiz || ''),
    'Gespeichert: ' + d.toLocaleString('de-DE'), 'Teile: ' + state.parts.length, '',
    'Projekt.s2m     – das ganze Projekt; in Weckwop auf der Projektseite „Datei öffnen (.s2m)“',
    'STEP/           – die geladenen STEP-/DXF-Dateien (Stand beim Speichern)',
    'Programme/      – die .xcs-Programme und konvertieren.bat (wandelt sie mit dem X-Konverter in .pgmx)',
    'Zeichnungen/    – die PDF-Zeichnungen und Bilder zum Projekt',
    'Versionen/      – frühere Stände von Projekt.s2m (nur auf dem Server)', ''].join('\r\n') });
  const seen = new Set();
  for (const f of data.session.files || []) {
    let n = fileSafe(String(f.label).replace(/^Beispiel: /, '').replace(/^.*[\\/]/, ''));
    if (!/\.(step|stp|dxf)$/i.test(n)) n += f.kind === 'dxf' ? '.dxf' : '.step';
    for (let k = 2; seen.has(n.toLowerCase()); k++) n = n.replace(/(\.\w+)$/, '_' + k + '$1');
    seen.add(n.toLowerCase());
    files.push({ name: 'STEP/' + n, text: f.text });
  }
  const seenZ = new Set();
  for (const z of drwClean(data.zeichnungen)) {
    let n = fileSafe(z.name) + drwFileExt(z);
    for (let k = 2; seenZ.has(n.toLowerCase()); k++) n = fileSafe(z.name) + '_' + k + drwFileExt(z);
    seenZ.add(n.toLowerCase());
    files.push({ name: 'Zeichnungen/' + n, data: drwBytes(z) });
  }
  const progs = state.parts.flatMap(partFiles);
  for (const f of progs) files.push({ name: 'Programme/' + fileSafe(f.name), text: f.text });
  if (progs.length) files.push({ name: 'Programme/konvertieren.bat', text: StepToXcs.makeBatch(state.settings) });
  try {
    if (bomRows().length) {
      files.push({ name: 'Stueckliste.csv', text: bomCsv() });
      const b = bomPdf(true);
      if (b) files.push({ name: 'Stueckliste.pdf', data: b });
    }
    const c = cutPdf(true);
    if (c) files.push({ name: 'Zuschnittplan.pdf', data: c });
  } catch (e) { /* Listen nicht berechenbar: Ordner ohne PDF */ }
  return files;
}
async function srvFolder(id, data) {
  const fd = new FormData();
  fd.append('a', 'ordner');
  fd.append('id', id);
  fd.append('paket', zip(projFolderFiles(data)), 'ordner.zip');
  const j = await srvJson(await srvCall('ordner', { body: fd }));
  if (!j.ok) throw new Error(j.fehler || 'Projektordner nicht geschrieben.');
  return j.ordner;
}
// --- Sicherungsordner am PC (File System Access: Chrome/Edge), Ordner-Zugriff in IndexedDB gemerkt
const BACKUP_KEY = 'sicherungsordner';
const backupPossible = () => typeof window.showDirectoryPicker === 'function';
const backup = { handle: null, name: '', loaded: false };
async function backupLoad() {
  if (backup.loaded || !backupPossible()) return;
  backup.loaded = true;
  try { backup.handle = (await idbGet(BACKUP_KEY)) || null; backup.name = backup.handle ? backup.handle.name : ''; } catch (e) { backup.handle = null; }
}
async function backupPick() {
  try {
    const h = await window.showDirectoryPicker({ id: 's2m-sicherung', mode: 'readwrite' });
    backup.handle = h;
    backup.name = h.name;
    try { await idbSet(BACKUP_KEY, h); } catch (e) { /* nicht speicherbar: gilt bis zum Neuladen */ }
    toast('Sicherungsordner: ' + h.name + ' – beim Speichern kommt dort ein Ordner je Projekt hinein.');
  } catch (e) { if (e && e.name !== 'AbortError') toast('Ordner nicht wählbar: ' + (e.message || e)); }
  renderStart();
}
async function backupOff() { backup.handle = null; backup.name = ''; try { await idbSet(BACKUP_KEY, null); } catch (e) { /* egal */ } renderStart(); }
// Rechte prüfen – nachfragen geht nur direkt nach einem Klick (daher vor allem anderen in projSave)
async function backupReady(ask) {
  if (!backup.handle) return false;
  try {
    let p = await backup.handle.queryPermission({ mode: 'readwrite' });
    if (p === 'prompt' && ask) p = await backup.handle.requestPermission({ mode: 'readwrite' });
    return p === 'granted';
  } catch (e) { return false; }
}
async function backupWrite(data) {
  const dir = await backup.handle.getDirectoryHandle(fileSafe(proj.name), { create: true });
  // Programme und STEP frisch (alte Programme nicht liegen lassen)
  for (const sub of ['Programme', 'STEP', 'Zeichnungen']) { try { await dir.removeEntry(sub, { recursive: true }); } catch (e) { /* gab es nicht */ } }
  for (const f of projFolderFiles(data)) {
    const parts = f.name.split('/');
    let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(f.data instanceof Uint8Array ? f.data : f.text);
    await w.close();
  }
  return fileSafe(proj.name);
}

/*
 * STEP aktualisieren: neue Version einer Datei im Projekt einlesen. Teile werden über den Namen aus der STEP zugeordnet
 * (stepName, bei mehreren gleichen in Reihenfolge) und behalten Drehlage, Feld, Programmname, Werkstück-Profil,
 * Werkzeuge/Bearbeitungen, Material, Anzahl, Kanten und Faser; neue Teile kommen dazu, fehlende werden (nach Nachfrage) entfernt.
 */
function stepFilesInProject() {
  const used = new Map();
  for (const p of state.parts) if (p.src && p.solid && p.stepText !== undefined && !used.has(p.src.file)) used.set(p.src.file, srcFiles.get(p.src.file));
  return Array.from(used.entries()).filter(([, f]) => f && f.kind === 'step').map(([id, f]) => ({ id: id, label: f.label, n: state.parts.filter((p) => p.src && p.src.file === id).length }));
}
function updateStep(oldId, text, label) {
  let solids;
  try { solids = StepToXcs.readParts(text, label.replace(/^Beispiel: /, '')); } catch (e) { toast(label + ': ' + (e.message || e)); return null; }
  if (!solids.length) { toast(label + ': keine Bauteile gefunden.'); return null; }
  const old = state.parts.filter((p) => p.src && p.src.file === oldId);
  const keyOf = (s) => normWord(s.stepName || s.name);
  const pool = old.slice();
  const pairs = solids.map((s) => {
    const i = pool.findIndex((p) => keyOf(p.solid) === keyOf(s));
    return [s, i >= 0 ? pool.splice(i, 1)[0] : null];
  });
  const gone = pool;
  if (gone.length && !confirm('In der neuen Version fehlen ' + gone.length + ' Teil' + (gone.length === 1 ? '' : 'e') + ':\n' +
    gone.map((p) => '• ' + p.solid.name).join('\n') + '\n\nOK = entfernen und aktualisieren\nAbbrechen = nichts ändern')) return null;
  const fileId = srcFile(label, 'step', text);
  const taken = new Set(state.parts.filter((p) => p.solid && !old.includes(p)).map((p) => p.solid.name.toLowerCase()));
  const made = pairs.map(([s, o], idx) => {
    const part = { label: label, src: { file: fileId, idx: idx }, solid: s, stepText: text, orientation: null, field: null, fileName: null, result: null, side: 1,
      profile: state.newProfile, overrides: { tools: {}, steps: {}, depths: {} }, overrides2: { tools: {}, steps: {}, depths: {} } };
    if (o) {
      // Einstellungen des Teils übernehmen (auch einen geänderten Namen)
      for (const k of ['orientation', 'field', 'fileName', 'profile', 'board', 'qty', 'grain', 'edges']) if (o[k] !== undefined) part[k] = JSON.parse(JSON.stringify(o[k]));
      part.overrides = JSON.parse(JSON.stringify(o.overrides || part.overrides));
      part.overrides2 = JSON.parse(JSON.stringify(o.overrides2 || part.overrides2));
      s.name = o.solid.name;
    } else {
      let k = s.name;
      for (let j = 2; taken.has(k.toLowerCase()); j++) k = s.name + '_' + j;
      s.name = k;
    }
    taken.add(s.name.toLowerCase());
    try { compute(part); } catch (e) { part.error = e.message || String(e); }
    return [part, o];
  });
  // an der Stelle der alten Teile einsetzen, neue dahinter
  const sel = state.parts[state.sel];
  const out = [];
  let lastOld = -1;
  state.parts.forEach((p) => {
    if (!old.includes(p)) { out.push(p); return; }
    const m = made.find(([, o]) => o === p);
    if (m) out.push(m[0]);
    lastOld = out.length - 1;
  });
  const fresh = made.filter(([, o]) => !o).map(([p]) => p);
  out.splice(lastOld + 1, 0, ...fresh);
  state.parts = out;
  state.sel = Math.max(0, out.indexOf(sel) >= 0 ? out.indexOf(sel) : Math.min(state.sel, out.length - 1));
  anim.result = null;
  if (mdl) mdl.key = null; // Möbel 3D neu aufbauen
  render();
  return { kept: made.filter(([, o]) => o).length, added: fresh.map((p) => p.solid.name), removed: gone.map((p) => p.solid.name) };
}
let stepUpdateId = null;
$('stepupd').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f || stepUpdateId === null) return;
  const r = updateStep(stepUpdateId, await f.text(), f.name);
  stepUpdateId = null;
  if (!r) return;
  toast('STEP aktualisiert: ' + r.kept + ' Teile übernommen' + (r.added.length ? ', ' + r.added.length + ' neu' : '') + (r.removed.length ? ', ' + r.removed.length + ' entfernt' : '') + ' – speichern nicht vergessen.');
  renderStart();
});
// zuletzt benutzte Arbeitsseite (nicht die Projektseite)
// Startadressen: index.html#saegen öffnet gleich den Sägemodus (z. B. am Pi), #programme, #listen, #zuschnitt …
const HASH_PAGES = { projekte: ['start'], programme: ['pgmx'], moebel: ['model'], moebel3d: ['model'], listen: ['lists', 'bom'], stueckliste: ['lists', 'bom'],
  zuschnitt: ['lists', 'cut'], saegen: ['lists', 'saw'], etiketten: ['labels'], material: ['material'], zeichnungen: ['drawings'] };
const lastWorkPage = () => { const p = loadJson(PAGE_KEY, 'pgmx'); return p && p !== 'start' ? p : 'pgmx'; };

// --- Darstellung
const dateText = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };
function renderStartHead() {
  const el = $('pj-state');
  if (!el) return;
  const d = projDirty();
  el.className = 'pjstate' + (d ? ' warn' : proj.saved ? ' ok' : '');
  el.textContent = !state.parts.length ? 'leer – Teile laden oder anlegen' : !proj.id ? 'noch nicht gespeichert' :
    (d ? 'ungespeicherte Änderungen · ' : 'gespeichert ') + dateText(proj.saved) + ' · ' + (proj.store === 'server' ? 'Server' : 'dieser Browser');
}
async function renderStart() {
  const host = $('startpage');
  if (!host || state.page !== 'start') return;
  // Ablage-Reiter: von selbst Server (wenn da), bis man selbst umschaltet
  if (!pst.tabUser) pst.tab = srv.ok ? 'server' : 'local';
  const list = (pst.tab === 'server' ? srv.list : pst.local).filter((m) => !pst.q || normWord(m.name + ' ' + (m.kunde || '') + ' ' + (m.notiz || '') + ' ' + (m.materialien || []).join(' ')).includes(normWord(pst.q)));
  const canSrv = srv.ok && srv.login;
  host.innerHTML = '<div class="pjcur"><div class="pjtitle"><span class="lab">Aktuelles Projekt</span><span id="pj-state"></span></div>' +
    '<div class="pjform"><label>Name <input type="text" id="pj-name" maxlength="120" value="' + esc(proj.name) + '" placeholder="z. B. Küche Müller"></label>' +
    '<label>Kunde / Auftrag <input type="text" id="pj-kunde" maxlength="120" value="' + esc(proj.kunde) + '"></label>' +
    '<label class="wide">Notiz <input type="text" id="pj-notiz" maxlength="500" value="' + esc(proj.notiz) + '"></label></div>' +
    '<div class="pjact"><button type="button" class="btn primary" id="pj-save"' + (pst.busy ? ' disabled' : '') + '>💾 Speichern</button>' +
    (proj.id ? '<button type="button" class="btn" id="pj-saveas">Als neues Projekt speichern</button>' : '') +
    (srv.ok && canSrv && !proj.id ? '<label class="pjwhere">Ablage <select id="pj-store"><option value="server">Server (alle Geräte)</option><option value="local">nur dieser Browser</option></select></label>' : '') +
    '<button type="button" class="btn" id="pj-new">＋ Neues Projekt</button>' +
    '<span class="sp"></span><span class="pjcount">' + state.parts.length + ' Teile</span>' +
    '<button type="button" class="btn go" id="pj-go"' + (state.parts.length ? '' : ' disabled') + '>Weiter bearbeiten ▶</button></div>' +
    '<div class="pjextra">' +
    (proj.store === 'server' && proj.ordner ? '<span class="pjinfo" title="Auf dem Server: Projekt.s2m, STEP/, Programme/ (xcs + konvertieren.bat), Stückliste, Zuschnittplan, Versionen/">📂 Projektordner: <b>' + esc(proj.ordner) + '</b></span>' : '') +
    (backupPossible() ? (backup.handle ? '<span class="pjinfo">💾 Sicherung am PC: <b>' + esc(backup.name) + '/' + esc(fileSafe(proj.name || 'Projekt')) + '</b> <button type="button" class="btn ghost small" id="pj-bk">ändern</button><button type="button" class="btn ghost small" id="pj-bkoff">aus</button></span>'
      : '<button type="button" class="btn ghost small" id="pj-bk" title="Beim Speichern zusätzlich einen lesbaren Ordner (STEP, Programme, Listen) in einen Ordner auf diesem PC bzw. Netzlaufwerk schreiben">💾 Sicherungsordner am PC wählen …</button>') : '') +
    (stepFilesInProject().length ? '<span class="pjinfo pjsteps">STEP aktualisieren: ' + stepFilesInProject().map((f) => '<button type="button" class="btn ghost small" data-stepupd="' + f.id + '" title="Neue Version dieser Datei einlesen – Einstellungen der Teile bleiben (Zuordnung über den Teilenamen)">↻ ' +
      esc(String(f.label).replace(/^Beispiel: /, '').replace(/^.*[\\/]/, '')) + ' <small>' + f.n + '</small></button>').join('') + '</span>' : '') +
    '</div></div>' +
    '<div class="pjlist"><div class="pjbar"><h3>Projekte</h3>' +
    (srv.ok ? '<span class="seg" role="group" aria-label="Ablage"><button type="button" data-pjtab="server" aria-pressed="' + (pst.tab === 'server') + '">🖧 Server <small>' + (canSrv ? srv.list.length : '') + '</small></button>' +
      '<button type="button" data-pjtab="local" aria-pressed="' + (pst.tab === 'local') + '">💻 Dieser Browser <small>' + pst.local.length + '</small></button></span>' : '<span class="note">Ablage: dieser Browser' + (serverPossible() ? '' : ' (ohne Server)') + '</span>') +
    '<input type="search" id="pj-q" placeholder="Suchen (Name, Kunde, Material)" value="' + esc(pst.q) + '" aria-label="Projekte suchen">' +
    '<span class="sp"></span><button type="button" class="btn small" id="pj-import">Datei öffnen (.s2m)</button>' +
    '<button type="button" class="btn small" id="pj-export"' + (state.parts.length ? '' : ' disabled') + '>Aktuelles als Datei</button></div>' +
    (pst.tab === 'server' && srv.ok && !srv.login ? '<form class="pjlogin" id="pj-login"><b>Anmelden</b> – Projekte auf dem Server: Passwort wie in der Dekor-Verwaltung' +
      '<input type="password" id="pj-pw" autocomplete="current-password" aria-label="Passwort"><button type="submit" class="btn primary">Anmelden</button></form>' : '') +
    (list.length ? '<div class="tblwrap"><table class="pjtbl"><thead><tr><th>Projekt</th><th class="r">Teile</th><th>Material</th><th>Geändert</th><th></th></tr></thead><tbody>' +
      list.map((m) => { const cur = proj.id === m.id && proj.store === pst.tab; const k = pst.tab + m.id; return '<tr' + (cur ? ' class="cur"' : '') + '><td><b>' + esc(m.name) + '</b>' + (cur ? ' <span class="chip ok">offen</span>' : '') +
        (m.kunde ? '<div class="sub">' + esc(m.kunde) + '</div>' : '') + (m.notiz ? '<div class="sub n">' + esc(m.notiz) + '</div>' : '') +
        (m.ordner ? '<div class="sub">📂 ' + esc(m.ordner) + '</div>' : '') + '</td>' +
        '<td class="r">' + (m.teile !== undefined ? m.teile + (m.stueck && m.stueck !== m.teile ? '<div class="sub">' + m.stueck + ' Stück</div>' : '') : '') + '</td>' +
        '<td class="mat">' + esc((m.materialien || []).join(', ')) + (m.platten ? '<div class="sub">' + m.platten + ' Platte' + (m.platten === 1 ? '' : 'n') + '</div>' : '') + '</td>' +
        '<td>' + esc(dateText(m.geaendert)) + '</td>' +
        '<td class="act"><button type="button" class="btn small primary" data-pjopen="' + esc(m.id) + '">Öffnen</button>' +
        '<button type="button" class="btn ghost small" data-pjcopy="' + esc(m.id) + '" title="Kopie anlegen">Kopie</button>' +
        '<button type="button" class="btn ghost small" data-pjexp="' + esc(m.id) + '" title="Als .s2m-Datei speichern">Datei</button>' +
        '<button type="button" class="btn ghost small' + (pst.del === k ? ' arm' : '') + '" data-pjdel="' + esc(m.id) + '" title="Löschen – zweimal klicken">' + (pst.del === k ? 'Wirklich löschen?' : ICON_TRASH) + '</button></td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="note">' + (pst.q ? 'Kein Projekt passt zur Suche.' : pst.tab === 'server' && !srv.login ? '' : 'Noch keine Projekte gespeichert – oben einen Namen eingeben und „Speichern“.') + '</p>') +
    (pst.tab === 'local' ? '<p class="note">Im Browser gespeicherte Projekte gibt es nur auf diesem Gerät' + (srv.ok ? ' – für alle Geräte auf dem Server speichern.' : '. Mit einem Server (Diskstation/Docker oder Webspace) liegen sie zentral für alle Geräte.') + '</p>' : '') +
    '</div>';
  renderStartHead();
  const nm = () => ({ name: $('pj-name').value.trim(), kunde: $('pj-kunde').value.trim(), notiz: $('pj-notiz').value.trim() });
  for (const id of ['pj-name', 'pj-kunde', 'pj-notiz']) $(id).addEventListener('change', () => { projSet(nm()); });
  $('pj-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('pj-save').click(); } });
  $('pj-save').addEventListener('click', () => projSave(Object.assign(nm(), { store: $('pj-store') ? $('pj-store').value : undefined })));
  if ($('pj-saveas')) $('pj-saveas').addEventListener('click', () => projSave(Object.assign(nm(), { asNew: true, store: srv.ok && srv.login ? 'server' : 'local' })));
  $('pj-new').addEventListener('click', projNew);
  $('pj-go').addEventListener('click', () => setPage(lastWorkPage()));
  if ($('pj-bk')) $('pj-bk').addEventListener('click', backupPick);
  if ($('pj-bkoff')) $('pj-bkoff').addEventListener('click', backupOff);
  host.querySelectorAll('[data-stepupd]').forEach((b) => b.addEventListener('click', () => { stepUpdateId = +b.dataset.stepupd; $('stepupd').click(); }));
  $('pj-import').addEventListener('click', () => openPicker());
  $('pj-export').addEventListener('click', saveProject);
  $('pj-q').addEventListener('input', (e) => { pst.q = e.target.value; const pos = e.target.selectionStart; renderStart(); const q = $('pj-q'); q.focus(); q.setSelectionRange(pos, pos); });
  host.querySelectorAll('[data-pjtab]').forEach((b) => b.addEventListener('click', () => { pst.tab = b.dataset.pjtab; pst.tabUser = true; pst.del = null; renderStart(); }));
  host.querySelectorAll('[data-pjopen]').forEach((b) => b.addEventListener('click', () => projOpen(pst.tab, b.dataset.pjopen)));
  host.querySelectorAll('[data-pjcopy]').forEach((b) => b.addEventListener('click', () => projCopy(pst.tab, b.dataset.pjcopy)));
  host.querySelectorAll('[data-pjexp]').forEach((b) => b.addEventListener('click', () => projExport(pst.tab, b.dataset.pjexp)));
  host.querySelectorAll('[data-pjdel]').forEach((b) => b.addEventListener('click', () => projDelete(pst.tab, b.dataset.pjdel)));
  if ($('pj-login')) $('pj-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await srvLogin($('pj-pw').value); toast('Angemeldet.'); } catch (err) { toast(err.message || String(err)); }
    renderStart();
  });
}
async function startInit() {
  pst.local = await localList();
  await backupLoad();
  await srvRefresh();
  if (state.page === 'start') renderStart();
}
$('projsave').addEventListener('click', () => projSave());
$('projopen').addEventListener('click', () => setPage('start'));

// Dekore laden (Bibliothek auf dem Server, eigene Bilder im Browser) – asynchron, darum erst hier, wenn alle Programmteile da sind
loadDecors();
loadLocalDecors();

// Start mit Beispiel aus Onshape
renderToolLib();
renderRule();
renderSettings();
renderProfileEditor();
(async () => {
  // gespeicherte Sitzung (auch eine geleerte Liste) – sonst beim ersten Öffnen die Beispielteile
  const had = await restoreSession();
  await drwLoadSaved();
  if (!had) for (const s of (window.SAMPLE_STEPS || [])) addStep(s.text, 'Beispiel: ' + s.name);
  if (!had) projSet({ sig: projSig() }); // Beispielteile zählen nicht als ungespeichertes Projekt
  sessionReady = true;
  // beim Start die Projektseite („Weiter bearbeiten“ führt zur letzten Seite) – oder die Seite aus der Adresse (#saegen …)
  const fromHash = HASH_PAGES[String(location.hash || '').slice(1).toLowerCase()];
  if (fromHash && fromHash[1]) { lst.tab = fromHash[1]; saveLst(); }
  setPage(fromHash ? fromHash[0] : 'start');
  startInit();
  render();
})();
