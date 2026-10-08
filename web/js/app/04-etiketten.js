/*
 * Weckwop – Etiketten (04-etiketten.js)
 * Etiketten drucken (40 × 60 mm …), Etiketten-Konfigurator (Seite „Etiketten“), Druck nur von #printarea.
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 13) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

// ------------------------------------------------ Etiketten (Druck über den Browser, z. B. 40 × 60 mm)
const ICON_ZIP = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m-3.5-3.5L8 10l3.5-3.5M2.5 11.5v2h11v-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_TRASH = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4m-6 0 .7 9.5h6.6L12 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_PRINT = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6V1.5h8V6M4 12H2.5A1 1 0 0 1 1.5 11V7a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H12" ' +
  'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><rect x="4" y="9.5" width="8" height="5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const n1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
// Draufsicht in mm (w × h), schwarz-weiß für Thermodrucker: Kontur, Durchbrüche, Taschen, Bohrungen, Nullpunkt, Länge und Breite
// dims = { L, W }: andere Zahlen an der Bemaßung (Zuschnittmaß), Zeichnung bleibt das Teil
function labelSketch(p, w, h, edges, dims) {
  const fs = 2.3;
  // Platz für die Maße: an Seiten mit Kantenband (vorne L1, links B1) etwas mehr
  const gl = edges && edges.b1 ? 1 : 0;
  const gb = edges && edges.l1 ? 1 : 0;
  const ml = 4 + gl;
  const mb = 4 + gb;
  const k = Math.min((w - ml - 0.6) / p.L, (h - mb - 0.6) / p.W);
  const dw = p.L * k;
  const dh = p.W * k;
  const ox = ml + (w - ml - 0.6 - dw) / 2;
  const oy = 0.6 + (h - mb - 0.6 - dh) / 2;
  const X = (x) => +(ox + x * k).toFixed(3);
  const Y = (y) => +(oy + (p.W - y) * k).toFixed(3);
  const loop = (segs) => {
    const pts = [];
    for (const q of segs) for (const t of PanelAnalyzer.segPoints(q)) pts.push(t);
    return 'M' + pts.map((t) => X(t[0]) + ' ' + Y(t[1])).join(' L') + ' Z';
  };
  let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + 'mm" height="' + h + 'mm" aria-hidden="true">';
  s += '<path d="' + loop(p.outline) + '" fill="#fff" stroke="#000" stroke-width="0.3" stroke-linejoin="round"/>';
  for (const c of p.cutouts) s += '<path d="' + loop(c) + '" fill="#000" fill-opacity="0.45" stroke="#000" stroke-width="0.2"/>';
  for (const g of p.grooves || []) {
    const r = g.dir === 'X' ? [0, g.from, p.L, g.to] : [g.from, 0, g.to, p.W];
    s += '<rect x="' + X(r[0]) + '" y="' + Y(r[3]) + '" width="' + (X(r[2]) - X(r[0])) + '" height="' + (Y(r[1]) - Y(r[3])) + '" fill="none" stroke="#000" stroke-width="0.18" stroke-dasharray="0.6 0.4"/>';
  }
  for (const k2 of p.pockets) s += '<path d="' + loop(k2.segs) + '" fill="#000" fill-opacity="0.15" stroke="#000" stroke-width="0.18" stroke-dasharray="0.6 0.4"/>';
  for (const d of p.drills) {
    if (d.face !== 'Top') {
      // Kantenbohrung: kurzer Strich von der Kante nach innen
      const v = { Left: [1, 0], Right: [-1, 0], Front: [0, 1], Back: [0, -1] }[d.face];
      if (!v) continue;
      const len = Math.max(0.9, d.depth * k);
      s += '<path d="M' + X(d.x) + ' ' + Y(d.y) + ' L' + (X(d.x) + v[0] * len).toFixed(3) + ' ' + (Y(d.y) - v[1] * len).toFixed(3) + '" stroke="#000" stroke-width="0.4"/>';
      continue;
    }
    s += '<circle cx="' + X(d.x) + '" cy="' + Y(d.y) + '" r="' + Math.max(0.3, (d.d / 2) * k).toFixed(3) + '" fill="#000"' + (d.through ? '' : ' fill-opacity="0.6"') + '/>';
  }
  // Kantenband: Strich außen an der Seite – Dekor 1 durchgezogen, Dekor 2 gestrichelt
  if (edges) {
    const o2 = 0.75;
    const side = { l1: [0, 0, p.L, 0, 0, o2], l2: [0, p.W, p.L, p.W, 0, -o2], b1: [0, 0, 0, p.W, -o2, 0], b2: [p.L, 0, p.L, p.W, o2, 0] };
    for (const [k] of EDGE_SIDES) {
      if (!edges[k]) continue;
      const q = side[k];
      s += '<path d="M' + (X(q[0]) + q[4]).toFixed(3) + ' ' + (Y(q[1]) + q[5]).toFixed(3) + ' L' + (X(q[2]) + q[4]).toFixed(3) + ' ' + (Y(q[3]) + q[5]).toFixed(3) +
        '" stroke="#000" stroke-width="1.1" stroke-linecap="butt"' + (edges[k] === 2 ? ' stroke-dasharray="1.4 0.8"' : '') + '/>';
    }
  }
  // Nullpunkt vorne links
  s += '<circle cx="' + X(0) + '" cy="' + Y(0) + '" r="0.7" fill="#fff" stroke="#000" stroke-width="0.3"/>';
  // Bemaßung: Länge unten, Breite links
  const yb = Y(0) + 1.6 + gb;
  const xl = X(0) - 1.6 - gl;
  const tick = (x, y) => '<path d="M' + (x - 0.5) + ' ' + (y + 0.5) + ' L' + (x + 0.5) + ' ' + (y - 0.5) + '" stroke="#000" stroke-width="0.22"/>';
  s += '<path d="M' + X(0) + ' ' + yb + ' H' + X(p.L) + ' M' + X(0) + ' ' + (Y(0) + 0.3) + ' V' + (yb + 0.5) + ' M' + X(p.L) + ' ' + (Y(0) + 0.3) + ' V' + (yb + 0.5) +
    ' M' + xl + ' ' + Y(0) + ' V' + Y(p.W) + ' M' + (X(0) - 0.3) + ' ' + Y(0) + ' H' + (xl - 0.5) + ' M' + (X(0) - 0.3) + ' ' + Y(p.W) + ' H' + (xl - 0.5) + '" stroke="#000" stroke-width="0.15" fill="none"/>';
  s += tick(X(0), yb) + tick(X(p.L), yb) + tick(xl, Y(0)) + tick(xl, Y(p.W));
  const tx = (x, y, t, rot) => '<text x="' + x + '" y="' + y + '" font-size="' + fs + '" font-weight="600" text-anchor="middle" dominant-baseline="' + (rot ? 'auto' : 'hanging') + '"' +
    (rot ? ' transform="rotate(-90 ' + x + ' ' + y + ')"' : '') + ' paint-order="stroke" stroke="#fff" stroke-width="0.6">' + t + '</text>';
  // Fertigmaß (aus dem Modell) bzw. Zuschnittmaß – nur die Zahl
  s += tx((X(0) + X(p.L)) / 2, yb + 0.35, n1(dims ? dims.L : p.L));
  s += tx(xl - 0.35, (Y(0) + Y(p.W)) / 2, n1(dims ? dims.W : p.W), true);
  return s + '</svg>';
}
/*
 * Etikett (schwarz-weiß für Thermodrucker): schwarzer Kopf mit Bauteil-Nr. und Material, Name, Maße groß, Hinweis bei
 * zweiseitiger Bearbeitung (wenden) bzw. Bearbeitung von unten ohne Programm, Draufsicht mit Kantenband, Kanten-Legende
 * (━ Dekor 1, ┅ Dekor 2 mit Seiten), Fußzeile (Datum, Profil, Anzahl Bearbeitungen, Zusatzzeile).
 */
