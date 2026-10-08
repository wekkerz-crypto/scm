/*
 * Weckwop – Zeichnungen (12-zeichnungen.js)
 * PDF (und Bilder) zum Projekt: Seite „Zeichnungen“ (Liste, Ansicht seitenfüllend, Blättern, Vollbild) und dasselbe als
 * Fenster über dem Sägemodus (Knopf „📄 Zeichnungen“, Sprache „Zeichnung“ / „nächste Seite“ / „Zeichnung zu“).
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 13) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

/*
 * Daten: drw.list = [{ id, name, mime, size, data (Data-URL base64), added }] – gehört zum Projekt (projectPayload → data.zeichnungen),
 * die aktuelle Liste liegt im Browser (IndexedDB DRW_KEY), nicht in localStorage (zu groß). PDF zeichnet pdf.js
 * (js/vendor/pdfjs, Version 3.11, lädt erst bei Bedarf; Arbeit im Hauptfaden über das pdfjsWorker-Skript – geht auch
 * offline als Datei, .exe und auf dem Pi). isEvalSupported: false (keine Ausführung von Code aus der PDF).
 */
const DRW_KEY = 'zeichnungen.v1';
const DRW_MAX = 40 * 1024 * 1024; // je Datei
const DRW_TYPES = /^data:(application\/pdf|image\/(png|jpeg|webp|gif));base64,[A-Za-z0-9+/=]+$/;
const drw = { list: [], i: 0, page: 1, fit: 'page', zoom: 1, over: false, del: null, docs: new Map(), pages: {}, task: null, token: 0 };
const drwCur = () => drw.list[Math.min(drw.i, drw.list.length - 1)] || null;
let drwSaveT = null;
function drwSave() {
  clearTimeout(drwSaveT);
  drwSaveT = setTimeout(() => idbSet(DRW_KEY, drw.list).catch(() => toast('Zeichnungen konnten im Browser nicht gespeichert werden (zu groß?).')), 250);
  drwTabCount();
}
async function drwLoadSaved() {
  try { const v = await idbGet(DRW_KEY); if (Array.isArray(v)) drw.list = drwClean(v); } catch (e) { /* ohne Speicher */ }
  drwTabCount();
  if (state.page === 'drawings') renderDrw();
}
// aus Projektdatei/Speicher: nur PDF und Bilder als Data-URL, Namen kürzen
function drwClean(list) {
  return (Array.isArray(list) ? list : []).filter((d) => d && typeof d.data === 'string' && DRW_TYPES.test(d.data)).map((d) => ({
    id: String(d.id || ('z' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7))).slice(0, 40),
    name: String(d.name || 'Zeichnung').replace(/[\x00-\x1f]/g, '').slice(0, 120),
    mime: d.data.slice(5, d.data.indexOf(';')), size: Math.round(d.data.length * 0.75), data: d.data, added: d.added || '' }));
}
// Projekt: Zeichnungen übernehmen (applyProject) bzw. leeren (projNew)
function drwSet(list) {
  drw.list = drwClean(list);
  drw.docs.clear();
  drw.pages = {};
  drw.i = 0;
  drw.page = 1;
  drwSave();
  if (drw.over) drwOverlay(false);
  if (state.page === 'drawings') renderDrw();
}
const drwPayload = () => drw.list.map((d) => ({ id: d.id, name: d.name, mime: d.mime, data: d.data, added: d.added }));
function drwTabCount() { const e = $('ptn-drw'); if (e) e.textContent = drw.list.length ? String(drw.list.length) : ''; }
const drwBytes = (d) => { const b = atob(d.data.slice(d.data.indexOf(',') + 1)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const drwFileExt = (d) => ({ 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[d.mime] || '');

// Dateien hinzufügen (Knopf, Ablegen auf der Seite)
async function addDrawingFiles(files) {
  let n = 0;
  for (const f of Array.from(files || [])) {
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const isImg = /^image\/(png|jpeg|webp|gif)$/.test(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
    if (!isPdf && !isImg) { toast(f.name + ': nur PDF oder Bilder (PNG, JPG).'); continue; }
    if (f.size > DRW_MAX) { toast(f.name + ': größer als 40 MB.'); continue; }
    let data = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => resolve(''); r.readAsDataURL(f); });
    if (isPdf) data = data.replace(/^data:[^;,]*/, 'data:application/pdf');
    else if (/^data:application\/octet-stream/.test(data)) data = data.replace(/^data:[^;,]*/, 'data:image/' + ({ jpg: 'jpeg' }[f.name.split('.').pop().toLowerCase()] || f.name.split('.').pop().toLowerCase()));
    const d = drwClean([{ name: f.name.replace(/\.[^.]+$/, ''), data: data, added: new Date().toISOString().slice(0, 10) }])[0];
    if (!d) { toast(f.name + ': Datei nicht lesbar.'); continue; }
    drw.list.push(d);
    n++;
  }
  if (!n) return;
  drw.i = drw.list.length - n;
  drw.page = 1;
  drwSave();
  projMark();
  toast(n + ' Zeichnung' + (n === 1 ? '' : 'en') + ' hinzugefügt.');
  if (state.page === 'drawings') renderDrw();
}

// pdf.js bei Bedarf laden
let drwLibP = null;
function drwLib() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (drwLibP) return drwLibP;
  const load = (src) => new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('pdf.js nicht geladen (' + src + ')')); document.head.appendChild(s); });
  drwLibP = load('js/vendor/pdfjs/pdf.worker.min.js').then(() => load('js/vendor/pdfjs/pdf.min.js')).then(() => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdfjs/pdf.worker.min.js';
    return window.pdfjsLib;
  }).catch((e) => { drwLibP = null; throw e; });
  return drwLibP;
}
async function drwDoc(d) {
  if (drw.docs.has(d.id)) return drw.docs.get(d.id);
  const lib = await drwLib();
  const p = lib.getDocument({ data: drwBytes(d), isEvalSupported: false, enableXfa: false }).promise.then((doc) => { drw.pages[d.id] = doc.numPages; return doc; });
  drw.docs.set(d.id, p);
  p.catch(() => drw.docs.delete(d.id));
  return p;
}
const drwPagesOf = (d) => (d && d.mime === 'application/pdf' ? drw.pages[d.id] || 0 : 1);

