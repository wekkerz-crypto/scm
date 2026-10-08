/*
 * Weckwop – Sägemodus und Listen-Seite (07-saegemodus.js)
 * Sägemodus (Schritte, Karte, Vollbild, Etiketten beim Sägen), Sprachsteuerung (`sawAction`), Seite „Listen“ (Reiter, Zoom).
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 13) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

/*
 * Sägemodus: eine Platte Schritt für Schritt – Anschnitt (Besäumen), Streifen, Querschnitte, Nachschnitte, Abfall.
 * Schritte aus CutPlan.cutSequence (kind, size = Maß ab Anschlag, rest, done); Stand in lst.saw = { key, step }.
 */
function sawSheets() {
  const out = [];
  for (const g of cutGroups()) g.plan.sheets.forEach((sh, i) => { if (sh.parts.length) out.push({ g: g, s: sh, i: i, key: g.key + '#' + i }); });
  return out;
}
// Schnittfolge-Einstellungen (Sägemodus), gemerkt in lst.sawCfg
const SAW_CFG = { primary: 'plan', trimLong: true, trimCross: true, trimFirst: 'long', startX: 'left', startY: 'back', order: 'depth', trims: 'now',
  trimMax: 150, trimPct: 30, restMin: 300, measure: 'piece', labelPopup: true, stripPopup: true, labelMode: null };
