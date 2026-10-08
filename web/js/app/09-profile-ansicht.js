/*
 * Weckwop – Profile und Ansichten (09-profile-ansicht.js)
 * Werkstück-Profile, Zoom der Draufsicht, Animation der Werkzeugbahn, 3D-Ansicht eines Teils.
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 12) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

// ------------------------------------------------ Werkstück-Profile
// Symbole (Strich in Textfarbe): mehrere Blätter = für alle Teile, Stift = bearbeiten
const ICON_ALL = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/><path d="M11 14l2 2 4-4"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 8.5l3 3"/></svg>';
const profName = (i) => (state.settings.profiles[i] && state.settings.profiles[i].name) || 'Profil ' + (i + 1);
// Leiste oben: aktiv = Profil des gewählten Teils (ohne Teil: Vorgabe für neue Teile)
function renderProfileBar() {
  const bar = $('profilebar');
  const part = state.parts[state.sel];
  const cur = part && part.solid ? (part.profile ?? null) : state.newProfile;
  bar.innerHTML = '<span class="plabel">Werkstück-Profil</span><span class="pseg" role="group" aria-label="Werkstück-Profil">' + state.settings.profiles.map((pr, i) =>
    '<button type="button" class="pbtn" data-profile="' + i + '" aria-pressed="' + (cur === i) + '" title="' +
    esc('Werkzeuge und Strategie für ' + profName(i) + ' – noch einmal klicken: ohne Profil') + '"><span class="k">' + (i + 1) + '</span>' + esc(profName(i)) + '</button>').join('') +
    '</span><span class="hint" title="' + (cur === null ? 'Ohne Profil gelten die Einstellungen aus „Werkzeuge &amp; Regeln“' : 'Neue Teile bekommen ' + esc(profName(state.newProfile ?? cur))) + '">' +
    (cur === null ? 'ohne Profil' : 'neue Teile: ' + esc(profName(state.newProfile ?? cur))) + '</span>' +
    '<span class="pact">' +
    (part && part.solid && state.parts.filter((x) => x.solid).length > 1 ? '<button type="button" class="btn ghost small ibtn" id="profileall" title="Aktuelles Profil für alle Teile übernehmen">' + ICON_ALL + '<span class="t">' +
      (cur === null ? 'Für alle Teile: ohne Profil' : 'Für alle Teile: ' + esc(profName(cur))) + '</span></button>' : '') +
    '<button type="button" class="btn ghost small ibtn" id="profileedit" title="Profile bearbeiten" aria-label="Profile bearbeiten">' + ICON_EDIT + '<span class="t">Profile bearbeiten</span></button></span>';
  bar.querySelectorAll('[data-profile]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.profile);
    const p = state.parts[state.sel];
    const next = (p && p.solid ? (p.profile ?? null) : state.newProfile) === i ? null : i;
    state.newProfile = next;
    storeJson('step2xcs.profile.v1', next === null ? null : { i: next });
    if (p && p.solid) { p.profile = next; compute(p); }
    render();
  }));
  if ($('profileall')) $('profileall').addEventListener('click', () => {
    for (const p of state.parts) if (p.solid) { p.profile = cur; compute(p); }
    render();
    toast('Profil für alle Teile: ' + (cur === null ? 'ohne Profil' : profName(cur)));
  });
  $('profileedit').addEventListener('click', () => {
    const box = $('profilebox');
    box.open = true;
    state.profileTab = cur ?? state.profileTab ?? 0;
    renderProfileEditor();
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// Bereich „Werkstück-Profile“: Name und Werte je Profil (leer = wie Einstellung)
function renderProfileEditor() {
  const el = $('profedit');
  const i = state.profileTab ?? 0;
  const pr = state.settings.profiles[i];
  const st = state.settings;
  const toolName = (n) => { const t = state.tools.find((x) => x.name === n); return t ? ToolLibrary.label(t) : n; };
  let html = '<div class="ptabs seg" role="group" aria-label="Profil wählen">' + state.settings.profiles.map((x, k) =>
    '<button type="button" data-ptab="' + k + '" aria-pressed="' + (k === i) + '">' + (k + 1) + ' · ' + esc(profName(k)) + '</button>').join('') + '</div>' +
    '<label class="pname">Name <input id="pname" type="text" maxlength="24" value="' + esc(pr.name) + '"></label><table><tbody>';
  for (const [k, label, type, unit] of XcsWriter.PROFILE_KEYS) {
    const v = pr.values[k];
    const set = v !== undefined && v !== null && v !== '';
    let ctl;
    if (type === 'mill' || type === 'saw' || type === 'sand') {
      ctl = toolSelect('data-pkey="' + k + '"', type, set ? v : '').replace('<select data-pkey="' + k + '">',
        '<select data-pkey="' + k + '"><option value=""' + (set ? '' : ' selected') + '>– wie Einstellung: ' + esc(toolName(st[k])) + ' –</option>');
    } else if (type === 'bool') {
      ctl = '<select data-pkey="' + k + '"><option value=""' + (set ? '' : ' selected') + '>– wie Einstellung: ' + (st[k] ? 'ja' : 'nein') + ' –</option>' +
        '<option value="1"' + (set && v ? ' selected' : '') + '>ja</option><option value="0"' + (set && !v ? ' selected' : '') + '>nein</option></select>';
    } else {
      ctl = '<input data-pkey="' + k + '" type="number" step="any" value="' + (set ? esc(v) : '') + '" placeholder="wie Einstellung: ' + esc(st[k]) + '">';
    }
    html += '<tr' + (set ? ' class="set"' : '') + '><td>' + esc(label) + (unit ? ' <small>' + esc(unit) + '</small>' : '') + '</td><td class="c">' + ctl + '</td></tr>';
  }
  el.innerHTML = html + '</tbody></table>';
  el.querySelectorAll('[data-ptab]').forEach((b) => b.addEventListener('click', () => { state.profileTab = Number(b.dataset.ptab); renderProfileEditor(); }));
  const changed = () => { saveSettings(); state.parts.forEach(compute); renderProfileEditor(); render(); };
  const nm = $('pname');
  nm.addEventListener('change', () => { pr.name = nm.value.trim() || 'Profil ' + (i + 1); changed(); });
  el.querySelectorAll('[data-pkey]').forEach((c) => c.addEventListener('change', () => {
    const k = c.dataset.pkey;
    const type = XcsWriter.PROFILE_KEYS.find((x) => x[0] === k)[2];
    let v = c.value;
    if (v === '') delete pr.values[k];
    else if (type === 'bool') pr.values[k] = v === '1';
    else if (type === 'number') { v = parseFloat(String(v).replace(',', '.')); if (isNaN(v)) return; pr.values[k] = v; } else pr.values[k] = v;
    changed();
  }));
}
// Nach Eingaben (Feld verlassen) erst nach dem laufenden Klick neu aufbauen – sonst geht der Klick auf
// einen Knopf verloren, weil die Seite zwischen Maus-Drücken und -Loslassen ersetzt wird.
let ptrDown = false;
let pendingRender = false;
document.addEventListener('pointerdown', () => { ptrDown = true; }, true);
const ptrEnd = () => setTimeout(() => { ptrDown = false; if (pendingRender) { pendingRender = false; render(); } }, 0);
document.addEventListener('pointerup', ptrEnd, true);
document.addEventListener('pointercancel', ptrEnd, true);
function renderSoon() { if (ptrDown) pendingRender = true; else render(); }

// Schritte mit gedrückter Maus (oder Finger) am Griff verschieben
// ------------------------------------------------ Zoom der Draufsicht (2D): Mausrad an der Mausposition, Ziehen verschiebt,
// Doppelklick oder „Ganz“ zeigt wieder alles. Wirkt auf das SVG (viewBox) – die Animation zeichnet im selben Ausschnitt.
const zoom = { part: null, k: 1, cx: 0, cy: 0 };
function setupZoom(part) {
  const view = $('view');
  const svg = view && view.querySelector('svg');
  if (!svg) return;
  const base = svg.viewBox.baseVal;
  const B = { x: base.x, y: base.y, w: base.width, h: base.height };
  if (zoom.part !== part || zoom.key !== B.w + 'x' + B.h) { zoom.part = part; zoom.key = B.w + 'x' + B.h; zoom.k = 1; zoom.cx = B.x + B.w / 2; zoom.cy = B.y + B.h / 2; }
  const apply = () => {
    const w = B.w / zoom.k;
    const h = B.h / zoom.k;
    // nicht aus dem Bild schieben
    zoom.cx = Math.min(B.x + B.w - w / 2, Math.max(B.x + w / 2, zoom.cx));
    zoom.cy = Math.min(B.y + B.h - h / 2, Math.max(B.y + h / 2, zoom.cy));
    svg.setAttribute('viewBox', (zoom.cx - w / 2) + ' ' + (zoom.cy - h / 2) + ' ' + w + ' ' + h);
    view.classList.toggle('zoomed', zoom.k > 1.001);
    const lab = $('zoomk');
    if (lab) lab.textContent = Math.round(zoom.k * 100) + ' %';
    drawAnim();
  };
  // Bildschirmpunkt → SVG-Koordinaten (preserveAspectRatio meet: zentriert)
  const toSvg = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const sc = Math.min(r.width / vb.width, r.height / vb.height);
    return [vb.x + (cx - r.left - (r.width - vb.width * sc) / 2) / sc, vb.y + (cy - r.top - (r.height - vb.height * sc) / 2) / sc, sc];
  };
  const zoomAt = (k, cx, cy) => {
    const nk = Math.min(40, Math.max(1, k));
    if (cx === undefined) { zoom.k = nk; apply(); return; }
    const [x, y] = toSvg(cx, cy);
    // Punkt unter der Maus bleibt stehen
    zoom.cx = x + (zoom.cx - x) * (zoom.k / nk);
    zoom.cy = y + (zoom.cy - y) * (zoom.k / nk);
    zoom.k = nk;
    apply();
  };
  // Bedienleiste
  const bar = document.createElement('div');
  bar.className = 'v3bar zoombar';
  bar.innerHTML = '<button type="button" data-z="out" aria-label="Verkleinern" title="Verkleinern (Mausrad)">−</button>' +
    '<span class="zk" id="zoomk">100 %</span><button type="button" data-z="in" aria-label="Vergrößern" title="Vergrößern (Mausrad)">+</button>' +
    '<button type="button" data-z="fit" title="Ganzes Teil zeigen (Doppelklick)">Ganz</button>';
  view.appendChild(bar);
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-z]');
    if (!b) return;
    if (b.dataset.z === 'fit') { zoom.k = 1; zoom.cx = B.x + B.w / 2; zoom.cy = B.y + B.h / 2; apply(); }
    else zoomAt(zoom.k * (b.dataset.z === 'in' ? 1.5 : 1 / 1.5));
  });
  bar.addEventListener('dblclick', (e) => e.stopPropagation());
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(zoom.k * Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 30 : 1)), e.clientX, e.clientY);
  }, { passive: false });
  view.addEventListener('dblclick', () => { zoom.k = 1; zoom.cx = B.x + B.w / 2; zoom.cy = B.y + B.h / 2; apply(); });
  // Verschieben mit gedrückter Maus (bzw. einem Finger), wenn vergrößert; zwei Finger: zoomen
  const touches = new Map();
  let pinch = null;
  view.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zoombar') || e.button > 0) return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2) {
      const [a, b] = Array.from(touches.values());
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: zoom.k };
      return;
    }
    if (zoom.k <= 1.001) return;
    const start = [e.clientX, e.clientY];
    const c0 = [zoom.cx, zoom.cy];
    let moved = false;
    const move = (ev) => {
      if (touches.has(ev.pointerId)) touches.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pinch && touches.size === 2) {
        const [a, b] = Array.from(touches.values());
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        zoomAt(pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, mid[0], mid[1]);
        return;
      }
      const sc = toSvg(0, 0)[2];
      if (!moved && Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) < 3) return;
      moved = true;
      view.classList.add('panning');
      zoom.cx = c0[0] - (ev.clientX - start[0]) / sc;
      zoom.cy = c0[1] - (ev.clientY - start[1]) / sc;
      apply();
    };
    const up = (ev) => {
      touches.delete(ev.pointerId);
      if (touches.size < 2) pinch = null;
      view.classList.remove('panning');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  });
  view.addEventListener('pointerup', (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; });
  view.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); pinch = null; });
  apply();
}

function setupStepDrag(part) {
  const table = $('opstable');
  const aside = table && table.closest('.steps');
  if (!table || !aside) return;
  table.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip || e.button > 0) return;
    e.preventDefault();
    const group = grip.dataset.grip;
    const groups = Array.from(table.querySelectorAll('tbody.grp'));
    const from = groups.findIndex((g) => g.dataset.grp === group);
    const lifted = groups[from];
    const line = $('dropline');
    const ghost = document.createElement('div');
    ghost.className = 'dragghost';
    ghost.textContent = lifted.querySelector('.jump').textContent;
    document.body.appendChild(ghost);
    lifted.classList.add('lifted');
    document.body.classList.add('dragging-step');
    let target = from;
    let scrollTimer = null;

    const place = (y) => {
      // Einfügeposition: vor dem ersten Schritt, dessen Mitte unter dem Zeiger liegt
      target = groups.length;
      for (let i = 0; i < groups.length; i++) {
        const r = groups[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) { target = i; break; }
      }
      const ar = aside.getBoundingClientRect();
      const ref = target < groups.length ? groups[target].getBoundingClientRect().top : groups[groups.length - 1].getBoundingClientRect().bottom;
      line.style.top = (ref - ar.top + aside.scrollTop - 2) + 'px';
      line.hidden = target === from || target === from + 1;
    };
    const move = (ev) => {
      ghost.style.left = (ev.clientX + 14) + 'px';
      ghost.style.top = (ev.clientY + 10) + 'px';
      place(ev.clientY);
      // am Rand des Fensters automatisch scrollen
      const ar = aside.getBoundingClientRect();
      clearInterval(scrollTimer);
      const dir = ev.clientY < ar.top + 40 ? -1 : ev.clientY > ar.bottom - 40 ? 1 : 0;
      if (dir) scrollTimer = setInterval(() => { aside.scrollTop += dir * 12; place(ev.clientY); }, 30);
    };
    const end = (ev, cancel) => {
      clearInterval(scrollTimer);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancelDrag);
      document.removeEventListener('keydown', key);
      ghost.remove();
      line.hidden = true;
      lifted.classList.remove('lifted');
      document.body.classList.remove('dragging-step');
      if (cancel || target === from || target === from + 1) return;
      const order = (part.result.groups || []).slice();
      const [g] = order.splice(from, 1);
      order.splice(target > from ? target - 1 : target, 0, g);
      ovOf(part).order = order;
      compute(part); render();
      toast('Reihenfolge geändert.');
    };
    const up = (ev) => end(ev, false);
    const cancelDrag = (ev) => end(ev, true);
    const key = (ev) => { if (ev.key === 'Escape') end(ev, true); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancelDrag);
    document.addEventListener('keydown', key);
    move(e);
  });
}

// ------------------------------------------------ Animation der Werkzeugbahn
const FEED = 150;    // mm/s bei 1× (Darstellung, nicht Maschinenvorschub)
const RAPID = 1500;  // mm/s Eilgang
const PLUNGE = 0.45; // s je Bohrung bei 1×
const CHANGE = 2.5;  // s je Werkzeugwechsel bei 1×
const anim = { result: null, moves: [], times: [], total: 0, t: 0, playing: false, speed: 5, last: 0, segs: [], wood: null };
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const plen = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };

function setupAnim(part) {
  const r = part.result;
  if (anim.result !== r) {
    anim.result = r;
    anim.moves = Toolpath.build(r, ToolLibrary.infoMap(state.tools), state.settings);
    anim.times = [];
    let t = 0;
    for (const m of anim.moves) {
      let d = m.type === 'plunge' ? PLUNGE : Math.max(0.03, plen(m.pts) / (m.type === 'rapid' ? RAPID : FEED));
      if (m.change) { m.travel = d / (d + CHANGE); d += CHANGE; } // Werkzeugwechsel: hinfahren, dann wechseln
      anim.times.push([t, t + d]);
      t += d;
    }
    anim.total = t;
    anim.opStart = {};
    anim.moves.forEach((m, k) => { if (m.op >= 0 && m.type !== 'rapid' && anim.opStart[m.op] === undefined) anim.opStart[m.op] = anim.times[k][0]; });
    anim.t = 0;
    anim.playing = false;
    // Abschnitte der Zeitleiste: je Bearbeitungsgruppe von der ersten bis zur letzten Bewegung
    const segs = [];
    anim.moves.forEach((m, i) => {
      if (m.op < 0) return;
      const last = segs[segs.length - 1];
      // zweistufig: Vor- und Nachfräsen als eigene Abschnitte (Vorfräsen heller); Werkzeugwechsel gehört zum folgenden
      if (last && last.group === m.group && last.stage === (m.stage || '')) {
        last.t1 = anim.times[i][1];
        if (!last.label && !m.change) last.label = m.label;
      } else segs.push({ group: m.group, stage: m.stage || '', t0: anim.times[i][0], t1: anim.times[i][1], label: m.change ? '' : m.label,
        tok: opToken(r.ops[m.op]) });
    });
    for (const g of segs) if (!g.label) g.label = 'Werkzeugwechsel';
    anim.segs = segs;
  }
  const tl = $('tl');
  tl.innerHTML = anim.segs.map((g, i) => '<button type="button" data-seg="' + i + '" style="width:' + ((g.t1 - g.t0) / anim.total * 100).toFixed(3) +
    '%;background:' + (g.stage === 'rough' ? 'color-mix(in srgb, var(' + g.tok + ') 50%, var(--surface))' : 'var(' + g.tok + ')') + '" title="' +
    esc((i + 1) + ': ' + g.label) + '" aria-label="' + esc('Zu ' + g.label + ' springen') + '"></button>').join('') +
    '<span class="head" id="tlhead"></span>';
  tl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg]');
    if (!b) return;
    jumpTo(anim.segs[+b.dataset.seg].t0 + 1e-6);
  });
  document.querySelectorAll('#detail [data-jump]').forEach((b) => b.addEventListener('click', () => {
    const g = anim.segs.find((x) => x.group === b.dataset.jump);
    if (g) jumpTo(g.t0 + 1e-6);
  }));
  $('aplay').addEventListener('click', () => {
    if (anim.t >= anim.total) anim.t = 0;
    anim.playing = !anim.playing;
    anim.last = performance.now();
    if (anim.playing) requestAnimationFrame(tick);
    drawAnim();
  });
  $('areset').addEventListener('click', () => { anim.t = 0; anim.playing = false; drawAnim(); });
  $('afull').addEventListener('click', () => {
    const card = $('stagecard');
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (card.requestFullscreen) card.requestFullscreen().catch(() => toast('Vollbild ist hier nicht möglich.'));
      else toast('Vollbild ist hier nicht möglich.');
    } catch (e) { toast('Vollbild ist hier nicht möglich.'); }
  });
  $('aspeed').addEventListener('change', (e) => { anim.speed = +e.target.value; });
  $('apos').addEventListener('input', (e) => { anim.t = (e.target.value / 1000) * anim.total; anim.playing = false; drawAnim(); });
  drawAnim();
}

function jumpTo(t) {
  anim.t = Math.max(0, Math.min(anim.total, t));
  anim.playing = false;
  drawAnim();
}

function tick(now) {
  if (!anim.playing || !$('hud')) return;
  anim.t = Math.min(anim.total, anim.t + ((now - anim.last) / 1000) * anim.speed);
  anim.last = now;
  if (anim.t >= anim.total) anim.playing = false;
  drawAnim(now);
  if (anim.playing) requestAnimationFrame(tick);
}

// Punkt nach Anteil f entlang einer Polylinie
function along(pts, f) {
  if (pts.length === 1) return { pts: pts, at: pts[0], dir: [1, 0] };
  const total = plen(pts);
  let rest = total * f;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const dir = l ? [(pts[i][0] - pts[i - 1][0]) / l, (pts[i][1] - pts[i - 1][1]) / l] : [1, 0];
    if (rest <= l) {
      const k = l ? rest / l : 0;
      const q = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
      out.push(q);
      return { pts: out, at: q, dir: dir };
    }
    rest -= l;
    out.push(pts[i]);
  }
  return { pts: out, at: pts[pts.length - 1], dir: [1, 0] };
}

// Farbe als RGB-Tripel (aus #rrggbb)
function rgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, k) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')';
// Haltestege eines Durchbruchs als Rechtecke (Plattenkoordinaten): quer über die Fräsbahn (Breite = Fräser),
// Länge = Steglänge, Mitte = Bahnmitte auf der Werkzeugseite
function tabRects(op) {
  if (!op || !op.tabs || !op.tabMarks) return [];
  const info = ToolLibrary.infoMap(state.tools)[op.tool] || {};
  const d = info.d || 10;
  const len = op.tabLength || 5;
  // Werkzeugseite wie die Radiuskorrektur der Bearbeitung: 1 = links, 2 = rechts der Bahn, sonst Mitte
  const sgn = op.side === 1 ? 1 : op.side === 2 ? -1 : 0;
  return op.tabMarks.map((k) => {
    const nl = [-k.t[1], k.t[0]];
    const c = [k.at[0] + nl[0] * sgn * d / 2, k.at[1] + nl[1] * sgn * d / 2];
    const a = [k.t[0] * len / 2, k.t[1] * len / 2];
    const b = [nl[0] * d / 2, nl[1] * d / 2];
    return { c: c, t: k.t, len: len, w: d, h: op.tabHeight || 2,
      pts: [[c[0] - a[0] - b[0], c[1] - a[1] - b[1]], [c[0] + a[0] - b[0], c[1] + a[1] - b[1]], [c[0] + a[0] + b[0], c[1] + a[1] + b[1]], [c[0] - a[0] + b[0], c[1] - a[1] + b[1]]] };
  });
}
// Farbe einer Bewegung: Bearbeitungsart; beim zweistufigen Formatfräsen das Vorfräsen heller (gleicher Farbton der Palette)
function moveColor(m, op, col) {
  const base = col(opToken(op));
  if (m.stage !== 'rough') return base;
  try { return mix(rgb(base), rgb(col('--surface')), 0.5); } catch (e) { return base; }
}

// Holzplatte mit Maserung (einmal je Größe/Farbe berechnet)
function woodTexture(w, h, base) {
  const key = w + 'x' + h + base;
  if (anim.wood && anim.wood.key === key) return anim.wood.cv;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  const c = cv.getContext('2d');
  const b = rgb(base);
  c.fillStyle = mix(b, b, 0);
  c.fillRect(0, 0, cv.width, cv.height);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lines = Math.max(12, Math.round(cv.height / 5));
  for (let i = 0; i < lines; i++) {
    const y0 = rnd() * cv.height;
    const amp = 1 + rnd() * 4;
    const freq = 0.004 + rnd() * 0.01;
    const dark = rnd() < 0.6;
    c.strokeStyle = dark ? 'rgba(90,60,25,' + (0.05 + rnd() * 0.08) + ')' : 'rgba(255,245,225,' + (0.05 + rnd() * 0.08) + ')';
    c.lineWidth = 0.6 + rnd() * 1.8;
    c.beginPath();
    for (let x = 0; x <= cv.width; x += 6) {
      const y = y0 + Math.sin(x * freq + i) * amp + Math.sin(x * freq * 3.1) * amp * 0.3;
      if (x) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.stroke();
  }
  anim.wood = { key: key, cv: cv };
  return cv;
}

// Fräser bzw. Bohrer von oben: Schatten, metallischer Körper, drehende Schneiden
function drawTool(ctx, x, y, r, angle, lifted, isDrill, col) {
  r = Math.max(4, r);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = lifted ? 18 : 8;
  ctx.shadowOffsetX = lifted ? 7 : 3;
  ctx.shadowOffsetY = lifted ? 7 : 3;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#f4f6f8');
  g.addColorStop(0.55, '#b4bcc4');
  g.addColorStop(1, '#6d7680');
  ctx.fillStyle = g;
  ctx.globalAlpha = lifted ? 0.8 : 0.95;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const flutes = isDrill ? 2 : (r > 14 ? 4 : 3);
  ctx.strokeStyle = 'rgba(40,46,52,0.75)';
  ctx.lineWidth = Math.max(1, r * 0.09);
  for (let i = 0; i < flutes; i++) {
    ctx.rotate((Math.PI * 2) / flutes);
    ctx.beginPath();
    ctx.moveTo(r * 0.15, 0);
    ctx.quadraticCurveTo(r * 0.6, r * (isDrill ? 0.45 : 0.25), r * 0.95, r * (isDrill ? 0.1 : 0.35));
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#2b3138';
  ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.12), 0, Math.PI * 2); ctx.fill();
}

// Liegendes Werkzeug (Bearbeitung von der Kante), von oben gesehen: Spitze bei (x, y),
// ax = Richtung in die Platte (Bildschirm), len = Schneidenlänge, sc = Maßstab mm → px
function drawSideTool(ctx, x, y, r, ax, len, spin, lifted, isDrill, col) {
  r = Math.max(3, r);
  const lc = Math.max(len, r * 2.5);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(-ax[1], -ax[0])); // lokales +x zeigt aus der Platte heraus
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = lifted ? 16 : 7;
  ctx.shadowOffsetX = lifted ? 6 : 3;
  ctx.shadowOffsetY = lifted ? 6 : 3;
  const steel = (h) => {
    const g = ctx.createLinearGradient(0, -h, 0, h);
    g.addColorStop(0, '#5f6872'); g.addColorStop(0.35, '#eef1f4'); g.addColorStop(0.6, '#b4bcc4'); g.addColorStop(1, '#4f5760');
    return g;
  };
  ctx.globalAlpha = lifted ? 0.85 : 1;
  // Aggregat / Spindelkopf
  const hx = lc + r * 2.2;
  const hh = Math.max(r * 1.7, 9);
  const hl = Math.max(r * 3.2, 22);
  const hg = ctx.createLinearGradient(0, -hh, 0, hh);
  hg.addColorStop(0, '#2f353b'); hg.addColorStop(0.4, '#5d656e'); hg.addColorStop(1, '#262b30');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.roundRect(hx, -hh, hl, hh * 2, Math.min(6, hh * 0.4)); ctx.fill();
  ctx.shadowColor = 'transparent';
  // Spannzange / Schaft
  ctx.fillStyle = steel(r * 0.8);
  ctx.fillRect(lc, -r * 0.8, hx - lc, r * 1.6);
  ctx.fillStyle = '#3a4148';
  ctx.fillRect(hx - Math.max(2, r * 0.5), -r * 1.15, Math.max(2, r * 0.5), r * 2.3);
  // Schneide mit umlaufenden Spannuten
  const t0 = isDrill ? r * 0.55 : 0;
  ctx.fillStyle = steel(r);
  ctx.beginPath();
  if (isDrill) { ctx.moveTo(0, 0); ctx.lineTo(t0, -r); ctx.lineTo(lc, -r); ctx.lineTo(lc, r); ctx.lineTo(t0, r); ctx.closePath(); }
  else ctx.rect(0, -r, lc, r * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(40,46,52,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.16);
  const pitch = Math.max(5, r * 1.3);
  const off = ((spin * r * 0.25) % pitch + pitch) % pitch;
  for (let u = -2 * r - pitch + off; u < lc + 2 * r; u += pitch) {
    ctx.beginPath(); ctx.moveTo(u, -r); ctx.lineTo(u + r * 0.9, r); ctx.stroke();
  }
  ctx.restore();
  // Rahmen in der Farbe der Bearbeitung
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (isDrill) { ctx.moveTo(-1.5, 0); ctx.lineTo(t0, -r - 1.5); ctx.lineTo(lc, -r - 1.5); ctx.moveTo(lc, r + 1.5); ctx.lineTo(t0, r + 1.5); ctx.closePath(); }
  else ctx.rect(-1.5, -r - 1.5, lc + 1.5, r * 2 + 3);
  ctx.stroke();
  ctx.restore();
}

// Geneigtes Sägeblatt von oben: Ellipse (Blattdurchmesser × Projektion der Neigung) entlang der Schnittrichtung
function drawBlade(ctx, x, y, m, sc, spin, lifted, col) {
  const b = m.blade;
  const pts = m.pts;
  const dir = Math.atan2(-(pts[pts.length - 1][1] - pts[0][1]), pts[pts.length - 1][0] - pts[0][0]);
  const R = Math.max(10, (b.d / 2) * sc);
  const rr = Math.max((b.thick || 3) * sc, R * Math.sin((b.tilt || 0) * Math.PI / 180));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = lifted ? 16 : 8;
  ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4;
  const g = ctx.createLinearGradient(-R, -rr, R, rr);
  g.addColorStop(0, '#7d868f'); g.addColorStop(0.45, '#eef1f4'); g.addColorStop(1, '#69727b');
  ctx.globalAlpha = lifted ? 0.55 : 0.7;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, R, rr, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = 1;
  // Zähne am Rand, laufen beim Abspielen um
  ctx.strokeStyle = 'rgba(40,46,52,0.6)';
  ctx.lineWidth = 1;
  const nT = 36;
  for (let k = 0; k < nT; k++) {
    const a = (k / nT) * Math.PI * 2 + spin * 0.3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.9, Math.sin(a) * rr * 0.9);
    ctx.lineTo(Math.cos(a) * R, Math.sin(a) * rr);
    ctx.stroke();
  }
  ctx.fillStyle = '#2b3138';
  ctx.beginPath(); ctx.ellipse(0, 0, R * 0.12, rr * 0.12 + 1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, R + 1.5, rr + 1.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function arrow(ctx, a, b, color) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(b[0], b[1]);
  ctx.lineTo(b[0] - 9 * Math.cos(ang - 0.4), b[1] - 9 * Math.sin(ang - 0.4));
  ctx.lineTo(b[0] - 9 * Math.cos(ang + 0.4), b[1] - 9 * Math.sin(ang + 0.4));
  ctx.closePath(); ctx.fill();
}

// ------------------------------------------------ 3D-Ansicht (STEP-Netz + Werkzeugbahn in 3D)
const VIEW_KEY = 'step2xcs.view3d.v1';
function isDarkTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
const v3 = { viewer: null, host: null, result: null, showRaw: true, error: null };

function v3message(text) {
  const m = $('v3msg');
  if (!m) return;
  m.hidden = !text;
  m.textContent = text || '';
}

// Werkzeugbahn der gelöschten Bearbeitungen (für die rote Markierung in 2D und 3D)
function suppressedMoves(r) {
  if (!(r.suppressed || []).length) return [];
  try {
    return Toolpath.build({ panel: r.panel, ops: r.suppressed.flatMap((g) => g.ops) }, ToolLibrary.infoMap(state.tools), state.settings);
  } catch (e) { return []; }
}

function mount3d(part) {
  const slot = $('v3slot');
  if (!slot) return;
  if (!part.stepText) { v3message(part.dxfText !== undefined ? 'DXF ist eine 2D-Zeichnung – die 3D-Ansicht gibt es nur für STEP. Die Werkzeugbahn zeigt die 2D-Ansicht.' : 'Für dieses Teil gibt es keine 3D-Daten.'); return; }
  if (v3.error) { v3message(v3.error); return; }
  if (v3.host) slot.appendChild(v3.host);
  v3message(v3.viewer ? '' : '3D wird geladen …');
  View3D.load().then((occt) => {
    if (!state.mode3d || !$('v3slot')) return;
    if (!v3.viewer) {
      v3.host = document.createElement('div');
      v3.host.className = 'v3host';
      $('v3slot').appendChild(v3.host);
      try { v3.viewer = new View3D.Viewer(v3.host); } catch (e) { throw new Error('WebGL ist in diesem Browser nicht verfügbar.'); }
      v3.viewer.setRaw(v3.showRaw);
    } else if (v3.host.parentNode !== $('v3slot')) $('v3slot').appendChild(v3.host);
    const cur = state.parts[state.sel];
    if (!cur || !cur.result || !cur.result.panel) return;
    const css = getComputedStyle(document.documentElement);
    const col = (n) => css.getPropertyValue(n).trim() || '#888888';
    v3.viewer.setTheme(isDarkTheme());
    if (v3.result !== cur.result || v3.board !== boardKeyOf(cur)) {
      v3.result = cur.result;
      v3.board = boardKeyOf(cur);
      const ops = cur.result.ops;
      v3.viewer.setPart({
        meshes: meshesOf(occt, cur.stepText), panel: cur.result.panel, tf: cur.result.panel.tf,
        raw: cur.result.side === 2 ? 0 : (state.settings.rawOversize || 0), board: boardKeyOf(cur), // Seite 2: ohne Rohteil-Versatz
        colorOf: (m) => moveColor(m, ops[m.op], col),
        suction: cur.result.suction,
        // gelöscht: immer kräftiges Rot (das Holz ist in beiden Modi hell)
        suppressed: suppressedMoves(cur.result), suppressedColor: '#c62a1c',
        tabs: ops.flatMap((op) => tabRects(op)), tabColor: '#c25a00', // Haltestege: kräftig, in hell und dunkel gut zu sehen
      });
    }
    v3message('');
    drawAnim();
  }).catch((e) => { v3.error = (e && e.message) || String(e); v3message('3D nicht möglich: ' + v3.error); });
}

function draw3d(now) {
  if (!anim.result) return;
  const active = anim.playing || anim.t > 0;
  let i = -1;
  let f = 0;
  for (let k = 0; k < anim.times.length; k++) {
    if (anim.t < anim.times[k][1] || k === anim.times.length - 1) { i = k; const [t0, t1] = anim.times[k]; f = t1 > t0 ? Math.max(0, Math.min(1, (anim.t - t0) / (t1 - t0))) : 1; break; }
  }
  if (anim.t >= anim.total) i = -1;
  const m = i >= 0 ? anim.moves[i] : null;
  // Werkzeugwechsel: erst zur Parkposition fahren (Anteil travel), dann wechseln – wie in 2D
  const fm = m && m.change ? Math.min(1, f / (m.travel || 1)) : f;
  const cur = m ? { m: m, f: f, i: i, at: along(m.pts, fm).at } : null;
  if (v3.viewer && v3.result === anim.result) {
    const spin = reduceMotion ? 0 : ((now || performance.now()) / 1000) * 14;
    v3.viewer.setTime(anim.moves, i, fm, active, spin, ToolLibrary.infoMap(state.tools));
  }
  updateHud(cur);
  updateControls(cur);
}

function drawAnim(now) {
  if (state.mode3d) { draw3d(now); return; }
  const cv = $('animcv');
  const svg = document.querySelector('#view svg');
  if (!cv || !svg || !anim.result) return;
  const p = anim.result.panel;
  const vb = svg.viewBox.baseVal;
  const rect = svg.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(rect.width * dpr);
  cv.height = Math.round(rect.height * dpr);
  cv.style.height = rect.height + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  updateHud(null);
  const active = anim.playing || anim.t > 0;
  svg.style.opacity = '1';
  if (!active) { updateControls(null); return; }

  const sc = Math.min(rect.width / vb.width, rect.height / vb.height);
  const ox = (rect.width - vb.width * sc) / 2;
  const oy = (rect.height - vb.height * sc) / 2;
  const X = (x) => ox + (x - vb.x) * sc;
  const Y = (y) => oy + (p.W - y - vb.y) * sc;
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim() || '#888888';
  const board = rgb(col('--board'));
  const dark = [40, 24, 8];
  const table = col('--table');
  const shade = (m) => (m.through ? table : mix(board, dark, Math.min(0.75, 0.22 + 0.55 * (m.z / p.T))));
  const path = (pts) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); };

  // Rohteil mit Maserung
  const o = state.settings.rawOversize || 0;
  const bx = X(-o);
  const by = Y(p.W + o);
  const bw = (p.L + 2 * o) * sc;
  const bh = (p.W + 2 * o) * sc;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  ctx.drawImage(woodTexture(bw, bh, col('--board')), bx, by, bw, bh);
  ctx.restore();
  ctx.strokeStyle = col('--board-edge'); ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
  svg.style.opacity = '0';

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let cur = null;
  // Vorschau der noch kommenden Bahnen
  ctx.globalAlpha = 0.45; ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.strokeStyle = col('--muted');
  for (let i = 0; i < anim.moves.length; i++) {
    const m = anim.moves[i];
    if (anim.times[i][0] <= anim.t || m.type === 'rapid') continue;
    if (m.type === 'plunge') { ctx.beginPath(); ctx.arc(X(m.pts[0][0]), Y(m.pts[0][1]), Math.max(1, (m.d / 2) * sc), 0, Math.PI * 2); ctx.stroke(); }
    else { path(m.pts); ctx.stroke(); }
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  // Abgetragenes Material: tiefere Bearbeitungen dunkler, durchgefräst = Tisch
  for (let i = 0; i < anim.moves.length; i++) {
    const m = anim.moves[i];
    const [t0, t1] = anim.times[i];
    if (t0 > anim.t) break;
    const f = t1 > t0 ? Math.min(1, (anim.t - t0) / (t1 - t0)) : 1;
    const part = along(m.pts, m.change ? Math.min(1, f / (m.travel || 1)) : f);
    cur = { m: m, at: part.at, f: f, i: i };
    if (m.type === 'rapid') continue;
    if (m.type === 'plunge') {
      const rr = Math.max(0.8, (m.d / 2) * sc);
      ctx.fillStyle = shade(m);
      ctx.globalAlpha = Math.min(1, 0.25 + f);
      ctx.beginPath(); ctx.arc(X(m.pts[0][0]), Y(m.pts[0][1]), rr * Math.min(1, 0.4 + f), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (!m.through && rr > 2) {
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(X(m.pts[0][0]), Y(m.pts[0][1]), rr, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (m.kind === 'edge') {
      // Kantenbohrung liegt im Material: gestrichelt
      const w = Math.max(1, m.d * sc);
      ctx.strokeStyle = col('--hdrill'); ctx.globalAlpha = 0.3; ctx.lineWidth = w; path(part.pts); ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = shade(m);
      ctx.lineWidth = Math.max(1, m.d * sc);
      if (m.blade) ctx.lineCap = 'butt';
      path(part.pts); ctx.stroke();
      if (m.stage) {
        // zweistufig: Bahnmitte in der Farbe der Stufe (vorfräsen hell, nachfräsen kräftig)
        ctx.strokeStyle = moveColor(m, anim.result.ops[m.op], col); ctx.lineWidth = 2.5;
        path(part.pts); ctx.stroke();
      }
      ctx.lineCap = 'round';
      if (m.slug && f >= 1 && m.through) { ctx.fillStyle = table; path(m.slug); ctx.closePath(); ctx.fill(); }
    }
  }

  // Haltestege: ab Beginn des Durchbruchs als stehen bleibendes Material markieren
  anim.result.ops.forEach((op, k) => {
    if (!op.tabs || !(anim.opStart && anim.opStart[k] !== undefined && anim.opStart[k] <= anim.t)) return;
    for (const t of tabRects(op)) {
      ctx.fillStyle = col('--warn'); ctx.globalAlpha = 0.9;
      ctx.beginPath(); t.pts.forEach((q, j) => (j ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = col('--ink'); ctx.lineWidth = 1; ctx.stroke();
    }
  });

  // Eilgang mit Pfeil, Werkzeug
  if (cur) {
    const m = cur.m;
    if (m.type === 'rapid' && cur.f < 1) arrow(ctx, [X(m.pts[0][0]), Y(m.pts[0][1])], [X(m.pts[1][0]), Y(m.pts[1][1])], col('--muted'));
    if (m.d && !(anim.t >= anim.total)) {
      const spin = reduceMotion ? 0 : ((now || performance.now()) / 1000) * 14;
      const op = anim.result.ops[m.op];
      const isDrill = m.kind === 'drill' || (op && op.kind === 'drill');
      const ring = m.type === 'rapid' ? col('--muted') : moveColor(m, op, col);
      if (m.change) {
        // Werkzeugwechsel: am Wechselplatz altes Werkzeug ab, neues an (Durchmesser springt), mit Hinweis
        const swapped = cur.f >= (m.travel || 0) + (1 - (m.travel || 0)) / 2;
        const atPark = cur.f >= (m.travel || 1);
        const r0 = ((swapped ? m.change.dTo : m.change.dFrom) || m.d) / 2;
        drawTool(ctx, X(cur.at[0]), Y(cur.at[1]), r0 * sc, atPark ? 0 : spin, true, false, col('--muted'));
        if (atPark) {
          const tx = X(cur.at[0]) + r0 * sc + 8;
          const ty = Y(cur.at[1]);
          ctx.font = '600 13px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
          ctx.textBaseline = 'middle';
          const txt = '⟳ ' + m.change.from + ' → ' + m.change.to;
          const w = ctx.measureText(txt).width + 14;
          ctx.fillStyle = col('--surface'); ctx.strokeStyle = col('--accent'); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tx, ty - 12, w, 24, 6) : ctx.rect(tx, ty - 12, w, 24); ctx.fill(); ctx.stroke();
          ctx.fillStyle = col('--ink'); ctx.fillText(txt, tx + 7, ty);
        }
      } else if (m.blade) {
        drawBlade(ctx, X(cur.at[0]), Y(cur.at[1]), m, sc, spin, m.type === 'rapid', ring);
      } else if (m.axis) {
        // von der Kante (liegend) oder auf schräger Ebene (gekippt): von oben gesehen verkürzt
        const info = ToolLibrary.infoMap(state.tools)[m.tool] || {};
        const len = Math.max(m.z + 3, Math.min(info.len || 0, m.z * 1.6)) * sc * (m.axisScale || 1);
        drawSideTool(ctx, X(cur.at[0]), Y(cur.at[1]), (m.d / 2) * sc, [m.axis[0], -m.axis[1]], len, spin, m.type === 'rapid', isDrill, ring);
      } else {
        drawTool(ctx, X(cur.at[0]), Y(cur.at[1]), (m.d / 2) * sc, spin, m.type === 'rapid', isDrill, ring);
      }
    }
  }
  updateHud(cur);
  updateControls(cur);
}

function updateHud(cur) {
  const hud = $('hud');
  if (!hud) return;
  if (!cur || !(anim.playing || anim.t > 0)) {
    hud.innerHTML = '<span class="idle">' + anim.segs.length + ' Bearbeitungsschritte. Abspielen zeigt den Materialabtrag in Programmreihenfolge.</span>';
    return;
  }
  if (anim.t >= anim.total) {
    hud.innerHTML = '<span class="idle">Fertig. Vereinfachte Darstellung – maßgeblich ist die Simulation in Maestro.</span>';
    return;
  }
  const m = cur.m;
  const info = ToolLibrary.infoMap(state.tools)[m.tool];
  const dia = info && info.d ? info.d : m.d;
  const n = anim.segs.findIndex((g) => g.group === m.group && g.stage === (m.stage || '')) + 1;
  hud.innerHTML = '<b>' + (m.op >= 0 ? n + '/' + anim.segs.length + ' · ' : '') + esc(m.label) + '</b>' +
    '<span class="m">' + esc(m.tool || '') + (dia ? ' Ø' + fmt(dia) : '') + (m.z ? ' · T ' + fmt(m.z) + ' mm' : '') + (m.change ? ' · Werkzeugwechsel' : m.type === 'rapid' ? ' · Eilgang' : '') + '</span>' +
    '<span class="m">X ' + fmt(cur.at[0]) + ' · Y ' + fmt(cur.at[1]) + '</span>';
}

function updateControls(cur) {
  const pos = $('apos');
  if (pos) pos.value = anim.total ? Math.round((anim.t / anim.total) * 1000) : 0;
  const head = $('tlhead');
  if (head) head.style.left = (anim.total ? (anim.t / anim.total) * 100 : 0) + '%';
  const play = $('aplay');
  if (play) play.textContent = anim.playing ? '⏸ Pause' : (anim.t > 0 && anim.t < anim.total ? '▶ Weiter' : '▶ Werkzeugbahn abspielen');
  const group = cur && anim.t < anim.total && (anim.playing || anim.t > 0) ? cur.m.group : null;
  document.querySelectorAll('#detail tr[data-group]').forEach((tr) => tr.classList.toggle('now', !!group && tr.dataset.group === group));
}
window.addEventListener('resize', () => drawAnim());
document.addEventListener('fullscreenchange', () => {
  const b = $('afull');
  if (b) { b.textContent = document.fullscreenElement ? '✕ Vollbild beenden' : '⛶ Vollbild'; b.setAttribute('aria-pressed', !!document.fullscreenElement); }
  requestAnimationFrame(() => drawAnim());
});