// Blättern: über das Ende einer Zeichnung hinaus zur nächsten bzw. vorigen
async function drwGo(step) {
  const d = drwCur();
  if (!d) return;
  const n = d.mime === 'application/pdf' ? (await drwDoc(d)).numPages : 1;
  let i = drw.i;
  let pg = drw.page + step;
  if (pg > n) { if (i + 1 >= drw.list.length) { drwFlash('Letzte Seite'); return; } i++; pg = 1; }
  else if (pg < 1) {
    if (i === 0) { drwFlash('Erste Seite'); return; }
    i--;
    const p = drw.list[i];
    pg = p.mime === 'application/pdf' ? (await drwDoc(p)).numPages : 1;
  }
  drw.i = i;
  drw.page = pg;
  drwShow();
}
async function drwGoto(i, pg) {
  const d = drw.list[i];
  if (!d) throw new Error('Zeichnung ' + (i + 1) + ' gibt es nicht – es sind ' + drw.list.length + '.');
  const n = d.mime === 'application/pdf' ? (await drwDoc(d)).numPages : 1;
  if (pg > n) throw new Error('Seite ' + pg + ' gibt es nicht – „' + d.name + '“ hat ' + n + ' Seite' + (n === 1 ? '' : 'n') + '.');
  drw.i = i;
  drw.page = Math.max(1, pg || 1);
  drwShow();
}
const drwShow = () => { if (drw.over) renderDrwOver(); else if (state.page === 'drawings') renderDrw(); };
function drwFlash(t) { const e = document.querySelector('.drwview .drwmsg'); if (e) { e.textContent = t; e.classList.add('on'); setTimeout(() => e.classList.remove('on'), 1200); } else toast(t); }

