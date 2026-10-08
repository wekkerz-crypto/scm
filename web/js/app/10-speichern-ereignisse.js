/*
 * Weckwop – Speichern und Ereignisse (10-speichern-ereignisse.js)
 * Speichern (.xcs, ZIP mit konvertieren.bat), Meldungen (`toast`), Datei ablegen/wählen, Reihenfolge-Regel, Werkzeugdatei.
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 13) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

// ------------------------------------------------ Speichern
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function zip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let off = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const used = new Set();
  for (const f of files) {
    let name = f.name;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = f.name.replace(/(\.xcs)?$/i, '_' + i + '$1');
    used.add(name.toLowerCase());
    const nb = enc.encode(name);
    const data = f.data instanceof Uint8Array ? f.data : enc.encode(f.text); // Text oder schon fertige Bytes (PDF)
    const crc = CRC(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    chunks.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob(chunks.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
}

// Im claude.ai-Artifact nur über die downloads-Fähigkeit (ZIP), sonst direkter Download.
let downloadsCap;
const claudeHost = !!(window.claude && window.claude.use);
if (claudeHost) window.claude.use('downloads').then((d) => { downloadsCap = d; }, () => { downloadsCap = null; });

// Jede ZIP bekommt die konvertieren.bat für den X-Konverter dazu.
const withBatch = (files) => files.concat([{ name: 'konvertieren.bat', text: StepToXcs.makeBatch(state.settings) }]);

async function saveFiles(files, zipName, forceZip) {
  if (claudeHost) {
    if (!downloadsCap) { toast('Speichern ist hier nicht verfügbar – bitte „Kopieren“ verwenden.'); return; }
    try {
      await downloadsCap.save({ filename: zipName, data: zip(withBatch(files)) });
      toast('Gespeichert: ' + zipName);
    } catch (e) {
      if (e && e.code !== 'declined') toast('Speichern nicht möglich (' + (e.code || 'Fehler') + ').');
    }
    return;
  }
  const single = files.length === 1 && !forceZip;
  const blob = single ? new Blob([files[0].text], { type: 'text/plain' }) : zip(withBatch(files));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = single ? files[0].name : zipName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function downloadAll() {
  const files = state.parts.flatMap(partFiles);
  if (!files.length) { toast('Keine Programme vorhanden.'); return; }
  saveFiles(files, 'xcs-programme.zip', true);
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ------------------------------------------------ Ereignisse
$('file').addEventListener('change', (e) => { loadFiles(e.target.files); e.target.value = ''; });
const over = $('dropover');
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
// Material-Seite: Bilder werden zu Dekoren (Feld „Dekor-Bilder hierher ziehen“), STEP/DXF wie sonst
const isImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);
['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { if (!hasFiles(e)) return; e.preventDefault(); if (state.page !== 'material' && state.page !== 'drawings') over.hidden = false; }));
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) over.hidden = true; });
document.addEventListener('drop', (e) => { e.preventDefault(); over.hidden = true; });
document.addEventListener('drop', (e) => {
  if (!e.dataTransfer || !e.dataTransfer.files.length) return;
  let fs = Array.from(e.dataTransfer.files);
  // PDF (überall) und auf der Seite „Zeichnungen“ auch Bilder → Zeichnungen zum Projekt
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  const toDrw = fs.filter((f) => isPdf(f) || (state.page === 'drawings' && isImg(f)));
  if (toDrw.length) { addDrawingFiles(toDrw); fs = fs.filter((f) => !toDrw.includes(f)); }
  if (!fs.length) return;
  if (state.page === 'material' && fs.some(isImg)) { addDecorFiles(fs.filter(isImg)); if (fs.some((f) => !isImg(f))) loadFiles(fs.filter((f) => !isImg(f))); return; }
  loadFiles(fs);
});
$('reset').addEventListener('click', () => {
  if (!confirm('Alle Werkzeuge & Regeln auf Standard zurücksetzen?\n(Eigene Farben, Etikett-Layout und Werkstück-Profile bleiben.)')) return;
  const keep = { customBoards: state.settings.customBoards, labelLayout: state.settings.labelLayout, profiles: state.settings.profiles };
  state.settings = Object.assign({}, XcsWriter.DEFAULTS, { orderRule: { on: true, seq: XcsWriter.DEFAULTS.orderRule.seq.slice() },
    profiles: keep.profiles || JSON.parse(JSON.stringify(XcsWriter.DEFAULTS.profiles)) });
  if (keep.customBoards) state.settings.customBoards = keep.customBoards;
  if (keep.labelLayout) state.settings.labelLayout = keep.labelLayout;
  saveSettings(); renderSettings(); renderRule(); renderProfileEditor(); state.parts.forEach(compute); applyBoards();
});

$('ruleon').addEventListener('change', (e) => {
  const rule = state.settings.orderRule || XcsWriter.DEFAULTS.orderRule;
  setRule({ on: e.target.checked, seq: XcsWriter.ruleSequence(rule) });
});
$('ruledefault').addEventListener('click', () => {
  const rule = state.settings.orderRule || XcsWriter.DEFAULTS.orderRule;
  setRule({ on: rule.on, seq: XcsWriter.DEFAULTS.orderRule.seq.slice() });
});
$('rulelist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rule]');
  if (!b) return;
  const rule = state.settings.orderRule || XcsWriter.DEFAULTS.orderRule;
  const seq = XcsWriter.ruleSequence(rule);
  const i = seq.indexOf(b.dataset.rule);
  const j = i + Number(b.dataset.dir);
  if (j < 0 || j >= seq.length) return;
  [seq[i], seq[j]] = [seq[j], seq[i]];
  setRule({ on: rule.on, seq: seq });
  const again = document.querySelector('[data-rule="' + b.dataset.rule + '"][data-dir="' + b.dataset.dir + '"]');
  if (again && !again.disabled) again.focus();
});
// Reihenfolge-Regel: Zeile mit der Maus (oder am Griff ⠿, auch per Finger) packen und an die richtige Stelle ziehen
$('rulelist').addEventListener('pointerdown', (e) => {
  const row = e.target.closest('li.rrow');
  if (!row || e.button > 0 || e.target.closest('button')) return;
  if (e.pointerType !== 'mouse' && !e.target.closest('[data-rgrip]')) return; // Touch: nur am Griff, sonst scrollt die Seite
  e.preventDefault();
  const ol = $('rulelist');
  const rows = Array.from(ol.querySelectorAll('li.rrow'));
  const from = rows.indexOf(row);
  const line = $('ruledrop');
  const ghost = document.createElement('div');
  ghost.className = 'dragghost';
  ghost.textContent = row.querySelector('.nm').textContent;
  document.body.appendChild(ghost);
  row.classList.add('lifted');
  document.body.classList.add('dragging-step');
  let target = from;
  let moved = false;
  const place = (y) => {
    target = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { target = i; break; }
    }
    const or = ol.getBoundingClientRect();
    const gap = 4;
    const ref = target < rows.length ? rows[target].getBoundingClientRect().top - gap / 2 : rows[rows.length - 1].getBoundingClientRect().bottom + gap / 2;
    line.style.top = (ref - or.top) + 'px';
    line.hidden = target === from || target === from + 1;
  };
  const move = (ev) => {
    if (Math.abs(ev.clientY - e.clientY) > 3) moved = true;
    ghost.style.left = (ev.clientX + 14) + 'px';
    ghost.style.top = (ev.clientY + 10) + 'px';
    ghost.hidden = !moved;
    place(ev.clientY);
  };
  const end = (cancel) => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancelDrag);
    document.removeEventListener('keydown', key);
    ghost.remove();
    line.hidden = true;
    row.classList.remove('lifted');
    document.body.classList.remove('dragging-step');
    if (cancel || !moved || target === from || target === from + 1) return;
    const rule = state.settings.orderRule || XcsWriter.DEFAULTS.orderRule;
    const seq = XcsWriter.ruleSequence(rule);
    const [c] = seq.splice(from, 1);
    seq.splice(target > from ? target - 1 : target, 0, c);
    setRule({ on: rule.on, seq: seq });
    toast('Reihenfolge-Regel geändert.');
  };
  const up = () => end(false);
  const cancelDrag = () => end(true);
  const key = (ev) => { if (ev.key === 'Escape') end(true); };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancelDrag);
  document.addEventListener('keydown', key);
  move(e);
});
$('toolgrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fav]');
  if (!b) return;
  const n = b.dataset.fav;
  state.favorites = state.favorites.includes(n) ? state.favorites.filter((x) => x !== n) : state.favorites.concat([n]);
  storeJson(FAV_KEY, state.favorites);
  renderToolLib(); renderSettings(); renderDetail();
});
$('loadtools').addEventListener('click', () => $('tlgx').click());
$('tlgx').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const tools = ToolLibrary.parseTlgx(await f.text());
  if (!tools.length) { toast('In dieser Datei wurden keine Werkzeuge gefunden.'); return; }
  state.tools = tools;
  state.toolSource = f.name;
  storeJson(TOOLS_KEY, { tools: tools, source: f.name });
  state.parts.forEach(compute);
  renderToolLib(); renderSettings(); render();
  toast(tools.length + ' Werkzeuge geladen.');
});
$('resettools').addEventListener('click', () => {
  state.tools = window.DEFAULT_TOOLS || [];
  state.toolSource = 'def.tlgx (Standard)';
  storeJson(TOOLS_KEY, null);
  state.parts.forEach(compute);
  renderToolLib(); renderSettings(); render();
});