let lblNums = null;
const labelNums = () => { const m = new Map(); for (const row of bomRows()) for (const q of row.parts) m.set(q, row); return m; };
// Werte für ein eigenes Etikett (LabelLayout): Felder, Draufsicht, Kanten-Legende, Hinweis Seiten
function labelData(part) {
  const r = part.res;
  const p = r.panel;
  const cfg = state.settings;
  const row = lblNums && lblNums.get(part);
  const board = boardKeyOf(part);
  const edges = edgesOf(part);
  const c = counts(r);
  if (r.side2) { const c2 = counts(r.side2); c.drills += c2.drills; c.mill += c2.mill; c.saw += c2.saw; }
  const d = new Date();
  const byDeco = new Map();
  for (const [k, t] of EDGE_SIDES) if (edges[k]) { if (!byDeco.has(edges[k])) byDeco.set(edges[k], []); byDeco.get(edges[k]).push(t); }
  const edgeList = Array.from(byDeco.keys()).sort().map((v) => ({ name: decoName(v, board), sides: byDeco.get(v).length === 4 ? 'ringsum' : byDeco.get(v).join(' '), dash: v === 2 }));
  const tm = row ? row.time : partTime(part);
  return {
    nr: row ? row.nums[0] : state.parts.indexOf(part) + 1,
    name: part.fileName.replace(/\.xcs$/i, ''),
    datei: part.fileName,
    masse: n1(p.L) + ' × ' + n1(p.W) + ' × ' + n1(p.T), L: n1(p.L), B: n1(p.W), D: n1(p.T),
    material: View3D.boardOf(board).name,
    kanten: edgeText(edges),
    kantentext: edgeList.map((q) => q.name + ': ' + q.sides).join(' · '),
    zuschnitt: ((z) => n1(z.L) + ' × ' + n1(z.W))(cutDimsOf(part)),
    anzahl: row ? row.qty : qtyOf(part),
    seiten: r.side2 ? '2-seitig' : '',
    bearbeitung: [[c.drills, 'Bohrung', 'Bohrungen'], [c.mill, 'Fräsung', 'Fräsungen'], [c.saw, 'Sägeschnitt', 'Sägeschnitte']]
      .filter((x) => x[0]).map((x) => x[0] + ' ' + (x[0] === 1 ? x[1] : x[2])).join(' · '),
    zeit: tm ? Toolpath.fmtTime(tm.total) : '',
    profil: part.profile !== null && part.profile !== undefined ? profName(part.profile) : '',
    datum: String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getFullYear()).slice(2),
    auftrag: cfg.labelExtra || '',
    sketch: (w, h, dm) => labelSketch(p, w, h, edges, (dm || cfg.labelSketchDims) === 'zuschnitt' ? cutDimsOf(part) : null),
    edgeList: edgeList,
    two: r.side2 ? 'two' : r.canTwoSided ? 'warn' : '',
  };
}
// Etikett-Größe: Etikett (W × H) und Inhalt in Leserichtung (cw × ch; gedreht = vertauscht)
function labelDims() {
  const cfg = state.settings;
  const LW = cfg.labelWidth > 0 ? +cfg.labelWidth : 40;
  const LH = cfg.labelHeight > 0 ? +cfg.labelHeight : 60;
  const rot = !!cfg.labelRotate;
  return { LW: LW, LH: LH, rot: rot, cw: rot ? LH : LW, ch: rot ? LW : LH };
}
function labelHtml(part) {
  const lay = state.settings.labelLayout;
  if (lay && Array.isArray(lay.items)) {
    // eigenes Layout aus dem Etiketten-Konfigurator
    const D = labelDims();
    return '<div class="lbl" style="width:' + D.LW + 'mm;height:' + D.LH + 'mm"><div class="lin free" style="width:' + D.cw + 'mm;height:' + D.ch + 'mm;' +
      (D.rot ? 'transform:translate(' + D.LW + 'mm,0) rotate(90deg);' : '') + '">' + LabelLayout.render(lay, labelData(part), D.cw, D.ch) + '</div></div>';
  }
  const r = part.res;
  const p = r.panel;
  const cfg = state.settings;
  const LW = cfg.labelWidth > 0 ? +cfg.labelWidth : 40;
  const LH = cfg.labelHeight > 0 ? +cfg.labelHeight : 60;
  const rot = !!cfg.labelRotate;
  const cw = rot ? LH : LW; // Inhalt in Leserichtung
  const ch = rot ? LW : LH;
  const pad = 1.6;
  const name = part.fileName.replace(/\.xcs$/i, '');
  // Nr. wie im Zuschnittplan (erste Nummer der Stücklisten-Position – gleiche Teile tragen dieselbe)
  const no = (lblNums && lblNums.get(part) && lblNums.get(part).nums[0]) || state.parts.indexOf(part) + 1;
  const board = boardKeyOf(part);
  const c = counts(r);
  if (r.side2) { const c2 = counts(r.side2); c.drills += c2.drills; c.mill += c2.mill; c.saw += c2.saw; }
  const cnt = [[c.drills, 'Bohrung', 'Bohrungen'], [c.mill, 'Fräsung', 'Fräsungen'], [c.saw, 'Sägeschnitt', 'Sägeschnitte']]
    .filter((x) => x[0]).map((x) => x[0] + ' ' + (x[0] === 1 ? x[1] : x[2])).join(' · ');
  const d = new Date();
  const date = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getFullYear()).slice(2);
  const edges = edgesOf(part);
  const wide = cw >= ch * 1.25; // quer: Text links, Draufsicht rechts
  const tw = wide ? cw * 0.5 : cw - 2 * pad; // Breite der Textspalte
  // Name in einer Zeile, so groß wie es passt; nur sehr lange Namen umbrechen
  const nameSize = Math.max(2.2, Math.min(3.4, tw / (Math.max(6, name.length) * 0.7)));
  const dims = n1(p.L) + ' × ' + n1(p.W) + ' × ' + n1(p.T);
  const dimSize = Math.max(2.4, Math.min(4.2, tw / (dims.length * 0.66)));
  // Hinweis Seiten: zweiseitig = wenden; Bearbeitung von unten ohne Programm = Achtung
  const two = r.side2 ? '<div class="two" title="Seite 1 bearbeiten, wenden, Seite 2">⇅ 2-SEITIG · WENDEN</div>'
    : r.canTwoSided ? '<div class="two warn" title="Bearbeitungen von unten sind nicht im Programm">! Unterseite beachten</div>' : '';
  // Kanten-Legende je Dekor mit Seiten
  const byDeco = new Map();
  for (const [k, t] of EDGE_SIDES) if (edges[k]) { if (!byDeco.has(edges[k])) byDeco.set(edges[k], []); byDeco.get(edges[k]).push(t); }
  const all4 = (v) => byDeco.get(v).length === 4;
  const eg = byDeco.size ? '<div class="eg">' + Array.from(byDeco.keys()).sort().map((v) => '<span><svg viewBox="0 0 6 2" width="4.2mm" height="1.4mm" aria-hidden="true">' +
    '<path d="M0 1 H6" stroke="#000" stroke-width="1.3"' + (v === 2 ? ' stroke-dasharray="1.4 0.8"' : '') + '/></svg>' +
    esc(decoName(v, board)) + ' <b>' + (all4(v) ? 'ringsum' : byDeco.get(v).join(' ')) + '</b></span>').join('') + '</div>'
    : '<div class="eg none">ohne Kante</div>';
  const foot = [date, part.profile !== null && part.profile !== undefined ? profName(part.profile) : '', cnt].filter(Boolean).join(' · ');
  const head = '<div class="hd" style="margin:' + -pad + 'mm ' + -pad + 'mm 0;padding:0.7mm ' + pad + 'mm"><span class="no">' + no + '</span>' +
    '<span class="mt">' + esc(View3D.boardOf(board).name) + '</span></div>';
  const text = '<div class="ln nm' + (nameSize <= 2.2 ? ' nmw' : '') + '" style="font-size:' + nameSize.toFixed(2) + 'mm">' + esc(name) + '</div>' +
    '<div class="ln dm" style="font-size:' + dimSize.toFixed(2) + 'mm">' + dims + '</div>' + two;
  const tail = eg + (cfg.labelExtra ? '<div class="ln in">' + esc(cfg.labelExtra) + '</div>' : '') + '<div class="ln ft">' + esc(foot) + '</div>';
  // Höhe der Textzeilen (mm) für die Draufsicht darunter
  const lines = 6.2 + nameSize * 1.25 + dimSize * 1.2 + (two ? 4.4 : 0) + 3.4 * Math.max(1, byDeco.size) + (cfg.labelExtra ? 3 : 0) + 2.8 + 4 * 0.7;
  let sketch = '';
  if (cfg.labelSketch !== false) {
    const sw = wide ? cw - tw - 3 * pad : cw - 2 * pad;
    const sh = wide ? ch - 2 * pad - 6.2 : ch - 2 * pad - lines;
    if (sw > 8 && sh > 8) sketch = '<div class="sk">' + labelSketch(p, +sw.toFixed(2), +sh.toFixed(2), edges, cfg.labelSketchDims === 'zuschnitt' ? cutDimsOf(part) : null) + '</div>';
  }
  return '<div class="lbl" style="width:' + LW + 'mm;height:' + LH + 'mm"><div class="lin' + (wide ? ' wide' : '') + '" style="width:' + cw + 'mm;height:' + ch + 'mm;padding:' + pad + 'mm;' +
    (rot ? 'transform:translate(' + LW + 'mm,0) rotate(90deg);' : '') + '">' +
    (wide ? head + '<div class="wrow"><div class="tx" style="width:' + tw + 'mm">' + text + tail + '</div>' + sketch + '</div>' : head + '<div class="tx">' + text + '</div>' + sketch + '<div class="tx">' + tail + '</div>') + '</div></div>';
}
// Vorschau mit Druckknopf; gedruckt wird nur der Etikettenbereich (@page = Etikettgröße, ohne Rand)
function openLabels(parts) {
  const list = parts.filter((x) => x.res && x.res.panel);
  if (!list.length) { toast('Keine Teile mit Programm zum Beschriften.'); return; }
  let dlg = $('labeldlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'labeldlg';
    dlg.className = 'labeldlg';
    document.body.appendChild(dlg);
  }
  const cfg = state.settings;
  dlg.innerHTML = '<h3>' + (list.length === 1 ? 'Etikett' : list.length + ' Etiketten') + ' · ' + labelDims().LW + ' × ' + labelDims().LH + ' mm</h3>' +
    '<div class="lprev">' + ((lblNums = labelNums()), list.map(labelHtml).join('')) + '</div>' +
    '<p class="note">Im Druckdialog den Etikettendrucker wählen, Papiergröße ' + esc(String(cfg.labelWidth)) + ' × ' + esc(String(cfg.labelHeight)) +
    ' mm, Ränder „Keine“, Skalierung 100 %. Größe und Drehung unter <i>Werkzeuge &amp; Regeln → Etiketten</i>.</p>' +
    '<div class="row"><button class="btn ghost" type="button" id="lrot">Inhalt drehen: ' + (cfg.labelRotate ? 'an' : 'aus') + '</button>' +
    '<button class="btn ghost" type="button" id="ldes" title="Etikett selbst gestalten: Elemente, Felder, Schrift, Lage">✎ Gestalten …</button>' +
    '<span class="sp"></span><button class="btn ghost" type="button" id="lclose">Schließen</button><button class="btn primary" type="button" id="lprint">' + ICON_PRINT + ' Drucken</button></div>';
  if (!dlg.open) dlg.showModal();
  $('lclose').addEventListener('click', () => dlg.close());
  $('ldes').addEventListener('click', () => { dlg.close(); openLabelDesigner(list[0]); });
  $('lrot').addEventListener('click', () => {
    state.settings.labelRotate = !state.settings.labelRotate;
    saveSettings();
    const cb = $('set-labelRotate');
    if (cb) cb.checked = state.settings.labelRotate;
    openLabels(parts);
  });
  $('lprint').addEventListener('click', () => { dlg.close(); printLabels(list); });
}
/*
 * Etiketten-Konfigurator: eigenes Layout (state.settings.labelLayout = { w, h, items }, LabelLayout) frei gestalten –
 * Elemente ziehen (Raster 0,5 mm, Alt = frei), Größe am Griff unten rechts, Pfeiltasten verschieben, Entf löscht;
 * rechts Elemente hinzufügen, Liste (Reihenfolge = Ebenen) und Eigenschaften. Jede Änderung wird gleich gespeichert.
 */