// Ansicht (Seite und Fenster): Kopfleiste, Bühne mit Leinwand bzw. Bild, Klick links = zurück, rechts = weiter
function drwViewHtml(big) {
  const d = drwCur();
  const n = drwPagesOf(d);
  return '<div class="drwview' + (big ? ' big' : '') + '"><div class="drwbar">' +
    '<button type="button" class="btn' + (big ? '' : ' small') + '" data-drw="prev" aria-label="Seite zurück">◀ Zurück</button>' +
    '<span class="drwpos" aria-live="polite"><b>' + (d ? esc(d.name) : '–') + '</b> <span>Seite ' + (d ? drw.page : 0) + ' / ' + (n || '…') + '</span>' +
      (drw.list.length > 1 ? ' <small>Zeichnung ' + (drw.i + 1) + ' von ' + drw.list.length + '</small>' : '') + '</span>' +
    '<button type="button" class="btn' + (big ? ' go' : ' small') + '" data-drw="next" aria-label="Seite weiter">Weiter ▶</button>' +
    '<span class="sp"></span>' +
    '<span class="seg drwfit" role="group" aria-label="Größe"><button type="button" data-drwfit="page" aria-pressed="' + (drw.fit === 'page') + '" title="ganze Seite">Ganz</button>' +
      '<button type="button" data-drwfit="width" aria-pressed="' + (drw.fit === 'width') + '" title="Seitenbreite">Breite</button></span>' +
    '<button type="button" class="btn ghost small" data-drw="zout" aria-label="kleiner">−</button><output class="drwz">' + Math.round(drw.zoom * 100) + ' %</output>' +
    '<button type="button" class="btn ghost small" data-drw="zin" aria-label="größer">+</button>' +
    (big ? '<button type="button" class="btn" data-drw="close">✕ Schließen</button>' : '<button type="button" class="btn small" data-drw="full" title="Zeichnung bildschirmfüllend (F)">⛶ Vollbild</button>') +
    '</div>' +
    (big && drw.list.length > 1 ? '<div class="drwtabs">' + drw.list.map((x, i) => '<button type="button" data-drwi="' + i + '" aria-pressed="' + (i === drw.i) + '">📄 ' + esc(x.name) + '</button>').join('') + '</div>' : '') +
    '<div class="drwstage" tabindex="0" aria-label="Zeichnung – Klick links: zurück, rechts: weiter">' +
      (d ? (d.mime === 'application/pdf' ? '<canvas class="drwcv"></canvas>' : '<img class="drwimg" alt="' + esc(d.name) + '" src="' + d.data + '">') : '<p class="note">Keine Zeichnung.</p>') +
      '<span class="drwhint l" aria-hidden="true">◀</span><span class="drwhint r" aria-hidden="true">▶</span><span class="drwmsg" role="status"></span></div></div>';
}
function drwWire(host) {
  host.querySelectorAll('[data-drw]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const a = b.dataset.drw;
    if (a === 'next') drwGo(1);
    else if (a === 'prev') drwGo(-1);
    else if (a === 'zin' || a === 'zout') { drw.zoom = Math.max(0.5, Math.min(4, Math.round((drw.zoom * (a === 'zin' ? 1.25 : 0.8)) * 100) / 100)); drwShow(); }
    else if (a === 'close') drwOverlay(false);
    else if (a === 'full') drwOverlay(true);
  }));
  host.querySelectorAll('[data-drwfit]').forEach((b) => b.addEventListener('click', () => { drw.fit = b.dataset.drwfit; drw.zoom = 1; drwShow(); }));
  host.querySelectorAll('[data-drwi]').forEach((b) => b.addEventListener('click', () => { drw.i = +b.dataset.drwi; drw.page = 1; drwShow(); }));
  const stage = host.querySelector('.drwstage');
  if (stage) stage.addEventListener('click', (e) => {
    if (stage.scrollWidth > stage.clientWidth + 4 && drw.zoom > 1) return; // vergrößert: Klicken = Ziehen/Scrollen, nicht blättern
    const r = stage.getBoundingClientRect();
    drwGo(e.clientX - r.left < r.width * 0.35 ? -1 : 1);
  });
  drwPaint(host);
}
// Seite zeichnen: passend zur Bühne (ganze Seite bzw. Breite) × Zoom, scharf mit devicePixelRatio
async function drwPaint(host) {
  const d = drwCur();
  const stage = host.querySelector('.drwstage');
  if (!d || !stage) return;
  const my = ++drw.token;
  if (d.mime !== 'application/pdf') {
    const img = stage.querySelector('.drwimg');
    if (img) { img.style.width = drw.fit === 'width' || drw.zoom !== 1 ? (drw.zoom * 100) + '%' : ''; img.classList.toggle('fitw', drw.fit === 'width' || drw.zoom !== 1); }
    return;
  }
  try {
    const doc = await drwDoc(d);
    if (my !== drw.token) return;
    const pg = Math.min(drw.page, doc.numPages);
    const page = await doc.getPage(pg);
    if (my !== drw.token) return;
    const cv = stage.querySelector('.drwcv');
    if (!cv) return;
    const pos = host.querySelector('.drwpos span');
    if (pos) pos.textContent = 'Seite ' + pg + ' / ' + doc.numPages;
    const v1 = page.getViewport({ scale: 1 });
    const W = Math.max(200, stage.clientWidth - 8);
    const H = Math.max(200, stage.clientHeight - 8);
    const fit = drw.fit === 'width' ? W / v1.width : Math.min(W / v1.width, H / v1.height);
    const css = fit * drw.zoom;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: css * dpr });
    // sehr große Seiten (Plan A0, stark vergrößert): Leinwand begrenzen
    const k = Math.min(1, Math.sqrt(16e6 / (vp.width * vp.height)));
    const vpk = k < 1 ? page.getViewport({ scale: css * dpr * k }) : vp;
    if (drw.task) { try { drw.task.cancel(); } catch (e) { /* schon fertig */ } }
    cv.width = Math.floor(vpk.width);
    cv.height = Math.floor(vpk.height);
    cv.style.width = Math.floor(v1.width * css) + 'px';
    cv.style.height = Math.floor(v1.height * css) + 'px';
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    drw.task = page.render({ canvasContext: ctx, viewport: vpk, background: '#ffffff' });
    await drw.task.promise;
    drw.task = null;
  } catch (e) {
    if (e && e.name === 'RenderingCancelledException') return;
    const m = stage.querySelector('.drwmsg');
    if (m) { m.textContent = 'PDF nicht lesbar: ' + (e && e.message ? e.message : e); m.classList.add('on', 'err'); }
  }
}

