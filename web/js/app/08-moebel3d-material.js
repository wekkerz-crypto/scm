/*
 * Step2Maestro – Möbel 3D und Material (08-moebel3d-material.js)
 * PDF-Dateien, Seitenwechsel (`setPage`), Möbel 3D (Baugruppe, Maße), Plattenfarben und Dekore (Bibliothek und lokal), Seite „Material“.
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 12) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

// ------------------------------------------------ PDF-Dateien (ohne Druckdialog – geht auch, wo der Browser „Drucken“ sperrt)
const pdfDate = () => new Date().toLocaleDateString('de-DE');
const BOM_COLS = [{ t: 'Pos.', w: 10 }, { t: 'Anz.', w: 11, align: 'right' }, { t: 'Bezeichnung', w: 58 }, { t: 'L', w: 16, align: 'right' }, { t: 'B', w: 16, align: 'right' },
  { t: 'D', w: 10, align: 'right' }, { t: 'Material / Kanten', w: 46 }, { t: 'Kantenband', w: 40 }, { t: 'Faser', w: 15 }, { t: 'Zuschnitt', w: 30, align: 'right' }, { t: 'Zeit', w: 21, align: 'right' }];
function bomPdfRows(rows) {
  return rows.map((r, k) => [String(k + 1), String(r.qty), r.names.join(', ') + ' (' + r.nums.join(', ') + ')', n1(r.L), n1(r.W), n1(r.T), boardName(r.board), edgeText(r.edges),
    GRAIN_NAMES[grainOf(r.parts[0])], n1(r.raw.L) + ' × ' + n1(r.raw.W), r.time ? Toolpath.fmtTime(r.time.total) : '–']);
}
function addBomPdf(d) {
  const rows = bomRows();
  const tot = bomTotals(rows);
  d.page();
  d.text(12, 16, 'Stückliste', { size: 15, bold: true });
  d.text(12, 23, pdfDate() + ' · ' + tot.qty + ' Teile · Bearbeitungszeit ' + Toolpath.fmtTime(tot.time) + ' (geschätzt, inkl. Auflegen)', { size: 9.5, color: [0.25, 0.25, 0.25] });
  let y = d.table(12, 29, BOM_COLS, bomPdfRows(rows), { onPage: () => { d.text(12, 12, 'Stückliste (Fortsetzung)', { size: 10, bold: true }); return 16; } });
  y += 6;
  d.text(12, y, Array.from(tot.byMat).map(([k, v]) => k + ': ' + fmt(Math.round(v * 100) / 100) + ' m²').join(' · '), { size: 9.5, maxW: 273 });
  if (tot.bands.size) d.text(12, y + 5.5, 'Kantenband (inkl. ' + fmt(+lst.edgeExtra || 0) + ' mm Zugabe je Kante): ' +
    Array.from(tot.bands).map(([k, v]) => k + ': ' + fmt(Math.round(v * 10) / 10) + ' m').join(' · '), { size: 9.5, maxW: 273 });
}
// ret = true: Bytes zurück (Projektordner) statt Datei speichern
function bomPdf(ret) {
  if (!bomRows().length) { if (ret) return null; toast('Keine Teile vorhanden.'); return; }
  const d = MiniPdf.doc(297, 210);
  addBomPdf(d);
  if (ret === true) return d.save();
  saveOne('stueckliste.pdf', d.save(), 'application/pdf');
}
// Möbel 3D: Ansicht als Bild, Maße, dahinter die Stückliste
function modelPdf() {
  if (!mdl.viewer) return;
  let cv;
  try { cv = mdl.viewer.snapshot(); } catch (e) { toast('Bild nicht möglich: ' + (e.message || e)); return; }
  // JPEG auf weißem Grund (PDF ohne Transparenz)
  const c2 = document.createElement('canvas');
  c2.width = cv.width;
  c2.height = cv.height;
  const g = c2.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c2.width, c2.height);
  g.drawImage(cv, 0, 0);
  const b64 = c2.toDataURL('image/jpeg', 0.9).split(',')[1];
  const bin = atob(b64);
  const jpg = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) jpg[i] = bin.charCodeAt(i);
  const d = MiniPdf.doc(297, 210);
  d.page();
  d.text(12, 16, 'Möbel 3D', { size: 15, bold: true });
  d.text(12, 23, pdfDate(), { size: 9.5, color: [0.25, 0.25, 0.25] });
  const dims = mdl.viewer.dims;
  const maxH = dims.length ? 150 : 170;
  const sc = Math.min(273 / c2.width, maxH / c2.height);
  const w = c2.width * sc;
  const h = c2.height * sc;
  d.image(12 + (273 - w) / 2, 28, w, h, jpg, c2.width, c2.height);
  if (dims.length) {
    d.text(12, 28 + h + 7, 'Maße: ' + dims.map((m, i) => (i + 1) + '. ' + (m.axis === 'aligned' ? '' : m.axis.toUpperCase() + ' ') + fmt(Math.round(m.value * 10) / 10) +
      ' mm (Bauteil ' + m.a.num + (m.b.num !== m.a.num ? ' > ' + m.b.num : '') + ')').join(' · '), { size: 9, maxW: 273 });
  }
  addBomPdf(d);
  saveOne('moebel_3d.pdf', d.save(), 'application/pdf');
}
// Drucken: im claude.ai-Artifact sperrt der Browser den Druckdialog – dort gleich als PDF speichern
function printOr(pdfFn, printFn) {
  if (claudeHost) { toast('Drucken ist hier gesperrt – PDF wird gespeichert, daraus drucken.'); pdfFn(); return; }
  printFn();
}

// ------------------------------------------------ Möbel 3D: alle STEP-Bauteile zusammengebaut
const PAGE_KEY = 'step2xcs.page.v1';
state.page = 'start';
const mdl = { viewer: null, key: null, hidden: new Set(), sel: null, loading: false };
function setPage(pg) {
  state.page = pg;
  if (pg !== 'start') storeJson(PAGE_KEY, pg); // gemerkt wird die letzte Arbeitsseite („Weiter bearbeiten“)
  voiceIdle();
  document.body.dataset.page = pg;
  $('modelpage').hidden = pg !== 'model';
  $('listpage').hidden = pg !== 'lists';
  $('lblpage').hidden = pg !== 'labels';
  $('matpage').hidden = pg !== 'material';
  $('startpage').hidden = pg !== 'start';
  document.querySelectorAll('.pagetabs [data-page]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.page === pg)));
  if (pg === 'model') renderModel();
  if (pg === 'lists') renderLists();
  if (pg === 'labels') renderLD();
  if (pg === 'material') renderMat();
  if (pg === 'start') renderStart();
}
document.querySelectorAll('.pagetabs [data-page]').forEach((b) => b.addEventListener('click', () => setPage(b.dataset.page)));
// Bauteile mit STEP (DXF hat kein 3D-Modell); Nummer = Platz in der Programmliste
function modelParts() {
  return state.parts.map((p, i) => ({ p: p, num: i + 1 })).filter((x) => x.p.solid && x.p.stepText);
}
// Hüllquader eines Bauteils in Modellkoordinaten (Eckpunkte der Kanten)
function solidBox(solid) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const f of solid.faces) for (const b of f.bounds) for (const e of b.edges) for (const q of [e.start, e.end]) {
    for (let k = 0; k < 3; k++) { if (q[k] < lo[k]) lo[k] = q[k]; if (q[k] > hi[k]) hi[k] = q[k]; }
  }
  return { lo: lo, hi: hi };
}
// ------------------------------------------------ Plattenfarbe (3D-Ansichten)
/*
 * Dekor-Bibliothek: liegt das Programm auf dem Webserver, holt es sich die Dekore aus dekore/api.php (Bilder, Namen, Maserung).
 * Offline (.exe, Datei) gibt es keine – dann wie bisher Farben. decorKey wie im PHP: „U708 ST9“ → U708_ST9.
 */