// Etiketten beim Sägen: 'off' (keine), 'popup' (Fenster zum Antippen), 'auto' (bei „Weiter“ gleich drucken); alt: labelPopup
const sawLabelMode = (c) => (['off', 'popup', 'auto'].includes(c.labelMode) ? c.labelMode : c.labelPopup === false ? 'off' : 'popup');
const sawCfg = () => Object.assign({}, SAW_CFG, lst.sawCfg || {});
function sawSteps(x) {
  const cfg = sawCfg();
  const seq = seqOf(x.s, x.g);
  const steps = [];
  if (lst.trim > 0) {
    const ds = cfg.trimFirst === 'cross' ? ['v', 'h'] : ['h', 'v'];
    for (const d of ds) if (d === 'h' ? cfg.trimLong : cfg.trimCross) steps.push({ kind: 'anschnitt', dir: d, size: lst.trim, parts: [], done: [] });
  }
  for (const c of seq.cuts) steps.push(c);
  return { steps: steps, ok: seq.ok, cfg: cfg, strips: seq.strips };
}
const SAW_KIND = { anschnitt: 'Anschnitt', strip: 'Streifen', cross: 'Querschnitt', trim: 'Nachschnitt', waste: 'Abfall' };
function sawText(st, x, cfg) {
  const pn = (uid) => { const p = x.s.parts.find((q) => q.uid === uid); return p ? 'Teil ' + p.id + ' · ' + p.label + ' ' + n1(p.l) + ' × ' + n1(p.w) : uid; };
  const dirName = st.dir === 'h' ? 'Längsschnitt' : 'Querschnitt';
  const len = st.to !== undefined ? n1(st.to - st.from) : '';
  const inPiece = st.parts.length ? (st.parts.length === 1 ? pn(st.parts[0]) : st.parts.length + ' Teile') : '';
  const restTx = st.restParts === 0 && st.rest > 0 ? n1(st.rest) + ' mm ' + (st.rest >= (+cfg.restMin || 0) ? 'Reststück' : 'Abfall') : '';
  if (st.kind === 'anschnitt') {
    const far = st.dir === 'h' ? cfg.startY === 'back' : cfg.startX === 'right';
    return { kind: 'Anschnitt', cls: 'anschnitt', dir: (st.dir === 'h' ? 'Längs' : 'Quer') + ' besäumen', tx: 'Fabrikkante ' + (st.dir === 'h' ? (far ? 'oben (hinten)' : 'unten (vorne)') : (far ? 'rechts' : 'links')) + ' abschneiden.', inn: '', rest: '' };
  }
  if (st.kind === 'strip') return { kind: 'Streifen', cls: 'strip', dir: dirName, tx: 'Streifen abtrennen, ' + len + ' mm lang.', inn: inPiece, rest: restTx };
  if (st.kind === 'cross') return { kind: st.level === 1 ? 'Querschnitt im Streifen' : 'Schnitt im Stück', cls: 'cross', dir: dirName, tx: 'Stück abtrennen.', inn: inPiece, rest: restTx };
  if (st.kind === 'waste') return { kind: 'Abfall', cls: 'waste', dir: dirName, tx: 'Abfall abschneiden, dann weiter.', inn: '', rest: '' };
  return { kind: 'Nachschnitt', cls: 'trim', dir: dirName, tx: 'Auf Maß schneiden – Überstand ab.', inn: st.parts.length ? pn(st.parts[0]) : '', rest: n1(st.rest) + ' mm Überstand (Abfall)' };
}
// Maß für den Anschlag: abgetrenntes Stück (Parallelanschlag) oder Restmaß (Programmanschlag der Aufteilsäge)
const sawMeasure = (st, cfg) => (st.kind !== 'anschnitt' && cfg.measure === 'remain' ? { v: st.rest, u: 'mm Restmaß' } : { v: st.size, u: 'mm' });
function sawSvg(x, steps, cur, cfg, strips) {
  const sh = x.s;
  const k = Math.max(0, lst.kerf);
  const done = new Set();
  steps.slice(0, cur).forEach((st) => st.done.forEach((u) => done.add(u)));
  const Y = (y) => sh.W - y;
  // Streifen: aktueller hervorgehoben, fertige (alle Teile ab) blass
  const mk = stripMarks(strips, sh, { cur: steps[cur] ? steps[cur].sn : 0, done: new Set((strips || []).filter((q) => q.parts.every((u) => done.has(u))).map((q) => q.n)) });
  const ml = Math.max(40, mk.l);
  const mb = Math.max(40, mk.b);
  let o = '<svg class="sheet sawsheet" viewBox="' + -ml + ' -40 ' + (sh.L + ml + 40) + ' ' + (sh.W + 40 + mb) + '" role="img" aria-label="Platte ' + (x.i + 1) + ' Sägeschritt ' + (cur + 1) + '">' + mk.svg +
    '<rect x="0" y="0" width="' + sh.L + '" height="' + sh.W + '" class="sh"/>' +
    '<rect x="' + lst.trim + '" y="' + lst.trim + '" width="' + (sh.L - 2 * lst.trim) + '" height="' + (sh.W - 2 * lst.trim) + '" class="trim"/>';
  // fertige Teile sind weg (abgestapelt) – es bleiben die noch zu schneidenden
  for (const p of sh.parts) {
    if (done.has(p.uid)) continue;
    o += '<rect x="' + p.x + '" y="' + Y(p.y + p.w) + '" width="' + p.l + '" height="' + p.w + '" class="pt"/>' + partLabelSvg(p, Y(p.y + p.w), false, lst.sawFont);
  }
  const line = (st) => {
    if (st.kind === 'anschnitt') {
      const far = st.dir === 'h' ? cfg.startY === 'back' : cfg.startX === 'right';
      const t = far ? (st.dir === 'h' ? sh.W - lst.trim : sh.L - lst.trim) : lst.trim;
      return st.dir === 'h' ? [0, t, sh.L, t] : [t, 0, t, sh.W];
    }
    const c = st.c + k / 2;
    return st.dir === 'h' ? [st.from, c, st.to, c] : [c, st.from, c, st.to];
  };
  steps.slice(0, cur).forEach((st) => { const l = line(st); o += '<line x1="' + l[0] + '" y1="' + Y(l[1]) + '" x2="' + l[2] + '" y2="' + Y(l[3]) + '" class="spast"/>'; });
  const st = steps[cur];
  if (st) {
    // abgetrenntes Stück hervorheben (bei Anschnitt der Randstreifen)
    let r;
    if (st.kind === 'anschnitt') {
      const l = line(st);
      r = st.dir === 'h' ? { x0: 0, x1: sh.L, y0: Math.min(l[1], l[1] < sh.W / 2 ? 0 : sh.W), y1: Math.max(l[1], l[1] < sh.W / 2 ? 0 : sh.W) }
        : { y0: 0, y1: sh.W, x0: Math.min(l[0], l[0] < sh.L / 2 ? 0 : sh.L), x1: Math.max(l[0], l[0] < sh.L / 2 ? 0 : sh.L) };
    } else {
      const g = st.region;
      const hi = st.side === 'hi';
      r = st.dir === 'h' ? { x0: g.x0, x1: g.x1, y0: hi ? st.c + k : g.y0, y1: hi ? g.y1 : st.c } : { y0: g.y0, y1: g.y1, x0: hi ? st.c + k : g.x0, x1: hi ? g.x1 : st.c };
    }
    o += '<rect x="' + r.x0 + '" y="' + Y(r.y1) + '" width="' + (r.x1 - r.x0) + '" height="' + (r.y1 - r.y0) + '" class="scur"/>';
    const l = line(st);
    o += '<line x1="' + l[0] + '" y1="' + Y(l[1]) + '" x2="' + l[2] + '" y2="' + Y(l[3]) + '" class="snow"/>';
    // Pfeil am Schnittanfang (Sägerichtung)
    const a = 54;
    const atEnd = st.start !== undefined && st.kind !== 'anschnitt' && Math.abs(st.start - st.to) < 1;
    if (st.dir === 'h') {
      const xs = atEnd ? l[2] + 6 : l[0] - 6;
      o += '<path d="M' + xs + ' ' + Y(l[1]) + ' l' + (atEnd ? a : -a) + ' ' + (-a * 0.7) + ' v' + (a * 1.4) + ' z" class="sarr"/>';
    } else {
      const ys = atEnd ? Y(l[3]) - 6 : Y(l[1]) + 6;
      o += '<path d="M' + l[0] + ' ' + ys + ' l' + (-a * 0.7) + ' ' + (atEnd ? -a : a) + ' h' + (a * 1.4) + ' z" class="sarr"/>';
    }
  }
  return o + '</svg>';
}
function sawCfgHtml(cfg) {
  const sel = (id, opts, v, label, tip) => '<label' + (tip ? ' title="' + esc(tip) + '"' : '') + '><span>' + label + '</span><select data-sawcfg="' + id + '">' +
    opts.map(([k, t]) => '<option value="' + k + '"' + (String(v) === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>';
  const num = (id, v, label, unit, tip) => '<label' + (tip ? ' title="' + esc(tip) + '"' : '') + '><span>' + label + '</span><span><input type="number" min="0" step="1" data-sawcfg="' + id + '" value="' + esc(v) + '"> ' + unit + '</span></label>';
  const chk = (id, v, label) => '<label class="ck"><input type="checkbox" data-sawcfg="' + id + '"' + (v ? ' checked' : '') + '> ' + label + '</label>';
  return '<div class="sawcfg" id="sawcfg"><h4>Schnittfolge einstellen</h4><div class="grid">' +
    '<fieldset><legend>Anschnitt (Besäumen ' + fmt(lst.trim) + ' mm)</legend>' + chk('trimLong', cfg.trimLong, 'längs') + chk('trimCross', cfg.trimCross, 'quer') +
      sel('trimFirst', [['long', 'erst längs'], ['cross', 'erst quer']], cfg.trimFirst, 'Reihenfolge') + '</fieldset>' +
    '<fieldset><legend>Schnitte</legend>' + sel('primary', [['plan', 'wie Zuschnittplan'], ['long', 'längs (Streifen über die Länge)'], ['cross', 'quer (Streifen über die Breite)']], cfg.primary, 'Erste Schnitte') +
      sel('order', [['depth', 'jeden Streifen gleich fertig'], ['strips', 'erst alle Streifen, dann quer']], cfg.order, 'Reihenfolge') + '</fieldset>' +
    '<fieldset><legend>Anschlag / Beginn</legend>' + sel('startX', [['left', 'links'], ['right', 'rechts']], cfg.startX, 'Quer ab') +
      sel('startY', [['back', 'oben (hinten)'], ['front', 'unten (vorne)']], cfg.startY, 'Längs ab') +
      sel('measure', [['piece', 'abgetrenntes Stück (Parallelanschlag)'], ['remain', 'Restmaß (Programmanschlag)']], cfg.measure, 'Maß zeigen') + '</fieldset>' +
    '<fieldset><legend>Nachschnitt</legend>' + sel('trims', [['now', 'sofort'], ['strip', 'nach jedem Streifen'], ['end', 'am Schluss gesammelt']], cfg.trims, 'Wann') +
      num('trimMax', cfg.trimMax, 'Überstand bis', 'mm', 'Ein Schnitt heißt Nachschnitt, wenn nur noch ein Teil im Stück ist und höchstens so viel abkommt') +
      num('trimPct', cfg.trimPct, 'oder bis', '% vom Maß') + num('restMin', cfg.restMin, 'Reststück ab', 'mm', 'Größere Reste heißen Reststück, kleinere Abfall') + '</fieldset>' +
    '<fieldset><legend>Etikett</legend>' + sel('labelMode', [['off', 'aus'], ['popup', 'Fenster zum Antippen'], ['auto', 'automatisch bei „Weiter“ drucken']], sawLabelMode(cfg), 'Etiketten') +
      chk('stripPopup', cfg.stripPopup, 'Streifen-Etikett nach jedem Streifen') + '</fieldset>' +
    '</div><div class="row"><button type="button" class="btn ghost small" data-saw="cfgreset">Standard</button><button type="button" class="btn small" data-saw="cfgclose">Fertig</button></div></div>';
}
function renderSaw() {
  const list = sawSheets();
  const host = $('sawview');
  if (!list.length) { host.innerHTML = '<p class="note">Keine Teile für den Zuschnitt.</p>'; return; }
  if (!lst.saw || !list.some((x) => x.key === lst.saw.key)) lst.saw = { key: list[0].key, step: 0 };
  const xi = list.findIndex((x) => x.key === lst.saw.key);
  const x = list[xi];
  const { steps, ok, cfg, strips } = sawSteps(x);
  // Plan dieser Platte geändert (Teile verschoben, Besäumen …): der alte Schritt passt nicht mehr – von vorn
  const sg = sawSig(x);
  if (lst.saw.sig !== sg) { if (lst.saw.sig) { lst.saw.step = 0; sawPop = null; } lst.saw.sig = sg; saveLst(); }
  const cur = Math.max(0, Math.min(steps.length, lst.saw.step | 0));
  lst.saw.step = cur;
  const st = steps[cur];
  if (!lst.sawDone || typeof lst.sawDone !== 'object') lst.sawDone = {};
  const t = st ? sawText(st, x, cfg) : null;
  const m = st ? sawMeasure(st, cfg) : null;
  const fin = st ? st.done.map((u) => x.s.parts.find((q) => q.uid === u)).filter(Boolean) : [];
  const doneN = steps.slice(0, cur).reduce((a, q) => a + q.done.length, 0);
  const next = steps.slice(cur + 1, cur + 4);
  const full = host.classList.contains('sawfull');
  const kindTot = {};
  for (const q of steps) kindTot[q.kind] = (kindTot[q.kind] || 0) + 1;
  host.innerHTML = '<div class="sawbar"><label>Platte <select id="sawsheet" aria-label="Platte zum Sägen">' + list.map((y, k) => '<option value="' + esc(y.key) + '"' + (k === xi ? ' selected' : '') + '>' +
      esc(y.g.name + ' ' + fmt(y.g.T) + ' mm – Platte ' + (y.i + 1) + ' von ' + y.g.plan.sheets.length) + '</option>').join('') + '</select></label>' +
    '<span class="sn">' + (st ? 'Schritt ' + (cur + 1) + ' von ' + steps.length : 'fertig') + ' · Teile fertig ' + doneN + ' / ' + x.s.parts.length + '</span>' +
    '<span class="sawprog" aria-hidden="true"><i style="width:' + Math.round((cur / Math.max(1, steps.length)) * 100) + '%"></i></span>' +
    '<span class="czoom" role="group" aria-label="Zoom Platte" title="Größe der Platte – auch Strg + Mausrad"><span>Platte</span><button type="button" class="btn small" data-szoom="-1" aria-label="Platte kleiner">−</button>' +
      '<output id="szoomv">' + Math.round((lst.sawZoom || 1) * 100) + ' %</output><button type="button" class="btn small" data-szoom="1" aria-label="Platte größer">+</button></span>' +
    '<span class="czoom" role="group" aria-label="Zoom Schrift" title="Schrift im Plan – auch Strg + Umschalt + Mausrad"><span>Schrift</span><button type="button" class="btn small" data-sfont="-1" aria-label="Schrift kleiner">−</button>' +
      '<output id="sfontv">' + Math.round((lst.sawFont || 1) * 100) + ' %</output><button type="button" class="btn small" data-sfont="1" aria-label="Schrift größer">+</button></span>' +
    ((m) => '<span class="seg lmode" role="group" aria-label="Etiketten beim Sägen" title="Etiketten beim Sägen: aus, Fenster zum Antippen oder automatisch bei „Weiter“ drucken">' +
      '<span class="lab">🏷 Etiketten</span>' + [['off', 'Aus'], ['popup', 'Fenster'], ['auto', 'Automatisch']].map(([k, t]) =>
      '<button type="button" data-lmode="' + k + '" aria-pressed="' + (m === k) + '">' + t + '</button>').join('') + '</span>')(sawLabelMode(cfg)) +
    '<span class="seg vctl" role="group" aria-label="Sprache"><button type="button" data-saw="voice" aria-pressed="' + voiceOn() + '" title="Sprachbefehle: „weiter“, „zurück“, „drucken“, „nächster Streifen“, „nächste Platte“, „nochmal“, „Mikrofon aus“">🎤 Sprache</button>' +
      '<button type="button" data-saw="say" aria-pressed="' + !!lst.sawSay + '" title="Ansage: Schritt und Maß nach jedem Schritt vorlesen">🔊 Ansage</button>' +
      '<button type="button" data-saw="ai" aria-pressed="' + !!lst.sawAi + '" title="KI hört mit: Sätze, die kein fester Befehl sind (z. B. „geh zu Platte 2, Streifen 3“, „wie viele Teile fehlen noch?“), gehen an den KI-Assistenten (ChatGPT/Claude), die Antwort wird vorgelesen">🤖 KI</button></span>' +
    '<button type="button" class="btn ghost small" data-saw="cfg" aria-expanded="' + String(!!lst.sawCfgOpen) + '">⚙ Schnittfolge</button>' +
    '<button type="button" class="btn ghost small" data-saw="reset">Von vorn</button>' +
    '<button type="button" class="btn small drwbtn" data-saw="drw" title="Zeichnungen zum Projekt bildschirmfüllend (Z) – blättern mit ← →, Sprache „Zeichnung“, „nächste Seite“, „Zeichnung zu“">📄 Zeichnungen' + (drw.list.length ? ' <small>' + drw.list.length + '</small>' : '') + '</button>' +
    '<button type="button" class="btn small" data-saw="full" aria-pressed="' + full + '">' + (full ? '✕ Vollbild beenden' : '⛶ Vollbild') + '</button></div>' +
    (lst.sawCfgOpen ? sawCfgHtml(cfg) : '') + sawOverHtml(list, xi) +
    (ok ? '' : '<p class="warn">Diese Anordnung ist nicht ganz mit durchgehenden Schnitten trennbar – im Zuschnittplan prüfen.</p>') +
    '<div class="saw"><div class="sawdraw">' + sawSvg(x, steps, cur, cfg, strips) + '</div><div class="sawcard" aria-live="polite">' +
    (voice.msg || voice.heard ? '<div class="vstat' + (voice.msg ? ' warn' : '') + '" role="status">' + esc(voice.msg || '🎤 „' + voice.heard + '“' + (voice.cmd ? '' : lst.sawAi ? ' → KI' : ' – kein Befehl (z. B. „Hilfe“)')) + '</div>' : '') +
    (voice.reply ? '<div class="vstat reply" role="status">' + esc(voice.reply) + '</div>' : '') +
    (st ? '<div class="sawhead"><span class="sk ' + t.cls + '">' + esc(t.kind) + '</span>' +
      (st.sn ? '<span class="sstrip" title="Streifen – Nummer am Rand der Platte">Streifen <b>' + st.sn + '</b>/' + strips.length + '</span>' : '') + '<span class="snum">' + (cur + 1) + '<small>/' + steps.length + '</small></span></div>' +
      '<div class="fence"><span class="fl">' + (st.kind === 'anschnitt' ? 'Abschneiden' : cfg.measure === 'remain' ? 'Anschlag einstellen · Restmaß' : 'Anschlag einstellen') + '</span>' +
      '<span class="big" style="--nl:' + n1(m.v).length + '">' + n1(m.v) + '<small>mm</small></span></div>' +
      '<div class="dir"><span class="darr" aria-hidden="true">' + (st.dir === 'h' ? '⟷' : '↕') + '</span> ' + esc(t.dir) + '</div>' +
      (st.kind !== 'anschnitt' && cfg.measure === 'remain' ? '<div class="sub2">Stück ' + n1(st.size) + ' mm</div>' : st.kind !== 'anschnitt' && st.rest > 0 && !t.rest ? '<div class="sub2">Rest ' + n1(st.rest) + ' mm</div>' : '') +
      '<div class="tx">' + esc(t.tx) + '</div>' +
      (st.sn ? '<button type="button" class="btn ghost small sstriplbl" data-saw="striplbl" title="Etikett für diesen Streifen (Nr., Material, Platte)">🏷 Streifen ' + st.sn + ' – Etikett</button>' : '') +
      (t.inn ? '<div class="inn"><span>Im Stück</span>' + esc(t.inn) + '</div>' : '') +
      (t.rest ? '<div class="inn"><span>Übrig</span>' + esc(t.rest) + '</div>' : '') +
      (fin.length ? '<div class="fin">' + fin.map((p) => '<div>✓ ' + esc('Teil ' + p.id + ' · ' + p.label) + ' <b>' + n1(p.l) + ' × ' + n1(p.w) + '</b></div>').join('') + '</div>' : '') +
      '<div class="nx"><span>Danach</span>' + (next.length ? '<ol start="' + (cur + 2) + '">' + next.map((q) => { const tq = sawText(q, x, cfg); const mq = sawMeasure(q, cfg); return '<li><b>' + esc(tq.kind) + '</b>' + (q.sn ? ' <span class="sn2">S' + q.sn + '</span>' : '') + ' ' + (q.dir === 'h' ? 'längs' : 'quer') + ' · ' + n1(mq.v) + ' mm</li>'; }).join('') + '</ol>' : '<p>Danach ist die Platte fertig.</p>') + '</div>'
      : '<div class="sawhead"><span class="sk done">Fertig</span></div><div class="dir">Platte ' + (x.i + 1) + ' ist geschnitten – ' + x.s.parts.length + ' Teile.</div>' +
        (list[xi + 1] ? '<button type="button" class="btn sawbig" data-saw="nextsheet">Nächste Platte ▶</button>' : '<div class="tx">Alle Platten fertig.</div>')) +
    '<div class="sawnav"><button type="button" class="btn ghost" data-saw="prev"' + (cur ? '' : ' disabled') + '>◀ Zurück</button>' +
    '<button type="button" class="btn go" data-saw="next"' + (st ? '' : ' disabled') + '>Weiter ▶</button></div>' +
    '<div class="sn keys">Tasten: → oder Leertaste = weiter · ← = zurück · F = Vollbild' + (voiceOn() ? ' · Sprache: „weiter“, „zurück“, „drucken“, „nächster Streifen“, „Streifen drei“, „Hilfe“' : '') + '</div>' +
    '<div class="sn">' + Object.entries(kindTot).map(([k2, v]) => v + ' × ' + SAW_KIND[k2]).join(' · ') + '</div></div></div>' + sawPopHtml(x);
  $('sawsheet').addEventListener('change', (e) => { lst.saw = { key: e.target.value, step: 0 }; sawPop = null; saveLst(); renderSaw(); });
  host.querySelectorAll('[data-saw]').forEach((b) => b.addEventListener('click', () => sawGo(b.dataset.saw)));
  host.querySelectorAll('[data-lmode]').forEach((b) => b.addEventListener('click', () => {
    lst.sawCfg = Object.assign({}, lst.sawCfg || {}, { labelMode: b.dataset.lmode });
    saveLst();
    renderSaw(); // Schnittfolge bleibt, nur die Etiketten ändern sich
  }));
  host.querySelectorAll('[data-szoom]').forEach((b) => b.addEventListener('click', () => setSawZoom((lst.sawZoom || 1) + 0.1 * +b.dataset.szoom)));
  host.querySelectorAll('[data-sfont]').forEach((b) => b.addEventListener('click', () => setSawFont((lst.sawFont || 1) + 0.1 * +b.dataset.sfont)));
  host.querySelectorAll('[data-sawgo]').forEach((b) => b.addEventListener('click', () => { lst.saw = { key: b.dataset.sawgo, step: 0 }; sawPop = null; saveLst(); renderSaw(); }));
  host.querySelectorAll('[data-sawlbl]').forEach((b) => b.addEventListener('click', () => {
    const part = sawPart(x, b.dataset.sawlbl);
    if (!part) return;
    sawPop.printed.add(b.dataset.sawlbl);
    printLabels([part]);
    renderSaw();
  }));
  host.querySelectorAll('[data-sawcfg]').forEach((inp) => inp.addEventListener('change', () => {
    const c = Object.assign({}, lst.sawCfg || {});
    const k2 = inp.dataset.sawcfg;
    c[k2] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? Math.max(0, +inp.value || 0) : inp.value;
    lst.sawCfg = c;
    if (!['labelMode', 'stripPopup'].includes(k2)) lst.saw.step = 0; // andere Folge: von vorn (Etiketten ändern die Folge nicht)
    saveLst();
    renderSaw();
  }));
}
// Platte als geschnitten gemerkt? (Signatur = Gruppe + Teile der Platte)
const sawSig = (x) => {
  const t = x.g.sig + '|' + x.s.parts.map((p) => p.uid + '@' + Math.round(p.x) + ',' + Math.round(p.y)).join(';');
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const sawIsDone = (x) => !!lst.sawDone && lst.sawDone[x.key] === sawSig(x);
// Übersicht im Sägemodus: alle Platten als Felder (fertige abgehakt), Tippen = diese Platte sägen
function sawOverHtml(list, xi) {
  const nd = list.filter(sawIsDone).length;
  const byG = new Map();
  list.forEach((x, k) => { if (!byG.has(x.g.key)) byG.set(x.g.key, []); byG.get(x.g.key).push([x, k]); });
  return '<div class="sawover" aria-label="Übersicht Platten"><span class="so-t"><b>' + nd + ' / ' + list.length + '</b> Platten geschnitten</span>' +
    Array.from(byG.values()).map((xs) => '<span class="so-g"><span class="so-n">' + boardSwatch(xs[0][0].g.board) + esc(xs[0][0].g.name + ' ' + fmt(xs[0][0].g.T)) + '</span>' +
      xs.map(([x, k]) => '<button type="button" class="so-s' + (sawIsDone(x) ? ' done' : '') + (k === xi ? ' cur' : '') + '" data-sawgo="' + esc(x.key) + '" title="Platte ' + (x.i + 1) +
        ' · ' + x.s.parts.length + ' Teile' + (sawIsDone(x) ? ' · geschnitten' : '') + '"' + (k === xi ? ' aria-current="true"' : '') + '>' + (sawIsDone(x) ? '✓' : x.i + 1) + '</button>').join('') + '</span>').join('') +
    (nd ? '<button type="button" class="btn ghost small" data-saw="donereset" title="Haken bei allen Platten entfernen">Haken löschen</button>' : '') + '</div>';
}
// Bauteil zu einem Stück im Plan (uid id#n)
function sawPart(x, uid) {
  const [id, n] = String(uid).split('#');
  const it = x.g.items.find((q) => String(q.id) === id);
  return it && it.pp ? it.pp[(+n || 1) - 1] || it.pp[0] : null;
}
// Fenster „Teil fertig – Etikett drucken“ (nach einem Schnitt, der Teile fertig macht)
let sawPop = null; // { uids, printed: Set }
function sawPopHtml(x) {
  if (!sawPop) return '';
  const ps = sawPop.uids.map((u) => [u, x.s.parts.find((q) => q.uid === u)]).filter((q) => q[1]);
  if (!ps.length && !sawPop.strip) return '';
  const sp = sawPop.strip ? stripsOf(x.g, x.i).find((q) => q.strip.n === sawPop.strip) : null;
  const done = sawPop.printed.has('strip');
  return '<div class="sawpop" role="dialog" aria-modal="true" aria-label="Etikett drucken"><div class="sawpopin"><h3>' + (ps.length ? '✓ Fertig geschnitten' : '✓ Streifen ' + sawPop.strip + ' abgetrennt') + '</h3>' +
    '<p class="sn">Antippen – das Etikett wird gedruckt.</p><div class="sawtiles">' +
    (sp ? '<button type="button" class="sawtile stile' + (done ? ' printed' : '') + '" data-saw="striplbl"><span class="s-tn">Streifen ' + sp.strip.n + '<small> / ' + sp.nStrips + '</small></span>' +
      '<span class="s-tl">' + esc(x.g.name + ' · ' + fmt(x.g.T) + ' mm') + '</span><span class="s-td">Platte ' + (x.i + 1) + ' / ' + x.g.plan.sheets.length + '</span>' +
      '<span class="s-tp">' + (done ? '✓ gedruckt – nochmal' : '🏷 Streifen-Etikett drucken') + '</span></button>' : '') +
    ps.map(([u, p]) => '<button type="button" class="sawtile' + (sawPop.printed.has(u) ? ' printed' : '') + '" data-sawlbl="' + esc(u) + '"><span class="s-tn">Nr. ' + esc(String(p.id)) + '</span>' +
      '<span class="s-tl">' + esc(p.label) + '</span><span class="s-td">' + n1(p.l) + ' × ' + n1(p.w) + ' mm</span><span class="s-tp">' + (sawPop.printed.has(u) ? '✓ gedruckt – nochmal' : '🏷 Etikett drucken') + '</span></button>').join('') +
    '</div><button type="button" class="btn sawbig" data-saw="popclose">Weiter sägen ▶</button></div></div>';
}
// Vollbild: echtes Vollbild, wo der Browser es erlaubt, sonst über die ganze Seite
function sawFull(on) {
  const host = $('sawview');
  host.classList.toggle('sawfull', on);
  document.body.classList.toggle('sawlock', on);
  try {
    if (on && host.requestFullscreen && !document.fullscreenElement) host.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch (e) { /* nur Seiten-Vollbild */ }
  renderSaw();
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && $('sawview').classList.contains('sawfull')) sawFull(false); });
function sawGo(what) {
  const list = sawSheets();
  if (!lst.saw) return;
  const xi = list.findIndex((x) => x.key === lst.saw.key);
  if (xi < 0) return;
  const n = sawSteps(list[xi]).steps.length;
  if (what === 'popclose') { sawPop = null; renderSaw(); return; }
  if (sawPop && (what === 'next' || what === 'prev')) { sawPop = null; renderSaw(); return; } // erst das Fenster schließen
  if (what === 'next') {
    const st = sawSteps(list[xi]).steps[lst.saw.step | 0];
    lst.saw.step = Math.min(n, (lst.saw.step | 0) + 1);
    // letzter Schnitt gemacht: Platte als geschnitten merken
    if (st && lst.saw.step === n) { if (!lst.sawDone || typeof lst.sawDone !== 'object') lst.sawDone = {}; lst.sawDone[list[xi].key] = sawSig(list[xi]); }
    const c = sawCfg();
    const mode = sawLabelMode(c);
    // Streifen abgetrennt (mehrere Teile darin): Streifen-Etikett; fertige Teile: Teil-Etiketten
    const strip = mode !== 'off' && st && st.kind === 'strip' && st.sn && st.parts.length > 1 && c.stripPopup ? st.sn : 0;
    const uids = mode !== 'off' && st ? st.done.slice() : [];
    if (mode === 'auto' && (uids.length || strip)) {
      // Automatik: gleich drucken, ohne Fenster (ein Druckauftrag)
      const x = list[xi];
      const parts = uids.map((u) => sawPart(x, u)).filter((q) => q && q.res && q.res.panel);
      const sp = strip ? stripsOf(x.g, x.i).find((q) => q.strip.n === strip) : null;
      if (!parts.length && !sp) { saveLst(); renderSaw(); return; }
      lblNums = labelNums();
      printLabelHtml((sp ? stripLabelHtml(sp) : '') + parts.map(labelHtml).join(''));
      toast('🏷 ' + [sp ? 'Streifen ' + strip : '', parts.length ? parts.length + ' Etikett' + (parts.length === 1 ? '' : 'en') : ''].filter(Boolean).join(' + ') + ' gedruckt');
    } else if (uids.length || strip) sawPop = { uids: uids, printed: new Set(), strip: strip };
  }
  else if (what === 'prev') lst.saw.step = Math.max(0, (lst.saw.step | 0) - 1);
  else if (what === 'reset') { lst.saw.step = 0; sawPop = null; }
  else if (what === 'striplbl') {
    // aktueller Streifen (bzw. der eben im Fenster gezeigte)
    const x = list[xi];
    const st = sawSteps(x).steps[lst.saw.step | 0];
    const sn = sawPop && sawPop.strip ? sawPop.strip : st && st.sn;
    const all = stripsOf(x.g, x.i);
    const one = all.find((q) => q.strip.n === sn);
    if (one) { printStripLabels([one]); if (sawPop && sawPop.strip) sawPop.printed.add('strip'); }
    renderSaw();
    return;
  }
  else if (what === 'nextsheet' && list[xi + 1]) lst.saw = { key: list[xi + 1].key, step: 0 };
  else if (what === 'full') { sawFull(!$('sawview').classList.contains('sawfull')); return; }
  else if (what === 'drw') { drwOverlay(true); return; }
  else if (what === 'voice') { voiceToggle(); return; }
  else if (what === 'say') { lst.sawSay = !lst.sawSay; saveLst(); renderSaw(); if (lst.sawSay) sawSay(); return; }
  else if (what === 'ai') {
    lst.sawAi = !lst.sawAi;
    saveLst();
    if (lst.sawAi && !aiReady()) toast('🤖 Für freie Sätze im KI-Assistenten (✨ oben) den API-Schlüssel eintragen.');
    if (voiceOn()) voice.ctl.restart(); // Offline-Erkennung: mit/ohne Befehls-Grammatik
    renderSaw();
    return;
  }
  else if (what === 'strip') {
    // nächster Streifen: zum ersten Schritt eines anderen Streifens (ohne Etiketten)
    const steps = sawSteps(list[xi]).steps;
    const cur = lst.saw.step | 0;
    const sn = steps[cur] && steps[cur].sn;
    let j = cur + 1;
    while (j < steps.length && !(steps[j].sn && steps[j].sn !== sn)) j++;
    lst.saw.step = Math.min(n, j);
    sawPop = null;
    if (lst.saw.step === n) { if (!lst.sawDone || typeof lst.sawDone !== 'object') lst.sawDone = {}; lst.sawDone[list[xi].key] = sawSig(list[xi]); }
  }
  else if (what === 'cfg') lst.sawCfgOpen = !lst.sawCfgOpen;
  else if (what === 'cfgclose') lst.sawCfgOpen = false;
  else if (what === 'cfgreset') { lst.sawCfg = null; lst.saw.step = 0; }
  else if (what === 'donereset') lst.sawDone = {};
  saveLst();
  renderSaw();
}
/*
 * Sprachsteuerung (js/voice.js) und Steuerung des Sägemodus von außen (Sprache, KI-Werkzeug saegen_steuern, Schnittstelle):
 * sawAction(aktion, o) → neuer Stand (sawStatusObj). Befehle wie die Knöpfe; „drucken“ druckt die Etiketten im offenen
 * Fenster (sonst das Streifen-Etikett). Ansage (lst.sawSay): Schritt und Maß nach jedem Schritt vorlesen. Sätze, die kein
 * Befehl sind, gehen bei „🤖 KI“ (lst.sawAi) an den KI-Assistenten, die Antwort wird vorgelesen.
 */
const voice = { ctl: null, msg: '', heard: '', cmd: null, reply: '' };
const voiceOn = () => !!(voice.ctl && voice.ctl.on);
const onSaw = () => state.page === 'lists' && lst.tab === 'saw';
function voiceToggle() {
  if (!voice.ctl) {
    voice.ctl = Voice.create({
      voskBase: new URL('js/vendor/vosk/', location.href).href,
      free: () => !!lst.sawAi,
      onCommand: (cmd, t, c) => voiceCommand(c),
      onFree: (t) => { if (lst.sawAi && onSaw()) aiVoice(t); },
      onHeard: (t, cmd) => { voice.heard = t; voice.cmd = cmd; voice.msg = ''; if (cmd) voice.reply = ''; if (onSaw()) renderSaw(); },
      onState: (x) => { voice.msg = x.msg; if (!x.on) voice.heard = ''; if (onSaw()) renderSaw(); },
    });
  }
  if (voice.ctl.on) { voice.ctl.stop(); voice.msg = ''; voice.heard = ''; voice.reply = ''; renderSaw(); toast('🎤 Sprache aus'); }
  else { voice.msg = ''; voice.ctl.start().then(() => { if (voice.ctl.on) toast('🎤 Sprache an – z. B. „weiter“, „zurück“, „drucken“, „Streifen drei“, „Hilfe“'); renderSaw(); }); }
}
// aktuelle Platte und Schritt
function sawCur() {
  const list = sawSheets();
  if (!list.length) return null;
  if (!lst.saw || !list.some((y) => y.key === lst.saw.key)) lst.saw = { key: list[0].key, step: 0 };
  const xi = list.findIndex((y) => y.key === lst.saw.key);
  const x = list[xi];
  const sq = sawSteps(x);
  const cur = Math.max(0, Math.min(sq.steps.length, lst.saw.step | 0));
  return { list: list, xi: xi, x: x, steps: sq.steps, cfg: sq.cfg, strips: sq.strips, cur: cur };
}
const stepInfo = (c, st, k) => { const t = sawText(st, c.x, c.cfg); return { schritt: k + 1, art: t.kind, streifen: st.sn || null, mass_mm: Math.round(sawMeasure(st, c.cfg).v * 10) / 10, richtung: st.dir === 'h' ? 'längs' : 'quer', text: t.tx }; };
function sawStatusObj() {
  const c = sawCur();
  if (!c) return { aktiv: onSaw(), meldung: 'Keine Teile für den Zuschnitt.' };
  const { x, steps, cur } = c;
  const same = c.list.filter((y) => y.g.key === x.g.key);
  const st = steps[cur];
  return { aktiv: onSaw(), platte: { nr: x.i + 1, von: x.g.plan.sheets.length, material: x.g.name, D: x.g.T, geschnitten: sawIsDone(x) },
    schritt: st ? cur + 1 : null, schritte: steps.length, fertig: !st, aktuell: st ? stepInfo(c, st, cur) : null, streifen_gesamt: c.strips.length,
    teile_fertig: steps.slice(0, cur).reduce((a, q) => a + q.done.length, 0), teile_gesamt: x.s.parts.length,
    danach: steps.slice(cur + 1, cur + 4).map((q, k) => stepInfo(c, q, cur + 1 + k)), etikett_fenster_offen: !!sawPop,
    etiketten_modus: sawLabelMode(c.cfg), ansage: !!lst.sawSay, vollbild: $('sawview').classList.contains('sawfull'),
    platten_dieses_materials: same.length, platten: c.list.map((y) => ({ material: y.g.name, D: y.g.T, nr: y.i + 1, geschnitten: sawIsDone(y), aktuell: y.key === x.key })) };
}
function sawStatusText() {
  const o = sawStatusObj();
  if (!o.platte) return o.meldung;
  return o.platte.material + ' ' + fmt(o.platte.D) + ', Platte ' + o.platte.nr + ' von ' + o.platte.von + '. ' +
    (o.fertig ? 'Diese Platte ist fertig.' : 'Schritt ' + o.schritt + ' von ' + o.schritte + (o.aktuell.streifen ? ', Streifen ' + o.aktuell.streifen + ' von ' + o.streifen_gesamt : '') + '.') +
    ' ' + o.teile_fertig + ' von ' + o.teile_gesamt + ' Teilen fertig.';
}
function sawGoStep(k) { lst.saw.step = k; sawPop = null; }
// Steuerung wie die Knöpfe (aktion = Werkzeug saegen_steuern); Fehler als Exception mit Text zum Vorlesen
function sawAction(aktion, o) {
  o = o || {};
  if (/^zeichnung_/.test(aktion)) return drwAction(aktion, o); // Zeichnungen gehen auch ohne Zuschnitt
  if (!onSaw()) { lst.tab = 'saw'; saveLst(); setPage('lists'); }
  let c = sawCur();
  if (!c) throw new Error('Keine Teile für den Zuschnitt.');
  const firstOf = (sn) => c.steps.findIndex((q) => q.sn === sn);
  switch (aktion) {
    case 'weiter': sawGo('next'); break;
    case 'zurueck': sawGo('prev'); break;
    case 'naechster_streifen': sawGo('strip'); break;
    case 'vorheriger_streifen': {
      const sn = c.steps[c.cur] && c.steps[c.cur].sn;
      const from = sn ? firstOf(sn) : c.cur;
      let j = from - 1;
      while (j >= 0 && !(c.steps[j].sn && c.steps[j].sn !== sn)) j--;
      sawGoStep(j >= 0 ? firstOf(c.steps[j].sn) : 0);
      break;
    }
    case 'naechste_platte': if (!c.list[c.xi + 1]) throw new Error('Das ist die letzte Platte.'); lst.saw = { key: c.list[c.xi + 1].key, step: 0 }; sawPop = null; break;
    case 'vorherige_platte': if (!c.xi) throw new Error('Das ist die erste Platte.'); lst.saw = { key: c.list[c.xi - 1].key, step: 0 }; sawPop = null; break;
    case 'von_vorn': sawGo('reset'); break;
    case 'gehe_zu': {
      if (o.platte) {
        const want = o.gruppe_material ? normWord(o.gruppe_material) : null;
        const gk = want ? (c.list.find((y) => normWord(y.g.name + ' ' + fmt(y.g.T)).includes(want)) || {}).g : c.x.g;
        if (!gk) throw new Error('Material „' + o.gruppe_material + '“ ist nicht im Zuschnitt.');
        const same = c.list.filter((y) => y.g.key === gk.key);
        const y = same[o.platte - 1];
        if (!y) throw new Error('Platte ' + o.platte + ' gibt es nicht – ' + gk.name + ' hat ' + same.length + ' Platte' + (same.length === 1 ? '' : 'n') + '.');
        lst.saw = { key: y.key, step: 0 };
        sawPop = null;
        c = sawCur();
      }
      if (o.streifen) {
        const k = firstOf(o.streifen);
        if (k < 0) throw new Error('Streifen ' + o.streifen + ' gibt es auf dieser Platte nicht – sie hat ' + c.strips.length + ' Streifen.');
        sawGoStep(k);
      }
      if (o.schritt) {
        if (o.schritt > c.steps.length) throw new Error('Schritt ' + o.schritt + ' gibt es nicht – diese Platte hat ' + c.steps.length + ' Schritte.');
        sawGoStep(o.schritt - 1);
      }
      if (!o.platte && !o.streifen && !o.schritt) throw new Error('gehe_zu braucht schritt, streifen oder platte.');
      break;
    }
    case 'drucken': sawPrintNow(); break;
    case 'streifen_etikett': {
      if (!(c.steps[c.cur] && c.steps[c.cur].sn) && !(sawPop && sawPop.strip)) throw new Error('Hier gibt es kein Streifen-Etikett.');
      sawGo('striplbl');
      break;
    }
    case 'vollbild_an': if (!$('sawview').classList.contains('sawfull')) sawFull(true); break;
    case 'vollbild_aus': if ($('sawview').classList.contains('sawfull')) sawFull(false); break;
    case 'etiketten_aus': case 'etiketten_fenster': case 'etiketten_automatisch':
      lst.sawCfg = Object.assign({}, lst.sawCfg || {}, { labelMode: { etiketten_aus: 'off', etiketten_fenster: 'popup', etiketten_automatisch: 'auto' }[aktion] });
      break;
    case 'ansage_an': lst.sawSay = true; break;
    case 'ansage_aus': lst.sawSay = false; break;
    case 'vorlesen': sawSay(); break;
    default: throw new Error('unbekannte Aktion: ' + aktion);
  }
  saveLst();
  if (onSaw()) renderSaw();
  return sawStatusObj();
}
const MOVES = new Set(['weiter', 'zurueck', 'naechster_streifen', 'vorheriger_streifen', 'naechste_platte', 'vorherige_platte', 'von_vorn', 'gehe_zu']);
const SAW_HELP = 'Sag zum Beispiel: weiter, zurück, drucken, nächster Streifen, Streifen drei, nächste Platte, Platte zwei, Schritt fünf, von vorn, ' +
  'wie weit, was kommt danach, nochmal, Ansage an oder aus, Etiketten aus, Fenster oder automatisch, Vollbild, Zeichnung, nächste Seite, Seite zwei, Zeichnung zu, Mikrofon aus.';
function voiceCommand(c) {
  if (!onSaw()) return;
  const map = { next: 'weiter', prev: 'zurueck', strip: 'naechster_streifen', prevstrip: 'vorheriger_streifen', sheet: 'naechste_platte', prevsheet: 'vorherige_platte',
    reset: 'von_vorn', print: 'drucken', printstrip: 'streifen_etikett', fullon: 'vollbild_an', fulloff: 'vollbild_aus', sayon: 'ansage_an', sayoff: 'ansage_aus', say: 'vorlesen',
    drawon: 'zeichnung_an', drawoff: 'zeichnung_aus', pagenext: 'zeichnung_weiter', pageprev: 'zeichnung_zurueck' };
  // Zeichnung offen: „weiter“/„zurück“ blättern in der Zeichnung, „Seite 3“ springt dorthin
  if (drw.over && (c.cmd === 'next' || c.cmd === 'prev')) c = { cmd: c.cmd === 'next' ? 'pagenext' : 'pageprev' };
  try {
    if (c.cmd === 'status') { Voice.say(sawStatusText()); return; }
    if (c.cmd === 'help') { Voice.say(SAW_HELP); return; }
    if (c.cmd === 'preview') {
      const o = sawStatusObj();
      Voice.say(o.danach && o.danach.length ? 'Danach: ' + o.danach.slice(0, 2).map((q) => q.art + ' ' + q.richtung + ', ' + n1(q.mass_mm) + ' Millimeter').join('. Dann ') + '.' : 'Danach ist die Platte fertig.');
      return;
    }
    if (c.cmd === 'lmode') { sawAction({ off: 'etiketten_aus', popup: 'etiketten_fenster', auto: 'etiketten_automatisch' }[c.arg]); Voice.say({ off: 'Etiketten aus.', popup: 'Etiketten im Fenster.', auto: 'Etiketten automatisch.' }[c.arg]); return; }
    let a = map[c.cmd];
    let o = {};
    if (c.cmd === 'gostrip') { a = 'gehe_zu'; o = { streifen: c.n }; }
    if (c.cmd === 'gosheet') { a = 'gehe_zu'; o = { platte: c.n }; }
    if (c.cmd === 'gostep') { a = 'gehe_zu'; o = { schritt: c.n }; }
    if (c.cmd === 'gopage') { a = 'zeichnung_seite'; o = { seite: c.n }; }
    if (!a) return;
    sawAction(a, o);
    if (c.cmd === 'sayon') Voice.say('Ansage an.');
    else if (c.cmd === 'sayoff') Voice.say('Ansage aus.');
    else if (lst.sawSay && MOVES.has(a)) sawSay();
  } catch (e) {
    voice.reply = '⚠ ' + e.message;
    renderSaw();
    Voice.say(e.message);
  }
}
// „drucken“: offenes Etikett-Fenster ganz (Streifen + Teile, ein Druckauftrag), sonst das Streifen-Etikett
function sawPrintNow() {
  const list = sawSheets();
  const x = lst.saw && list.find((y) => y.key === lst.saw.key);
  if (!x) return;
  if (sawPop) {
    const parts = sawPop.uids.map((u) => sawPart(x, u)).filter((q) => q && q.res && q.res.panel);
    const sp = sawPop.strip ? stripsOf(x.g, x.i).find((q) => q.strip.n === sawPop.strip) : null;
    if (!parts.length && !sp) { toast('Nichts zu drucken.'); return; }
    lblNums = labelNums();
    printLabelHtml((sp ? stripLabelHtml(sp) : '') + parts.map(labelHtml).join(''));
    if (sp) sawPop.printed.add('strip');
    for (const u of sawPop.uids) sawPop.printed.add(u);
    renderSaw();
    return;
  }
  const st = sawSteps(x).steps[lst.saw.step | 0];
  if (st && st.sn) sawGo('striplbl'); else toast('Nichts zu drucken – Etiketten gibt es nach einem Schnitt, der Teile fertig macht.');
}
// Ansage des aktuellen Schritts (Sprachausgabe des Browsers)
function sawSay() {
  const list = sawSheets();
  const x = lst.saw && list.find((y) => y.key === lst.saw.key);
  if (!x) return;
  const { steps, cfg } = sawSteps(x);
  const cur = lst.saw.step | 0;
  const st = steps[cur];
  if (sawPop) { Voice.say('Fertig. Etikett drucken oder weiter.'); return; }
  if (!st) { Voice.say('Platte ' + (x.i + 1) + ' ist fertig.'); return; }
  const t = sawText(st, x, cfg);
  const m = sawMeasure(st, cfg);
  Voice.say('Schritt ' + (cur + 1) + '. ' + (st.sn ? 'Streifen ' + st.sn + '. ' : '') + t.kind + ', ' + (st.dir === 'h' ? 'längs' : 'quer') + '. ' + n1(m.v) + ' Millimeter.');
}
// Seite oder Reiter verlassen: Mikrofon aus
function voiceIdle() { if (voiceOn() && !onSaw()) { voice.ctl.stop(true); voice.heard = ''; voice.msg = ''; voice.reply = ''; } }
document.addEventListener('keydown', (e) => {
  if (state.page !== 'lists' || lst.tab !== 'saw' || e.altKey || e.ctrlKey || e.metaKey || drw.over) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) && e.key === ' ') return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === 'Escape' && sawPop) { sawGo('popclose'); return; }
  if (e.key === 'Escape' && $('sawview').classList.contains('sawfull')) { sawFull(false); return; }
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); sawGo('full'); return; }
  if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); sawGo('drw'); return; }
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); sawGo('next'); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); sawGo('prev'); }
});
function renderLists() {
  if (state.page !== 'lists') return;
  document.querySelectorAll('[data-ltab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ltab === lst.tab)));
  $('bomview').hidden = lst.tab !== 'bom';
  $('cutview').hidden = lst.tab !== 'cut';
  $('sawview').hidden = lst.tab !== 'saw';
  if (lst.tab !== 'bom') { $('erpanel').hidden = true; $('bomnew').hidden = true; }
  $('bomopts').hidden = lst.tab !== 'bom';
  $('bomnewbtn').hidden = lst.tab !== 'bom';
  $('cutopts').hidden = lst.tab === 'bom';
  $('czoomg').hidden = $('cfontg').hidden = lst.tab !== 'cut'; // Sägemodus: eigene Regler oben in der Leiste
  $('lcsv').hidden = lst.tab !== 'bom';
  $('lgroup').checked = lst.group;
  voiceIdle();
  if (lst.tab === 'bom') renderBom();
  else if (lst.tab === 'saw') renderSaw();
  else $('cutsheets').innerHTML = renderCut(false);
}
document.querySelectorAll('[data-ltab]').forEach((b) => b.addEventListener('click', () => { lst.tab = b.dataset.ltab; saveLst(); renderLists(); }));
$('lgroup').addEventListener('change', (e) => { lst.group = e.target.checked; saveLst(); renderLists(); });
for (const [id, k] of [['csheetL', 'sheetL'], ['csheetW', 'sheetW'], ['ckerf', 'kerf'], ['ctrim', 'trim'], ['emm', 'edgeMm'], ['eextra', 'edgeExtra']]) {
  $(id).value = lst[k];
  $(id).addEventListener('change', (e) => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (v >= 0) { lst[k] = v; saveLst(); renderLists(); } });
}
for (const [id, k] of [['ename1', 'edgeName1'], ['ename2', 'edgeName2']]) {
  $(id).value = lst[k] || '';
  $(id).addEventListener('change', (e) => { lst[k] = e.target.value.trim(); saveLst(); applyBoards(); });
}
$('ecol2').value = /^#[0-9a-f]{6}$/i.test(lst.edgeColor2 || '') ? lst.edgeColor2 : '#5b4a3a';
$('ecol2').addEventListener('input', (e) => { lst.edgeColor2 = e.target.value; saveLst(); applyBoards(); });
// Zoom des Zuschnittplans: 30 … 100 % der Fenstergröße, nur CSS (kein Neuzeichnen)
function setCutZoom(z) {
  lst.cutZoom = Math.max(0.3, Math.min(1, Math.round(z * 10) / 10));
  $('cutsheets').style.setProperty('--cz', String(lst.cutZoom));
  $('czoomv').textContent = Math.round(lst.cutZoom * 100) + ' %';
  saveLst();
}
document.querySelectorAll('[data-czoom]').forEach((b) => b.addEventListener('click', () => setCutZoom(b.dataset.czoom === 'fit' ? 1 : (lst.cutZoom || 0.7) + 0.1 * +b.dataset.czoom)));
$('cutsheets').addEventListener('wheel', (e) => {
  if (!e.ctrlKey || !e.target.closest('svg.sheet')) return;
  e.preventDefault();
  if (e.shiftKey) setCutFont((lst.cutFont || 1) + (e.deltaY < 0 ? 0.1 : -0.1));
  else setCutZoom((lst.cutZoom || 0.7) + (e.deltaY < 0 ? 0.1 : -0.1));
}, { passive: false });
setCutZoom(lst.cutZoom || 0.7);
// Schriftgröße der Beschriftung (Faktor 50 … 250 %) – zeichnet neu
const fontOf = (z) => Math.max(0.5, Math.min(2.5, Math.round(z * 10) / 10));
function setCutFont(z) {
  lst.cutFont = fontOf(z);
  $('cfontv').textContent = Math.round(lst.cutFont * 100) + ' %';
  saveLst();
  if (state.page === 'lists' && lst.tab === 'cut') $('cutsheets').innerHTML = renderCut(false);
}
document.querySelectorAll('[data-cfont]').forEach((b) => b.addEventListener('click', () => setCutFont((lst.cutFont || 1) + 0.1 * +b.dataset.cfont)));
$('cfontv').textContent = Math.round((lst.cutFont || 1) * 100) + ' %';
// Sägemodus: Plattengröße (CSS --sz, 50 … 160 %) und Schrift
function setSawZoom(z) {
  lst.sawZoom = Math.max(0.5, Math.min(1.6, Math.round(z * 10) / 10));
  $('sawview').style.setProperty('--sz', String(lst.sawZoom));
  const o = $('szoomv');
  if (o) o.textContent = Math.round(lst.sawZoom * 100) + ' %';
  saveLst();
}
function setSawFont(z) {
  lst.sawFont = fontOf(z);
  saveLst();
  renderSaw();
}
$('sawview').addEventListener('wheel', (e) => {
  if (!e.ctrlKey || !e.target.closest('svg.sheet')) return;
  e.preventDefault();
  if (e.shiftKey) setSawFont((lst.sawFont || 1) + (e.deltaY < 0 ? 0.1 : -0.1));
  else setSawZoom((lst.sawZoom || 1) + (e.deltaY < 0 ? 0.1 : -0.1));
}, { passive: false });
setSawZoom(lst.sawZoom || 1);
for (const [id, k] of [['cdir', 'dir'], ['cgoal', 'goal']]) {
  $(id).value = lst[k];
  $(id).addEventListener('change', (e) => { lst[k] = e.target.value; saveLst(); renderLists(); });
}
for (const [id, k] of [['craw', 'raw'], ['cgrain', 'grain'], ['ccuts', 'cuts'], ['ededuct', 'edgeDeduct']]) {
  $(id).checked = lst[k];
  $(id).addEventListener('change', (e) => { lst[k] = e.target.checked; saveLst(); renderLists(); });
}
$('lpdf').addEventListener('click', () => (lst.tab === 'bom' ? bomPdf(false) : cutPdf(false)));
$('lcsv').addEventListener('click', () => saveOne('stueckliste.csv', bomCsv(), 'text/csv;charset=utf-8'));
$('lprintbtn').addEventListener('click', () => {
  if (lst.tab === 'bom') printOr(bomPdf, () => printA4(bomPrintHtml(), true));
  else printOr(cutPdf, () => printA4('<h1>Zuschnittplan</h1><p class="meta">' + new Date().toLocaleDateString('de-DE') + ' · Schnittfuge ' + fmt(lst.kerf) + ' mm · Besäumen ' + fmt(lst.trim) +
    ' mm · ' + (lst.raw ? 'Rohmaß (mit Aufmaß)' : 'Fertigmaß') + '</p>' + renderCut(true), true));
});
