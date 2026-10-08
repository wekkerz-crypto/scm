/*
 * Weckwop – Anzeige der Teile (03-anzeige.js)
 * Teileliste links, Detail eines Teils (Bearbeitungen, Werkzeuge, Schnittwerte, Drehen/Wenden/Kippen), Draufsicht.
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 13) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

// ------------------------------------------------ Darstellung
// Farbe (CSS-Token) je Bearbeitungsart – gleich in Draufsicht, Liste, Zeitleiste und Animation
function opToken(op) {
  if (!op) return '--mill';
  if (op.kind === 'drill') return op.plane ? '--sdrill' : op.face === 'Top' ? '--drill' : '--hdrill';
  if (op.kind === 'sdrill') return '--sdrill';
  if (op.kind === 'pocket') return op.face && op.face !== 'Top' ? '--hdrill' : '--pocket';
  if (op.kind === 'chamfer' || op.kind === 'slant' || op.kind === 'slantpath' || op.profile) return '--chamfer';
  if (op.kind === 'surface' || op.kind === 'cyl4') return '--pocket';
  if (op.kind === 'slot' || op.kind === 'blade' || op.kind === 'clamex' || /^rebate-/.test(op.key || '')) return '--saw';
  return '--mill';
}

// Eine Zeile je Gruppe in Programmreihenfolge (Fräsung, Falz mit allen Bahnen, gleiche Bohrungen).
function opsSummary(r) {
  const rows = [];
  const byGroup = new Map();
  for (const op of r.ops) {
    let row = byGroup.get(op.group);
    if (!row) {
      row = { group: op.group, ops: [] };
      byGroup.set(op.group, row);
      rows.push(row);
    }
    row.ops.push(op);
  }
  for (const row of rows) {
    const op = row.ops[0];
    if (op.kind === 'drill' || op.kind === 'sdrill') {
      const n = row.ops.reduce((a, o) => a + (o.kind === 'drill' ? o.pattern.nX * o.pattern.nY : 1), 0);
      const d = op.kind === 'drill' ? op.d : op;
      const where = op.kind === 'sdrill' ? 'schräg ' + fmt(op.angleB) + '°'
        : op.plane ? 'auf Schräge ' + fmt(Math.round(op.plane.xRot * 10) / 10) + '°' : FACE[op.face];
      row.c = 'var(' + opToken(op) + ')';
      row.k = n + ' × Bohrung Ø' + fmt(d.d) + ' ' + where + (d.tip === 'L' ? ' (durch)' : '');
      row.v = 'T ' + fmt(d.depth);
      row.op = op; // nur Vorschub/Drehzahl (Bohrer wählt Maestro nach Ø)
    } else {
      row.c = 'var(' + opToken(op) + ')';
      row.k = op.label + (row.ops.length > 1 ? ' (' + row.ops.length + ' Bahnen)' : '');
      row.v = 'T ' + fmt(op.depth || op.height || 0);
      row.op = op;
    }
  }
  return rows;
}

// Schnittwerte: Werkzeug der Bearbeitung (Bohrungen: erster Bohrer mit passendem Ø), Werte aus der Werkzeugdatei
function techTool(op) {
  if (op.kind === 'drill' || op.kind === 'sdrill') {
    const d = op.kind === 'drill' ? op.d.d : op.d;
    return state.tools.find((t) => t.kind === 'drill' && !t.disabled && t.d && Math.abs(t.d - d) < 0.05) || null;
  }
  return state.tools.find((t) => t.name === op.tool) || null;
}
const TECH = [['feed', 'Vorschub', 'm/min'], ['rot', 'Drehzahl', 'U/min'], ['descent', 'Eintauchen', 'm/min']];
function techBox(part, op) {
  const t = techTool(op);
  const db = (t && t.tech) || {};
  const own = (ovOf(part).tech || {})[op.group] || {};
  const drill = op.kind === 'drill' || op.kind === 'sdrill';
  const fields = drill ? [['rot', 'Drehzahl', 'U/min'], ['feed', 'Bohrvorschub', 'm/min']] : TECH;
  const val = (k) => (own[k] > 0 ? own[k] : db[k] ? db[k][0] : null);
  const nOwn = fields.filter(([k]) => own[k] > 0).length;
  const sum = fields.map(([k, , u]) => (val(k) !== null ? fmt(val(k)) + ' ' + u : '–')).join(' · ');
  const src = nOwn ? 'eigene Werte' : t && t.tech ? 'Werkzeugdatei' + (drill ? ' (' + t.name + ')' : '') : 'nicht in der Werkzeugdatei';
  let html = '<details class="tech" data-techgrp="' + esc(op.group) + '"' + (state.techOpen.has(op.group) ? ' open' : '') + '><summary><span class="tsum">' + esc(sum) +
    '</span> <span class="tsrc' + (nOwn ? ' own' : '') + '">' + esc(src) + '</span></summary><div class="trow">';
  for (const [k, label, unit] of fields) {
    const r = db[k];
    const out = own[k] > 0 && r && r[1] !== null && r[2] !== null && (own[k] < r[1] - 1e-9 || own[k] > r[2] + 1e-9);
    html += '<label' + (out ? ' class="out" title="außerhalb ' + fmt(r[1]) + '–' + fmt(r[2]) + ' laut Werkzeugdatei"' : '') + '>' + label +
      ' <input class="step" type="number" min="0" step="' + (k === 'rot' ? 500 : 0.5) + '" data-tech="' + k + '" data-techfor="' + esc(op.group) + '" value="' +
      (own[k] > 0 ? own[k] : '') + '" placeholder="' + (r ? fmt(r[0]) : '–') + '"> ' + unit +
      (r && r[1] !== null && r[2] !== null ? ' <small>' + fmt(r[1]) + '–' + fmt(r[2]) + '</small>' : '') + '</label>';
  }
  if (nOwn) html += '<button type="button" class="btn ghost small" data-techreset="' + esc(op.group) + '">Werte aus der Werkzeugdatei</button>';
  return html + '</div></details>';
}

function opControls(part, op) {
  if (!op) return '';
  if (op.kind === 'drill' || op.kind === 'sdrill') return techBox(part, op);
  if (op.macro) {
    // Makro: Werkzeug, Tiefe und Schnittwerte kommen aus dem Makro bzw. SawCut_Lamello.xspc
    const m = op.macro;
    return '<span class="note">Makro ' + esc(state.settings.clamexMacro || 'SawCut_Lamello') + ' · ' + (m.n > 1 ? m.n + ' Verbinder X ' + fmt(m.x) + ' Y ' + fmt(m.y) +
      ' → X ' + fmt(m.ex) + ' Y ' + fmt(m.ey) : 'X ' + fmt(m.x) + ' Y ' + fmt(m.y)) + ' · Winkel ' + fmt(m.angle) + '° · Richtung ' + fmt(m.angleZ) + '°' +
      (m.kind !== 'face' ? ' · Höhe ' + fmt(Math.round(m.h * 100) / 100) + ' mm' : '') + ' · P-' + m.type + '</span>';
  }
  let html = '';
  if (op.key === 'format') {
    // je Teil umschaltbar: normal (ein Werkzeug) oder zweistufig (vorfräsen mit Aufmaß, nachfräsen)
    const two = !!op.rough;
    html += '<span class="seg small" role="group" aria-label="Formatfräsen für dieses Teil">' +
      '<button type="button" data-twostep="0" aria-pressed="' + !two + '">Normal</button>' +
      '<button type="button" data-twostep="1" aria-pressed="' + two + '">Zweistufig</button></span>' +
      (two ? '<span class="rough" title="Werkzeug 1 und Aufmaß unter Werkzeuge &amp; Regeln">vor: ' + esc(op.rough.tool) + ' +' + fmt(op.rough.allowance) + ' mm · nach:</span>' : '');
  }
  if (op.tabsOption) {
    // Haltestege je Durchbruch an/aus (Vorgabe aus Werkzeuge & Regeln)
    const on = !!op.tabs;
    html += '<span class="seg small" role="group" aria-label="Haltestege für diesen Durchbruch" title="Haltestege: Innenstück bleibt hängen (' +
      fmt(state.settings.tabsCount) + ' Stege, ' + fmt(state.settings.tabLength) + ' × ' + fmt(state.settings.tabHeight) + ' mm)">' +
      '<span class="lab">Haltestege</span><button type="button" data-tabs="' + esc(op.key) + '" data-on="0" aria-pressed="' + !on + '">Aus</button>' +
      '<button type="button" data-tabs="' + esc(op.key) + '" data-on="1" aria-pressed="' + on + '">An</button></span>';
  }
  if (op.rebateStop && op === part.result.ops.find((o) => o.key === op.key)) {
    // abgesetzter Falz je Teil: einfach (ein-, durch-, austauchen) oder nochmal zurück mit der Mitte auf der Kante
    const back = !!op.rebateReturn;
    html += '<span class="seg small" role="group" aria-label="Abgesetzter Falz für dieses Teil">' +
      '<button type="button" data-rebret="0" aria-pressed="' + !back + '" title="außen eintauchen, an der Flanke entlang, über die Kante austauchen">Einfach</button>' +
      '<button type="button" data-rebret="1" aria-pressed="' + back + '" title="nochmal zurück mit der Werkzeugmitte auf der Plattenkante – an den Enden bleibt nichts stehen">Mit Rückweg</button></span>';
  }
  html += toolSelect('data-tool="' + esc(op.key) + '" aria-label="Werkzeug für ' + esc(op.label) + '"', op.toolKind, op.tool);
  if (op.depthAdjustable) {
    const ownD = ovOf(part).depths[op.key];
    html += '<label title="Frästiefe in mm, leer = Plattendicke + Zugabe aus den Einstellungen">Tiefe <input class="step" type="number" min="0" step="0.5" data-depth="' +
      esc(op.key) + '" value="' + (ownD !== undefined ? ownD : '') + '" placeholder="' + fmt(op.depth) + '"> mm</label>';
  }
  if (op.osc) {
    html += '<span class="note">Tiefe pendelt ' + fmt(op.osc.min) + '–' + fmt(op.osc.max) + ' mm (' + fmt(op.osc.min - part.result.panel.T) + '–' +
      fmt(op.osc.max - part.result.panel.T) + ' unter der Platte)' + (op.passes > 1 ? ', ' + op.passes + ' Umläufe' : '') + '</span>';
  } else if ((op.kind === 'contour' && !op.profile) || op.kind === 'pocket') {
    const own = ovOf(part).steps[op.key];
    // wirksame Vorgabe: Einstellung, ggf. vom Werkstück-Profil überschrieben
    const eff = part.profile !== null && part.profile !== undefined ? XcsWriter.applyProfile(state.settings, part.profile) : state.settings;
    html += '<label title="Tiefe je Durchgang in mm, leer = Einstellung für alle Teile, 0 = ein Durchgang">Zustellung <input class="step" type="number" min="0" step="0.5" data-step="' + esc(op.key) + '" value="' +
      (own !== undefined ? own : '') + '" placeholder="' + ((op.kind === 'pocket' && eff.pocketStepDown > 0 ? eff.pocketStepDown : eff.stepDown) || 'aus') + '"> mm</label>';
  }
  return html + techBox(part, op);
}

function counts(r) {
  let drills = 0;
  let mill = 0;
  let saw = 0;
  for (const op of r.ops) {
    if (op.kind === 'drill') drills += op.pattern.nX * op.pattern.nY;
    else if (op.kind === 'sdrill') drills++;
    else if (op.kind === 'blade' || op.kind === 'slot') saw++;
    else mill++;
  }
  return { drills: drills, mill: mill, saw: saw };
}

// Wie oft läuft ein Programm? Stücklisten-Position (gleiches Programm zusammengefasst) → Anzahl und Bauteil-Nr.
function progRuns() {
  const m = new Map();
  for (const row of bomRows()) for (const q of row.parts) m.set(q, row);
  return m;
}
function renderParts() {
  const el = $('parts');
  const runs = progRuns();
  const head = '<div class="head"><button class="btn primary" id="pick" type="button" title="STEP: ein Volumenkörper = ein Programm, Baugruppen werden zerlegt. DXF: größte Kontur = Teil, alles darin als Vorschlag">STEP/DXF wählen</button>' +
    (state.parts.length ? '<span class="tools"><button class="btn small" id="zipall" type="button" title="Alle Programme als ZIP mit konvertieren.bat">' + ICON_ZIP + ' Alle als ZIP</button>' +
      '<button class="btn small" id="labelall" type="button" title="Etiketten aller Teile drucken">' + ICON_PRINT + ' Etiketten</button>' +
      '<button class="btn ghost small" id="clear" type="button" title="Alle Teile aus der Liste entfernen">' + ICON_TRASH + ' Liste leeren</button></span>' : '') +
    '</div>';
  if (!state.parts.length) {
    el.innerHTML = head + '<div class="empty">Noch keine Teile – STEP- oder DXF-Dateien wählen oder auf die Seite ziehen.</div>';
    $('pick').addEventListener('click', openPicker);
    return;
  }
  // Summe: Programmläufe und Maschinenzeit (je Stück × Anzahl)
  let nRun = 0;
  let tAll = 0;
  for (const row of new Set(runs.values())) { nRun += row.qty; if (row.time) tAll += row.time.total * row.qty; }
  el.innerHTML = head + (runs.size ? '<div class="runsum" title="Anzahl aus der Stückliste – gleiche Programme zusammengezählt">' + nRun + ' Programmläufe · ≈ ' + Toolpath.fmtTime(tAll) + ' gesamt</div>' : '');
  state.parts.forEach((p, i) => {
    const b = document.createElement('div');
    b.className = 'part';
    b.setAttribute('aria-current', i === state.sel ? 'true' : 'false');
    const r = p.res || p.result; // Übersicht: Seite 1 (bei zweiseitig mit Hinweis auf Seite 2)
    const name = p.solid ? p.solid.name : p.label;
    let html = (r && r.panel ? thumbSvg(r) : '') + '<span class="n"><span class="pnum" title="Bauteil-Nummer (wie in Möbel 3D)">' + (i + 1) + '</span>' + esc(name) + '</span>';
    if (r && r.panel) {
      const c = counts(r);
      html += '<span class="d">' + fmt(r.panel.L) + ' × ' + fmt(r.panel.W) + ' × ' + fmt(r.panel.T) + '</span>';
      const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
      html += '<span class="chips"><span class="chip ok">' + n(c.drills, 'Bohrung', 'Bohrungen') + '</span>' +
        (c.saw ? '<span class="chip ok">' + n(c.saw, 'Sägeschnitt', 'Sägeschnitte') + '</span>' : '') +
        '<span class="chip ok">' + n(c.mill, 'Fräsung', 'Fräsungen') + '</span>' +
        (r.side2 ? '<span class="chip ok">+ Seite 2: ' + r.side2.ops.length + '</span>' : '') +
        ((tm) => tm ? '<span class="chip" title="' + esc(timeTitle(tm)) + '">≈ ' + Toolpath.fmtTime(tm.total) + '</span>' : '')(partTime(p)) +
        ((row, tm) => row && row.qty !== 1 ? '<span class="chip runs' + (row.qty ? '' : ' none') + '" title="Programm läuft ' + row.qty + '× (Anzahl aus der Stückliste' +
          (row.nums.length > 1 ? '; gleiches Programm: Nr. ' + row.nums.join(', ') : '') + ')">' + row.qty + '×' + (tm && row.qty ? ' = ≈ ' + Toolpath.fmtTime(tm.total * row.qty) : '') + '</span>' : '')(runs.get(p), partTime(p)) +
        (p.profile !== null && p.profile !== undefined ? '<span class="chip prof">' + esc(profName(p.profile)) + '</span>' : '') +
        (r.warnings.length ? '<span class="chip warn">' + r.warnings.length + ' Hinweis' + (r.warnings.length > 1 ? 'e' : '') + '</span>' : '') + '</span>';
    } else {
      html += '<span class="chips"><span class="chip err">Fehler</span></span>';
    }
    b.innerHTML = '<button type="button" class="sel">' + html + '</button>' +
      '<button type="button" class="del" title="Teil entfernen" aria-label="' + esc(name) + ' entfernen">×</button>';
    b.querySelector('.sel').addEventListener('click', () => { state.sel = i; render(); });
    b.querySelector('.del').addEventListener('click', () => removePart(i));
    el.appendChild(b);
  });
  // ausgewähltes Teil in der Leiste sichtbar halten (ohne die Seite zu scrollen)
  const cur = el.querySelector('.part[aria-current="true"]');
  if (cur) {
    const top = cur.offsetTop - el.offsetTop;
    if (top < el.scrollTop) el.scrollTop = top - 4;
    else if (top + cur.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + cur.offsetHeight - el.clientHeight + 4;
    const left = cur.offsetLeft - el.offsetLeft;
    if (left + cur.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = left + cur.offsetWidth - el.clientWidth + 4;
  }
  $('zipall').addEventListener('click', downloadAll);
  $('labelall').addEventListener('click', () => openLabels(state.parts));
  $('pick').addEventListener('click', openPicker);
  $('clear').addEventListener('click', () => { state.parts = []; state.sel = 0; anim.result = null; if (mdl.viewer) mdl.viewer.clearDims(); mdl.dimsSaved = null; render(); });
}

function openPicker() { $('file').click(); }

// Ein Teil aus der Liste entfernen; Auswahl bleibt beim selben Teil bzw. rückt nach
function removePart(i) {
  state.parts.splice(i, 1);
  if (i < state.sel || state.sel >= state.parts.length) state.sel = Math.max(0, state.sel - 1);
  anim.result = null;
  anim.playing = false;
  render();
}

// Mini-Vorschau eines Teils: Kontur, Durchbrüche, Taschen, Bohrungen in den Bearbeitungsfarben
function thumbSvg(r) {
  const p = r.panel;
  const L = p.L;
  const W = p.W;
  const m = Math.max(L, W) * 0.04;
  const Y = (y) => W - y;
  const sw = 'vector-effect="non-scaling-stroke"';
  let s = '<svg class="thumb" viewBox="' + (-m) + ' ' + (-m) + ' ' + (L + 2 * m) + ' ' + (W + 2 * m) + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">';
  const o = loopToPoly(p.outline);
  s += '<path d="' + svgPath(o.start, o.segs, Y) + ' Z" fill="var(--board)" stroke="var(--board-edge)" stroke-width="1" ' + sw + '/>';
  for (const c of p.cutouts) { const q = loopToPoly(c); s += '<path d="' + svgPath(q.start, q.segs, Y) + ' Z" fill="var(--sunken)" stroke="var(--board-edge)" stroke-width="1" ' + sw + '/>'; }
  for (const w of p.slantWalls) {
    s += '<path d="M' + w.top.a[0] + ' ' + Y(w.top.a[1]) + ' L' + w.top.b[0] + ' ' + Y(w.top.b[1]) + ' L' + w.bottom.b[0] + ' ' + Y(w.bottom.b[1]) +
      ' L' + w.bottom.a[0] + ' ' + Y(w.bottom.a[1]) + ' Z" fill="var(--saw)" fill-opacity="0.45"/>';
  }
  for (const g of p.grooves) {
    const x = g.dir === 'X' ? 0 : g.from; const y = g.dir === 'X' ? g.from : 0;
    const w = g.dir === 'X' ? L : g.to - g.from; const h = g.dir === 'X' ? g.to - g.from : W;
    s += '<rect x="' + x + '" y="' + Y(y + h) + '" width="' + w + '" height="' + h + '" fill="var(--saw)" fill-opacity="0.6"/>';
  }
  for (const k of p.pockets) { const q = loopToPoly(k.segs); s += '<path d="' + svgPath(q.start, q.segs, Y) + ' Z" fill="var(--pocket)" fill-opacity="0.55"/>'; }
  const dot = Math.max(L, W) * 0.012;
  for (const d of p.drills) {
    if (d.face === 'Top') s += '<circle cx="' + d.x + '" cy="' + Y(d.y) + '" r="' + Math.max(d.d / 2, dot) + '" fill="var(--drill)"/>';
    else s += '<circle cx="' + d.x + '" cy="' + Y(d.y) + '" r="' + dot + '" fill="var(--hdrill)"/>';
  }
  for (const k of (p.sidePockets || [])) {
    const c = k.face === 'Left' ? [0, W - (k.x0 + k.x1) / 2] : k.face === 'Right' ? [L, (k.x0 + k.x1) / 2] : k.face === 'Front' ? [(k.x0 + k.x1) / 2, 0] : [L - (k.x0 + k.x1) / 2, W];
    s += '<circle cx="' + c[0] + '" cy="' + Y(c[1]) + '" r="' + dot * 1.4 + '" fill="var(--hdrill)"/>';
  }
  for (const sp of (p.slantPlanes || [])) {
    const mp = (l) => [sp.o[0] + sp.X[0] * l[0] + sp.Y[0] * l[1], sp.o[1] + sp.X[1] * l[0] + sp.Y[1] * l[1]];
    for (const d of sp.drills) { const c = mp([d.x, d.y]); s += '<circle cx="' + c[0] + '" cy="' + Y(c[1]) + '" r="' + Math.max(d.d / 2, dot) + '" fill="var(--sdrill)"/>'; }
    for (const k of sp.pockets) { const c = mp([(k.x0 + k.x1) / 2, (k.y0 + k.y1) / 2]); s += '<circle cx="' + c[0] + '" cy="' + Y(c[1]) + '" r="' + dot * 1.6 + '" fill="var(--pocket)"/>'; }
  }
  return s + '</svg>';
}

function svgPath(start, segs, Y) {
  let d = 'M' + start[0] + ' ' + Y(start[1]);
  let cur = start;
  for (const s of segs) {
    if (s.type === 'line') d += ' L' + s.to[0] + ' ' + Y(s.to[1]);
    else {
      const r = Math.hypot(cur[0] - s.c[0], cur[1] - s.c[1]);
      const a0 = Math.atan2(cur[1] - s.c[1], cur[0] - s.c[0]);
      const a1 = Math.atan2(s.to[1] - s.c[1], s.to[0] - s.c[0]);
      let sw = a1 - a0;
      if (s.cw) { while (sw >= 0) sw -= 2 * Math.PI; } else { while (sw <= 0) sw += 2 * Math.PI; }
      d += ' A' + r + ' ' + r + ' 0 ' + (Math.abs(sw) > Math.PI ? 1 : 0) + ' ' + (s.cw ? 1 : 0) + ' ' + s.to[0] + ' ' + Y(s.to[1]);
    }
    cur = s.to;
  }
  return d;
}
const loopToPoly = (loop) => {
  // ganzer Kreis: zwei Halbkreise (ein Bogen mit Anfang = Ende wird in SVG nicht gezeichnet)
  if (loop.length === 1 && loop[0].full) {
    const q = loop[0];
    const opp = [2 * q.c[0] - q.a[0], 2 * q.c[1] - q.a[1]];
    return { start: q.a, segs: [{ type: 'arc', to: opp, c: q.c, cw: !q.ccw }, { type: 'arc', to: q.a, c: q.c, cw: !q.ccw }] };
  }
  return { start: loop[0].a, segs: loop.map((s) => s.type === 'arc' ? { type: 'arc', to: s.b, c: s.c, cw: !s.ccw } : { type: 'line', to: s.b }) };
};

function drawPanel(r) {
  const p = r.panel;
  const L = p.L;
  const W = p.W;
  const u = Math.max(L, W) / 100; // Zeichen-Einheit
  const m = u * 6.5;
  const Y = (y) => W - y;
  const sw = 'vector-effect="non-scaling-stroke"';
  let s = '<svg viewBox="' + (-m) + ' ' + (-m) + ' ' + (L + 2 * m) + ' ' + (W + 2 * m) + '" role="img" aria-label="Draufsicht ' + esc(p.name) + '">';
  s += '<defs><pattern id="hatch" width="' + u * 1.5 + '" height="' + u * 1.5 + '" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line x1="0" y1="0" x2="0" y2="' + u * 1.5 + '" stroke="var(--saw)" stroke-width="' + u * 0.35 + '"/></pattern></defs>';
  // Platte
  const o = loopToPoly(p.outline);
  s += '<path d="' + svgPath(o.start, o.segs, Y) + ' Z" fill="var(--board)" stroke="var(--board-edge)" stroke-width="1.5" ' + sw + '/>';
  for (const c of p.cutouts) {
    const q = loopToPoly(c);
    s += '<path d="' + svgPath(q.start, q.segs, Y) + ' Z" fill="var(--sunken)" stroke="var(--board-edge)" stroke-width="1.2" ' + sw + '/>';
  }
  // Nuten, Falze, Taschen
  for (const g of p.grooves) {
    const x = g.dir === 'X' ? 0 : g.from;
    const y = g.dir === 'X' ? g.from : 0;
    const w = g.dir === 'X' ? L : g.to - g.from;
    const h = g.dir === 'X' ? g.to - g.from : W;
    s += '<rect x="' + x + '" y="' + Y(y + h) + '" width="' + w + '" height="' + h + '" fill="url(#hatch)" stroke="var(--saw)" stroke-width="1" ' + sw + '/>';
  }
  for (const rb of p.rebates) {
    let x = 0; let y = 0; let w = L; let h = W;
    if (rb.edge === 'Front') h = rb.width;
    if (rb.edge === 'Back') { y = W - rb.width; h = rb.width; }
    if (rb.edge === 'Left') w = rb.width;
    if (rb.edge === 'Right') { x = L - rb.width; w = rb.width; }
    // abgesetzter Falz: nur zwischen den Enden
    const fr = rb.from === null || rb.from === undefined ? null : rb.from;
    const to = rb.to === null || rb.to === undefined ? null : rb.to;
    if (rb.edge === 'Front' || rb.edge === 'Back') { if (fr !== null) { w -= fr; x = fr; } if (to !== null) w = to - x; }
    else { if (fr !== null) { h -= fr; y = fr; } if (to !== null) h = to - y; }
    s += '<rect x="' + x + '" y="' + Y(y + h) + '" width="' + w + '" height="' + h + '" fill="url(#hatch)" stroke="var(--saw)" stroke-width="1" ' + sw + '/>';
  }
  const loopPath = (lp) => {
    if (lp.length === 1 && lp[0].type === 'arc' && lp[0].full) {
      const q = lp[0];
      return 'M' + (q.c[0] + q.r) + ' ' + Y(q.c[1]) + ' A' + q.r + ' ' + q.r + ' 0 1 0 ' + (q.c[0] - q.r) + ' ' + Y(q.c[1]) +
        ' A' + q.r + ' ' + q.r + ' 0 1 0 ' + (q.c[0] + q.r) + ' ' + Y(q.c[1]) + ' Z';
    }
    const q = loopToPoly(lp);
    return svgPath(q.start, q.segs, Y) + ' Z';
  };
  for (const k of p.pockets) {
    s += '<path d="' + loopPath(k.segs) + ' ' + k.islands.map(loopPath).join(' ') + '" fill="var(--pocket)" fill-opacity="0.22" fill-rule="evenodd" stroke="var(--pocket)" stroke-width="1.5" ' + sw +
      '><title>Tasche T' + fmt(k.depth) + '</title></path>';
  }
  for (const c of p.chamfers) {
    s += '<line x1="' + c.line.a[0] + '" y1="' + Y(c.line.a[1]) + '" x2="' + c.line.b[0] + '" y2="' + Y(c.line.b[1]) +
      '" stroke="var(--chamfer)" stroke-width="' + (c.side === 'top' ? 4 : 2) + '" stroke-dasharray="' + (c.side === 'top' ? '0' : '5 3') + '" ' + sw +
      '><title>Fase ' + fmt(c.width) + '×' + fmt(c.height) + (c.side === 'top' ? ' oben' : ' unten') + '</title></line>';
  }
  for (const c of (p.chamferPaths || [])) {
    const q = loopToPoly(c.segs);
    s += '<path d="' + svgPath(q.start, q.segs, Y) + (c.closed ? ' Z' : '') + '" fill="none" stroke="var(--chamfer)" stroke-width="' + (c.side === 'top' ? 4 : 2) +
      '" stroke-dasharray="' + (c.side === 'top' ? '0' : '5 3') + '" stroke-linejoin="round" ' + sw + '><title>Fase ' + fmt(c.width) + '×' + fmt(c.height) +
      (c.side === 'top' ? ' oben' : ' unten') + '</title></path>';
  }
  // Kantenrundungen: oben durchgezogen, unten gestrichelt; blass, wenn kein passender Radiusfräser
  for (const e of (p.edgeRounds || [])) {
    const q = loopToPoly(e.segs);
    const done = r.ops.some((o) => o.profile && o.label.indexOf('R' + fmt(e.r) + ' ' + (e.side === 'top' ? 'oben' : 'unten')) >= 0);
    s += '<path d="' + svgPath(q.start, q.segs, Y) + (e.closed ? ' Z' : '') + '" fill="none" stroke="var(--chamfer)" stroke-width="' + (e.side === 'top' ? 3 : 2) +
      '" stroke-dasharray="' + (e.side === 'top' ? '0' : '5 3') + '" stroke-opacity="' + (done ? 1 : 0.4) + '" stroke-linejoin="round" ' + sw + '><title>Kantenrundung R' + fmt(e.r) +
      (e.side === 'top' ? ' oben' : ' unten') + (done ? '' : ' (nicht bearbeitet)') + '</title></path>';
  }
  const sawn = r.ops.some((o) => o.kind === 'blade');
  for (const w of p.slantWalls) {
    const wc = sawn ? 'var(--saw)' : 'var(--chamfer)';
    s += '<path d="M' + w.top.a[0] + ' ' + Y(w.top.a[1]) + ' L' + w.top.b[0] + ' ' + Y(w.top.b[1]) + ' L' + w.bottom.b[0] + ' ' + Y(w.bottom.b[1]) +
      ' L' + w.bottom.a[0] + ' ' + Y(w.bottom.a[1]) + ' Z" fill="' + wc + '" fill-opacity="0.25" stroke="' + wc + '" stroke-width="1.5" ' + sw +
      '><title>' + (sawn ? 'Sägeschnitt ' : 'Schräge Kante ') + fmt(w.angle) + '°</title></path>';
  }
  // Schräge an Rundungen (Oberkante) und gewölbte Flächen (Bereich); blass, solange nicht eingeschaltet
  const cOn = { slant: r.ops.some((o) => o.kind === 'slantpath'), surface: r.ops.some((o) => o.kind === 'surface' || o.kind === 'cyl4') };
  for (const c of (p.curvedSlants || [])) {
    const q = loopToPoly(c.segs); // auch ganzer Kegel (schräges Rundloch) – zwei Halbkreise
    const d = svgPath(q.start, q.segs, Y);
    s += '<path d="' + d + (c.closed ? ' Z' : '') + '" fill="none" stroke="var(--chamfer)" stroke-width="3" stroke-opacity="' +
      (cOn.slant ? 1 : 0.45) + '" stroke-linejoin="round" ' + sw + '><title>Schräge an Rundung ' + fmt(c.tilt) + '°' + (cOn.slant ? '' : ' (nicht bearbeitet)') + '</title></path>';
  }
  for (const c of (p.curvedSurfaces || [])) {
    const rects = c.rects.map((b) => 'M' + b.x0 + ' ' + Y(b.y0) + ' H' + b.x1 + ' V' + Y(b.y1) + ' H' + b.x0 + ' Z').join(' ');
    s += '<path d="' + rects + '" fill="var(--pocket)" fill-opacity="' + (cOn.surface ? 0.3 : 0.12) + '" stroke="var(--pocket)" stroke-width="1" stroke-dasharray="4 3" ' + sw +
      '><title>Gewölbte Fläche (' + esc(c.kinds.join(', ')) + ') T' + fmt(c.depth) + (cOn.surface ? '' : ' (nicht bearbeitet)') + '</title></path>';
  }
  // Taschen und Bohrungen auf schrägen Ebenen, von oben gesehen
  for (const sp of (p.slantPlanes || [])) {
    const mp = (l) => [sp.o[0] + sp.X[0] * l[0] + sp.Y[0] * l[1], sp.o[1] + sp.X[1] * l[0] + sp.Y[1] * l[1]];
    const poly = (pts) => 'M' + pts.map((q) => { const m = mp(q); return m[0] + ' ' + Y(m[1]); }).join(' L') + ' Z';
    for (const k of sp.pockets) {
      const pts = [];
      for (const q of k.segs) for (const t of PanelAnalyzer.segPoints(q)) pts.push(t);
      s += '<path d="' + poly(pts) + '" fill="var(--pocket)" fill-opacity="0.22" stroke="var(--pocket)" stroke-width="1.5" ' + sw +
        '><title>Tasche auf Schräge T' + fmt(k.depth) + '</title></path>';
    }
    for (const d of sp.drills) {
      const pts = [];
      for (let i = 0; i < 32; i++) pts.push([d.x + d.d / 2 * Math.cos(i * Math.PI / 16), d.y + d.d / 2 * Math.sin(i * Math.PI / 16)]);
      s += '<path d="' + poly(pts) + '" fill="var(--sdrill)" fill-opacity="0.5" stroke="var(--sdrill)" stroke-width="1" ' + sw +
        '><title>Bohrung Ø' + fmt(d.d) + ' auf Schräge T' + fmt(d.depth) + '</title></path>';
    }
  }
  // Fräsbahnen (außer Formatfräsen)
  let tabsSvg = '';
  for (const op of r.ops) {
    if ((op.kind !== 'contour' && op.kind !== 'slantpath') || op.key === 'format') continue;
    s += '<path d="' + svgPath(op.start, op.segs, Y) + '" fill="none" stroke="var(' + opToken(op) + ')" stroke-width="2" stroke-dasharray="6 3" ' + sw + '/>';
    // Haltestege: Material bleibt quer über der Fräsbahn stehen (zuletzt gezeichnet, über der Lochfläche)
    for (const t of tabRects(op)) {
      tabsSvg += '<polygon class="tabmark" points="' + t.pts.map((q) => q[0] + ',' + Y(q[1])).join(' ') + '" fill="var(--warn)" fill-opacity="0.85" stroke="var(--ink)" stroke-width="1" ' + sw +
        '><title>Haltesteg ' + fmt(t.len) + ' × ' + fmt(t.h) + ' mm (Länge × Höhe)</title></polygon>';
    }
  }
  // Bohrungen
  for (const d of p.drills) {
    if (d.face === 'Top') {
      s += '<circle cx="' + d.x + '" cy="' + Y(d.y) + '" r="' + d.d / 2 + '" fill="' + (d.through ? 'var(--sunken)' : 'var(--drill)') +
        '" fill-opacity="' + (d.through ? 1 : 0.55) + '" stroke="var(--drill)" stroke-width="1" ' + sw + '><title>Ø' + fmt(d.d) + ' T' + fmt(d.depth) + '</title></circle>';
    } else {
      const t = d.d;
      let x; let y; let w; let h;
      if (d.face === 'Left') { x = 0; y = d.along - t / 2; w = d.depth; h = t; }
      if (d.face === 'Right') { x = L - d.depth; y = d.along - t / 2; w = d.depth; h = t; }
      if (d.face === 'Front') { x = d.along - t / 2; y = 0; w = t; h = d.depth; }
      if (d.face === 'Back') { x = d.along - t / 2; y = W - d.depth; w = t; h = d.depth; }
      s += '<rect x="' + x + '" y="' + Y(y + h) + '" width="' + w + '" height="' + h + '" fill="var(--hdrill)" fill-opacity="0.35" stroke="var(--hdrill)" stroke-width="1" stroke-dasharray="3 2" ' + sw + '><title>Ø' +
        fmt(d.d) + ' ' + FACE[d.face] + ' T' + fmt(d.depth) + '</title></rect>';
    }
  }
  for (const sd of p.slantDrills) {
    const rr = sd.d / 2;
    const e = sd.entry;
    const end = [e[0] + sd.dir[0] * sd.depth, e[1] + sd.dir[1] * sd.depth];
    s += '<g><title>Schräge Bohrung Ø' + fmt(sd.d) + ' T' + fmt(sd.depth) + '</title><line x1="' + e[0] + '" y1="' + Y(e[1]) + '" x2="' + end[0] + '" y2="' + Y(end[1]) +
      '" stroke="var(--sdrill)" stroke-width="2" ' + sw + '/><circle cx="' + e[0] + '" cy="' + Y(e[1]) + '" r="' + rr +
      '" fill="var(--sdrill)" fill-opacity="0.5" stroke="var(--sdrill)" stroke-width="1.5" ' + sw + '/></g>';
  }
  // Zapfen auf einer Schräge: Grundriss des Zapfens (auf die Draufsicht projiziert)
  for (const w of (p.slantWalls || [])) {
    if (!w.boss) continue;
    const q = w.boss.plane;
    for (const lp of w.boss.islands) {
      const pts = lp.map((sg) => [q.o[0] + q.X[0] * sg.a[0] + q.Y[0] * sg.a[1], q.o[1] + q.X[1] * sg.a[0] + q.Y[1] * sg.a[1]]);
      s += '<path d="M' + pts.map((t) => t[0] + ' ' + Y(t[1])).join(' L') + ' Z" fill="var(--pocket)" fill-opacity="0.35" stroke="var(--pocket)" stroke-width="1.2" ' + sw +
        '><title>Zapfen ' + fmt(w.boss.height) + ' mm auf Schräge ' + fmt(w.angle) + '° (bleibt stehen)</title></path>';
    }
  }
  // Clamex-Nuten: Kante – Kreissegment (Sehne × Tiefe), Fläche – Sehne × Nutbreite
  for (const g of (p.clamex || [])) {
    const dist = g.r - g.depth;
    let pts;
    if (Math.abs(g.n[2]) < 0.5) {
      const a0 = Math.atan2(-g.n[1], -g.n[0]);
      const half = Math.acos(Math.min(1, dist / g.r));
      pts = [];
      for (let k = 0; k <= 16; k++) { const t = a0 - half + (2 * half * k) / 16; pts.push([g.c[0] + g.r * Math.cos(t), g.c[1] + g.r * Math.sin(t)]); }
    } else {
      const s0 = [g.c[0] - g.n[0] * dist, g.c[1] - g.n[1] * dist];
      const u = [g.a[1] * g.n[2] - g.a[2] * g.n[1], g.a[2] * g.n[0] - g.a[0] * g.n[2]];
      const ul = Math.hypot(u[0], u[1]) || 1;
      const h = g.chord / 2 / ul;
      const v = [g.a[0] * g.w / 2, g.a[1] * g.w / 2];
      pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [s0[0] + u[0] * h * i + v[0] * j, s0[1] + u[1] * h * i + v[1] * j]);
    }
    s += '<path d="M' + pts.map((q) => q[0] + ' ' + Y(q[1])).join(' L') + ' Z" fill="var(--saw)" fill-opacity="0.45" stroke="var(--saw)" stroke-width="1.2" ' + sw +
      '><title>Clamex-Nut ' + fmt(g.w) + '×' + fmt(g.depth) + (Math.abs(g.n[2]) < 0.5 ? ' in der Kante' : ' in der Fläche') + '</title></path>';
  }
  // Taschen in den Kanten: Grundriss von oben gesehen
  for (const k of (p.sidePockets || [])) {
    let x; let y; let w; let h;
    if (k.face === 'Left') { x = 0; y = W - k.x1; w = k.depth; h = k.x1 - k.x0; }
    if (k.face === 'Right') { x = L - k.depth; y = k.x0; w = k.depth; h = k.x1 - k.x0; }
    if (k.face === 'Front') { x = k.x0; y = 0; w = k.x1 - k.x0; h = k.depth; }
    if (k.face === 'Back') { x = L - k.x1; y = W - k.depth; w = k.x1 - k.x0; h = k.depth; }
    s += '<rect x="' + x + '" y="' + Y(y + h) + '" width="' + w + '" height="' + h + '" rx="' + Math.min(w, h) * 0.15 + '" fill="var(--hdrill)" fill-opacity="0.3" stroke="var(--hdrill)" stroke-width="1.2" stroke-dasharray="4 2" ' + sw +
      '><title>Tasche ' + FACE[k.face] + ' ' + fmt(k.x1 - k.x0) + '×' + fmt(k.y1 - k.y0) + ' T' + fmt(k.depth) + '</title></rect>';
  }
  // Gelöschte (unterdrückte) Bearbeitungen: rot dort, wo sie wären – Werkzeugbahn wie in der Animation
  if ((r.suppressed || []).length) {
    const moves = suppressedMoves(r);
    s += '<g class="suppressed-ops">';
    moves.forEach((m) => {
      if (m.type === 'rapid' || m.op < 0) return;
      const op = r.suppressed.flatMap((g) => g.ops)[m.op];
      const g = r.suppressed.find((x) => x.ops.includes(op));
      const t = '<title>Gelöscht: ' + esc(g ? g.label : '') + '</title>';
      const w = Math.max(1, m.d || 1);
      if (m.pts.length === 1) {
        s += '<circle cx="' + m.pts[0][0] + '" cy="' + Y(m.pts[0][1]) + '" r="' + w / 2 + '" fill="var(--err)" fill-opacity="0.35" stroke="var(--err)" stroke-width="1.5" stroke-dasharray="3 2" ' + sw + '>' + t + '</circle>';
      } else {
        const d = 'M' + m.pts.map((q) => q[0] + ' ' + Y(q[1])).join(' L');
        s += '<path d="' + d + '" fill="none" stroke="var(--err)" stroke-opacity="0.3" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round">' + t + '</path>' +
          '<path d="' + d + '" fill="none" stroke="var(--err)" stroke-width="1.5" stroke-dasharray="5 3" ' + sw + '>' + t + '</path>';
      }
    });
    s += '</g>';
  }
  // Sauger-Vorschlag: Konsolen (gestrichelt) und Drehsauger auf der Unterseite
  if (r.suction && r.suction.bars.length) {
    s += '<g class="cups">';
    for (const b of r.suction.bars) {
      s += '<line x1="' + b.x + '" y1="' + (-u * 4) + '" x2="' + b.x + '" y2="' + (W + u * 4) + '" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="7 5" ' + sw + '/>';
      for (const c of b.cups) {
        // exzentrischer Sauger: Gehäuse um die Drehachse (blass), Saugfläche daneben
        const px = c.px !== undefined ? c.px : b.x;
        const py = c.py !== undefined ? c.py : c.y;
        const rot = c.rot !== undefined ? c.rot : c.angle;
        if (c.e > 0) {
          s += '<circle cx="' + b.x + '" cy="' + Y(c.y) + '" r="' + ((c.h || c.sx) / 2) + '" fill="none" stroke="var(--muted)" stroke-opacity="0.6" stroke-width="1" stroke-dasharray="2 3" ' + sw + '/>' +
            '<circle cx="' + b.x + '" cy="' + Y(c.y) + '" r="' + u * 0.6 + '" fill="var(--muted)"/>';
        }
        s += '<rect x="' + (px - c.sx / 2) + '" y="' + (Y(py) - c.sy / 2) + '" width="' + c.sx + '" height="' + c.sy + '" rx="' + Math.min(c.sx, c.sy) * 0.12 +
          '" transform="rotate(' + (-rot) + ' ' + px + ' ' + Y(py) + ')" fill="var(--ink)" fill-opacity="0.1" stroke="var(--ink)" stroke-opacity="0.55" stroke-width="1.2" stroke-dasharray="4 3" ' + sw +
          '><title>Sauger ' + esc(c.code) + ' · X ' + fmt(b.x) + ' Y ' + fmt(c.y) + ' · ' + fmt(c.angle) + '°' + (c.e > 0 ? ' (exzentrisch)' : '') + '</title></rect>';
      }
    }
    s += '</g>';
  }
  // Nullpunkt und Maße
  const fs = u * 2.6;
  s += '<g font-family="IBM Plex Mono, monospace" font-size="' + fs + '" fill="var(--muted)">';
  s += '<line x1="0" y1="' + (W + u * 3) + '" x2="' + L + '" y2="' + (W + u * 3) + '" stroke="var(--muted)" stroke-width="1" ' + sw + '/>';
  s += '<text x="' + L / 2 + '" y="' + (W + u * 3 + fs * 1.1) + '" text-anchor="middle">X ' + fmt(L) + '</text>';
  s += '<line x1="' + (-u * 3) + '" y1="0" x2="' + (-u * 3) + '" y2="' + W + '" stroke="var(--muted)" stroke-width="1" ' + sw + '/>';
  s += '<text x="' + (-u * 3 - fs * 0.5) + '" y="' + W / 2 + '" text-anchor="middle" transform="rotate(-90 ' + (-u * 3 - fs * 0.5) + ' ' + W / 2 + ')">Y ' + fmt(W) + '</text>';
  s += '</g>';
  s += '<circle cx="0" cy="' + W + '" r="' + u * 1.2 + '" fill="var(--err)"><title>Nullpunkt X0 Y0</title></circle>';
  s += tabsSvg + '</svg>';
  return s;
}

function highlight(xcs) {
  return esc(xcs.replace(/\r/g, '')).replace(/^(\w+)/gm, '<span class="c">$1</span>').replace(/(&quot;[^&]*&quot;)/g, '<span class="s">$1</span>');
}

function renderDetail() {
  const el = $('detail');
  const part = state.parts[state.sel];
  if (!part) { el.innerHTML = '<div class="card empty">STEP- oder DXF-Datei laden, um ein Programm zu erzeugen.</div>'; return; }
  const r = part.result;
  if (!r || !r.panel) {
    el.innerHTML = '<div class="card"><h2>' + esc(part.solid ? part.solid.name : part.label) + '</h2><ul class="warns"><li class="err">' +
      esc((r && r.error) || part.error || 'Unbekannter Fehler') + '</li></ul></div>';
    return;
  }
  const p = r.panel;
  const fieldOpts = [state.settings.fieldShort, state.settings.fieldLong, state.settings.fieldWideShort, state.settings.fieldWideLong]
    .concat([r.field]).filter((f, i, a) => f && a.indexOf(f) === i);
  const legend = [['var(--drill)', 'Bohrung oben'], ['var(--pocket)', 'Tasche'], ['var(--mill)', 'Fräsen / Kontur'],
    ['var(--saw)', 'Sägeschnitt / Nut / Falz'], ['var(--chamfer)', 'Fase / schräge Kante'], ['var(--sdrill)', 'Bohrung schräg'],
    ['var(--hdrill)', 'Kante (Bohrung / Tasche)'], ['var(--err)', 'Nullpunkt']].concat(r.suction && r.suction.bars.length ? [['transparent;border:1.5px dashed var(--muted)', 'Sauger (Vorschlag)']] : [])
    .concat((r.suppressed || []).length ? [['color-mix(in srgb, var(--err) 35%, transparent);border:1.5px dashed var(--err)', 'Gelöscht (unterdrückt)']] : []);
  el.innerHTML =
    '<div class="work"><div class="card stagecard" id="stagecard"><div class="dhead"><div class="title"><h2>' + esc(p.name) + '</h2><span class="dims">' + fmt(p.L) + ' × ' + fmt(p.W) + ' × ' +
    fmt(p.T) + ' mm · ' + esc(part.label) + (part.profile !== null && part.profile !== undefined ? ' · <b>Profil ' + esc(profName(part.profile)) + '</b>' : '') + (part.res.side2 ? ' · <b>Seite ' + part.side + (part.side === 2 ? ' (um Y gewendet, ohne Rohteil-Versatz)' : ' (mit Formatfräsen)') + '</b>' : '') +
    ((tm) => tm ? ' · <span class="est" title="' + esc(timeTitle(tm)) + '">≈ ' + Toolpath.fmtTime(tm.total) + (tm.s2 ? ' (beide Seiten)' : '') + ' je Stück</span>' : '')(partTime(part)) + '</span>' +
    // Anzahl dieses Bauteils und wie oft das (gleiche) Programm insgesamt läuft – mit Gesamtzeit
    ((row, tm) => '<span class="runs"><label>Anzahl <input type="number" id="pqty" min="0" step="1" value="' + qtyOf(part) + '" aria-label="Anzahl dieses Bauteils"></label>' +
      (row ? ' <span>Programm läuft <b>' + row.qty + '×</b>' + (row.nums.length > 1 ? ' (gleiches Programm: Nr. ' + row.nums.join(', ') + ')' : '') +
        (tm ? ' · gesamt <b>≈ ' + Toolpath.fmtTime(tm.total * row.qty) + '</b>' : '') + '</span>' : '') + '</span>')(progRuns().get(part), partTime(part)) + '</div>' +
    '<div class="tools"><span class="seg" role="group" aria-label="Ansicht"><button type="button" data-vmode="2d" aria-pressed="' + !state.mode3d + '">2D</button>' +
    '<button type="button" data-vmode="3d" aria-pressed="' + !!state.mode3d + '">3D</button></span>' +
    (part.res.canTwoSided ? '<span class="seg" role="group" aria-label="Seiten"><button type="button" data-two="0" aria-pressed="' + !part.res.side2 +
      '" title="Bearbeitungen von unten nur als Hinweis">Einseitig</button><button type="button" data-two="1" aria-pressed="' + !!part.res.side2 +
      '" title="Seite 1 mit Formatfräsen, Seite 2 um Y gewendet ohne Rohteil-Versatz">Zweiseitig</button></span>' : '') +
    (part.res.side2 ? '<span class="seg sides" role="group" aria-label="Angezeigte Seite"><button type="button" data-side="1" aria-pressed="' + (part.side === 1) +
      '">Seite 1</button><button type="button" data-side="2" aria-pressed="' + (part.side === 2) + '">Seite 2</button></span>' : '') +
    '<button class="btn" id="rot" type="button">Drehen 90°</button>' + (part.dxfText !== undefined ? '' : '<button class="btn" id="flip" type="button">Wenden</button>' +
      // Sonderteile: auf die Kante kippen (lang → kurz → wieder flach)
      ((t) => '<button class="btn ghost tiltbtn' + (t ? ' on' : '') + '" id="tilt" type="button" aria-pressed="' + !!t + '" title="Sonderteile: Teil um 90° auf die Kante kippen – ' +
        'erst auf die lange, dann auf die kurze Kante, dann wieder flach. Spannmittel von Hand prüfen.">⤾ Kippen 90°' + (t ? ': ' + (t === 1 ? 'lange Kante' : 'kurze Kante') : '') + '</button>')(part.orientation && part.orientation.tilt | 0)) +
    '<label for="field">Feld <select id="field">' + fieldOpts.map((f) => '<option' + (f === r.field ? ' selected' : '') + '>' + esc(f) + '</option>').join('') +
    '</select></label></div></div>' +
    '<div class="stage" style="margin-top:12px">' +
    '<div class="view" id="view"' + (state.mode3d ? ' hidden' : '') + '>' + drawPanel(r) + '<canvas id="animcv" aria-hidden="true"></canvas></div>' +
    '<div class="view3d" id="view3d"' + (state.mode3d ? '' : ' hidden') + '><div class="v3slot" id="v3slot"></div>' +
    '<div class="v3bar"><button type="button" data-v3="iso">Iso</button><button type="button" data-v3="top">Oben</button>' +
    '<button type="button" data-v3="front">Vorne</button><button type="button" data-v3="raw" aria-pressed="' + v3.showRaw + '">Rohteil</button></div>' +
    '<div class="v3msg" id="v3msg" hidden></div></div>' +
    '<div class="s-tl" id="tl" aria-label="Zeitleiste der Bearbeitungen"></div>' +
    '<div class="hud" id="hud" aria-live="polite"></div>' +
    '<div class="anim"><button class="btn primary" id="aplay" type="button">▶ Werkzeugbahn abspielen</button>' +
    '<button class="btn ghost" id="areset" type="button">⟲ Neustart</button>' +
    '<button class="btn ghost" id="afull" type="button" aria-pressed="false">⛶ Vollbild</button>' +
    '<label for="aspeed" class="note">Tempo <select id="aspeed">' + [1, 2, 5, 10, 25, 50].map((v) => '<option value="' + v + '"' +
      (v === anim.speed ? ' selected' : '') + '>' + v + '×</option>').join('') + '</select></label>' +
    '<input type="range" id="apos" min="0" max="1000" value="0" aria-label="Position in der Werkzeugbahn"></div>' +
    '<div class="legend">' + legend.map(([c, t]) => '<span><i style="background:' + c + '"></i>' + t + '</span>').join('') + '</div></div></div>' +
    '<aside class="card steps" aria-label="Bearbeitungsschritte"><div class="opshead"><h3>Bearbeitungsschritte</h3>' +
    (ovOf(part).order ? '<button class="btn ghost small" id="resetorder" type="button">Reihenfolge zurücksetzen</button>' : '') +
    '</div>' + dxfBox(part) + curvedBox(part) + '<table class="ops" id="opstable">' +
    opsSummary(r).map((x, i, all) => '<tbody class="grp" data-grp="' + esc(x.group) + '" style="--c:' + x.c + '"><tr data-group="' + esc(x.group) + '"' + (x.op ? ' class="has-ctl"' : '') + '><td class="k">' +
      '<span class="grip" data-grip="' + esc(x.group) + '" title="Gedrückt halten und ziehen, um die Reihenfolge zu ändern" aria-hidden="true">⠿</span><span class="num">' + (i + 1) + '</span>' +
      '<span class="sw" style="background:' + x.c + '"></span><button type="button" class="jump" data-jump="' + esc(x.group) + '" title="' + esc(x.k) + ' – in der Animation hierher springen">' +
      esc(x.k) + '</button></td><td class="v">' + esc(x.v) + '</td><td class="mv">' +
      '<button type="button" class="mvb" data-move="' + esc(x.group) + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="' + esc(x.k) + ' nach oben">↑</button>' +
      '<button type="button" class="mvb" data-move="' + esc(x.group) + '" data-dir="1"' + (i === all.length - 1 ? ' disabled' : '') + ' aria-label="' + esc(x.k) + ' nach unten">↓</button>' +
      '<button type="button" class="mvb del" data-suppress="' + esc(x.group) + '" title="Bearbeitung löschen (unterdrücken – unten wiederherstellbar)" aria-label="' + esc(x.k) + ' löschen">✕</button>' +
      '</td></tr>' +
      (x.op ? '<tr class="ctlrow" data-group="' + esc(x.group) + '"><td colspan="3"><div class="ctl">' + opControls(part, x.op) + '</div></td></tr>' : '') + '</tbody>').join('') +
    '</table><div class="dropline" id="dropline" hidden></div>' +
    ((r.suppressed || []).length ? '<details class="suppressed" open><summary>Gelöscht / unterdrückt (' + r.suppressed.length + ')</summary><ul>' +
      r.suppressed.map((g) => '<li><span class="nm">' + esc(g.label) + '</span><button type="button" class="btn ghost small" data-restore="' + esc(g.group) +
        '">Wiederherstellen</button></li>').join('') +
      (r.suppressed.length > 1 ? '<li><button type="button" class="btn ghost small" id="restoreall">Alle wiederherstellen</button></li>' : '') + '</ul></details>' : '') +
    (r.warnings.length || part.notice ? '<ul class="warns">' +
      (part.notice ? '<li class="info">' + esc(part.notice) + '</li>' : '') + r.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '') +
    '</aside></div>' +
    '<div class="card code"><div class="bar"><span class="fname"><input id="fname" type="text" value="' + esc(sideFile(part, part.side)) + '" aria-label="Dateiname"></span>' +
    '<span class="tools"><button class="btn" id="label" type="button" title="Etikett mit Name, Maßen und Draufsicht drucken">' + ICON_PRINT + ' Etikett</button>' +
    '<button class="btn" id="copy" type="button">Kopieren</button><button class="btn primary" id="dl" type="button">' +
      (part.res.side2 ? 'Beide Seiten speichern' : 'Speichern') + '</button></span></div>' +
    '<details class="xcsbox" id="xcsbox"' + (state.showCode ? ' open' : '') + '><summary>Programmcode (.xcs) anzeigen</summary>' +
    '<pre class="xcs" id="xcs">' + highlight(r.xcs) + '</pre></details></div>';

  $('xcsbox').addEventListener('toggle', () => { state.showCode = $('xcsbox').open; storeJson('step2xcs.showcode.v1', state.showCode); });
  try { setupAnim(part); } catch (e) { console.error(e); } // Animation darf die übrige Bedienung nie lahmlegen
  el.querySelectorAll('[data-vmode]').forEach((b) => b.addEventListener('click', () => {
    state.mode3d = b.dataset.vmode === '3d';
    storeJson(VIEW_KEY, state.mode3d);
    render();
  }));
  el.querySelectorAll('[data-v3]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.v3 === 'raw') {
      v3.showRaw = !v3.showRaw;
      b.setAttribute('aria-pressed', String(v3.showRaw));
      if (v3.viewer) v3.viewer.setRaw(v3.showRaw);
    } else if (v3.viewer) v3.viewer.view(b.dataset.v3);
  }));
  if (state.mode3d) mount3d(part);
  el.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => {
    const order = (part.result.groups || []).slice();
    const i = order.indexOf(b.dataset.move);
    const j = i + Number(b.dataset.dir);
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    ovOf(part).order = order;
    compute(part); render();
    const again = document.querySelector('[data-move="' + CSS.escape(b.dataset.move) + '"][data-dir="' + b.dataset.dir + '"]');
    if (again && !again.disabled) again.focus();
  }));
  if ($('resetorder')) $('resetorder').addEventListener('click', () => { delete ovOf(part).order; compute(part); render(); });
  // DXF: Dicke und Art/Tiefe je Erkennung; Gruppen ändern sich dabei → eigene Reihenfolge/Löschungen zurücksetzen
  const dxfChanged = () => {
    // Werkzeug/Zustellung/Tiefe je Bearbeitung hängen an der Nummer (cutout-1 …) – nach einer Änderung passen sie nicht mehr
    const ov = part.overrides;
    const indexed = (m) => Object.keys(m || {}).some((k) => /-\d+$/.test(k));
    if (ov.order || ov.suppress || indexed(ov.tools) || indexed(ov.steps) || indexed(ov.depths) || indexed(ov.tech)) {
      part.notice = 'Eigene Reihenfolge, gelöschte Bearbeitungen und Werkzeug/Zustellung/Tiefe je Kontur wurden nach der DXF-Änderung zurückgesetzt.';
    }
    for (const m of [ov.tools, ov.steps, ov.depths, ov.tech, ov.tabs]) for (const k of Object.keys(m || {})) if (/-\d+$/.test(k)) delete m[k];
    delete ov.order;
    delete ov.suppress;
    compute(part); render();
  };
  if ($('dxfT')) $('dxfT').addEventListener('change', (e) => {
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    if (v > 0) part.overrides.dxf.T = v;
    dxfChanged();
  });
  el.querySelectorAll('[data-dxfkind]').forEach((sel) => sel.addEventListener('change', () => {
    const f = part.overrides.dxf.features;
    const cur = f[sel.dataset.dxfkind] || {};
    f[sel.dataset.dxfkind] = { kind: sel.value };
    if (cur.depth > 0 && sel.value !== 'cutout') f[sel.dataset.dxfkind].depth = cur.depth;
    dxfChanged();
  }));
  el.querySelectorAll('[data-dxfdepth]').forEach((inp) => inp.addEventListener('change', () => {
    const f = part.overrides.dxf.features;
    const v = parseFloat(String(inp.value).replace(',', '.'));
    const cur = Object.assign({}, f[inp.dataset.dxfdepth]);
    if (!cur.kind) cur.kind = (part.res.dxf.features.find((x) => x.id === inp.dataset.dxfdepth) || {}).kind;
    if (v > 0) cur.depth = v; else delete cur.depth;
    f[inp.dataset.dxfdepth] = cur;
    dxfChanged();
  }));
  // Bearbeitung löschen (unterdrücken) und wiederherstellen – je Seite
  el.querySelectorAll('[data-suppress]').forEach((b) => b.addEventListener('click', () => {
    const ov = ovOf(part);
    ov.suppress = (ov.suppress || []).concat([b.dataset.suppress]);
    if (ov.order) ov.order = ov.order.filter((g) => g !== b.dataset.suppress);
    compute(part); render();
  }));
  el.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', () => {
    const ov = ovOf(part);
    ov.suppress = (ov.suppress || []).filter((g) => g !== b.dataset.restore);
    if (!ov.suppress.length) delete ov.suppress;
    compute(part); render();
  }));
  if ($('restoreall')) $('restoreall').addEventListener('click', () => { delete ovOf(part).suppress; compute(part); render(); });
  // Zweiseitig und angezeigte Seite
  el.querySelectorAll('[data-two]').forEach((b) => b.addEventListener('click', () => {
    part.overrides.twoSided = b.dataset.two === '1';
    if (!part.overrides.twoSided) part.side = 1;
    compute(part); render();
  }));
  el.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => {
    part.side = Number(b.dataset.side);
    compute(part); render();
  }));
  setupStepDrag(part);
  setupZoom(part);
  el.querySelectorAll('[data-curved]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.on;
    const val = v === '1' ? true : v === '0' || v === 'off' ? false : v; // Schräge: an/aus; Flächen: aus/ball/flat4
    part.overrides.curved = Object.assign({}, part.overrides.curved, { [b.dataset.curved]: val });
    compute(part); render();
  }));
  el.querySelectorAll('[data-tabs]').forEach((b) => b.addEventListener('click', () => {
    const ov = ovOf(part);
    ov.tabs = Object.assign({}, ov.tabs, { [b.dataset.tabs]: b.dataset.on === '1' });
    compute(part); render();
  }));
  el.querySelectorAll('[data-rebret]').forEach((b) => b.addEventListener('click', () => {
    part.overrides.rebateReturn = b.dataset.rebret === '1';
    compute(part); render();
  }));
  el.querySelectorAll('[data-twostep]').forEach((b) => b.addEventListener('click', () => {
    part.overrides.twoStep = b.dataset.twostep === '1';
    compute(part); render();
  }));
  // Vorschub/Drehzahl je Bearbeitung (leer = Werkzeugdatei); Untermenü bleibt beim Neuzeichnen offen
  el.querySelectorAll('details.tech').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) state.techOpen.add(d.dataset.techgrp); else state.techOpen.delete(d.dataset.techgrp);
  }));
  el.querySelectorAll('input[data-tech]').forEach((inp) => inp.addEventListener('change', () => {
    const ov = ovOf(part);
    const g = inp.dataset.techfor;
    const v = parseFloat(String(inp.value).replace(',', '.'));
    const t = Object.assign({}, (ov.tech || {})[g]);
    if (v > 0) t[inp.dataset.tech] = v; else delete t[inp.dataset.tech];
    ov.tech = Object.assign({}, ov.tech, { [g]: t });
    if (!Object.keys(t).length) delete ov.tech[g];
    compute(part); render();
  }));
  el.querySelectorAll('[data-techreset]').forEach((b) => b.addEventListener('click', () => {
    const ov = ovOf(part);
    if (ov.tech) delete ov.tech[b.dataset.techreset];
    compute(part); render();
  }));
  el.querySelectorAll('select[data-tool]').forEach((sel) => sel.addEventListener('change', () => {
    ovOf(part).tools[sel.dataset.tool] = sel.value;
    // anderes Werkzeug: eigene Schnittwerte gelten nicht mehr
    if (ovOf(part).tech) delete ovOf(part).tech[sel.dataset.tool];
    compute(part); render();
  }));
  el.querySelectorAll('input[data-step], input[data-depth]').forEach((inp) => {
    let timer;
    const isDepth = inp.dataset.depth !== undefined;
    const map = isDepth ? ovOf(part).depths : ovOf(part).steps;
    const key = isDepth ? inp.dataset.depth : inp.dataset.step;
    const apply = () => {
      clearTimeout(timer);
      const v = String(inp.value).trim();
      const cur = map[key];
      let next = v === '' ? undefined : parseFloat(v.replace(',', '.'));
      if (next !== undefined && isNaN(next)) return;
      if (isDepth && next !== undefined && next <= 0) next = undefined;
      if (next === cur) return;
      if (next === undefined) delete map[key];
      else map[key] = next;
      compute(part); renderSoon();
    };
    inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(apply, 500); });
    inp.addEventListener('change', apply);
  });
  // Neu aufbauen und dabei im Vollbild bleiben
  const rerender = () => {
    const full = document.fullscreenElement && document.fullscreenElement.id === 'stagecard';
    render();
    if (full && $('stagecard').requestFullscreen) $('stagecard').requestFullscreen().catch(() => {});
  };
  // Drehen/Wenden ändert die Bearbeitungsgruppen (Seiten, Winkel): eigene Reihenfolge passt nicht mehr
  const turned = () => {
    // Seite 2 hängt an der Lage von Seite 1: deren Einstellungen passen nicht mehr
    if (part.overrides.order || part.overrides.suppress || (part.overrides2 && (part.overrides2.order || part.overrides2.suppress))) {
      part.notice = 'Eigene Reihenfolge und gelöschte Bearbeitungen wurden beim Drehen/Wenden zurückgesetzt.';
    }
    delete part.overrides.order;
    delete part.overrides.suppress;
    part.overrides2 = { tools: {}, steps: {}, depths: {} };
    part.side = 1;
    compute(part); rerender();
  };
  $('rot').addEventListener('click', () => { part.orientation.rot = (part.orientation.rot + 1) % 4; turned(); });
  if ($('flip')) $('flip').addEventListener('click', () => { part.orientation.flip = !part.orientation.flip; turned(); });
  if ($('tilt')) $('tilt').addEventListener('click', () => {
    const t = ((part.orientation.tilt | 0) + 1) % 3;
    if (t) part.orientation.tilt = t; else delete part.orientation.tilt;
    part.orientation.rot = 0;
    part.orientation.flip = false;
    turned();
    toast(t ? 'Sonderlage: auf die ' + (t === 1 ? 'lange' : 'kurze') + ' Kante gekippt – Spannmittel prüfen.' : 'Wieder flach.');
  });
  $('field').addEventListener('change', (e) => { part.field = e.target.value; compute(part); rerender(); });
  $('fname').addEventListener('change', (e) => {
    // eingegebener Name ohne .xcs und ohne _S1/_S2 ist der Grundname beider Seiten
    const typed = e.target.value.trim().replace(/\.xcs$/i, '').replace(/_S[12]$/i, '');
    part.fileName = StepToXcs.partName(typed || part.fileName.replace(/\.xcs$/i, '')) + '.xcs';
    e.target.value = sideFile(part, part.side);
  });
  $('copy').addEventListener('click', () => {
    const text = part.result.xcs;
    const fallback = () => {
      const range = document.createRange();
      range.selectNodeContents($('xcs'));
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      toast('Text markiert – mit Strg+C kopieren.');
    };
    try {
      navigator.clipboard.writeText(text).then(() => toast('Programm kopiert.'), fallback);
    } catch (e) { fallback(); }
  });
  $('dl').addEventListener('click', () => saveFiles(partFiles(part), part.fileName.replace(/\.xcs$/i, '') + '.zip'));
  $('label').addEventListener('click', () => openLabels([part]));
  $('pqty').addEventListener('change', (e) => {
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    if (!(v >= 0)) { e.target.value = qtyOf(part); return; } // leer / ungültig: nichts ändern
    part.qty = Math.round(v);
    render();
  });
}
