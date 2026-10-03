/*
 * Liest eine Maestro-Werkzeugliste (.tlgx) und teilt die Werkzeuge in Fräser, Sägen und Bohrer ein.
 * Bewusst ohne XML-Parser (läuft im Browser und in Node gleich).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ToolLibrary = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = (block, tag) => {
    const m = new RegExp('<(?:\\w+:)?' + tag + '>(-?[\\d.]+)<').exec(block);
    return m ? parseFloat(m[1]) : null;
  };

  // XML-Entitäten in Namen/Beschreibungen auflösen (&amp; → & usw.)
  function xmlText(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k];
    });
  }

  function parseTlgx(text) {
    const tools = [];
    const blocks = String(text).split(/<CoreTool[\s>]/).slice(1);
    for (const b of blocks) {
      const type = (/i:type="(?:\w+:)?(\w+)"/.exec(b) || [])[1] || '';
      if (type !== 'CuttingTool') continue;
      const rawName = (/<Name[^>]*>([^<]*)<\/Name>/.exec(b) || [])[1];
      const name = rawName && xmlText(rawName).trim();
      if (!name) continue;
      const disabled = /<IsDisabled>true</.test(b);
      const desc = xmlText((/<Description>([^<]*)</.exec(b) || [])[1] || '').trim();
      const unit = (/KindOfTool>(\w+)</.exec(b) || [])[1] || '';
      const body = (/ToolBody i:type="(?:\w+:)?(\w+)"/.exec(b) || [])[1] || '';
      let kind;
      if (body === 'UniversalBlade') kind = 'saw';
      else if (/Boring/.test(unit)) kind = 'drill';
      else if (body === 'SandMill') kind = 'other';
      else kind = 'mill';
      const tip = num(b, 'TipAngle');
      tools.push({
        name: name.trim(),
        desc: desc,
        kind: kind,
        body: body,
        d: num(b, 'Diameter'),
        len: num(b, 'SinkingLength'),
        blade: num(b, 'BladeThickness'),
        tipAngle: tip !== null ? Math.round((tip * 180) / Math.PI * 100) / 100 : null,
        disabled: disabled,
      });
    }
    return tools;
  }

  // Lesbare Bezeichnung für Auswahllisten
  function label(t) {
    const parts = [t.name];
    if (t.desc) parts.push(t.desc);
    const dims = [];
    if (t.kind === 'saw' && t.blade) dims.push('Blatt ' + t.blade);
    else if (t.d) dims.push('Ø' + Math.round(t.d * 100) / 100);
    if (t.len) dims.push('NL ' + t.len);
    if (t.tipAngle) dims.push(t.tipAngle + '°');
    return parts.join(' – ') + (dims.length ? ' (' + dims.join(', ') + ')' : '');
  }

  function infoMap(tools) {
    const m = {};
    for (const t of tools || []) m[t.name] = { d: t.d, len: t.len, blade: t.blade, kind: t.kind };
    return m;
  }

  return { parseTlgx: parseTlgx, label: label, infoMap: infoMap };
});