// Seite „Zeichnungen“: links die Liste (hinzufügen, umbenennen, Reihenfolge, löschen), rechts die Ansicht
function renderDrw() {
  const host = $('drwpage');
  if (!host || state.page !== 'drawings') return;
  if (drw.i >= drw.list.length) drw.i = Math.max(0, drw.list.length - 1);
  const kb = (b) => (b > 1048576 ? fmt(Math.round(b / 104857.6) / 10) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB');
  host.innerHTML = '<div class="drwgrid"><aside class="drwside"><h3>Zeichnungen <small>' + drw.list.length + '</small></h3>' +
    '<label class="btn primary drwadd">+ PDF / Bild hinzufügen<input type="file" id="drwfile" accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif" multiple hidden></label>' +
    '<div class="drwdrop" id="drwdrop">PDF-Zeichnungen hierher ziehen – sie gehören zum Projekt und sind im Sägemodus mit „📄 Zeichnungen“ zur Hand.</div>' +
    (drw.list.length ? '<ol class="drwlist">' + drw.list.map((d, i) => '<li' + (i === drw.i ? ' class="on"' : '') + '>' +
      '<button type="button" class="drwsel" data-drwsel="' + i + '" aria-pressed="' + (i === drw.i) + '"><span class="ic" aria-hidden="true">' + (d.mime === 'application/pdf' ? 'PDF' : 'BILD') + '</span>' +
      '<span class="tx"><b>' + esc(d.name) + '</b><small>' + (d.mime === 'application/pdf' ? (drw.pages[d.id] ? drw.pages[d.id] + ' Seite' + (drw.pages[d.id] === 1 ? '' : 'n') + ' · ' : '') : '') + kb(d.size) + '</small></span></button>' +
      '<span class="acts"><button type="button" class="btn ghost small" data-drwren="' + i + '" title="Umbenennen" aria-label="' + esc(d.name) + ' umbenennen">✎</button>' +
      '<button type="button" class="btn ghost small" data-drwup="' + i + '"' + (i ? '' : ' disabled') + ' aria-label="nach oben">↑</button>' +
      '<button type="button" class="btn ghost small" data-drwdown="' + i + '"' + (i < drw.list.length - 1 ? '' : ' disabled') + ' aria-label="nach unten">↓</button>' +
      '<button type="button" class="btn ghost small drwdel' + (drw.del === d.id ? ' arm' : '') + '" data-drwdel="' + i + '" aria-label="' + esc(d.name) + ' löschen">' + (drw.del === d.id ? 'Löschen?' : '✕') + '</button></span></li>').join('') + '</ol>'
      : '<p class="note">Noch keine Zeichnungen in diesem Projekt.</p>') +
    '<p class="note">Blättern: Klick rechts/links in die Zeichnung, ← →, Bild ↑/↓. Gespeichert wird mit dem Projekt (auch auf dem Server und im Projektordner unter „Zeichnungen“).</p></aside>' +
    '<section class="drwmain">' + (drw.list.length ? drwViewHtml(false) : '<div class="drwempty"><b>Keine Zeichnung geladen</b><span>PDF links hinzufügen oder auf die Seite ziehen.</span></div>') + '</section></div>';
  $('drwfile').addEventListener('change', (e) => { addDrawingFiles(e.target.files); e.target.value = ''; });
  const dz = $('drwdrop');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); addDrawingFiles(e.dataTransfer.files); });
  host.querySelectorAll('[data-drwsel]').forEach((b) => b.addEventListener('click', () => { drw.i = +b.dataset.drwsel; drw.page = 1; drw.del = null; renderDrw(); }));
  const move = (i, j) => { const [d] = drw.list.splice(i, 1); drw.list.splice(j, 0, d); if (drw.i === i) drw.i = j; else if (drw.i === j) drw.i = i; drwSave(); projMark(); renderDrw(); };
  host.querySelectorAll('[data-drwup]').forEach((b) => b.addEventListener('click', () => move(+b.dataset.drwup, +b.dataset.drwup - 1)));
  host.querySelectorAll('[data-drwdown]').forEach((b) => b.addEventListener('click', () => move(+b.dataset.drwdown, +b.dataset.drwdown + 1)));
  host.querySelectorAll('[data-drwren]').forEach((b) => b.addEventListener('click', () => {
    const d = drw.list[+b.dataset.drwren];
    const li = b.closest('li');
    const tx = li.querySelector('.tx b');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = d.name;
    inp.maxLength = 120;
    inp.className = 'drwname';
    inp.setAttribute('aria-label', 'Name der Zeichnung');
    tx.replaceWith(inp);
    inp.focus();
    inp.select();
    let fin = false; // Enter zeichnet neu → das Feld verliert dabei den Fokus (blur): nur einmal übernehmen
    const done = (ok) => { if (fin) return; fin = true; if (ok && inp.value.trim()) { d.name = inp.value.trim().slice(0, 120); drwSave(); projMark(); } renderDrw(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); e.stopPropagation(); });
    inp.addEventListener('blur', () => done(true));
    inp.addEventListener('click', (e) => e.stopPropagation());
  }));
  host.querySelectorAll('[data-drwdel]').forEach((b) => b.addEventListener('click', () => {
    const d = drw.list[+b.dataset.drwdel];
    if (drw.del !== d.id) { drw.del = d.id; renderDrw(); return; }
    drw.del = null;
    drw.list.splice(+b.dataset.drwdel, 1);
    drw.docs.delete(d.id);
    drw.page = 1;
    drwSave();
    projMark();
    toast('„' + d.name + '“ gelöscht.');
    renderDrw();
  }));
  const main = host.querySelector('.drwmain');
  if (drw.list.length) drwWire(main);
  // Seitenzahlen der übrigen PDFs nachladen (für die Liste)
  const missing = drw.list.filter((d) => d.mime === 'application/pdf' && !drw.pages[d.id]);
  if (missing.length) Promise.all(missing.map((d) => drwDoc(d).catch(() => null))).then(() => { if (state.page === 'drawings' && missing.some((d) => drw.pages[d.id])) renderDrwListOnly(); });
}
// nur die Seitenzahlen in der Liste nachtragen (ohne die Ansicht neu zu zeichnen)
function renderDrwListOnly() {
  document.querySelectorAll('#drwpage [data-drwsel]').forEach((b) => {
    const d = drw.list[+b.dataset.drwsel];
    const sm = b.querySelector('small');
    if (d && sm && drw.pages[d.id] && !/Seite/.test(sm.textContent)) sm.textContent = drw.pages[d.id] + ' Seite' + (drw.pages[d.id] === 1 ? '' : 'n') + ' · ' + sm.textContent;
  });
  const pos = document.querySelector('#drwpage .drwpos span');
  const d = drwCur();
  if (pos && d && drw.pages[d.id]) pos.textContent = 'Seite ' + drw.page + ' / ' + drw.pages[d.id];
}