let ld = null; // { lay, own, sel, part, zoom, print: Map(Teil → { on, n }) }
const LD_TYPES = { text: 'Text', two: 'Hinweis 2-seitig', sketch: 'Draufsicht', edges: 'Kanten-Legende', barcode: 'Strichcode', box: 'Linie / Rahmen' };
const ldParts = () => state.parts.filter((x) => x.res && x.res.panel);
// Stand des Konfigurators (beim ersten Öffnen bzw. nach geänderter Größe / Einstellung neu)
function ldInit() {
  const D = labelDims();
  const parts = ldParts();
  const own = state.settings.labelLayout && Array.isArray(state.settings.labelLayout.items);
  if (!ld) {
    ld = { lay: null, own: false, sel: null, part: null, print: new Map(),
      zoom: Math.max(4, Math.min(12, Math.round(Math.min((window.innerHeight * 0.6) / D.ch, (window.innerWidth * 0.3) / D.cw)))) };
    document.addEventListener('keydown', ldKey); // Pfeiltasten / Entf auf der Seite
  }
  // ld.base = gespeicherte Fassung (bzw. Vorlage), ld.lay = auf die aktuelle Größe gebracht – immer von base aus skalieren,
  // sonst schrumpft die Schrift bei jedem Größenwechsel weiter
  const stored = own ? JSON.stringify(state.settings.labelLayout) : null;
  if (!ld.lay || ld.own !== !!own || (own && stored !== ld.baseJson)) {
    ld.base = own ? JSON.parse(stored) : LabelLayout.layoutOf('standard', D.cw, D.ch);
    ld.baseJson = stored;
    ld.own = !!own;
    ld.lay = null;
  }
  if (!ld.lay || ld.lay.w !== D.cw || ld.lay.h !== D.ch) ld.lay = JSON.parse(JSON.stringify(LabelLayout.scaled(ld.base, D.cw, D.ch)));
  if (!parts.includes(ld.part)) ld.part = parts.includes(state.parts[state.sel]) ? state.parts[state.sel] : parts[0] || null;
  lblNums = labelNums();
}
// Etiketten-Seite öffnen (aus der Vorschau oder den Einstellungen), optional mit einem Teil als Vorschau
function openLabelDesigner(part) {
  ldInit();
  if (part && ldParts().includes(part)) ld.part = part;
  setPage('labels');
  window.scrollTo({ top: $('lblpage').offsetTop - 12, behavior: 'smooth' });
}
// Layout speichern (eigenes Layout ab der ersten Änderung)
function ldSave() {
  ld.own = true;
  state.settings.labelLayout = JSON.parse(JSON.stringify(ld.lay));
  ld.base = JSON.parse(JSON.stringify(ld.lay));
  ld.baseJson = JSON.stringify(state.settings.labelLayout);
  saveSettings();
  const st = $('ldstate');
  if (st) st.textContent = 'eigenes Layout';
}
const ldItem = () => ld && ld.lay.items.find((e) => e.id === ld.sel);
const snapMm = (v, free) => (free ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2);
function ldStageHtml() {
  const D = labelDims();
  const data = labelData(ld.part);
  if (!data.two) data.two = 'two'; // Hinweis im Editor immer zeigen
  const lay = { w: ld.lay.w, h: ld.lay.h, items: ld.lay.items };
  return '<div class="ldlabel" id="ldlabel" style="width:' + D.cw + 'mm;height:' + D.ch + 'mm;zoom:' + (ld.zoom / 3.7795).toFixed(4) + '">' +
    LabelLayout.render(lay, data, D.cw, D.ch, { edit: true }) + '</div>';
}
function ldInspector() {
  const e = ldItem();
  const fieldOpts = LabelLayout.FIELDS.map(([k, t]) => '<option value="' + k + '">{' + k + '} – ' + esc(t) + '</option>').join('');
  let h = '<div class="ldadd"><h4>Hinzufügen</h4><div class="ldbtns">' +
    '<button type="button" class="btn small" data-ldadd="text">Text</button>' +
    '<select id="ldfield" aria-label="Feld als Text hinzufügen"><option value="">Feld …</option>' + fieldOpts + '</select>' +
    '<button type="button" class="btn small" data-ldadd="sketch">Draufsicht Fertigmaß</button><button type="button" class="btn small" data-ldadd="sketchcut">Draufsicht Zuschnitt</button>' +
    '<button type="button" class="btn small" data-ldadd="edges">Kanten</button>' +
    '<button type="button" class="btn small" data-ldadd="two">Hinweis 2-seitig</button><button type="button" class="btn small" data-ldadd="barcode">Strichcode</button>' +
    '<button type="button" class="btn small" data-ldadd="line">Linie</button><button type="button" class="btn small" data-ldadd="box">Rahmen</button></div></div>';
  h += '<div class="ldlist"><h4>Elemente <small>(unten = vorne)</small></h4><ol>' + ld.lay.items.map((x) => '<li><button type="button" data-ldsel="' + esc(x.id) + '"' +
    (x.id === ld.sel ? ' aria-current="true"' : '') + '><b>' + esc(LD_TYPES[x.type] || x.type) + '</b> ' +
    esc(x.type === 'sketch' ? (x.dims === 'zuschnitt' ? 'Zuschnittmaß' : 'Fertigmaß') : String(x.text || '').slice(0, 28)) + '</button></li>').join('') + '</ol></div>';
  if (!e) return h + '<p class="note">Element anklicken (in der Vorschau oder in der Liste), um es zu ändern. Ziehen verschiebt, der Griff unten rechts ändert die Größe; Pfeiltasten ±0,5 mm (mit Umschalt ±2 mm), Entf löscht.</p>';
  const num = (k, label, step) => '<label><span>' + label + '</span><input type="number" step="' + (step || 0.5) + '" data-ldp="' + k + '" value="' + esc(e[k] === undefined ? '' : e[k]) + '"></label>';
  const chk = (k, label) => '<label class="ck"><input type="checkbox" data-ldp="' + k + '"' + (e[k] ? ' checked' : '') + '> ' + label + '</label>';
  const seg = (k, opts) => '<span class="seg" role="group">' + opts.map(([v, t]) => '<button type="button" data-ldseg="' + k + '" data-v="' + v + '" aria-pressed="' + ((e[k] || opts[0][0]) === v) + '">' + t + '</button>').join('') + '</span>';
  h += '<div class="ldprops"><h4>' + esc(LD_TYPES[e.type] || e.type) + '</h4><div class="ldgrid">' + num('x', 'X') + num('y', 'Y') + num('w', 'Breite') + num('h', 'Höhe') + '</div>';
  if (e.type === 'text' || e.type === 'two' || e.type === 'barcode') {
    h += '<label class="stack"><span>' + (e.type === 'two' ? 'Text bei 2-seitig' : 'Text') + ' <small>– Felder in { }</small></span><textarea rows="2" data-ldp="text">' + esc(e.text || '') + '</textarea></label>';
    if (e.type === 'two') h += '<label class="stack"><span>Text bei Bearbeitung von unten (einseitig) <small>– leer = nichts</small></span><input type="text" data-ldp="text2" value="' + esc(e.text2 || '') + '"></label>';
    h += '<div class="ldchips">' + LabelLayout.FIELDS.slice(0, 12).map(([k, t]) => '<button type="button" data-ldins="{' + k + '}" title="' + esc(t) + '">{' + k + '}</button>').join('') + '</div>';
  }
  if (e.type === 'text' || e.type === 'two') {
    h += '<div class="ldgrid">' + num('size', 'Schrift mm', 0.1) + '<label><span>Schriftart</span><select data-ldp="font">' + [['body', 'Normal'], ['display', 'Titel'], ['mono', 'Ziffern (fest)']]
      .map(([v, t]) => '<option value="' + v + '"' + ((e.font || 'body') === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label></div>' +
      '<div class="ldrow">' + seg('align', [['l', 'links'], ['c', 'Mitte'], ['r', 'rechts']]) + seg('valign', [['t', 'oben'], ['m', 'Mitte'], ['b', 'unten']]) + '</div>' +
      '<div class="ldrow">' + chk('bold', 'fett') + chk('italic', 'kursiv') + chk('inv', 'weiß auf schwarz') + chk('fit', 'verkleinern bis es passt') + chk('wrap', 'umbrechen') + '</div>';
  }
  if (e.type === 'edges') h += '<div class="ldgrid">' + num('size', 'Schrift mm', 0.1) + '</div>';
  if (e.type === 'sketch') h += '<div class="ldrow"><span>Bemaßung</span>' + seg('dims', [['fertig', 'Fertigmaß'], ['zuschnitt', 'Zuschnittmaß']]) + '</div>';
  if (e.type === 'barcode') {
    // Strichbreite: unter 0,25 mm (2 Punkte bei 203 dpi) lässt sich der Code kaum drucken und lesen
    const t = LabelLayout.fill(e.text, labelData(ld.part));
    const mods = LabelLayout.code128(t).split('').reduce((a, c) => a + +c, 0) + 20;
    const mw = e.w / mods;
    h += '<div class="ldrow">' + chk('human', 'Klartext darunter') + '</div><div class="ldgrid">' + num('size', 'Klartext mm', 0.1) + '</div>' +
      '<p class="note' + (mw < 0.25 ? ' warn' : '') + '">Schmalster Strich ' + n1(mw) + ' mm' + (mw < 0.25 ? ' – zu fein für 203 dpi: kürzerer Text (z. B. {nr}) oder breiter machen.' : ' – gut lesbar.') + '</p>';
  }
  if (e.type === 'box') h += '<div class="ldgrid">' + num('border', 'Rahmen mm', 0.05) + num('radius', 'Ecken mm', 0.1) + '</div><div class="ldrow">' + chk('fill', 'schwarz gefüllt') + '</div>';
  h += '<div class="ldrow"><button type="button" class="btn small" data-ldact="dup">Duplizieren</button><button type="button" class="btn small" data-ldact="up" title="eine Ebene nach vorn">▼ nach vorn</button>' +
    '<button type="button" class="btn small" data-ldact="down" title="eine Ebene nach hinten">▲ nach hinten</button><button type="button" class="btn small danger" data-ldact="del">Löschen</button></div></div>';
  return h;
}
// Druckliste: je Bauteil an/aus und Anzahl Etiketten (Vorgabe = Anzahl in der Stückliste)
// Druckliste: nur eigene Änderungen merken (an/aus, Anzahl) – ohne eigene Anzahl gilt die aktuelle aus der Stückliste
function ldPrintOf(p) {
  if (!ld.print.has(p)) ld.print.set(p, { on: true, own: null });
  const q = ld.print.get(p);
  return { get on() { return q.on; }, set on(v) { q.on = v; }, get n() { return q.own !== null ? q.own : Math.max(0, qtyOf(p)); }, set n(v) { q.own = v; } };
}
function ldPrintHtml(parts) {
  const tot = parts.reduce((a, p) => { const q = ldPrintOf(p); return a + (q.on ? q.n : 0); }, 0);
  return '<div class="ldprint"><h4>Drucken <small>' + tot + ' Etikett' + (tot === 1 ? '' : 'en') + '</small></h4>' +
    '<div class="ldprow"><button type="button" class="btn ghost small" data-lpall="1">alle</button><button type="button" class="btn ghost small" data-lpall="0">keine</button></div>' +
    '<div class="ldplist">' + parts.map((p, i) => {
      const q = ldPrintOf(p);
      const row = lblNums && lblNums.get(p);
      return '<div class="ldpi' + (p === ld.part ? ' cur' : '') + '"><input type="checkbox" data-lpon="' + i + '"' + (q.on ? ' checked' : '') + ' aria-label="drucken">' +
        '<button type="button" data-lpsel="' + i + '" title="als Vorschau zeigen"><span><b>' + (row ? row.nums[0] : i + 1) + '</b> ' + esc(p.fileName.replace(/\.xcs$/i, '')) + '</span>' +
        '<small>' + n1(p.res.panel.L) + ' × ' + n1(p.res.panel.W) + ' × ' + n1(p.res.panel.T) + '</small></button>' +
        '<input type="number" min="0" step="1" data-lpn="' + i + '" value="' + q.n + '" aria-label="Anzahl Etiketten"></div>';
    }).join('') + '</div>' +
    '<button type="button" class="btn primary" id="ldprintgo"' + (tot ? '' : ' disabled') + '>' + ICON_PRINT + ' ' + tot + ' Etikett' + (tot === 1 ? '' : 'en') + ' drucken</button></div>';
}
function renderLD() {
  const host = $('lblpage');
  if (!host || state.page !== 'labels') return;
  const parts = ldParts();
  if (!parts.length) { host.innerHTML = '<p class="note">Keine Teile geladen – das Etikett wird an einem echten Teil gestaltet.</p>'; return; }
  ldInit();
  for (const p of Array.from(ld.print.keys())) if (!parts.includes(p)) ld.print.delete(p); // entfernte Teile vergessen
  const D = labelDims();
  const scroll = host.querySelector('.ldside') ? host.querySelector('.ldside').scrollTop : 0;
  const scroll2 = host.querySelector('.ldplist') ? host.querySelector('.ldplist').scrollTop : 0;
  host.innerHTML = '<div class="ldhead">' +
    '<label>Etikett <input type="number" min="10" step="1" id="ldW" value="' + D.LW + '" aria-label="Etikett Breite"> × <input type="number" min="10" step="1" id="ldH" value="' + D.LH + '" aria-label="Etikett Höhe"> mm</label>' +
    '<label><input type="checkbox" id="ldrot"' + (D.rot ? ' checked' : '') + '> Inhalt um 90° drehen</label>' +
    '<label>Vorlage <select id="ldtpl">' + LabelLayout.TEMPLATES.map(([k, t]) => '<option value="' + k + '">' + esc(t) + '</option>').join('') + '</select></label>' +
    '<button type="button" class="btn small" id="ldtplgo" title="Ersetzt das Layout durch die Vorlage">Laden</button>' +
    '<span class="sp"></span><span class="ldmode">' + (ld.own ? 'Eigenes Layout' : 'Automatisch – gezeigt wird die Vorlage „Standard“ (ähnlich); die erste Änderung speichert sie als eigenes Layout') + '</span>' +
    (ld.own ? '<button type="button" class="btn ghost small" id="ldauto" title="Eigenes Layout verwerfen, wieder das automatische Etikett">Automatisch verwenden</button>' : '') + '</div>' +
    '<div class="ldmain">' + ldPrintHtml(parts) + '<div class="ldstage" id="ldstage">' + ldStageHtml() + '<div class="ldzoom"><button type="button" class="btn small" data-ldz="-1" aria-label="kleiner">−</button>' +
    '<button type="button" class="btn small" data-ldz="1" aria-label="größer">+</button></div></div><div class="ldside">' + ldInspector() + '</div></div>';
  host.querySelector('.ldside').scrollTop = scroll;
  host.querySelector('.ldplist').scrollTop = scroll2;
  ldWire(host);
}
// nur die Vorschau neu (beim Tippen in den Eigenschaften, Fokus bleibt)
function ldRefreshStage() {
  const st = $('ldstage');
  if (!st || !ld) return;
  const lab = $('ldlabel');
  if (lab) lab.outerHTML = ldStageHtml();
  ldMarkSel();
}
function ldMarkSel() {
  const lab = $('ldlabel');
  if (!lab) return;
  lab.querySelectorAll('[data-li]').forEach((n) => {
    n.classList.toggle('sel', n.dataset.li === ld.sel);
    if (n.dataset.li === ld.sel && !n.querySelector('.lh')) { const hd = document.createElement('span'); hd.className = 'lh'; n.appendChild(hd); }
  });
}
function ldChanged(full) { ldSave(); if (full) renderLD(); else ldRefreshStage(); }
function ldWire(dlg) {
  ldMarkSel();
  // Druckliste
  const parts = ldParts();
  dlg.querySelectorAll('[data-lpon]').forEach((c) => c.addEventListener('change', () => { ldPrintOf(parts[+c.dataset.lpon]).on = c.checked; renderLD(); }));
  dlg.querySelectorAll('[data-lpn]').forEach((c) => c.addEventListener('change', () => { ldPrintOf(parts[+c.dataset.lpn]).n = Math.max(0, Math.round(+c.value || 0)); renderLD(); }));
  dlg.querySelectorAll('[data-lpsel]').forEach((b) => b.addEventListener('click', () => { ld.part = parts[+b.dataset.lpsel]; renderLD(); }));
  dlg.querySelectorAll('[data-lpall]').forEach((b) => b.addEventListener('click', () => { for (const p of parts) ldPrintOf(p).on = b.dataset.lpall === '1'; renderLD(); }));
  $('ldprintgo').addEventListener('click', () => {
    const list = [];
    for (const p of parts) { const q = ldPrintOf(p); if (q.on) for (let c = 0; c < q.n; c++) list.push(p); }
    printLabels(list);
  });
  if ($('ldauto')) $('ldauto').addEventListener('click', () => {
    state.settings.labelLayout = null;
    saveSettings();
    ld.own = false;
    ld.lay = null; // Vorlage statt des verworfenen Layouts zeigen
    ld.sel = null;
    const st = $('ldstate');
    if (st) st.textContent = 'automatisch';
    toast('Wieder das automatische Etikett.');
    renderLD();
  });
  const size = () => {
    const W = Math.max(10, +$('ldW').value || 40);
    const H = Math.max(10, +$('ldH').value || 60);
    state.settings.labelWidth = W;
    state.settings.labelHeight = H;
    state.settings.labelRotate = $('ldrot').checked;
    const D = labelDims();
    ld.lay = JSON.parse(JSON.stringify(LabelLayout.scaled(ld.base, D.cw, D.ch))); // aus der gespeicherten Fassung, nicht kumulativ
    for (const [k, v] of [['labelWidth', W], ['labelHeight', H]]) { const i = $('set-' + k); if (i) i.value = v; }
    const cb = $('set-labelRotate');
    if (cb) cb.checked = state.settings.labelRotate;
    saveSettings();
    renderLD();
  };
  $('ldW').addEventListener('change', size);
  $('ldH').addEventListener('change', size);
  $('ldrot').addEventListener('change', size);
  $('ldtplgo').addEventListener('click', () => {
    const D = labelDims();
    ld.lay = LabelLayout.layoutOf($('ldtpl').value, D.cw, D.ch);
    ld.sel = null;
    ldChanged(true);
  });
  dlg.querySelectorAll('[data-ldz]').forEach((b) => b.addEventListener('click', () => { ld.zoom = Math.max(3, Math.min(14, ld.zoom + +b.dataset.ldz)); renderLD(); }));
  // hinzufügen
  const add = (o) => {
    const D = labelDims();
    const e = LabelLayout.newItem(Object.assign({ x: Math.max(0, D.cw / 2 - 10), y: Math.max(0, D.ch / 2 - 3), w: Math.min(20, D.cw), h: 6 }, o));
    ld.lay.items.push(e);
    ld.sel = e.id;
    ldChanged(true);
  };
  dlg.querySelectorAll('[data-ldadd]').forEach((b) => b.addEventListener('click', () => {
    const D = labelDims();
    const t = b.dataset.ldadd;
    if (t === 'text') add({ type: 'text', text: 'Text', size: 3, fit: true });
    else if (t === 'sketch' || t === 'sketchcut') add({ type: 'sketch', dims: t === 'sketchcut' ? 'zuschnitt' : 'fertig', x: 2, y: 2, w: D.cw - 4, h: D.ch / 2 });
    else if (t === 'edges') add({ type: 'edges', h: 6, w: D.cw - 4, x: 2, size: 2.2 });
    else if (t === 'two') add({ type: 'two', text: '⇅ 2-SEITIG · WENDEN', text2: '! Unterseite beachten', size: 2.4, bold: true, inv: true, align: 'c', valign: 'm', fit: true, h: 4, w: D.cw - 4, x: 2 });
    else if (t === 'barcode') add({ type: 'barcode', text: '{nr}', human: true, size: 1.8, h: 9, w: D.cw - 4, x: 2 });
    else if (t === 'line') add({ type: 'box', fill: true, h: 0.3, w: D.cw - 4, x: 2 });
    else if (t === 'box') add({ type: 'box', border: 0.3, w: D.cw - 4, x: 2, h: 10 });
  }));
  $('ldfield').addEventListener('change', (ev) => { const k = ev.target.value; if (k) add({ type: 'text', text: '{' + k + '}', size: 3, fit: true, bold: k === 'nr' || k === 'masse' }); });
  dlg.querySelectorAll('[data-ldsel]').forEach((b) => b.addEventListener('click', () => { ld.sel = b.dataset.ldsel; renderLD(); }));
  // Eigenschaften
  const e = ldItem();
  dlg.querySelectorAll('[data-ldp]').forEach((inp) => {
    const k = inp.dataset.ldp;
    const apply = () => {
      if (!e) return;
      if (inp.type === 'checkbox') e[k] = inp.checked;
      else if (inp.type === 'number') { const v = parseFloat(String(inp.value).replace(',', '.')); if (isNaN(v)) return; e[k] = Math.max(k === 'x' || k === 'y' ? -50 : 0, v); }
      else e[k] = inp.value;
      ldChanged(false);
    };
    inp.addEventListener(inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input', apply);
  });
  dlg.querySelectorAll('[data-ldseg]').forEach((b) => b.addEventListener('click', () => { if (!e) return; e[b.dataset.ldseg] = b.dataset.v; ldChanged(true); }));
  dlg.querySelectorAll('[data-ldins]').forEach((b) => b.addEventListener('click', () => {
    const ta = dlg.querySelector('textarea[data-ldp="text"]');
    if (!ta || !e) return;
    const a = ta.selectionStart;
    ta.value = ta.value.slice(0, a) + b.dataset.ldins + ta.value.slice(ta.selectionEnd);
    e.text = ta.value;
    ldChanged(false);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = a + b.dataset.ldins.length;
  }));
  dlg.querySelectorAll('[data-ldact]').forEach((b) => b.addEventListener('click', () => ldAct(b.dataset.ldact)));
  // Ziehen / Größe ändern
  const lab = $('ldlabel');
  lab.addEventListener('pointerdown', (ev) => {
    const n = ev.target.closest('[data-li]');
    if (!n) { if (ld.sel) { ld.sel = null; renderLD(); } return; }
    ev.preventDefault();
    const it = ld.lay.items.find((x) => x.id === n.dataset.li);
    if (!it) return;
    if (ld.sel !== it.id) { ld.sel = it.id; renderLD(); }
    const lab2 = $('ldlabel');
    const node = lab2.querySelector('[data-li="' + it.id + '"]');
    const rect = lab2.getBoundingClientRect();
    const D = labelDims();
    const k = rect.width / D.cw; // px je mm
    const res = ev.target.classList.contains('lh');
    const s0 = { x: ev.clientX, y: ev.clientY, ex: it.x, ey: it.y, ew: it.w, eh: it.h };
    let moved = false;
    const mv = (m) => {
      const dx = (m.clientX - s0.x) / k;
      const dy = (m.clientY - s0.y) / k;
      if (Math.abs(dx) + Math.abs(dy) > 0.2) moved = true;
      if (res) { it.w = Math.max(0.2, snapMm(s0.ew + dx, m.altKey)); it.h = Math.max(0.2, snapMm(s0.eh + dy, m.altKey)); }
      else { it.x = snapMm(s0.ex + dx, m.altKey); it.y = snapMm(s0.ey + dy, m.altKey); }
      node.style.left = it.x + 'mm'; node.style.top = it.y + 'mm'; node.style.width = it.w + 'mm'; node.style.height = it.h + 'mm';
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (moved) ldChanged(true);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up); // Touch abgebrochen: Ziehen beenden
  });
}
function ldAct(a) {
  const e = ldItem();
  if (!e) return;
  const items = ld.lay.items;
  const i = items.indexOf(e);
  if (a === 'del') { items.splice(i, 1); ld.sel = null; }
  else if (a === 'dup') { const o = Object.assign({}, e, { x: e.x + 1, y: e.y + 1 }); delete o.id; const c = LabelLayout.newItem(o); items.splice(i + 1, 0, c); ld.sel = c.id; }
  else if (a === 'up' && i < items.length - 1) { items.splice(i, 1); items.splice(i + 1, 0, e); }
  else if (a === 'down' && i > 0) { items.splice(i, 1); items.splice(i - 1, 0, e); }
  ldChanged(true);
}
function ldKey(ev) {
  if (!ld || !ld.sel || state.page !== 'labels' || ev.altKey || ev.target.isContentEditable || ev.target.closest('input, textarea, select, button, a, summary, dialog')) return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() !== 'd') return; // Browser-Kürzel nicht abfangen
  const e = ldItem();
  if (!e) return;
  const st = ev.shiftKey ? 2 : 0.5;
  const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[ev.key];
  if (mv) { ev.preventDefault(); e.x = Math.round((e.x + mv[0]) * 10) / 10; e.y = Math.round((e.y + mv[1]) * 10) / 10; ldChanged(true); }
  else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); ldAct('del'); }
  else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); ldAct('dup'); }
}
/*
 * Material (eigene Spalte, erste Fassung zum Überarbeiten): alles zur Materialdefinition an einer Stelle –
 * Materialien im Projekt (Teile, Dicken, Fläche, Format, Kante; für alle Teile ändern), Standard-Platte und Material aus dem
 * Namen, Kantenband (Dicke, Dekor 1/2, Zugabe), Plattenformat/Schnittfuge/Besäumen und Format je Material, eigene Farben,
 * Dekor-Bibliothek. Werte sind dieselben wie in Stückliste, Zuschnitt und Einstellungen.
 */
