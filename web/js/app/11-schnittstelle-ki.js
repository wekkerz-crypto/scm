/*
 * Weckwop – Programm-Schnittstelle und KI-Assistent (11-schnittstelle-ki.js)
 * `window.Weckwop.api` (Werkzeuge der KI), KI-Fenster (ChatGPT/Claude, auch über den Server), Rückgängig.
 * Teil des Programms in web/index.html: alle Dateien unter js/app/ teilen sich die obersten Namen (state, lst, $, render …)
 * und werden dort der Reihenfolge nach (01 … 12) geladen. Beim Laden ausgeführter Code darf nur Namen aus dieser oder
 * früheren Dateien benutzen – Funktionen aus späteren Dateien nur in Ereignissen (Klick …), die erst danach kommen.
 */
'use strict';

// ------------------------------------------------ Programm-Schnittstelle (window.Weckwop.api) und KI-Assistent
/*
 * Die Schnittstelle bedient Teileliste, Stückliste und Zuschnitt mit einfachen Daten (JSON) – der KI-Assistent (js/assist.js)
 * ruft genau diese Funktionen als Werkzeuge auf; sie lassen sich auch aus der Browser-Konsole oder einem eigenen Skript nutzen.
 * Fehler als Exception mit deutschem Text. Nach Änderungen wird die Seite neu gezeichnet und die Sitzung gespeichert.
 */
