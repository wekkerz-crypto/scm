/*
 * Etiketten-Layout (Etiketten-Konfigurator): Elemente frei auf dem Etikett platziert, Maße in mm (Inhalt in Leserichtung,
 * w × h). Ein Layout = { w, h, items: [Element] }; Element = { type, x, y, w, h, … }:
 *   text    – Text mit Feldern {nr} {name} … (FIELDS), size (mm), bold, italic, font body|mono|display, align l|c|r, valign t|m|b,
 *             inv (weiß auf schwarz), fit (verkleinern, bis es passt), wrap (umbrechen)
 *   two     – Hinweis zweiseitig: text (2-seitig, wenden), text2 (Bearbeitung von unten ohne Seite 2; leer = nichts), Stil wie text
 *   sketch  – Draufsicht mit Bemaßung und Kantenband (data.sketch(w, h))
 *   edges   – Kanten-Legende (data.edgeList: [{ name, sides, dash }]), size
 *   barcode – Strichcode Code 128 aus text (Felder erlaubt), human = Klartext darunter, size
 *   box     – Rahmen / Linie / Fläche: border (mm, 0 = keiner), fill (schwarz gefüllt), radius (mm)
 * Leere Felder werden samt Trenner „ · “ weggelassen; ein Text, der ganz leer bleibt, wird nicht gezeichnet.
 * render(layout, data, W, H) → HTML (absolut positioniert, mm); passt das Layout nicht zur Größe W × H, wird es skaliert.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LabelLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Felder für Texte (Schlüssel, Beschreibung, Beispiel)
  const FIELDS = [
    ['nr', 'Bauteil-Nr. (wie im Zuschnittplan)', '12'],
    ['name', 'Teilename (= Programmname)', 'KP_1_SW_L'],
    ['masse', 'Maße L × B × D', '900 × 450 × 19'],
    ['L', 'Länge', '900'],
    ['B', 'Breite', '450'],
    ['D', 'Dicke', '19'],
    ['material', 'Material / Dekor', 'U708 ST9'],
    ['kanten', 'Kanten kurz (L1 D1 · B1 D2)', 'L1 D1 · B1 D1'],
    ['kantentext', 'Kanten mit Dekor-Namen', 'U708 ST9: L1 B1'],
    ['zuschnitt', 'Zuschnitt (Rohmaß)', '904 × 454'],
    ['anzahl', 'Anzahl der Position', '2'],
    ['seiten', '„2-seitig“ bei zweiseitigen Teilen', '2-seitig'],
    ['bearbeitung', 'Anzahl Bohrungen / Fräsungen …', '12 Bohrungen · 2 Fräsungen'],
    ['zeit', 'Bearbeitungszeit je Stück', '1:16 min'],
    ['profil', 'Werkstück-Profil', 'Standard'],
    ['datum', 'Datum', '06.10.26'],
    ['auftrag', 'Zusatzzeile aus den Einstellungen (Auftrag, Kunde …)', 'Auftrag 4711'],
    ['datei', 'Programmdatei', 'KP_1_SW_L.xcs'],
  ];

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r2 = (v) => Math.round(v * 100) / 100;

  // Felder einsetzen; leere Teile zwischen „ · “ fallen weg
  function fill(tpl, data) {
    const t = String(tpl || '').replace(/\{([A-Za-z]+)\}/g, (m, k) => (data[k] === undefined || data[k] === null ? '' : String(data[k])));
    return t.split('\n').map((line) => line.split(' · ').map((x) => x.trim()).filter(Boolean).join(' · ')).join('\n').trim();
  }

  let uid = 0;
  const id = () => 'e' + Date.now().toString(36) + (uid++).toString(36);
  const el = (o) => Object.assign({ id: id(), x: 0, y: 0, w: 10, h: 4 }, o);

  // Vorlagen (Inhalt cw × ch mm): 'standard' (wie das automatische Etikett), 'kompakt', 'barcode', 'leer'
  function template(kind, cw, ch) {
    const wide = cw >= ch * 1.25;
    const pad = 1.6;
    const hd = Math.max(5, Math.min(7, ch * 0.11));
    const head = [
      el({ type: 'text', x: 0, y: 0, w: cw * 0.5, h: hd, text: 'Nr. {nr}', size: hd * 0.68, bold: true, font: 'mono', inv: true, valign: 'm', fit: true }),
      el({ type: 'text', x: cw * 0.5, y: 0, w: cw * 0.5, h: hd, text: '{material}', size: 2.3, bold: true, inv: true, align: 'r', valign: 'm', fit: true }),
    ];
    if (kind === 'leer') return [];
    if (kind === 'kompakt') {
      return head.concat([
        el({ type: 'text', x: pad, y: hd + 1, w: cw - 2 * pad, h: ch * 0.2, text: '{name}', size: 4, bold: true, font: 'display', fit: true, wrap: true }),
        el({ type: 'text', x: pad, y: hd + 1 + ch * 0.2, w: cw - 2 * pad, h: ch * 0.2, text: '{masse}', size: 5, bold: true, fit: true }),
        el({ type: 'two', x: pad, y: hd + 1.5 + ch * 0.4, w: cw - 2 * pad, h: 4, text: '⇅ 2-SEITIG · WENDEN', text2: '! Unterseite beachten', size: 2.4, bold: true, inv: true, align: 'c', valign: 'm', fit: true }),
        el({ type: 'edges', x: pad, y: ch - 10, w: cw - 2 * pad, h: 6, size: 2.4 }),
        el({ type: 'text', x: pad, y: ch - 3.4, w: cw - 2 * pad, h: 3, text: '{datum} · {auftrag}', size: 2, fit: true }),
      ]);
    }
    const tw = wide ? cw * 0.5 - pad : cw - 2 * pad;
    const top = hd + 0.8;
    const items = head.concat([
      el({ type: 'text', x: pad, y: top, w: tw, h: 4.4, text: '{name}', size: 3.4, bold: true, font: 'display', fit: true }),
      el({ type: 'text', x: pad, y: top + 4.4, w: tw, h: 5, text: '{masse}', size: 4.2, bold: true, fit: true }),
      el({ type: 'two', x: pad, y: top + 9.8, w: tw, h: 3.6, text: '⇅ 2-SEITIG · WENDEN', text2: '! Unterseite beachten', size: 2.2, bold: true, inv: true, align: 'c', valign: 'm', fit: true }),
    ]);
    const foot = kind === 'barcode' ? 9 : 0;
    if (wide) {
      items.push(el({ type: 'edges', x: pad, y: top + 14, w: tw, h: Math.max(4, ch - top - 18.5 - foot), size: 2.2 }));
      items.push(el({ type: 'box', x: pad, y: ch - 4 - foot, w: tw, h: 0.25, fill: true }));
      items.push(el({ type: 'text', x: pad, y: ch - 3.7 - foot, w: tw, h: 3.4, text: '{datum} · {profil} · {bearbeitung} · {auftrag}', size: 1.9, wrap: true, fit: true }));
      items.push(el({ type: 'sketch', x: cw * 0.5 + pad / 2, y: top, w: cw * 0.5 - pad * 1.5, h: ch - top - pad - foot }));
    } else {
      const sk = top + 14;
      items.push(el({ type: 'sketch', x: pad, y: sk, w: cw - 2 * pad, h: Math.max(6, ch - sk - 10.5 - foot) }));
      items.push(el({ type: 'edges', x: pad, y: ch - 10.2 - foot, w: cw - 2 * pad, h: 6, size: 2.2 }));
      items.push(el({ type: 'box', x: pad, y: ch - 4.1 - foot, w: cw - 2 * pad, h: 0.25, fill: true }));
      items.push(el({ type: 'text', x: pad, y: ch - 3.8 - foot, w: cw - 2 * pad, h: 3.6, text: '{datum} · {profil} · {bearbeitung} · {auftrag}', size: 1.9, wrap: true, fit: true }));
    }
    if (foot) items.push(el({ type: 'barcode', x: pad, y: ch - foot - 0.4, w: cw - 2 * pad, h: foot, text: '{nr}', human: true, size: 1.8 }));
    return items;
  }
  const TEMPLATES = [['standard', 'Standard (wie automatisch)'], ['kompakt', 'Kompakt – große Schrift'], ['barcode', 'Standard mit Strichcode'], ['leer', 'Leer']];
  function layoutOf(kind, cw, ch) { return { w: cw, h: ch, items: template(kind, cw, ch) }; }

  // Layout auf eine andere Größe bringen (Lage und Größe anteilig, Schrift mit dem kleineren Faktor)
  function scaled(layout, cw, ch) {
    if (!layout || (Math.abs(layout.w - cw) < 0.01 && Math.abs(layout.h - ch) < 0.01)) return layout;
    const fx = cw / layout.w;
    const fy = ch / layout.h;
    const fs = Math.min(fx, fy);
    return { w: cw, h: ch, items: layout.items.map((e) => Object.assign({}, e, { x: r2(e.x * fx), y: r2(e.y * fy), w: r2(e.w * fx), h: r2(e.h * fy),
      size: e.size ? r2(e.size * fs) : e.size, border: e.border ? r2(e.border * fs) : e.border })) };
  }

  // ungefähre Zeichenbreite (Anteil der Schriftgröße) je Schrift – im Browser genau gemessen (Canvas, Schrift der Seite)
  const charW = (e) => ({ mono: 0.62, display: e.bold ? 0.7 : 0.64 }[e.font] || (e.bold ? 0.64 : 0.58));
  let ctx = null;
  const famCache = {};
  function textW(e, txt) {
    if (typeof document === 'undefined' || !document.createElement) return txt.length * charW(e);
    try {
      if (!ctx) ctx = document.createElement('canvas').getContext('2d');
      const v = e.font === 'mono' ? '--font-mono' : e.font === 'display' ? '--font-display' : '--font-body';
      if (!famCache[v]) famCache[v] = getComputedStyle(document.documentElement).getPropertyValue(v).trim() || 'sans-serif';
      ctx.font = (e.italic ? 'italic ' : '') + (e.bold ? '700 ' : '400 ') + '100px ' + famCache[v];
      return (ctx.measureText(txt).width / 100) * 1.03; // je mm Schriftgröße, etwas Luft
    } catch (err) { return txt.length * charW(e); }
  }
  // Schriftgröße so, dass der Text in das Feld passt (fit), sonst wie eingestellt
  function fitSize(e, txt, padX) {
    let s = +e.size || 3;
    if (!e.fit || !txt) return s;
    const w = Math.max(1, e.w - 2 * padX);
    const lines = txt.split('\n');
    const longest = Math.max(...lines.map((l) => textW(e, l)), 0.1);
    if (!e.wrap) return Math.max(1.2, Math.min(s, w / longest, e.h / (lines.length * 1.18)));
    // umbrechen: kleiner, bis die Zeilen in die Höhe passen
    for (; s > 1.2; s -= 0.1) {
      const n = lines.reduce((a, l) => a + Math.max(1, Math.ceil((textW(e, l) * s) / w)), 0);
      if (n * s * 1.18 <= e.h + 0.01) break;
    }
    return Math.max(1.2, s);
  }

  // Code 128 (B, Zeichen 32–127): Strichbreiten je Symbol
  const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
    '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
    '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
    '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
    '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
    '114131 311141 411131 211412 211214 211232 2331112').split(' ');
  function code128(text) {
    const s = String(text).replace(/[^\x20-\x7e]/g, '?');
    const codes = [104];
    for (const ch of s) codes.push(ch.charCodeAt(0) - 32);
    let sum = 104;
    for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
    codes.push(sum % 103, 106);
    return codes.map((c) => C128[c]).join('');
  }
  function barcodeSvg(text, w, h, human, size) {
    const widths = code128(text);
    const mods = widths.split('').reduce((a, c) => a + +c, 0) + 20; // 10 Module Ruhezone je Seite
    const th = human ? (size || 1.8) * 1.2 : 0;
    let x = 10;
    let bars = '';
    widths.split('').forEach((c, i) => { if (i % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + c + '" height="1"/>'; x += +c; });
    return '<svg viewBox="0 0 ' + mods + ' 1" preserveAspectRatio="none" width="' + r2(w) + 'mm" height="' + r2(Math.max(1, h - th)) + 'mm" style="display:block" aria-hidden="true">' +
      '<g fill="#000">' + bars + '</g></svg>' +
      (human ? '<div style="font-size:' + r2(size || 1.8) + 'mm;line-height:1.15;text-align:center;font-family:var(--font-mono);white-space:nowrap;overflow:hidden">' + esc(text) + '</div>' : '');
  }

  // Ein Element als HTML (data: Werte der Felder, dazu sketch(w, h), edgeList, two ('two' | 'warn' | ''))
  function itemHtml(e, data, opts) {
    const box = 'left:' + r2(e.x) + 'mm;top:' + r2(e.y) + 'mm;width:' + r2(e.w) + 'mm;height:' + r2(e.h) + 'mm';
    const attr = opts && opts.edit ? ' data-li="' + esc(e.id) + '"' : '';
    if (e.type === 'box') {
      const b = +e.border || 0;
      return '<div class="li li-box"' + attr + ' style="' + box + ';' + (e.fill ? 'background:#000;' : '') + (b ? 'border:' + r2(b) + 'mm solid #000;' : '') +
        (e.radius ? 'border-radius:' + r2(e.radius) + 'mm;' : '') + '"></div>';
    }
    if (e.type === 'sketch') return '<div class="li li-sk"' + attr + ' style="' + box + '">' + (e.w > 6 && e.h > 6 && data.sketch ? data.sketch(r2(e.w), r2(e.h)) : '') + '</div>';
    if (e.type === 'edges') {
      const list = data.edgeList || [];
      const s = +e.size || 2.2;
      const inner = list.length ? list.map((q) => '<span><svg viewBox="0 0 6 2" width="' + r2(s * 1.9) + 'mm" height="' + r2(s * 0.62) + 'mm" aria-hidden="true">' +
        '<path d="M0 1 H6" stroke="#000" stroke-width="1.3"' + (q.dash ? ' stroke-dasharray="1.4 0.8"' : '') + '/></svg>' + esc(q.name) + ' <b>' + esc(q.sides) + '</b></span>').join('')
        : '<span><i>ohne Kante</i></span>';
      return '<div class="li li-eg"' + attr + ' style="' + box + ';font-size:' + r2(s) + 'mm">' + inner + '</div>';
    }
    if (e.type === 'barcode') {
      const t = fill(e.text, data);
      return '<div class="li li-bc"' + attr + ' style="' + box + '">' + (t ? barcodeSvg(t, e.w, e.h, e.human, e.size) : '') + '</div>';
    }
    // Text bzw. Hinweis
    let txt;
    let warn = false;
    if (e.type === 'two') {
      txt = data.two === 'two' ? fill(e.text, data) : data.two === 'warn' ? fill(e.text2, data) : '';
      warn = data.two === 'warn';
    } else txt = fill(e.text, data);
    if (!txt && !(opts && opts.edit)) return '';
    const inv = e.inv && !warn;
    const padX = inv || warn ? 0.7 : 0;
    const fs = fitSize(e, txt, padX);
    const fam = e.font === 'mono' ? 'var(--font-mono)' : e.font === 'display' ? 'var(--font-display)' : 'var(--font-body)';
    const jc = { t: 'flex-start', m: 'center', b: 'flex-end' }[e.valign || 't'];
    return '<div class="li li-tx' + (e.type === 'two' ? ' li-two' : '') + '"' + attr + ' style="' + box + ';display:flex;flex-direction:column;justify-content:' + jc + ';' +
      'padding:0 ' + padX + 'mm;font:' + (e.italic ? 'italic ' : '') + (e.bold ? '700 ' : '400 ') + r2(fs) + 'mm/1.15 ' + fam + ';text-align:' + ({ c: 'center', r: 'right' }[e.align] || 'left') + ';' +
      (inv ? 'background:#000;color:#fff;' : warn ? 'border:0.35mm dashed #000;' : '') + (e.type === 'two' && inv ? 'border-radius:0.6mm;' : '') + '">' +
      txt.split('\n').map((l) => '<div style="white-space:' + (e.wrap ? 'normal;overflow-wrap:anywhere' : 'nowrap') + ';overflow:hidden">' + esc(l) + '</div>').join('') + '</div>';
  }
  function render(layout, data, cw, ch, opts) {
    const L = scaled(layout, cw, ch);
    return L.items.map((e) => itemHtml(e, data, opts)).join('');
  }

  return { FIELDS: FIELDS, TEMPLATES: TEMPLATES, layoutOf: layoutOf, template: template, scaled: scaled, fill: fill, render: render, itemHtml: itemHtml,
    code128: code128, barcodeSvg: barcodeSvg, newItem: el };
});