// Fenster über allem (Sägemodus, Vollbild von der Seite): bildschirmfüllend, große Knöpfe
function drwOverlay(on) {
  let el = $('drwover');
  if (on) {
    if (!drw.list.length) { toast('Keine Zeichnungen im Projekt – unter „Zeichnungen“ eine PDF hinzufügen.'); return false; }
    if (!el) { el = document.createElement('div'); el.id = 'drwover'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Zeichnung'); document.body.appendChild(el); }
    drw.over = true;
    document.body.classList.add('drwlock');
    renderDrwOver();
    try { if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {}); } catch (e) { /* nur Fenster */ }
    const st = el.querySelector('.drwstage');
    if (st) st.focus();
  } else {
    drw.over = false;
    document.body.classList.remove('drwlock');
    try { if (document.fullscreenElement && document.fullscreenElement === el) document.exitFullscreen().catch(() => {}); } catch (e) { /* egal */ }
    if (el) el.remove();
    if (state.page === 'drawings') renderDrw();
    else if (typeof onSaw === 'function' && onSaw()) renderSaw();
  }
  return true;
}
function renderDrwOver() {
  const el = $('drwover');
  if (!el) return;
  el.innerHTML = drwViewHtml(true);
  drwWire(el);
}
window.addEventListener('resize', () => { if (drw.over) drwPaint($('drwover')); else if (state.page === 'drawings' && drw.list.length) drwPaint($('drwpage')); });
// Tasten: im Fenster und auf der Seite „Zeichnungen“
document.addEventListener('keydown', (e) => {
  if (!drw.over && state.page !== 'drawings') return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (drw.over && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); drwOverlay(false); return; }
  if (!drw.list.length) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && drw.over)) { e.preventDefault(); e.stopImmediatePropagation(); drwGo(1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); e.stopImmediatePropagation(); drwGo(-1); }
  else if ((e.key === 'f' || e.key === 'F') && !drw.over) { e.preventDefault(); drwOverlay(true); }
}, true);
// Sprache/KI (saegen_steuern zeichnung_…): Fenster auf/zu, blättern, Seite n
function drwAction(aktion, o) {
  if (aktion === 'zeichnung_aus') { if (drw.over) drwOverlay(false); return drwStatus(); }
  if (!drw.list.length) throw new Error('Keine Zeichnungen im Projekt.');
  if (!drw.over) drwOverlay(true);
  if (aktion === 'zeichnung_weiter' || aktion === 'zeichnung_zurueck') drwGo(aktion === 'zeichnung_weiter' ? 1 : -1);
  else if (aktion === 'zeichnung_seite') drwGoto(o.zeichnung ? o.zeichnung - 1 : drw.i, o.seite || 1).catch((e) => { if (voiceOn()) Voice.say(e.message); else toast(e.message); });
  else if (aktion !== 'zeichnung_an') throw new Error('unbekannte Aktion: ' + aktion);
  return drwStatus();
}
const drwStatus = () => { const d = drwCur(); return { zeichnung_offen: drw.over, zeichnungen: drw.list.map((x) => x.name), zeichnung: d ? d.name : null, seite: drw.page, seiten: drwPagesOf(d) || null }; };