let decorBase = '';
const decorKey = (code) => String(code || '').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
  .replace(/[^A-Za-z0-9-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '').toUpperCase().slice(0, 60);
async function loadDecors() {
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    const base = new URL('dekore/', location.href).href;
    const r = await fetch(base + 'api.php?a=list', { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (!j || !j.ok || !Array.isArray(j.dekore)) return;
    decorBase = base;
    serverDecors = j.dekore.map((d) => Object.assign({}, d, { url: d.bild ? new URL(d.bild, base).href : null, thumb: d.vorschau ? new URL(d.vorschau, base).href : null }));
    applyDecors();
    applyBoards();
  } catch (e) { /* keine Bibliothek auf diesem Server */ }
}
/*
 * Dekor-Bilder direkt im Programm (Material › Dekore): Bild hineinziehen oder wählen → verkleinert (lange Seite ≤ 1200 px, JPEG),
 * Vorschau 160 px, Grundfarbe aus dem Bild, Code aus dem Dateinamen („U708 ST9.jpg“ → U708 ST9). Gespeichert im Browser
 * (IndexedDB, DECOR_KEY), Export/Import als .json, in der Projektdatei die benutzten. Gleiche Schlüssel wie die Bibliothek auf dem
 * Server ('dek:KEY'); ein eigenes Bild geht dem vom Server vor.
 */
const DECOR_KEY = 'step2xcs.decors.v1';
let serverDecors = [];
let localDecors = [];
function applyDecors() {
  const m = new Map();
  for (const d of serverDecors) m.set(d.key, d);
  for (const d of localDecors) m.set(d.key, Object.assign({}, d, { url: d.img, thumb: d.thumb, local: true }));
  View3D.setDecors(Array.from(m.values()));
}
let decorSaveT = null;
function saveLocalDecors() {
  clearTimeout(decorSaveT);
  decorSaveT = setTimeout(() => idbSet(DECOR_KEY, localDecors).catch(() => toast('Dekore konnten im Browser nicht gespeichert werden.')), 200);
}
async function loadLocalDecors() {
  try { const v = await idbGet(DECOR_KEY); if (Array.isArray(v)) localDecors = v.filter((d) => d && d.key && d.img); } catch (e) { /* ohne Speicher */ }
  applyDecors();
  applyBoards();
  if (state.page === 'material') renderMat();
}
// Bild → { img, thumb, color } (Canvas)
function decorImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      try {
        const k = Math.min(1, 1200 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k));
        c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const t = document.createElement('canvas');
        t.width = t.height = 160;
        const s0 = Math.min(im.naturalWidth, im.naturalHeight);
        t.getContext('2d').drawImage(im, (im.naturalWidth - s0) / 2, (im.naturalHeight - s0) / 2, s0, s0, 0, 0, 160, 160);
        const a = document.createElement('canvas');
        a.width = a.height = 1;
        const ax = a.getContext('2d');
        ax.drawImage(im, 0, 0, 1, 1);
        const px = ax.getImageData(0, 0, 1, 1).data;
        URL.revokeObjectURL(url);
        resolve({ img: c.toDataURL('image/jpeg', 0.86), thumb: t.toDataURL('image/jpeg', 0.8), w: c.width, h: c.height,
          color: '#' + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('') });
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('kein Bild')); };
    im.src = url;
  });
}
async function addDecorFiles(files) {
  let n = 0;
  for (const f of Array.from(files || [])) {
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)) continue;
    try {
      const im = await decorImage(f);
      const code = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Dekor';
      const key = decorKey(code);
      const old = localDecors.find((d) => d.key === key);
      // Holz (H…) mit Maserung; Bildbreite: Vorgabe 1000 mm
      const d = Object.assign(old || { key: key, code: code, name: '', grain: /^H/i.test(code), scale: 1000 }, { img: im.img, thumb: im.thumb, color: im.color });
      if (!old) localDecors.push(d);
      n++;
    } catch (e) { toast(f.name + ': Bild nicht lesbar.'); }
  }
  if (!n) return;
  localDecors.sort((a, b) => a.code.localeCompare(b.code, 'de', { numeric: true }));
  saveLocalDecors();
  applyDecors();
  applyBoards();
  toast(n + ' Dekor-Bild' + (n === 1 ? '' : 'er') + ' übernommen.');
  render();
}
// Mehrere eigene Dekore auf einmal ändern: Auswahl (Schlüssel), Name suchen/ersetzen, Bildbreite (Maserung skalieren), Maserung an/aus
const decSel = new Set();
function decBulkHtml() {
  for (const k of Array.from(decSel)) if (!localDecors.some((d) => d.key === k)) decSel.delete(k);
  const n = decSel.size;
  const all = n === localDecors.length;
  const dis = n ? '' : ' disabled';
  return '<div class="decbulk" id="decbulk"><label class="ck"><input type="checkbox" id="decall"' + (all ? ' checked' : '') + '> Alle</label>' +
    '<span class="decn">' + (n ? '<b>' + n + '</b> gewählt' : 'Dekore wählen (Haken), dann für alle gewählten:') + '</span>' +
    '<span class="grp" title="Im Namen ersetzen – „Suchen“ leer: ganzen Namen setzen">Name <input type="text" id="decfind" placeholder="Suchen" aria-label="Im Namen suchen"' + dis + '> → ' +
      '<input type="text" id="decrepl" placeholder="Ersetzen durch" aria-label="Ersetzen durch"' + dis + '> <button type="button" class="btn small" id="decren"' + dis + '>Ersetzen</button></span>' +
    '<span class="grp" title="Wie breit das Bild auf der Platte ist – größer = gröbere Maserung">Bild <input type="number" id="decscale" min="50" max="6000" step="10" placeholder="mm" aria-label="Bildbreite in mm"' + dis + '> mm ' +
      '<button type="button" class="btn small" id="decsetscale"' + dis + '>Setzen</button>' +
      '<button type="button" class="btn ghost small" data-decfac="0.8"' + dis + ' title="Maserung feiner (Bild 20 % schmaler)">− 20 %</button>' +
      '<button type="button" class="btn ghost small" data-decfac="1.25"' + dis + ' title="Maserung gröber (Bild 25 % breiter)">+ 25 %</button></span>' +
    '<span class="grp">Maserung <button type="button" class="btn ghost small" data-decgrain="1"' + dis + '>an</button><button type="button" class="btn ghost small" data-decgrain="0"' + dis + '>aus</button></span></div>';
}
function decBulkWire(host) {
  if (!$('decbulk')) return;
  const chosen = () => localDecors.filter((d) => decSel.has(d.key));
  const done = (msg) => { saveLocalDecors(); applyDecors(); applyBoards(); render(); if (msg) toast(msg); };
  $('decall').addEventListener('change', (e) => { decSel.clear(); if (e.target.checked) for (const d of localDecors) decSel.add(d.key); renderMat(); });
  $('decall').indeterminate = decSel.size > 0 && decSel.size < localDecors.length;
  host.querySelectorAll('[data-decsel]').forEach((c) => c.addEventListener('change', () => {
    const d = localDecors[+c.dataset.decsel];
    if (c.checked) decSel.add(d.key); else decSel.delete(d.key);
    renderMat();
  }));
  const ren = () => {
    const find = $('decfind').value;
    const repl = $('decrepl').value.trim();
    let n = 0;
    for (const d of chosen()) {
      const old = d.name || '';
      const nu = (find ? old.split(find).join(repl) : repl).replace(/\s+/g, ' ').trim().slice(0, 80);
      if (nu !== old) { d.name = nu; n++; }
    }
    done(n + ' Name' + (n === 1 ? '' : 'n') + ' geändert.');
  };
  $('decren').addEventListener('click', ren);
  $('decrepl').addEventListener('keydown', (e) => { if (e.key === 'Enter') ren(); });
  const setScale = (fn) => { const c = chosen(); for (const d of c) d.scale = Math.round(Math.max(50, Math.min(6000, fn(d.scale || 1000)))); done('Bildbreite bei ' + c.length + ' Dekor' + (c.length === 1 ? '' : 'en') + ' geändert.'); };
  $('decsetscale').addEventListener('click', () => { const v = parseFloat(String($('decscale').value).replace(',', '.')); if (!(v >= 50)) { toast('Bildbreite ab 50 mm eingeben.'); return; } setScale(() => v); });
  $('decscale').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('decsetscale').click(); });
  host.querySelectorAll('[data-decfac]').forEach((b) => b.addEventListener('click', () => setScale((v) => v * +b.dataset.decfac)));
  host.querySelectorAll('[data-decgrain]').forEach((b) => b.addEventListener('click', () => { const c = chosen(); for (const d of c) d.grain = b.dataset.decgrain === '1'; done('Maserung ' + (b.dataset.decgrain === '1' ? 'an' : 'aus') + ' bei ' + c.length + ' Dekor' + (c.length === 1 ? '' : 'en') + '.'); }));
}
function decorSectionHtml(decs) {
  const loc = new Set(localDecors.map((d) => d.key));
  const srv = serverDecors.filter((d) => !loc.has(d.key));
  return '<section class="matcard wide" id="decsec"><h4>Dekore <small>' + decs.length + '</small><span class="sp"></span>' +
    '<label class="btn small" title="Bilder wählen (mehrere möglich) – Dateiname = Dekor-Code">+ Bilder <input type="file" id="decfile" accept="image/*" multiple hidden></label>' +
    (localDecors.length ? '<button type="button" class="btn ghost small" id="decexp" title="Eigene Dekore als Datei sichern – für andere PCs oder den Pi">Exportieren</button>' : '') +
    '<label class="btn ghost small" title="Dekor-Datei (.json) laden">Importieren <input type="file" id="decimp" accept=".json,application/json" hidden></label>' +
    (decorBase ? '<a class="btn ghost small" href="' + esc(decorBase) + '" target="_blank" rel="noopener">Server-Bibliothek ↗</a>' : '') + '</h4>' +
    '<div class="decdrop" id="decdrop">Dekor-Bilder hierher ziehen – der Dateiname wird zum Code (z. B. „U708 ST9.jpg“). Teile mit dem Code im Namen bekommen das Bild in Möbel 3D.</div>' +
    (localDecors.length ? decBulkHtml() : '') +
    (localDecors.length ? '<div class="decgrid">' + localDecors.map((d, i) => '<div class="dectile' + (decSel.has(d.key) ? ' sel' : '') + '"><input type="checkbox" class="decck" data-decsel="' + i + '"' +
      (decSel.has(d.key) ? ' checked' : '') + ' aria-label="' + esc(d.code) + ' auswählen"><i style="background:' + esc(d.color) + ' url(\'' + esc(d.thumb) + '\') center / cover"></i>' +
      '<div class="decf"><input type="text" data-decf="code" data-i="' + i + '" value="' + esc(d.code) + '" aria-label="Code" title="Code (wie im Bauteilnamen)">' +
      '<input type="text" data-decf="name" data-i="' + i + '" value="' + esc(d.name || '') + '" placeholder="Name (z. B. Schiefer)" aria-label="Name">' +
      '<span><label class="ck"><input type="checkbox" data-decf="grain" data-i="' + i + '"' + (d.grain ? ' checked' : '') + '> Maserung</label>' +
      '<label title="Wie breit das Bild auf der Platte ist">Bild <input type="number" min="50" max="6000" step="10" data-decf="scale" data-i="' + i + '" value="' + (d.scale || 1000) + '"> mm</label></span></div>' +
      '<button type="button" class="btn ghost small" data-decdel="' + i + '" aria-label="Dekor löschen" title="löschen">✕</button></div>').join('') + '</div>' : '') +
    (srv.length ? '<h5 class="dech">vom Server</h5><div class="matdec">' + srv.map((d) => '<span title="' + esc(d.code + (d.name ? ' ' + d.name : '')) + '"><i style="background:' + esc(d.color || '#ccc') +
      (d.thumb ? ' url(\'' + esc(d.thumb) + '\') center / cover' : '') + '"></i>' + esc(d.code) + '<small>' + esc(d.name || '') + '</small></span>').join('') + '</div>' : '') +
    '</section>';
}
function decorWire(host) {
  if (!$('decsec')) return;
  decBulkWire(host);
  $('decfile').addEventListener('change', (e) => { addDecorFiles(e.target.files); e.target.value = ''; });
  const dz = $('decdrop');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); addDecorFiles(e.dataTransfer.files); });
  if ($('decexp')) $('decexp').addEventListener('click', () => saveOne('dekore_' + new Date().toISOString().slice(0, 10) + '.json',
    JSON.stringify({ format: 'step2maestro-dekore', v: 1, dekore: localDecors }), 'application/json'));
  $('decimp').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const n = mergeDecors(j && j.dekore);
      toast(n + ' Dekor' + (n === 1 ? '' : 'e') + ' geladen.');
    } catch (err) { toast(f.name + ': keine Dekor-Datei.'); }
  });
  host.querySelectorAll('[data-decf]').forEach((inp) => inp.addEventListener('change', () => {
    const d = localDecors[+inp.dataset.i];
    if (!d) return;
    const k = inp.dataset.decf;
    if (k === 'grain') d.grain = inp.checked;
    else if (k === 'scale') d.scale = Math.max(50, Math.min(6000, +inp.value || 1000));
    else if (k === 'code') {
      const code = inp.value.trim().slice(0, 40);
      const key = decorKey(code);
      if (!key || localDecors.some((x) => x !== d && x.key === key)) { toast('Den Code gibt es schon (oder er ist leer).'); renderMat(); return; }
      // Teile mit dem alten Dekor behalten es
      const ren = (b) => (typeof b === 'string' && b.split('|')[0] === 'dek:' + d.key ? 'dek:' + key + b.slice(('dek:' + d.key).length) : b);
      for (const p of state.parts) p.board = ren(p.board);
      if (ren(state.settings.boardMaterial) !== state.settings.boardMaterial) { state.settings.boardMaterial = ren(state.settings.boardMaterial); saveSettings(); }
      if (decSel.delete(d.key)) decSel.add(key);
      d.code = code;
      d.key = key;
    } else d.name = inp.value.trim().slice(0, 80);
    saveLocalDecors();
    applyDecors();
    applyBoards();
    render();
  }));
  host.querySelectorAll('[data-decdel]').forEach((b) => b.addEventListener('click', () => {
    if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'Löschen?'; return; }
    localDecors.splice(+b.dataset.decdel, 1);
    saveLocalDecors();
    applyDecors();
    applyBoards();
    render();
  }));
}
// Dekore aus Datei/Projekt übernehmen (gleicher Code: Bild und Angaben ersetzen)
function mergeDecors(list) {
  let n = 0;
  for (const d of Array.isArray(list) ? list : []) {
    const okImg = (u) => /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(u || ''));
    if (!d || !d.key || !decorKey(d.key) || !okImg(d.img)) continue;
    const clean = { key: decorKey(d.key), code: String(d.code || d.key).slice(0, 40), name: String(d.name || '').slice(0, 80), grain: !!d.grain,
      scale: Math.max(50, Math.min(6000, +d.scale || 1000)), color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#c8c8c4', img: d.img,
      thumb: okImg(d.thumb) ? d.thumb : d.img };
    const i = localDecors.findIndex((x) => x.key === clean.key);
    if (i >= 0) localDecors[i] = clean; else localDecors.push(clean);
    n++;
  }
  if (n) { saveLocalDecors(); applyDecors(); applyBoards(); render(); }
  return n;
}
// Kantenbelegung für Möbel 3D (Schalter „Kanten“): Lage der Platte im Modell (panel.tf) und Kanten je Seite
const bandsOf = (part) => {
  const r = part && (part.res || part.result);
  if (!state.settings.modelEdges || !r || !r.panel || !r.panel.tf) return null;
  const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);
  const hlOn = !!state.settings.modelEdgeHl;
  // Dekor 2: eigene Farbe (Listen › Dekor 2); hervorheben: je Dekor eine Signalfarbe
  return { m: r.panel.tf.m, e: edgesOf(part), c2: col(lst.edgeColor2, '#5b4a3a'),
    hl: hlOn ? col(state.settings.modelEdgeColor, '#22a34a') : null, hl2: hlOn ? col(state.settings.modelEdgeColor2, '#e8590c') : null };
};
const boardKeyOf = (part) => (part && part.board) || nameBoard(part) || (learnedOf(part, 'board') || {}).board || state.settings.boardMaterial || 'eiche';
/*
 * Platte aus dem Bauteilnamen: Material/Dekor (StepToXcs.materialOf, z. B. „U708 ST9“) als eigene Farbe mit Namen; Farbe aus
 * der STEP, sonst nach dem Dekor-Code (W weiß, U uni grau, H Holz mit Maserung, F Stein). Holzdekore (H…) mit Maserung.
 */
