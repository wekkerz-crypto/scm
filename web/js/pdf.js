/*
 * Kleiner PDF-Schreiber (ohne Bibliothek, offline): Seiten mit Linien, Rechtecken und Text (Helvetica, WinAnsi).
 * Maße in mm, Ursprung oben links. Für den Zuschnittplan als Datei – funktioniert auch dort, wo der Druckdialog fehlt.
 *   const d = MiniPdf.doc(297, 210); d.page(); d.rect(x, y, w, h, { fill: [0.9,0.9,0.9], stroke: [0,0,0], lw: 0.3 });
 *   d.text(x, y, 'Text', { size: 10, bold: true, align: 'center' }); const bytes = d.save();
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MiniPdf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PT = 72 / 25.4; // mm → pt
  // WinAnsi: Latin-1 passt direkt; einige Zeichen umsetzen, unbekannte durch '?' ersetzen
  const MAP = { '€': 0x80, '–': 0x96, '—': 0x97, '„': 0x84, '“': 0x93, '”': 0x94, '‚': 0x82, '‘': 0x91, '’': 0x92, '…': 0x85, '•': 0x95 };
  const SUBST = { '≈': 'ca.', '→': '->', '⇄': '<>', '²': '²', ' ': ' ', ' ': ' ' };
  function enc(s) {
    let out = '';
    for (const ch0 of String(s)) {
      const ch = SUBST[ch0] !== undefined ? SUBST[ch0] : ch0;
      for (const ch1 of ch) {
        let c = MAP[ch1] !== undefined ? MAP[ch1] : ch1.codePointAt(0);
        if (c > 255) c = 63;
        const b = String.fromCharCode(c);
        out += b === '(' || b === ')' || b === '\\' ? '\\' + b : b;
      }
    }
    return out;
  }
  // grobe Textbreite Helvetica (Mittelwert je Zeichen) für Zentrieren/Abschneiden
  const width = (s, size, bold) => String(s).length * size * (bold ? 0.58 : 0.53) / PT;
  const n = (v) => (Math.round(v * 100) / 100).toString();
  const col = (c) => c.map((v) => n(v)).join(' ');

  function doc(wmm, hmm) {
    const pages = [];
    const images = [];
    let cur = null;
    const H = hmm * PT;
    const api = {
      W: wmm,
      H: hmm,
      page() { cur = []; pages.push(cur); return api; },
      rect(x, y, w, h, o) {
        o = o || {};
        const ops = ['q'];
        if (o.lw) ops.push(n(o.lw * PT) + ' w');
        if (o.dash) ops.push('[' + o.dash.map((d) => n(d * PT)).join(' ') + '] 0 d');
        if (o.fill) ops.push(col(o.fill) + ' rg');
        if (o.stroke) ops.push(col(o.stroke) + ' RG');
        ops.push(n(x * PT) + ' ' + n(H - (y + h) * PT) + ' ' + n(w * PT) + ' ' + n(h * PT) + ' re ' + (o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'));
        ops.push('Q');
        cur.push(ops.join('\n'));
        return api;
      },
      line(x1, y1, x2, y2, o) {
        o = o || {};
        cur.push('q ' + n((o.lw || 0.2) * PT) + ' w ' + col(o.stroke || [0, 0, 0]) + ' RG ' + n(x1 * PT) + ' ' + n(H - y1 * PT) + ' m ' + n(x2 * PT) + ' ' + n(H - y2 * PT) + ' l S Q');
        return api;
      },
      // y = Grundlinie (mm von oben)
      text(x, y, s, o) {
        o = o || {};
        const size = o.size || 10;
        let t = String(s);
        if (o.maxW) while (t.length > 1 && width(t, size, o.bold) > o.maxW) t = t.slice(0, -2) + '…';
        const w = width(t, size, o.bold);
        const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
        cur.push('BT /' + (o.bold ? 'F2' : 'F1') + ' ' + n(size) + ' Tf ' + col(o.color || [0, 0, 0]) + ' rg ' + n(x0 * PT) + ' ' + n(H - y * PT) + ' Td (' + enc(t) + ') Tj ET');
        return api;
      },
      // Schraffur im Rechteck (abgeschnitten): dir 'h' waagerecht, 'v' senkrecht, 'd' schräg 45°; gap Linienabstand in mm
      schraffur(x, y, w, h, dir, gap, o) {
        o = o || {};
        const ops = ['q', n(x * PT) + ' ' + n(H - (y + h) * PT) + ' ' + n(w * PT) + ' ' + n(h * PT) + ' re W n', n((o.lw || 0.15) * PT) + ' w', col(o.stroke || [0.6, 0.6, 0.6]) + ' RG'];
        const seg = (x1, y1, x2, y2) => ops.push(n(x1 * PT) + ' ' + n(H - y1 * PT) + ' m ' + n(x2 * PT) + ' ' + n(H - y2 * PT) + ' l');
        if (dir === 'h') for (let yy = y + gap / 2; yy < y + h; yy += gap) seg(x, yy, x + w, yy);
        else if (dir === 'v') for (let xx = x + gap / 2; xx < x + w; xx += gap) seg(xx, y, xx, y + h);
        else for (let t = -h; t < w; t += gap) seg(x + t, y + h, x + t + h, y);
        ops.push('S', 'Q');
        cur.push(ops.join('\n'));
        return api;
      },
      // JPEG-Bild (Bytes) in mm-Rechteck; pw/ph = Pixelmaße
      image(x, y, w, h, jpeg, pw, ph) {
        images.push({ data: jpeg, pw: pw, ph: ph });
        const name = 'Im' + images.length;
        cur.push('q ' + n(w * PT) + ' 0 0 ' + n(h * PT) + ' ' + n(x * PT) + ' ' + n(H - (y + h) * PT) + ' cm /' + name + ' Do Q');
        cur.images = (cur.images || []).concat([name]);
        return api;
      },
      textWidth: width,
      /*
       * Tabelle ab y (mm); cols: [{ t: Kopf, w: Breite mm, align }], rows: [[Zellen]]; bricht auf neue Seiten um
       * (onPage(y) zeichnet den Seitenkopf und gibt das neue y zurück). Ergebnis: y nach der Tabelle.
       */
      table(x, y, cols, rows, o) {
        o = o || {};
        const size = o.size || 8.5;
        const lh = size * 0.36 + 2.6;
        const bottom = hmm - (o.bottom || 14);
        const head = (yy) => {
          let cx = x;
          for (const c of cols) {
            api.text(c.align === 'right' ? cx + c.w - 1.5 : cx + 1.5, yy + lh - 1.6, c.t, { size: size, bold: true, align: c.align === 'right' ? 'right' : 'left', maxW: c.w - 2 });
            cx += c.w;
          }
          api.line(x, yy + lh, x + cols.reduce((a, c) => a + c.w, 0), yy + lh, { lw: 0.35 });
          return yy + lh;
        };
        y = head(y);
        for (const r of rows) {
          if (y + lh > bottom) { api.page(); y = head(o.onPage ? o.onPage() : 15); }
          let cx = x;
          cols.forEach((c, i) => {
            api.text(c.align === 'right' ? cx + c.w - 1.5 : cx + 1.5, y + lh - 1.6, r[i] === undefined ? '' : r[i], { size: size, align: c.align === 'right' ? 'right' : 'left', maxW: c.w - 2 });
            cx += c.w;
          });
          y += lh;
          api.line(x, y, x + cols.reduce((a, c) => a + c.w, 0), y, { lw: 0.15, stroke: [0.6, 0.6, 0.6] });
        }
        return y;
      },
      // fertige PDF-Datei als Uint8Array
      save() {
        const objs = [];
        const add = (s) => { objs.push(s); return objs.length; };
        const catalog = add(null);
        const pagesId = add(null);
        const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        const bin = (u8) => { let t = ''; for (let i = 0; i < u8.length; i += 8192) t += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return t; };
        const imgIds = images.map((im) => add('<< /Type /XObject /Subtype /Image /Width ' + im.pw + ' /Height ' + im.ph +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.data.length + ' >>\nstream\n' + bin(im.data) + '\nendstream'));
        const kids = [];
        for (const p of pages) {
          const body = p.join('\n');
          const cs = add('<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream');
          const xo = (p.images || []).map((nm) => '/' + nm + ' ' + imgIds[+nm.slice(2) - 1] + ' 0 R').join(' ');
          kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + n(wmm * PT) + ' ' + n(H) + '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 +
            ' 0 R >>' + (xo ? ' /XObject << ' + xo + ' >>' : '') + ' >> /Contents ' + cs + ' 0 R >>'));
        }
        objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
        objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
        let out = '%PDF-1.4\n%âãÏÓ\n';
        const offs = [];
        objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
        const xref = out.length;
        out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
        out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
        const bytes = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
        return bytes;
      },
    };
    return api;
  }

  return { doc: doc };
});