function renderMat() {
  const host = $('matpage');
  if (!host || state.page !== 'material') return;
  const rows = bomRows();
  const m2 = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // je Material: Teile, Dicken, Fläche
  const mats = new Map();
  for (const r of rows) {
    if (!mats.has(r.board)) mats.set(r.board, { key: r.board, qty: 0, area: 0, T: new Map(), parts: [] });
    const m = mats.get(r.board);
    m.qty += r.qty;
    m.area += (r.L * r.W * r.qty) / 1e6;
    const tk = Math.round(r.T * 10) / 10; // gleiche Dicke trotz Rundungsresten zusammen
    m.T.set(tk, (m.T.get(tk) || 0) + r.qty);
    m.parts.push(...r.parts);
  }
  const groups = cutGroups();
  const fmtTxt = (key, T) => { const g = groups.find((x) => x.key === View3D.boardOf(key).id + '|' + fmt(T)); return g ? fmt(g.fmt.L) + ' × ' + fmt(g.fmt.W) : fmt(lst.sheetL) + ' × ' + fmt(lst.sheetW); };
  const kind = (b) => (b.tex ? 'Dekor (Bibliothek)' : b.grain > 0 ? 'Holz, Maserung längs' : 'Dekor / einfarbig');
  const list = Array.from(mats.values());
  const num = (id, v, step, label) => '<label>' + label + ' <input type="number" id="' + id + '" step="' + step + '" value="' + esc(v) + '"></label>';
  const decs = View3D.decors();
  host.innerHTML = '<div class="mathead"><h3>Material</h3><p class="note">Alles zur Materialdefinition an einer Stelle – dieselben Werte wie in Stückliste, Zuschnitt und Einstellungen. ' +
      'Erste Fassung: wird noch überarbeitet.</p></div>' +
    '<div class="matgrid">' +
    // Materialien im Projekt
    '<section class="matcard wide"><h4>Materialien im Projekt <small>' + list.length + '</small></h4>' + (list.length ?
      '<div class="tblwrap"><table class="mattbl"><thead><tr><th>Material</th><th>Art</th><th>Schmalflächen</th><th class="r">Dicken (Teile)</th><th class="r">Teile</th><th class="r">Fläche</th><th class="r">Plattenformat</th><th>Kante Dekor 1</th><th></th></tr></thead><tbody>' +
      list.map((m, i) => { const b = View3D.boardOf(m.key); const Ts = Array.from(m.T.keys()).sort((a, c) => a - c);
        return '<tr><td>' + boardSwatch(m.key) + ' <b>' + esc(b.name) + '</b></td><td>' + kind(b) + '</td><td>' + esc(b.edge === 'same' ? 'wie Oberfläche' : b.edgeName) + '</td>' +
          '<td class="r">' + Ts.map((T) => fmt(T) + ' mm (' + m.T.get(T) + ')').join('<br>') + '</td><td class="r">' + m.qty + '</td><td class="r">' + m2(m.area) + ' m²</td>' +
          '<td class="r">' + Ts.map((T) => fmtTxt(m.key, T)).join('<br>') + '</td><td>' + esc(decoName(1, m.key)) + '</td>' +
          '<td><button type="button" class="btn small" id="matchg' + i + '" data-matchg="' + i + '" title="Material für alle ' + m.parts.length + ' Bauteile ändern">Ändern …</button></td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="note">Keine Teile geladen.</p>') + '</section>' +
    // Standard
    '<section class="matcard"><h4>Standard</h4><div class="matrows">' +
      '<label>Platte für alle Teile <button type="button" class="btn small boardbtn" id="matdef">' + boardChip(state.settings.boardMaterial) + '</button></label>' +
      '<label class="ck"><input type="checkbox" id="matname"' + (state.settings.boardFromName !== false ? ' checked' : '') + '> Material aus dem Bauteilnamen (z. B. „Seite (U708 ST9)“)</label>' +
      '<p class="note">Reihenfolge: je Teil gewählt &gt; aus dem Namen &gt; gelernte Regel (Stückliste › Regeln …) &gt; Standard.</p></div></section>' +
    // Kantenband
    '<section class="matcard"><h4>Kantenband</h4><div class="matrows">' +
      num('m-emm', lst.edgeMm, 0.1, 'Dicke (alle Kanten) mm') +
      '<label>Dekor 1 <input type="text" id="m-ename1" value="' + esc(lst.edgeName1 || '') + '" placeholder="wie Platte"></label>' +
      '<label>Dekor 2 <input type="text" id="m-ename2" value="' + esc(lst.edgeName2 || '') + '"> <input type="color" id="m-ecol2" value="' + esc(/^#[0-9a-f]{6}$/i.test(lst.edgeColor2 || '') ? lst.edgeColor2 : '#5b4a3a') + '" aria-label="Farbe Dekor 2"></label>' +
      num('m-eextra', lst.edgeExtra, 1, 'Zugabe je Kante mm') +
      '<label class="ck"><input type="checkbox" id="m-ededuct"' + (lst.edgeDeduct ? ' checked' : '') + '> Kantendicke vom Zuschnitt abziehen</label>' +
      '<p class="note">Belegung je Teil in der Stückliste; automatische Vorbelegung dort unter <i>Regeln …</i>.</p></div></section>' +
    // Platten
    '<section class="matcard"><h4>Rohplatten</h4><div class="matrows">' +
      '<label>Format <span><input type="number" id="m-sheetL" step="1" value="' + lst.sheetL + '"> × <input type="number" id="m-sheetW" step="1" value="' + lst.sheetW + '"> mm</span></label>' +
      num('m-kerf', lst.kerf, 0.1, 'Schnittfuge mm') + num('m-trim', lst.trim, 1, 'Besäumen mm') +
      '<label class="ck"><input type="checkbox" id="m-grain"' + (lst.grain ? ' checked' : '') + '> Maserung beachten</label>' +
      (lst.groupSheet && Object.keys(lst.groupSheet).length ? '<div class="matsub">Eigenes Format je Material:' + Object.entries(lst.groupSheet).map(([k, f]) =>
        '<div>' + esc(k.replace('|', ' · ') + ' mm') + ': <b>' + fmt(f.L) + ' × ' + fmt(f.W) + '</b> <button type="button" class="btn ghost small" data-matgf="' + esc(k) + '" title="wieder allgemeines Format">↺</button></div>').join('') + '</div>'
        : '<p class="note">Format je Material im Zuschnittplan (Kopf der Gruppe).</p>') + '</div></section>' +
    // eigene Farben
    '<section class="matcard"><h4>Eigene Farben <small>' + customBoards().length + '</small></h4>' + (customBoards().length ? '<div class="matown">' + customBoards().map((k) =>
        '<span>' + boardSwatch(k) + ' ' + esc(View3D.boardOf(k).name) + ' <button type="button" class="btn ghost small" data-matdel="' + esc(k) + '" aria-label="entfernen">✕</button></span>').join('') + '</div>'
      : '<p class="note">Noch keine – in der Farbauswahl (z. B. „Ändern …“) eigene Farbe mit Namen anlegen.</p>') + '</section>' +
    // Dekor-Bibliothek
    decorSectionHtml(decs) +
    '</div>';
  // Ereignisse
  list.forEach((m, i) => $('matchg' + i).addEventListener('click', (ev) => boardPicker(ev.currentTarget, m.key, null, (k) => {
    for (const p of m.parts) p.board = k || null;
    applyBoards();
    render();
  })));
  $('matdef').addEventListener('click', (ev) => boardPicker(ev.currentTarget, state.settings.boardMaterial, null, (k) => { setBoardDefault(k); renderMat(); }));
  $('matname').addEventListener('change', (e) => { state.settings.boardFromName = e.target.checked; const c = $('set-boardFromName'); if (c) c.checked = e.target.checked; saveSettings(); applyBoards(); render(); });
  const sync = (id, k, isNum, isChk) => $(id).addEventListener('change', (e) => {
    const v = isChk ? e.target.checked : isNum ? parseFloat(String(e.target.value).replace(',', '.')) : e.target.value.trim();
    if (isNum && !(v >= 0)) return;
    lst[k] = v;
    saveLst();
    // Felder in Stückliste / Zuschnitt nachziehen
    const twin = { edgeMm: 'emm', edgeName1: 'ename1', edgeName2: 'ename2', edgeColor2: 'ecol2', edgeExtra: 'eextra', edgeDeduct: 'ededuct', sheetL: 'csheetL', sheetW: 'csheetW', kerf: 'ckerf', trim: 'ctrim', grain: 'cgrain' }[k];
    if (twin && $(twin)) { if (isChk) $(twin).checked = v; else $(twin).value = v; }
    applyBoards();
    render();
  });
  sync('m-emm', 'edgeMm', true); sync('m-ename1', 'edgeName1'); sync('m-ename2', 'edgeName2'); sync('m-ecol2', 'edgeColor2'); sync('m-eextra', 'edgeExtra', true);
  sync('m-ededuct', 'edgeDeduct', false, true); sync('m-sheetL', 'sheetL', true); sync('m-sheetW', 'sheetW', true); sync('m-kerf', 'kerf', true); sync('m-trim', 'trim', true);
  sync('m-grain', 'grain', false, true);
  host.querySelectorAll('[data-matgf]').forEach((b) => b.addEventListener('click', () => { delete lst.groupSheet[b.dataset.matgf]; saveLst(); renderMat(); }));
  decorWire(host);
  host.querySelectorAll('[data-matdel]').forEach((b) => b.addEventListener('click', () => {
    state.settings.customBoards = customBoards().filter((k) => k !== b.dataset.matdel);
    saveSettings();
    renderMat();
  }));
}
// Etiketten direkt drucken (Druckbereich in Etikettgröße, schwarz-weiß) – auch aus dem Sägemodus
function printLabels(list) {
  list = list.filter((x) => x.res && x.res.panel);
  if (!list.length) { toast('Kein Teil mit Programm zum Beschriften.'); return; }
  lblNums = labelNums();
  printLabelHtml(list.map(labelHtml).join(''));
}
/*
 * Streifen-Etikett zum Zuordnen (Sägen): „Streifen 1/4“, Material + Dicke, „Platte 1/5“, Breite × Länge des Streifens und die
 * Bauteil-Nr. darin. o = { g: Gruppe, si: Platte (Index), strip: { n, region, dir, parts }, nStrips, sheet }
 */
function stripLabelHtml(o) {
  const D = labelDims();
  const r = o.strip.region;
  const h = o.strip.dir === 'h';
  const wid = h ? r.y1 - r.y0 : r.x1 - r.x0;
  const len = h ? r.x1 - r.x0 : r.y1 - r.y0;
  const cnt = new Map();
  for (const u of o.strip.parts) { const p = o.sheet.parts.find((q) => q.uid === u); if (p) cnt.set(p.id, (cnt.get(p.id) || 0) + 1); }
  const ids = Array.from(cnt).map(([id, n]) => id + (n > 1 ? ' ×' + n : '')).join(', ');
  const d = new Date();
  const date = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getFullYear()).slice(2);
  const mat = o.g.name + ' · ' + fmt(o.g.T) + ' mm';
  const ms = Math.max(2.2, Math.min(4.2, (D.cw - 3.2) / (mat.length * 0.74)));
  // kleine Skizze der Platte: dieser Streifen schwarz, die anderen umrandet, Teile darin hell
  const sh = o.sheet;
  const all = stripsOf(o.g, o.si);
  const sk = '<svg class="ssk" viewBox="-10 -10 ' + (sh.L + 20) + ' ' + (sh.W + 20) + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<rect x="0" y="0" width="' + sh.L + '" height="' + sh.W + '" fill="#fff" stroke="#000" stroke-width="' + sh.L / 120 + '"/>' +
    all.map((q) => { const g = q.strip.region; const me = q.strip.n === o.strip.n;
      return '<rect x="' + g.x0 + '" y="' + (sh.W - g.y1) + '" width="' + (g.x1 - g.x0) + '" height="' + (g.y1 - g.y0) + '" fill="' + (me ? '#000' : 'none') +
        '" stroke="#000" stroke-width="' + sh.L / (me ? 160 : 260) + '"' + (me ? '' : ' stroke-dasharray="' + sh.L / 60 + ' ' + sh.L / 90 + '"') + '/>' +
        (me ? '' : '<text x="' + (g.x0 + g.x1) / 2 + '" y="' + (sh.W - (g.y0 + g.y1) / 2) + '" font-size="' + Math.min(g.x1 - g.x0, g.y1 - g.y0) * 0.6 + '" text-anchor="middle" dominant-baseline="central" font-weight="700">' + q.strip.n + '</text>'); }).join('') +
    '</svg>';
  return '<div class="lbl slb" style="width:' + D.LW + 'mm;height:' + D.LH + 'mm"><div class="lin" style="width:' + D.cw + 'mm;height:' + D.ch + 'mm;padding:1.6mm;' +
    (D.rot ? 'transform:translate(' + D.LW + 'mm,0) rotate(90deg);' : '') + '">' +
    '<div class="hd" style="margin:-1.6mm -1.6mm 0;padding:0.8mm 1.6mm"><span class="st">STREIFEN</span><span class="sn">' + o.strip.n + '</span><span class="of">/ ' + o.nStrips + '</span></div>' +
    '<div class="mt" style="font-size:' + ms.toFixed(2) + 'mm">' + esc(mat) + '</div>' +
    '<div class="pl">Platte <b>' + (o.si + 1) + '</b> / ' + o.g.plan.sheets.length + '</div>' +
    '<div class="ms">' + n1(wid) + ' × ' + n1(len) + ' mm</div>' +
    (ids ? '<div class="ids"><span>Teile Nr.</span> ' + esc(ids) + '</div>' : '') +
    '<div class="sskw">' + sk + '</div>' +
    '<div class="ln ft">' + date + '</div></div></div>';
}
// Streifen einer Platte (Schnittfolge wie im Sägemodus)
function stripsOf(g, si) {
  const sheet = g.plan.sheets[si];
  const seq = seqOf(sheet, g);
  return seq.strips.map((st) => ({ g: g, si: si, strip: st, nStrips: seq.strips.length, sheet: sheet }));
}
function printStripLabels(list) {
  if (!list.length) { toast('Keine Streifen auf dieser Platte.'); return; }
  printLabelHtml(list.map(stripLabelHtml).join(''));
}
// Etiketten-HTML drucken: nur #printarea, @page in Etikettgröße
function printLabelHtml(html) {
  const cfg = state.settings;
  let area = $('printarea');
  if (!area) { area = document.createElement('div'); area.id = 'printarea'; document.body.appendChild(area); }
  area.innerHTML = html;
  let pg = $('labelpage');
  if (!pg) { pg = document.createElement('style'); pg.id = 'labelpage'; document.head.appendChild(pg); }
  pg.textContent = '@page { size: ' + labelDims().LW + 'mm ' + labelDims().LH + 'mm; margin: 0; }';
  window.print();
}
// Geschätzte Bearbeitungszeit eines Teils (s): Seite 1 (+ Seite 2), am Ergebnis zwischengespeichert
function timeOfResult(r, ov) {
  if (!r || !r.panel) return null;
  if (r._est === undefined) {
    try {
      const info = ToolLibrary.infoMap(state.tools);
      const st = state.settings;
      r._est = Toolpath.estimate(Toolpath.build(r, info, st), r, info, { rapid: st.estRapid, change: st.estChange, perRapid: st.estPerRapid,
        perDrill: st.estPerDrill, load: st.estLoad, factor: st.estFactor, tech: ov && ov.tech });
    } catch (e) { r._est = null; }
  }
  return r._est;
}
function partTime(p) {
  const r = p.res || p.result;
  const a = timeOfResult(r, p.overrides);
  if (!a) return null;
  const b = r.side2 ? timeOfResult(r.side2, p.overrides2) : null;
  return { total: a.total + (b ? b.total : 0), s1: a, s2: b };
}
// Tooltip: Aufteilung der geschätzten Zeit
function timeTitle(t) {
  const one = (e) => 'Fräsen ' + Toolpath.fmtTime(e.cut) + ', Bohren ' + Toolpath.fmtTime(e.drill) + ', Eilgang ' + Toolpath.fmtTime(e.rapid) +
    ', Werkzeugwechsel ' + Toolpath.fmtTime(e.change) + ', Auflegen ' + Toolpath.fmtTime(e.load);
  return 'Geschätzte Bearbeitungszeit (Einstellungen → Zeitschätzung). ' + (t.s2 ? 'Seite 1: ' + one(t.s1) + ' · Seite 2: ' + one(t.s2) : one(t.s1));
}

function render() { renderProfileBar(); renderParts(); renderDetail(); renderPageTabs(); if (state.page === 'model') renderModel(); if (state.page === 'lists') renderLists(); if (state.page === 'labels') renderLD(); if (state.page === 'material') renderMat(); saveSession(); }
// Anzahl auf den Seiten-Schaltern: Programme = alle Teile, Möbel 3D = Teile mit STEP-Modell
function renderPageTabs() {
  $('ptn-pgmx').textContent = state.parts.length || '';
  $('ptn-model').textContent = state.parts.filter((p) => p.solid && p.stepText).length || '';
  $('ptn-pgmx').title = state.parts.length + ' Teile';
  const q = state.parts.reduce((a, p) => a + (p.res || p.result ? qtyOf(p) : 0), 0);
  $('ptn-lists').textContent = q || '';
  $('ptn-lists').title = q + ' Teile (mit Anzahl)';
  $('projsave').disabled = !state.parts.length;
}