function nameBoard(part) {
  const s = part && part.solid;
  if (!s || !s.material || state.settings.boardFromName === false) return null;
  // Dekor aus der Bibliothek auf dem Server (gleicher Code, z. B. „U708 ST9“ → U708_ST9): mit Bild und Namen
  const dk = decorKey(s.material);
  if (dk && View3D.decors().some((d) => d.key === dk)) return 'dek:' + dk;
  const code = s.material.trim().charAt(0).toUpperCase();
  const color = s.color || { W: '#f4f4f0', U: '#b9b9b5', H: '#c9a26b', F: '#9c9a95' }[code] || '#c8c8c4';
  return color + (code === 'H' ? '' : '/u') + '~' + encodeURIComponent(s.material);
}
function boardSwatch(key) {
  const b = View3D.boardOf(key);
  if (b.thumb) return '<span class="bsw" style="background:' + b.color + ' url(\'' + esc(b.thumb) + '\') center / cover' + (b.edge !== 'same' ? ';box-shadow:inset -5px 0 0 ' + b.edgeColor : '') + '" aria-hidden="true"></span>';
  const bg = b.grain > 0 ? 'repeating-linear-gradient(172deg, ' + b.color + ' 0 3px, color-mix(in srgb, ' + b.color + ' 78%, #5a3410) 3px 4px, ' + b.color + ' 4px 7px)' : b.color;
  // andere Kanten: rechts ein Streifen in der Kantenfarbe
  const edge = b.edge !== 'same' ? ';box-shadow:inset -5px 0 0 ' + b.edgeColor : '';
  return '<span class="bsw" style="background:' + bg + edge + '" aria-hidden="true"></span>';
}
const boardName = (key) => { const b = View3D.boardOf(key); return b.name + (b.edge !== 'same' ? ' · Kante ' + b.edgeName : ''); };
const boardChip = (key) => boardSwatch(key) + '<span class="bn">' + esc(boardName(key)) + '</span>';
// Auswahlfenster: Oberfläche (Holzarten/Dekore, eigene Farbe mit/ohne Maserung) und Kanten (wie Oberfläche, Spanplatte,
// Multiplex, MDF, Kantenband in Farbe). Jede Wahl gilt sofort; inherit = Schlüssel der Einstellung → „wie Einstellung“
// eigene Farben mit Namen merken (Einstellung customBoards, höchstens 12)
const customBoards = () => (Array.isArray(state.settings.customBoards) ? state.settings.customBoards : []);
function rememberBoard(key) {
  const list = customBoards().filter((k) => k !== key && k.split('~')[1] !== (key.split('~')[1] || null));
  state.settings.customBoards = [key].concat(list).slice(0, 12);
  saveSettings();
}
let pickerClose = null;
function boardPicker(anchor, value, inherit, onPick) {
  if (pickerClose) pickerClose();
  // Knopf kann beim Neuzeichnen der Liste ersetzt werden: über den Selektor wiederfinden
  const anchorSel = anchor.id ? '#' + anchor.id : anchor.dataset.mboard ? '[data-mboard="' + anchor.dataset.mboard + '"]' : null;
  const anchorNow = () => (anchorSel && document.querySelector(anchorSel)) || anchor;
  const b0 = View3D.boardOf(value);
  let surf = String(value || b0.id).split('|')[0];
  let edge = b0.edge;
  const own = /^#/.test(surf);
  const box = document.createElement('div');
  box.className = 'bpick';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Plattenfarbe');
  const decs = View3D.decors();
  box.innerHTML = (decs.length ? '<h5>Dekore (Bibliothek)</h5>' + (decs.length > 12 ? '<input type="search" class="dsearch" placeholder="Dekor suchen …" aria-label="Dekor suchen">' : '') +
      '<div class="grid dgrid">' + decs.map((d) => '<button type="button" data-bkey="dek:' + esc(d.key) + '" data-dq="' + esc((d.code + ' ' + (d.name || '') + ' ' + (d.hersteller || '')).toLowerCase()) +
      '" aria-pressed="' + ('dek:' + d.key === surf) + '">' + boardSwatch('dek:' + d.key) + esc(d.code + (d.name ? ' ' + d.name : '')) + '</button>').join('') + '</div>' : '') +
    '<h5' + (decs.length ? ' class="eh"' : '') + '>Oberfläche</h5><div class="grid">' + View3D.MATERIALS.map((m) => '<button type="button" data-bkey="' + m.id + '" aria-pressed="' + (!own && m.id === b0.id) + '">' +
    boardSwatch(m.id) + esc(m.name) + '</button>').join('') + '</div>' +
    // gespeicherte eigene Farben (mit Namen)
    (customBoards().length ? '<h5 class="eh">Eigene Farben</h5><div class="grid">' + customBoards().map((k) => '<span class="ownk"><button type="button" data-bkey="' + esc(k) +
      '" aria-pressed="' + (k === surf) + '">' + boardSwatch(k) + esc(View3D.boardOf(k).name) + '</button><button type="button" class="del" data-bdel="' + esc(k) +
      '" title="Aus der Liste entfernen" aria-label="' + esc(View3D.boardOf(k).name) + ' entfernen">✕</button></span>').join('') + '</div>' : '') +
    '<div class="own"><input type="color" value="' + b0.color + '" aria-label="Eigene Farbe"><label><input type="checkbox"' + (!own || b0.grain ? ' checked' : '') + '> Maserung</label>' +
    '<input type="text" class="ownname" maxlength="40" placeholder="Name, z. B. Egger U999" aria-label="Name der eigenen Farbe" value="' + (own && b0.name !== 'Eigene Farbe' ? esc(b0.name) : '') + '">' +
    '<button type="button" class="btn small" data-bown aria-pressed="' + own + '" title="Eigene Farbe übernehmen und unter „Eigene Farben“ merken">Übernehmen</button></div>' +
    '<h5 class="eh">Kanten (Schmalflächen)</h5><div class="edges">' + View3D.EDGES.map((e) => '<button type="button" data-bedge="' + e.id + '" aria-pressed="' + (edge === e.id) + '">' +
    (e.color ? '<span class="bsw" style="background:' + e.color + '" aria-hidden="true"></span>' : boardSwatch(surf)) + esc(e.name) + '</button>').join('') +
    '<label class="eband"><input type="color" value="' + (/^#/.test(edge) ? edge : '#3a3a3a') + '" aria-label="Farbe Kantenband"><button type="button" data-bband aria-pressed="' + /^#/.test(edge) + '">Kantenband</button></label></div>' +
    '<div class="foot">' + (inherit ? '<button type="button" class="inh" data-binh>' + boardSwatch(inherit) + 'Wie Einstellung</button>' : '<span></span>') +
    (decorBase ? '<a class="btn ghost small" href="' + esc(decorBase) + '" target="_blank" rel="noopener">Dekore verwalten ↗</a>' : '') +
    '<button type="button" class="btn small" data-bdone>Fertig</button></div>';
  document.body.appendChild(box);
  const ds = box.querySelector('.dsearch');
  if (ds) ds.addEventListener('input', () => { const q = ds.value.trim().toLowerCase(); box.querySelectorAll('[data-dq]').forEach((b2) => { b2.hidden = !!q && !b2.dataset.dq.includes(q); }); });
  const r = anchor.getBoundingClientRect();
  const bw = box.offsetWidth;
  const bh = box.offsetHeight;
  // unter dem Knopf, sonst darüber, sonst daneben (links bzw. rechts) – nie über dem Knopf selbst
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  let left = Math.max(8, Math.min(vw - bw - 8, r.right - bw));
  let top;
  if (r.bottom + 6 + bh <= vh - 8) top = r.bottom + 6;
  else if (r.top - 6 - bh >= 8) top = r.top - 6 - bh;
  else {
    top = Math.max(8, Math.min(vh - bh - 8, r.top + r.height / 2 - bh / 2));
    left = r.left - bw - 8 >= 8 ? r.left - bw - 8 : Math.min(vw - bw - 8, r.right + 8);
  }
  box.style.left = left + 'px';
  box.style.top = top + 'px';
  box.style.maxHeight = (vh - 16) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  const close = () => {
    box.remove();
    anchorNow().setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    clearTimeout(dragTimer);
    pickerClose = null;
  };
  pickerClose = close;
  let dragTimer;
  const outside = (e) => { if (!box.contains(e.target) && !anchorNow().contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); anchorNow().focus(); } };
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', onKey, true); });
  const colorIn = box.querySelector('.own input[type=color]');
  const grainIn = box.querySelector('.own input[type=checkbox]');
  const bandIn = box.querySelector('.eband input[type=color]');
  const mark = () => {
    box.querySelectorAll('[data-bkey]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.bkey === surf)));
    box.querySelector('[data-bown]').setAttribute('aria-pressed', String(/^#/.test(surf)));
    box.querySelectorAll('[data-bedge]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.bedge === edge)));
    box.querySelector('[data-bband]').setAttribute('aria-pressed', String(/^#/.test(edge)));
    const same = box.querySelector('[data-bedge="same"] .bsw');
    if (same) same.outerHTML = boardSwatch(surf);
  };
  const apply = () => { mark(); onPick(View3D.boardKey(surf, edge)); };
  const nameIn = box.querySelector('.ownname');
  const ownKey = () => colorIn.value.toLowerCase() + (grainIn.checked ? '' : '/u') + (nameIn.value.trim() ? '~' + encodeURIComponent(nameIn.value.trim()) : '');
  box.addEventListener('click', (e) => {
    const k = e.target.closest('[data-bkey]');
    if (k) { surf = k.dataset.bkey; apply(); return; }
    if (e.target.closest('[data-bown]')) {
      surf = ownKey();
      rememberBoard(surf);
      apply();
      boardPicker(anchorNow(), View3D.boardKey(surf, edge), inherit, onPick); // neu öffnen: erscheint unter „Eigene Farben“
      return;
    }
    const del = e.target.closest('[data-bdel]');
    if (del) {
      state.settings.customBoards = customBoards().filter((k) => k !== del.dataset.bdel);
      saveSettings();
      boardPicker(anchorNow(), View3D.boardKey(surf, edge), inherit, onPick);
      return;
    }
    const ed = e.target.closest('[data-bedge]');
    if (ed) { edge = ed.dataset.bedge; apply(); return; }
    if (e.target.closest('[data-bband]')) { edge = bandIn.value.toLowerCase(); apply(); return; }
    if (e.target.closest('[data-binh]')) { onPick(null); close(); return; }
    if (e.target.closest('[data-bdone]')) { close(); anchorNow().focus(); }
  });
  // Farbe ziehen: erst nach kurzer Pause neu zeichnen (nicht bei jedem Zwischenwert)
  const soon = () => { clearTimeout(dragTimer); dragTimer = setTimeout(apply, 120); };
  colorIn.addEventListener('input', () => { surf = ownKey(); soon(); });
  grainIn.addEventListener('change', () => { if (/^#/.test(surf)) { surf = ownKey(); apply(); } });
  bandIn.addEventListener('input', () => { edge = bandIn.value.toLowerCase(); soon(); });
  (box.querySelector('[data-bkey][aria-pressed="true"]') || box.querySelector('button')).focus();
  return box;
}
function setBoardDefault(key) {
  state.settings.boardMaterial = key || 'eiche';
  saveSettings();
  applyBoards();
}
// nach jeder Farbänderung: Knöpfe, Möbel 3D, Liste und Teil-Ansicht nachziehen
function applyBoards() {
  const k = state.settings.boardMaterial;
  for (const id of ['set-boardMaterial', 'mboard']) { const e = $(id); if (e) e.innerHTML = boardChip(k); }
  if (mdl.viewer) {
    const m = {};
    const bn = {};
    for (const q of modelParts()) { m[q.num] = boardKeyOf(q.p); bn[q.num] = bandsOf(q.p); }
    mdl.viewer.setBoards(m, bn);
  }
  render();
}
$('mboard').innerHTML = boardChip(state.settings.boardMaterial);
$('mboard').addEventListener('click', (e) => boardPicker(e.currentTarget, state.settings.boardMaterial, null, (key) => setBoardDefault(key)));

// Symbole der Bauteilliste (Strich in Textfarbe): Auge = sichtbar, Auge durchgestrichen = ausgeblendet, Fokus = nur dieses
const ICO = (d) => '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICON_EYE = ICO('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const ICON_EYE_OFF = ICO('<path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>');
const ICON_SOLO = ICO('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="3"/>');
// Nummer des einzigen sichtbaren Bauteils (nur dieses gezeigt), sonst null
function soloNum() {
  const list = modelParts();
  if (list.length < 2) return null;
  const vis = list.filter((x) => !mdl.hidden.has(x.num));
  return vis.length === 1 ? vis[0].num : null;
}
function showAllParts() {
  mdl.hidden.clear();
  if (mdl.viewer) { for (const q of modelParts()) mdl.viewer.setVisible(q.num, true); mdl.viewer.view('iso'); }
  renderModelList();
}
function renderModelList() {
  const t = $('mtable');
  const list = modelParts();
  if (!list.length) { t.innerHTML = '<tr><td class="note">Keine STEP-Bauteile geladen.</td></tr>'; return; }
  t.innerHTML = list.map(({ p, num }) => {
    const r = p.res || p.result;
    const dm = r && r.panel ? fmt(r.panel.L) + ' × ' + fmt(r.panel.W) + ' × ' + fmt(r.panel.T) : '';
    const off = mdl.hidden.has(num);
    const solo = soloNum() === num;
    const nm = esc(p.solid.name);
    return '<tr data-num="' + num + '" class="' + (mdl.sel === num ? 'sel' : '') + (off ? ' off' : '') + '"><td class="no"><span>' + num + '</span></td>' +
      '<td><div class="nm">' + nm + '</div><div class="dm">' + dm + '</div></td>' +
      '<td class="act"><button type="button" class="mbsw' + (p.board ? ' own' : '') + '" data-mboard="' + num + '" aria-pressed="false" title="Plattenfarbe: ' + esc(boardName(boardKeyOf(p))) +
      (p.board ? '' : nameBoard(p) ? ' (aus dem Bauteilnamen)' : ' (wie Einstellung)') + '" aria-label="Plattenfarbe ' + nm + '">' + boardSwatch(boardKeyOf(p)) + '</button><button type="button" data-mvis="' + num + '" aria-pressed="false" title="' + (off ? 'Einblenden' : 'Ausblenden') + '" aria-label="' + nm + (off ? ' einblenden' : ' ausblenden') + '">' +
      (off ? ICON_EYE_OFF : ICON_EYE) + '</button><button type="button" data-monly="' + num + '" aria-pressed="' + solo + '" title="' + (solo ? 'Wieder alle Bauteile zeigen' : 'Nur dieses Bauteil zeigen (heranzoomen)') +
      '" aria-label="' + (solo ? 'Wieder alle zeigen' : 'Nur ' + nm + ' zeigen') + '">' + ICON_SOLO + '</button></td></tr>';
  }).join('');
  const vis = list.filter((x) => !mdl.hidden.has(x.num));
  $('mcount').textContent = mdl.hidden.size ? vis.length + ' von ' + list.length : list.length;
  const sn = soloNum();
  $('mall').hidden = !mdl.hidden.size || !!sn;
  const sp = sn && list.find((x) => x.num === sn);
  $('msolo').hidden = !sp;
  if (sp) $('msolo').innerHTML = '<span>Nur Bauteil <b>' + sn + '</b> · ' + esc(sp.p.solid.name) + '</span><button type="button" class="btn ghost small" data-mshowall>Alle zeigen</button>';
}
async function renderModel() {
  renderModelList();
  const list = modelParts();
  const key = list.map(({ p, num }) => num + ':' + p.solid.name + ':' + p.stepText.length).join('|');
  if (mdl.viewer && mdl.key === key) return;
  if (mdl.loading) { mdl.again = true; return; } // nach dem Laden noch einmal (z. B. Dateien während des ersten Ladens)
  // andere Teile: Ausblenden/Auswahl gelten nicht mehr (Nummern verschoben)
  if (mdl.key !== null && mdl.key !== key) { mdl.hidden.clear(); mdl.sel = null; }
  $('mmsg').hidden = false;
  $('mmsg').textContent = list.length ? '3D-Ansicht wird geladen …' : 'Keine STEP-Bauteile – unter „Programme“ STEP-Dateien laden.';
  if (!list.length) { if (mdl.viewer) mdl.viewer.setParts([]); mdl.key = key; return; }
  mdl.loading = true;
  try {
    const occt = await View3D.load();
    if (!mdl.viewer) {
      mdl.viewer = new Model3D.Viewer($('mhost'), $('mlabelwrap'));
      mdl.viewer.onPick = (num) => { mdl.sel = num; renderModelList(); updateModelHud(); const tr = document.querySelector('#mtable tr[data-num="' + num + '"]'); if (tr) tr.scrollIntoView({ block: 'nearest' }); };
      mdl.viewer.onMeasure = (m) => { mdl.meas = m; updateModelHud(); };
      mdl.viewer.onDims = () => { renderDimList(); saveSession(); };
    }
    mdl.viewer.setTheme(isDarkTheme());
    // je STEP-Datei die Netze von OpenCascade, Zuordnung über den Hüllquader
    const byText = new Map();
    for (const x of list) { if (!byText.has(x.p.stepText)) byText.set(x.p.stepText, []); byText.get(x.p.stepText).push(x); }
    const parts = [];
    for (const [text, xs] of byText) {
      const meshes = meshesOf(occt, text);
      const got = Model3D.assign(meshes, xs.map((x) => solidBox(x.p.solid)));
      xs.forEach((x, k) => parts.push({ num: x.num, name: x.p.solid.name, mesh: got[k], board: boardKeyOf(x.p), bands: bandsOf(x.p) }));
    }
    parts.sort((a, b) => a.num - b.num);
    mdl.viewer.setParts(parts);
    for (const n of mdl.hidden) mdl.viewer.setVisible(n, false);
    mdl.viewer.setOpacity(1 - (+$('mopac').value) / 100);
    mdl.viewer.setLabels($('mlabels').checked);
    mdl.viewer.setExplode((+$('mexpl').value) / 100, true);
    if (mdl.dimsSaved) { mdl.viewer.setDims(mdl.dimsSaved); mdl.dimsSaved = null; }
    mdl.key = key;
    const missing = parts.filter((x) => !x.mesh).length;
    $('mmsg').hidden = !missing;
    $('mmsg').textContent = missing ? missing + ' Bauteil(e) ohne 3D-Netz' : '';
  } catch (e) {
    $('mmsg').hidden = false;
    $('mmsg').textContent = '3D-Ansicht nicht verfügbar: ' + (e.message || e);
  } finally {
    mdl.loading = false;
    if (mdl.again) { mdl.again = false; if (state.page === 'model') renderModel(); }
  }
}
function updateModelHud() {
  const h = $('mhud');
  const m = mdl.meas;
  if (mdl.viewer && mdl.viewer.measuring) {
    const r1 = (v) => fmt(Math.round(v * 10) / 10);
    const fang = 'Fang: □ Endpunkt · ○ Kreismitte · △ Mitte · ✕ Kante · Fläche (Alt = ohne Fang)';
    if (mdl.viewer.mode === 'dim') {
      h.innerHTML = (m && m.first ? 'Bemaßen: zweiten Punkt anklicken' : 'Bemaßen: ersten Punkt anklicken – Maße bleiben stehen') + ' · Richtung ' +
        { aligned: 'direkt', x: 'X', y: 'Y', z: 'Z' }[mdl.viewer.dimAxis] + ' · ' + fang + ' · Entf löscht das letzte · Esc beendet';
      return;
    }
    h.innerHTML = !m ? 'Messen: ersten Punkt anklicken · ' + fang + ' · Esc beendet'
      : m.first ? 'Messen: zweiten Punkt anklicken · ' + fang
        : 'Abstand <b>' + r1(m.dist) + ' mm</b> · ΔX <b>' + r1(m.dx) + '</b> · ΔY <b>' + r1(m.dy) + '</b> · ΔZ <b>' + r1(m.dz) + '</b>' +
          (m.normal !== undefined ? ' · Flächen parallel, senkrechter Abstand <b>' + r1(m.normal) + ' mm</b>' : '') +
          (m.exploded ? ' · Maße wie zusammengebaut' : '') + ' · nächster Klick: neue Messung';
    return;
  }
  const x = mdl.sel ? modelParts().find((q) => q.num === mdl.sel) : null;
  const r = x && (x.p.res || x.p.result);
  h.innerHTML = x ? 'Bauteil <b>' + x.num + '</b> · ' + esc(x.p.solid.name) + (r && r.panel ? ' · <b>' + fmt(r.panel.L) + ' × ' + fmt(r.panel.W) + ' × ' + fmt(r.panel.T) + '</b> mm' : '') +
    ' · <button type="button" class="btn ghost small" id="mtoprog">Im Programm öffnen</button>'
    : 'Linke Maustaste: drehen · rechte Maustaste/Shift: verschieben · Mausrad: zoomen · Klick: Bauteil wählen';
  if ($('mtoprog')) $('mtoprog').addEventListener('click', () => { state.sel = x.num - 1; setPage('pgmx'); render(); });
}
$('mtable').addEventListener('click', (e) => {
  const vis = e.target.closest('[data-mvis]');
  const only = e.target.closest('[data-monly]');
  const bsw = e.target.closest('[data-mboard]');
  const tr = e.target.closest('tr[data-num]');
  if (bsw) {
    const x = modelParts().find((q) => q.num === +bsw.dataset.mboard);
    if (x) boardPicker(bsw, boardKeyOf(x.p), state.settings.boardMaterial, (key) => { x.p.board = key || null; applyBoards(); });
    return;
  }
  if (vis) {
    const n = +vis.dataset.mvis;
    if (mdl.hidden.has(n)) mdl.hidden.delete(n); else mdl.hidden.add(n);
    if (mdl.viewer) mdl.viewer.setVisible(n, !mdl.hidden.has(n));
    renderModelList();
    return;
  }
  if (only) {
    const n = +only.dataset.monly;
    if (soloNum() === n) { showAllParts(); return; }
    mdl.hidden = new Set(modelParts().map((q) => q.num).filter((q) => q !== n));
    if (mdl.viewer) { for (const q of modelParts()) mdl.viewer.setVisible(q.num, q.num === n); mdl.viewer.select(n); mdl.viewer.view('iso', n); }
    renderModelList();
    return;
  }
  if (tr && mdl.viewer) mdl.viewer.select(+tr.dataset.num);
});
$('mtable').addEventListener('dblclick', (e) => {
  const tr = e.target.closest('tr[data-num]');
  if (tr && mdl.viewer) mdl.viewer.view('iso', +tr.dataset.num);
});
$('mall').addEventListener('click', showAllParts);
$('msolo').addEventListener('click', (e) => { if (e.target.closest('[data-mshowall]')) showAllParts(); });
document.querySelectorAll('[data-mview]').forEach((b) => b.addEventListener('click', () => {
  if (!mdl.viewer) return;
  const v = b.dataset.mview;
  mdl.viewer.view(v === 'fit' ? 'iso' : v, v === 'fit' ? mdl.sel : undefined);
}));
$('mopac').addEventListener('input', (e) => {
  $('mopacv').textContent = e.target.value + ' %';
  if (mdl.viewer) mdl.viewer.setOpacity(1 - (+e.target.value) / 100);
});
$('mexpl').addEventListener('input', (e) => {
  $('mexplv').textContent = e.target.value + ' %';
  if (mdl.viewer) mdl.viewer.setExplode((+e.target.value) / 100);
});
// Explosion abspielen: von der aktuellen Stellung ganz auseinander (bzw. zurück, wenn schon über der Hälfte)
let explAnim = null;
$('mexplplay').addEventListener('click', () => {
  if (!mdl.viewer) return;
  if (explAnim) { cancelAnimationFrame(explAnim); explAnim = null; return; }
  const from = +$('mexpl').value;
  const to = from >= 50 ? 0 : 100;
  const t0 = performance.now();
  const dur = reduceMotion ? 1 : 1400;
  const step = (now) => {
    const u = Math.min(1, (now - t0) / dur);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // weich an- und auslaufen
    const v = Math.round(from + (to - from) * e);
    $('mexpl').value = v;
    $('mexplv').textContent = v + ' %';
    mdl.viewer.setExplode((from + (to - from) * e) / 100, true);
    explAnim = u < 1 ? requestAnimationFrame(step) : null;
  };
  explAnim = requestAnimationFrame(step);
});
// Schnittebene
const sec = { axis: '', t: 0.5, flip: false };
const applySec = () => {
  document.querySelectorAll('[data-msec]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.msec === sec.axis)));
  $('msecpos').disabled = !sec.axis;
  $('msecflip').disabled = !sec.axis;
  if (mdl.viewer) mdl.viewer.setSection(sec.axis || null, sec.t, sec.flip);
};
document.querySelectorAll('[data-msec]').forEach((b) => b.addEventListener('click', () => { sec.axis = b.dataset.msec; applySec(); }));
$('msecpos').addEventListener('input', (e) => { sec.t = (+e.target.value) / 100; applySec(); });
$('msecflip').addEventListener('click', () => { sec.flip = !sec.flip; applySec(); });
// Bild speichern / drucken
function modelImage() {
  if (!mdl.viewer) return null;
  try { return mdl.viewer.snapshot().toDataURL('image/png'); } catch (e) { toast('Bild nicht möglich: ' + (e.message || e)); return null; }
}
$('msnap').addEventListener('click', () => {
  const url = modelImage();
  if (!url) return;
  const bin = atob(url.split(',')[1]);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  saveOne('moebel_3d.png', u8, 'image/png');
});
$('mpdf').addEventListener('click', modelPdf);
$('mprint').addEventListener('click', () => {
  if (claudeHost) { printOr(modelPdf, () => {}); return; }
  const url = modelImage();
  if (!url) return;
  const dims = mdl.viewer.dims;
  printA4('<h1>Möbel 3D</h1><p class="meta">' + new Date().toLocaleDateString('de-DE') + '</p><img src="' + url + '" alt="Ansicht des Möbels">' +
    (dims.length ? '<h2 class="ph">Maße</h2><p>' + dims.map((d, i) => (i + 1) + '. ' + (d.axis === 'aligned' ? '' : d.axis.toUpperCase() + ' ') + fmt(Math.round(d.value * 10) / 10) +
      ' mm (Bauteil ' + d.a.num + (d.b.num !== d.a.num ? ' → ' + d.b.num : '') + ')').join(' · ') + '</p>' : '') +
    '<div class="pbreak"></div>' + bomPrintHtml(), true);
});
$('mlabels').addEventListener('change', (e) => { if (mdl.viewer) mdl.viewer.setLabels(e.target.checked); });
$('medges').checked = !!state.settings.modelEdges;
$('medgehl').checked = !!state.settings.modelEdgeHl;
$('medgecol').value = /^#[0-9a-f]{6}$/i.test(state.settings.modelEdgeColor || '') ? state.settings.modelEdgeColor : '#22a34a';
$('medgecol2').value = /^#[0-9a-f]{6}$/i.test(state.settings.modelEdgeColor2 || '') ? state.settings.modelEdgeColor2 : '#e8590c';
const edgeHlUi = () => { $('medgehl').disabled = !$('medges').checked; $('medgecol').disabled = $('medgecol2').disabled = !$('medges').checked || !$('medgehl').checked; };
edgeHlUi();
$('medges').addEventListener('change', (e) => { state.settings.modelEdges = e.target.checked; edgeHlUi(); saveSettings(); applyBoards(); });
$('medgehl').addEventListener('change', (e) => { state.settings.modelEdgeHl = e.target.checked; edgeHlUi(); saveSettings(); applyBoards(); });
$('medgecol').addEventListener('input', (e) => { state.settings.modelEdgeColor = e.target.value; saveSettings(); applyBoards(); });
$('medgecol2').addEventListener('input', (e) => { state.settings.modelEdgeColor2 = e.target.value; saveSettings(); applyBoards(); });
// Messen (vorübergehend) und Bemaßen (Maße bleiben stehen) – höchstens eins von beiden an
function setMeasureMode(mode) {
  if (!mdl.viewer) return;
  mdl.viewer.setMeasuring(!!mode, mode);
  $('mmeasure').setAttribute('aria-pressed', String(mode === 'measure'));
  $('mdim').setAttribute('aria-pressed', String(mode === 'dim'));
  $('mdimaxis').hidden = mode !== 'dim';
  mdl.meas = null;
  updateModelHud();
}
$('mmeasure').addEventListener('click', () => setMeasureMode(mdl.viewer && mdl.viewer.mode === 'measure' ? null : 'measure'));
$('mdim').addEventListener('click', () => setMeasureMode(mdl.viewer && mdl.viewer.mode === 'dim' ? null : 'dim'));
$('mdimaxis').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dimaxis]');
  if (!b || !mdl.viewer) return;
  mdl.viewer.dimAxis = b.dataset.dimaxis;
  $('mdimaxis').querySelectorAll('[data-dimaxis]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  updateModelHud();
});
function renderDimList() {
  const dims = mdl.viewer ? mdl.viewer.dims : [];
  $('mdimclear').hidden = !dims.length;
  $('mdimlist').innerHTML = !dims.length ? '<li class="note">Noch keine Maße – „📐 Bemaßen“ und zwei Punkte anklicken.</li>'
    : dims.map((d, i) => '<li data-dim="' + d.id + '">' + (i + 1) + '. <b>' + (d.axis === 'aligned' ? '' : d.axis.toUpperCase() + ' ') +
      fmt(Math.round(d.value * 10) / 10) + ' mm</b><span>Bauteil ' + d.a.num + (d.b.num !== d.a.num ? ' → ' + d.b.num : '') + '</span>' +
      '<button type="button" data-dimdel="' + d.id + '" title="Maß löschen" aria-label="Maß ' + (i + 1) + ' löschen">✕</button></li>').join('');
}
renderDimList();
$('mdimlist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dimdel]');
  if (b && mdl.viewer) mdl.viewer.removeDim(+b.dataset.dimdel);
});
$('mdimclear').addEventListener('click', () => { if (mdl.viewer) mdl.viewer.clearDims(); });
document.addEventListener('keydown', (e) => {
  if (state.page !== 'model' || !mdl.viewer || !mdl.viewer.measuring) return;
  if (e.key === 'Escape') setMeasureMode(null);
  else if ((e.key === 'Delete' || e.key === 'Backspace') && mdl.viewer.mode === 'dim' && mdl.viewer.dims.length && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
    e.preventDefault();
    mdl.viewer.removeDim(mdl.viewer.dims[mdl.viewer.dims.length - 1].id);
  }
});