const rd = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);
function apiPartOf(nr) {
  const p = state.parts[(nr | 0) - 1];
  if (!p || nr !== (nr | 0)) throw new Error('Bauteil ' + nr + ' gibt es nicht (1 … ' + state.parts.length + ').');
  return p;
}
function apiPart(p, i) {
  const r = p.res || p.result;
  const pn = r && r.panel;
  const b = boardKeyOf(p);
  const t = pn ? partTime(p) : null;
  const prof = p.profile === null || p.profile === undefined ? null : (state.settings.profiles[p.profile] || {}).name || null;
  return { teil: i + 1, name: p.solid ? p.solid.name : p.label, datei: String(p.label || '').replace(/^Beispiel: /, ''), L: pn ? rd(pn.L) : null, B: pn ? rd(pn.W) : null,
    D: pn ? rd(pn.T) : null, anzahl: qtyOf(p), material: { key: b, name: boardName(b) }, kanten: edgesOf(p), kanten_von_hand: !!p.edges, faser: grainOf(p),
    profil: prof, zweiseitig: !!(r && r.side2), zeit_s: t ? Math.round(t.total) : null, warnungen: r && r.warnings ? r.warnings.slice(0, 6) : [],
    fehler: p.error || (r && r.error) || null, programm: p.fileName || (r && r.fileName) || null };
}
// gültiger Material-Schlüssel? (Liste aus materialien_lesen, eigene Farbe #rrggbb[/u][~Name] oder Dekor dek:KEY)
function apiBoardKey(k) {
  k = String(k || '').trim();
  if (!k) return null;
  if (View3D.MATERIALS.some((m) => m.id === k.split('|')[0]) || customBoards().includes(k)) return k;
  if (/^dek:/.test(k) && View3D.decors().some((d) => 'dek:' + d.key === k.split('|')[0])) return k;
  if (/^#[0-9a-f]{6}(\/u)?(~[^|]{1,80})?$/i.test(k)) return k;
  if (state.parts.some((p) => boardKeyOf(p) === k)) return k;
  throw new Error('Material „' + k + '“ unbekannt – Schlüssel aus materialien_lesen nehmen.');
}
function syncListInputs() {
  for (const [id, k] of [['csheetL', 'sheetL'], ['csheetW', 'sheetW'], ['ckerf', 'kerf'], ['ctrim', 'trim'], ['emm', 'edgeMm'], ['eextra', 'edgeExtra'], ['ename1', 'edgeName1'], ['ename2', 'edgeName2'], ['cdir', 'dir'], ['cgoal', 'goal']]) {
    if ($(id) && lst[k] !== undefined) $(id).value = lst[k];
  }
  for (const [id, k] of [['craw', 'raw'], ['cgrain', 'grain'], ['ccuts', 'cuts'], ['ededuct', 'edgeDeduct'], ['lgroup', 'group']]) if ($(id)) $(id).checked = !!lst[k];
  if ($('ecol2') && /^#[0-9a-f]{6}$/i.test(lst.edgeColor2 || '')) $('ecol2').value = lst.edgeColor2;
}
let apiChanged = false; // in einer KI-Anfrage etwas geändert? (für „Rückgängig“)
const api = {
  teile_lesen() { return { anzahl_bauteile: state.parts.length, teile: state.parts.map(apiPart) }; },
  stueckliste_lesen() {
    const rows = bomRows();
    const tot = bomTotals(rows);
    return { positionen: rows.map((r, k) => ({ pos: k + 1, teile: r.nums, namen: r.names, anzahl: r.qty, L: rd(r.L), B: rd(r.W), D: rd(r.T), roh: { L: rd(r.raw.L), B: rd(r.raw.W) },
      material: { key: r.board, name: boardName(r.board) }, kanten: r.edges, kanten_text: edgeText(r.edges), zeit_s_je_stueck: r.time ? Math.round(r.time.total) : null })),
      summe: { teile: tot.qty, zeit_s: Math.round(tot.time), m2_je_material: Object.fromEntries(Array.from(tot.byMat).map(([k, v]) => [k, Math.round(v * 100) / 100])),
        kantenband_m: Object.fromEntries(Array.from(tot.bands).map(([k, v]) => [k, Math.round(v * 10) / 10])) } };
  },
  zuschnitt_lesen() {
    const groups = cutGroups();
    const o = cutOverview(groups);
    return { einstellungen: { platte_laenge: lst.sheetL, platte_breite: lst.sheetW, schnittfuge: lst.kerf, besaeumen: lst.trim, faser: !!lst.grain, richtung: lst.dir, ziel: lst.goal, roh: !!lst.raw },
      gruppen: o.rows.map((r) => ({ gruppe: r.g.key, material: r.g.name, D: rd(r.g.T), format: { L: r.g.fmt.L, W: r.g.fmt.W, eigenes: !!(lst.groupSheet && lst.groupSheet[r.g.key]) },
        platten: r.n, teile: r.parts, ausnutzung_prozent: r.util, von_hand: !!r.g.plan.manual, passt_nicht: r.g.plan.unplaced.map((u) => ({ teil: u.id, name: u.label, L: rd(u.l || u.L), B: rd(u.w || u.W) })) })),
      summe: { platten: o.sum.n, teile: o.sum.parts, nicht_passend: o.sum.miss } };
  },
  materialien_lesen() {
    const used = Array.from(new Set(state.parts.map(boardKeyOf)));
    return { standard: { key: boardKeyOf(null), name: boardName(boardKeyOf(null)) },
      im_projekt: used.map((k) => ({ key: k, name: boardName(k) })),
      holz_und_farben: View3D.MATERIALS.map((m) => ({ key: m.id, name: m.name })),
      dekore: View3D.decors().map((d) => ({ key: 'dek:' + d.key, name: d.name || d.code || d.key, code: d.code || d.key })),
      eigene_farben: customBoards().map((k) => ({ key: k, name: boardName(k) })),
      kantenband: { dicke_mm: lst.edgeMm, dekor1: lst.edgeName1 || 'wie Platte', dekor2: lst.edgeName2 } };
  },
  teile_aendern(input) {
    const list = input.aenderungen || [];
    const todo = list.map((c) => [apiPartOf(c.teil), c]); // erst alle prüfen, dann ändern
    for (const [, c] of todo) if (c.material) apiBoardKey(c.material);
    const out = [];
    for (const [p, c] of todo) {
      let recompute = false;
      if (c.name !== undefined && p.solid) {
        const base = StepToXcs.partName(String(c.name)) || p.solid.name;
        const taken = new Set(state.parts.filter((q) => q !== p && q.solid).map((q) => q.solid.name.toLowerCase()));
        let k = base;
        for (let j = 2; taken.has(k.toLowerCase()); j++) k = base + '_' + j;
        p.solid.name = k;
        p.fileName = null;
        recompute = true;
      }
      if (c.anzahl !== undefined) p.qty = Math.max(0, Math.round(c.anzahl));
      if (c.material !== undefined) p.board = apiBoardKey(c.material);
      if (c.kanten_auto) delete p.edges;
      if (c.kanten) { p.edges = edgesOf(p); for (const [s2] of EDGE_SIDES) if (c.kanten[s2] !== undefined) p.edges[s2] = c.kanten[s2]; }
      if (c.faser !== undefined) p.grain = c.faser === 'auto' ? undefined : c.faser;
      if (recompute) compute(p);
      out.push(apiPart(p, state.parts.indexOf(p)));
    }
    apiChanged = true;
    applyBoards();
    render();
    return { geaendert: out.length, teile: out };
  },
  teile_sortieren(input) {
    const order = input.reihenfolge || [];
    const seen = new Set();
    for (const nr of order) { apiPartOf(nr); if (seen.has(nr)) throw new Error('Bauteil ' + nr + ' doppelt in der Reihenfolge.'); seen.add(nr); }
    const sel = state.parts[state.sel];
    const first = order.map((nr) => state.parts[nr - 1]);
    state.parts = first.concat(state.parts.filter((p, i) => !seen.has(i + 1)));
    state.sel = Math.max(0, state.parts.indexOf(sel));
    apiChanged = true;
    render();
    return { reihenfolge: state.parts.map((p, i) => ({ teil: i + 1, name: p.solid ? p.solid.name : p.label })) };
  },
  teile_loeschen(input) {
    const nrs = Array.from(new Set(input.teile || []));
    for (const nr of nrs) apiPartOf(nr);
    const gone = new Set(nrs.map((nr) => state.parts[nr - 1]));
    const sel = state.parts[state.sel];
    state.parts = state.parts.filter((p) => !gone.has(p));
    state.sel = Math.max(0, Math.min(state.parts.length - 1, state.parts.indexOf(sel)));
    anim.result = null;
    apiChanged = true;
    render();
    return { geloescht: gone.size, uebrig: state.parts.length };
  },
  teil_anlegen(input) {
    const board = input.material ? apiBoardKey(input.material) : null;
    const n0 = state.parts.length;
    addManualPart({ name: String(input.name).trim() || 'Teil', L: +input.laenge, W: +input.breite, T: +input.dicke, qty: Math.max(1, Math.round(input.anzahl || 1)), board: board });
    if (state.parts.length === n0) throw new Error('Teil konnte nicht angelegt werden.');
    apiChanged = true;
    render();
    return apiPart(state.parts[state.parts.length - 1], state.parts.length - 1);
  },
  zuschnitt_einstellen(input) {
    const map = { platte_laenge: 'sheetL', platte_breite: 'sheetW', schnittfuge: 'kerf', besaeumen: 'trim', faser: 'grain', richtung: 'dir', ziel: 'goal', roh: 'raw' };
    if (input.format !== undefined && !input.gruppe) throw new Error('format nur zusammen mit gruppe.');
    if (input.gruppe && !cutGroups().some((g) => g.key === input.gruppe)) throw new Error('Gruppe „' + input.gruppe + '“ gibt es nicht – Schlüssel aus zuschnitt_lesen.');
    for (const [k, v] of Object.entries(input)) if (map[k]) lst[map[k]] = v;
    if (input.gruppe && input.format !== undefined) {
      if (!lst.groupSheet || typeof lst.groupSheet !== 'object') lst.groupSheet = {};
      if (input.format === null) delete lst.groupSheet[input.gruppe]; else lst.groupSheet[input.gruppe] = { L: input.format.L, W: input.format.W };
    }
    saveLst();
    syncListInputs();
    apiChanged = true;
    render();
    return api.zuschnitt_lesen();
  },
  seite_zeigen(input) {
    const to = { programme: ['pgmx'], moebel3d: ['model'], stueckliste: ['lists', 'bom'], zuschnitt: ['lists', 'cut'], saegen: ['lists', 'saw'], etiketten: ['labels'], material: ['material'] }[input.seite];
    if (!to) throw new Error('unbekannte Seite');
    if (input.teil) { apiPartOf(input.teil); state.sel = input.teil - 1; }
    if (to[1]) { lst.tab = to[1]; saveLst(); }
    setPage(to[0]);
    render();
    return { seite: input.seite };
  },
  saegen_status() { return sawStatusObj(); },
  saegen_steuern(input) { return sawAction(input.aktion, input); },
  // für eigene Skripte: Projekt als Daten (wie die .s2m-Datei) und Neuberechnung
  projekt() { return { session: JSON.parse(JSON.stringify(sessionData())), lists: projectLists() }; },
};
window.Weckwop = window.Step2Maestro = { api: api, version: 1 }; // „Step2Maestro“ = alter Name, bleibt für bestehende Anbindungen

// ---- KI-Assistent (Fenster rechts): ChatGPT (OpenAI) oder Claude (Anthropic), je eigener Schlüssel und eigenes Modell
const AI_KEY = 'step2xcs.ai.v1';
const ai = Object.assign({ provider: Assist.DEFAULT_PROVIDER, model: Assist.DEFAULT_MODEL, oaModel: Assist.OPENAI_DEFAULT, effort: 'medium', keep: false }, loadJson(AI_KEY, {}) || {});
if (!Assist.PROVIDERS.some(([k]) => k === ai.provider)) ai.provider = Assist.DEFAULT_PROVIDER;
// Gespräche: Chat-Fenster und Säge (gesprochen) getrennt; Claude = Verlauf, ChatGPT = letzte Antwort-ID
const newConv = () => ({ history: [], prevId: null });
const aiState = { chat: newConv(), saw: newConv(), busy: false, undo: null, undoHint: false, clients: {}, mem: {} };
const isOA = () => ai.provider === 'openai';
const PROV = {
  openai: { name: 'ChatGPT', keyLabel: 'OpenAI-API-Schlüssel', ph: 'sk-…', global: 'OpenAI', file: 'js/vendor/openai.js',
    note: 'Den Schlüssel gibt es auf platform.openai.com → API keys; die Kosten laufen über dieses Konto (ein ChatGPT-Abo zählt nicht).' },
  anthropic: { name: 'Claude', keyLabel: 'Anthropic-API-Schlüssel', ph: 'sk-ant-…', global: 'Anthropic', file: 'js/vendor/anthropic.js',
    note: 'Den Schlüssel gibt es in der Anthropic-Konsole (console.anthropic.com → API Keys); die Kosten laufen über dieses Konto.' },
};
const keyName = (pv) => AI_KEY + '.key' + (pv === 'openai' ? '.openai' : '');
const aiKeyNow = (pv) => {
  pv = pv || ai.provider;
  try { return (ai.keep ? localStorage.getItem(keyName(pv)) : sessionStorage.getItem(keyName(pv))) || aiState.mem[pv] || ''; } catch (e) { return aiState.mem[pv] || ''; }
};
function aiStoreKey(k, pv) {
  pv = pv || ai.provider;
  aiState.mem[pv] = k;
  try {
    localStorage.removeItem(keyName(pv)); sessionStorage.removeItem(keyName(pv));
    if (k) (ai.keep ? localStorage : sessionStorage).setItem(keyName(pv), k);
  } catch (e) { /* nur im Speicher */ }
}
// ChatGPT über den Server (ki/openai.php, Schlüssel auf der Diskstation) – wenn kein eigener Schlüssel eingetragen ist
const aiServer = () => ai.provider === 'openai' && kiSrv.aktiv && kiSrv.zugang && !aiKeyNow('openai');
const aiReady = () => !!aiKeyNow() || aiServer();
const aiSave = () => storeJson(AI_KEY, { provider: ai.provider, model: ai.model, oaModel: ai.oaModel, effort: ai.effort, keep: ai.keep });
const aiModel = () => (isOA() ? ai.oaModel || Assist.OPENAI_DEFAULT : ai.model || Assist.DEFAULT_MODEL);
const sdkLoading = {};
function loadSdk(pv) {
  const P = PROV[pv];
  if (window[P.global]) return Promise.resolve(window[P.global]);
  if (!sdkLoading[pv]) {
    sdkLoading[pv] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = P.file;
      el.onload = () => (window[P.global] ? resolve(window[P.global]) : reject(new Error(P.name + '-SDK fehlt')));
      el.onerror = () => reject(new Error('Datei fehlt: ' + P.file));
      document.head.appendChild(el);
    });
    sdkLoading[pv].catch(() => { sdkLoading[pv] = null; });
  }
  return sdkLoading[pv];
}
async function aiClient() {
  const pv = ai.provider;
  const A = await loadSdk(pv);
  if (aiServer()) {
    const c = aiState.clients.server;
    if (c && c.key === kiSrv.csrf) return c.client;
    const client = new A({ apiKey: 'server', baseURL: new URL('ki/openai.php/v1', location.href).href, defaultHeaders: { 'X-CSRF': kiSrv.csrf }, dangerouslyAllowBrowser: true, maxRetries: 1 });
    aiState.clients.server = { key: kiSrv.csrf, client: client };
    return client;
  }
  const key = aiKeyNow(pv);
  const c = aiState.clients[pv];
  if (c && c.key === key) return c.client;
  const client = new A({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
  aiState.clients[pv] = { key: key, client: client };
  return client;
}
/*
 * Eine Anfrage an die KI (Chat-Fenster oder gesprochen an der Säge): Stand vorher merken (Rückgängig), Schleife des
 * Anbieters laufen lassen. → { text, stop } oder { error }
 */
async function aiAsk(text, conv, onStep) {
  const snap = { session: JSON.parse(JSON.stringify(sessionData())), lists: projectLists() };
  apiChanged = false;
  if (aiState.undoHint) { text = '(Hinweis: Der Benutzer hat die Änderungen der letzten Anfrage mit „Rückgängig“ zurückgenommen – Stand neu lesen.)\n' + text; aiState.undoHint = false; }
  const exec = (name, input) => { if (!api[name]) throw new Error('unbekannt: ' + name); return api[name](input); };
  let res;
  try {
    const client = await aiClient();
    if (isOA()) res = await Assist.runOpenAI({ client: client, model: aiModel(), effort: ai.effort, conv: conv, text: text, exec: exec, onStep: onStep });
    else {
      const n0 = conv.history.length;
      conv.history.push({ role: 'user', content: text });
      try { res = await Assist.run({ client: client, model: aiModel(), effort: ai.effort, history: conv.history, exec: exec, onStep: onStep }); } catch (e) {
        // Anfrage ohne Antwort: aus dem Verlauf nehmen, damit das Gespräch gültig bleibt
        const last = conv.history[conv.history.length - 1];
        if (conv.history.length > n0 && last.role === 'user' && typeof last.content === 'string') conv.history.length = n0;
        throw e;
      }
    }
  } catch (e) {
    res = { error: Assist.errorText(e, window[PROV[ai.provider].global]) };
  }
  if (apiChanged) { aiState.undo = snap; $('aiundo').disabled = false; }
  return res;
}
const AI_SUGG = ['Sortiere die Liste nach Material und Dicke, große Teile zuerst', 'Prüf die Stückliste: fehlen Kanten oder stimmen Anzahlen nicht?',
  'Wie viele Platten brauche ich und wie ist die Ausnutzung?', 'Setz bei allen Fronten Kanten ringsum', 'Sägen: geh zu Platte 2, Streifen 3'];
function aiLog(cls, text) {
  const log = $('ailog');
  const hello = log.querySelector('.hello');
  if (hello) { hello.remove(); $('aisugg').innerHTML = ''; } // Vorschläge nur am Anfang
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}
function aiHello() {
  $('ailog').innerHTML = '<div class="hello"><p><b>Was soll ich tun?</b> Ich kann die Teileliste sortieren, Namen, Anzahl, Material, Kanten und Faser setzen, ' +
    'Teile anlegen oder löschen, den Zuschnitt einstellen und im Sägemodus blättern und drucken. Bearbeitungen (Bohrungen, Fräsungen) ändere ich nicht.</p>' +
    '<p>Antwortet: <b>' + esc(PROV[ai.provider].name) + '</b> (' + esc(aiModel()) + ')</p>' +
    (aiServer() ? '<p>Schlüssel: vom Server.</p>' : aiKeyNow() ? '' : '<p>Zuerst unter ⚙ Einstellungen den ' + esc(PROV[ai.provider].keyLabel) + ' eintragen.</p>') + '</div>';
  $('aisugg').innerHTML = AI_SUGG.map((t) => '<button type="button" data-aisugg="' + esc(t) + '">' + esc(t) + '</button>').join('');
}
function aiOpen(on) {
  $('aipanel').hidden = !on;
  $('aibtn').setAttribute('aria-expanded', String(on));
  if (!on) return;
  if (!$('ailog').children.length) aiHello();
  if (!aiReady()) aiSetOpen(true);
  $(aiReady() ? 'aiin' : 'aikey').focus();
}
function aiModelList(ids) {
  const sugg = isOA() ? Assist.OPENAI_MODELS : Assist.MODELS;
  const list = ids && ids.length ? ids.map((id) => [id, id]) : sugg;
  $('aimodels').innerHTML = list.map(([v, t]) => '<option value="' + esc(v) + '">' + esc(t) + '</option>').join('');
}
function aiSetOpen(on) {
  $('aiset').hidden = !on;
  $('aisetbtn').setAttribute('aria-expanded', String(on));
  if (!on) return;
  const P = PROV[ai.provider];
  $('aiprov').innerHTML = Assist.PROVIDERS.map(([v, t]) => '<option value="' + v + '"' + (v === ai.provider ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
  $('aikeylbl').textContent = P.keyLabel;
  $('aikey').placeholder = P.ph;
  $('aikey').value = aiKeyNow();
  $('aikeep').checked = !!ai.keep;
  $('aimodel').value = aiModel();
  aiModelList(null);
  $('aieffort').innerHTML = Assist.EFFORTS.map(([v, t]) => '<option value="' + v + '"' + (v === ai.effort ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
  $('aikeynote').textContent = (ai.provider === 'openai' && kiSrv.aktiv ? 'Auf dem Server ist ein OpenAI-Schlüssel eingetragen – ohne eigenen Schlüssel läuft ChatGPT darüber' + (kiSrv.zugang ? '.' : ' (nach der Anmeldung auf der Projektseite).') + ' ' : '') + P.note + ' Gesendet werden nur die Daten der Teileliste (Namen, Maße, Material, Kanten, Zuschnitt, Stand beim Sägen) – keine STEP-Dateien. ' +
    'Der Schlüssel bleibt im Browser (ohne Haken nur bis zum Schließen) – auf fremden Geräten nicht merken.';
}
async function aiSend(text) {
  text = String(text || '').trim();
  if (!text || aiState.busy) return;
  if (!aiReady()) { aiSetOpen(true); $('aikey').focus(); toast('Bitte zuerst den ' + PROV[ai.provider].keyLabel + ' eintragen.'); return; }
  aiState.busy = true;
  $('aisend').disabled = true;
  $('aiin').value = '';
  aiLog('m u', text);
  const busy = aiLog('busy', PROV[ai.provider].name + ' denkt nach …');
  const res = await aiAsk(text, aiState.chat, (st) => {
    const d = st.type === 'tool' ? aiLog('t' + (st.error ? ' err' : ''), '› ' + Assist.toolText(st) + (st.error ? ' – ' + st.error : '')) : aiLog('m a', st.text);
    $('ailog').insertBefore(d, busy);
  });
  busy.remove();
  if (res.error) aiLog('m e', res.error);
  else if (res.stop === 'refusal' || res.stop === 'max_tokens' || res.stop === 'steps') aiLog('m e', res.text);
  else if (!res.text) aiLog('m a', 'Erledigt.');
  aiState.busy = false;
  $('aisend').disabled = false;
  $('aiin').focus();
}
// gesprochen an der Säge (kein fester Befehl, „🤖 KI“ an): an die KI, Antwort vorlesen
async function aiVoice(text) {
  if (aiState.busy) { Voice.say('Moment, ich bin noch dran.'); return; }
  if (!aiReady()) { voice.msg = 'Für freie Sätze den API-Schlüssel im KI-Assistenten eintragen.'; renderSaw(); return; }
  aiState.busy = true;
  voice.reply = '🤖 …';
  renderSaw();
  if ($('ailog').children.length) aiLog('m u', '🎤 ' + text);
  const res = await aiAsk('[Gesprochen an der Säge] ' + text, aiState.saw, (st) => { if (st.type === 'tool' && $('ailog').children.length) aiLog('t', '› ' + Assist.toolText(st)); });
  aiState.busy = false;
  const out = res.error || res.text || 'Erledigt.';
  voice.reply = '🤖 ' + out;
  if ($('ailog').children.length) aiLog(res.error ? 'm e' : 'm a', out);
  if (state.page === 'lists' && lst.tab === 'saw') renderSaw();
  Voice.say(out.replace(/[*_#`>]/g, ''));
}
function aiUndo() {
  const snap = aiState.undo;
  if (!snap) return;
  state.parts = [];
  anim.result = null;
  restoreFrom(snap.session);
  for (const k of PROJECT_LST_KEYS) { if (snap.lists[k] !== undefined) lst[k] = snap.lists[k]; else delete lst[k]; }
  saveLst();
  syncListInputs();
  aiState.undo = null;
  aiState.undoHint = true; // die KI soll wissen, dass ihr Stand nicht mehr gilt
  $('aiundo').disabled = true;
  applyBoards();
  render();
  aiLog('t', '↶ Änderungen der letzten Anfrage zurückgenommen');
}
$('aibtn').addEventListener('click', () => aiOpen($('aipanel').hidden));
$('aiclose').addEventListener('click', () => { aiOpen(false); $('aibtn').focus(); });
$('aisetbtn').addEventListener('click', () => aiSetOpen($('aiset').hidden));
$('aiprov').addEventListener('change', (e) => {
  ai.provider = e.target.value; aiSave();
  aiState.chat = newConv(); aiState.saw = newConv(); // anderer Anbieter: neues Gespräch
  aiSetOpen(true); aiHello();
});
$('aikey').addEventListener('change', (e) => { aiStoreKey(e.target.value.trim()); if (aiKeyNow()) aiHello(); });
$('aikeep').addEventListener('change', (e) => {
  const keys = Object.fromEntries(Assist.PROVIDERS.map(([pv]) => [pv, aiKeyNow(pv)]));
  ai.keep = e.target.checked; aiSave();
  for (const [pv, k] of Object.entries(keys)) aiStoreKey(k, pv);
});
$('aimodel').addEventListener('change', (e) => {
  const v = e.target.value.trim();
  if (isOA()) ai.oaModel = v || Assist.OPENAI_DEFAULT; else ai.model = v || Assist.DEFAULT_MODEL;
  aiSave();
});
$('aimload').addEventListener('click', async () => {
  if (!aiReady()) { toast('Zuerst den Schlüssel eintragen.'); return; }
  try {
    const client = await aiClient();
    const ids = [];
    for await (const m of client.models.list()) ids.push(m.id);
    const use = (isOA() ? ids.filter((id) => /^(gpt-|o\d|chatgpt)/.test(id) && !/(audio|realtime|image|tts|transcribe|search|embedding|instruct)/.test(id)) : ids).sort().reverse();
    aiModelList(use);
    toast(use.length + ' Modelle verfügbar – im Feld „Modell“ auswählen.');
  } catch (e) { toast(Assist.errorText(e, window[PROV[ai.provider].global])); }
});
$('aieffort').addEventListener('change', (e) => { ai.effort = e.target.value; aiSave(); });
$('aiform').addEventListener('submit', (e) => { e.preventDefault(); aiSend($('aiin').value); });
$('aiin').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); aiSend($('aiin').value); } });
$('aisugg').addEventListener('click', (e) => { const b = e.target.closest('[data-aisugg]'); if (b) aiSend(b.dataset.aisugg); });
$('aiundo').addEventListener('click', aiUndo);
$('ainew').addEventListener('click', () => { if (aiState.busy) return; aiState.chat = newConv(); aiState.saw = newConv(); aiHello(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('aipanel').hidden && !document.querySelector('.sawpop')) { aiOpen(false); } });
