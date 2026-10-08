/*
 * KI-Assistent im Browser – ChatGPT (OpenAI, Responses-API) oder Claude (Anthropic): hilft bei Stückliste, Sortieren,
 * Material, Kanten, Zuschnitt und steuert den Sägemodus. Die KI ruft Werkzeuge auf (TOOLS) – ausgeführt werden sie von der
 * Seite über die Programm-Schnittstelle (window.Weckwop.api in index.html). Dieses Modul kennt nur die Werkzeuge, die
 * Prüfung der Eingaben und die Schleife Anfrage → Werkzeuge → Ergebnis → Anfrage …; den Client (SDK aus js/vendor/openai.js
 * bzw. anthropic.js) gibt die Seite mit.
 *   runOpenAI({ client, model, effort, conv, text, exec, onStep, maxSteps }) – conv = { prevId } (Gespräch über
 *     previous_response_id), liefert { text, stop, steps }.
 *   run({ client, model, effort, history, … }) – Claude: hängt an history an (nur anhängen, nie ändern: Denkblöcke bleiben gültig).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Assist = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PROVIDERS = [['openai', 'ChatGPT (OpenAI)'], ['anthropic', 'Claude (Anthropic)']];
  const DEFAULT_PROVIDER = 'openai';
  // ChatGPT: Vorschläge – der Name ist frei eintragbar, „Modelle laden“ holt die Liste des eigenen Kontos
  const OPENAI_MODELS = [
    ['gpt-5.5', 'GPT-5.5 (Standard)'],
    ['gpt-5.4-mini', 'GPT-5.4 mini (schneller, günstiger)'],
    ['gpt-5.4-nano', 'GPT-5.4 nano (am günstigsten)'],
  ];
  const OPENAI_DEFAULT = 'gpt-5.5';
  const MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5 (Standard)'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (schneller, günstiger)'],
    ['claude-haiku-4-5', 'Claude Haiku 4.5 (am günstigsten)'],
  ];
  const DEFAULT_MODEL = 'claude-opus-5-5';
  const EFFORTS = [['low', 'schnell'], ['medium', 'normal'], ['high', 'gründlich']];

  const SYSTEM = [
    'Du bist der Assistent in „Weckwop“, einem Werkzeug einer Schreinerei: STEP/DXF-Bauteile werden zu Programmen für die',
    'CNC SCM Maestro, dazu Stückliste, Kantenband, Zuschnittplan für die Plattensäge und Etiketten.',
    'Du hilfst beim Bearbeiten, Sortieren und Prüfen: Namen, Anzahl, Material/Dekor, Kanten, Faserrichtung, Reihenfolge,',
    'Teile von Hand anlegen oder löschen, Plattenformat und Zuschnitt-Einstellungen.',
    '',
    'Regeln:',
    '- Antworte kurz, sachlich und auf Deutsch (du, Werkstattsprache). Maße in mm, Dezimalkomma.',
    '- Lies den aktuellen Stand mit den Lese-Werkzeugen, bevor du etwas änderst. Nummern ändern sich beim Sortieren und Löschen –',
    '  lies danach neu, bevor du weitere Nummern benutzt.',
    '- „teil“ ist die Bauteil-Nummer (Platz in der Programmliste, ab 1). Eine Position der Stückliste kann mehrere Bauteile haben.',
    '- Material nur mit einem Schlüssel aus materialien_lesen (Feld „key“). Gibt es das gewünschte nicht, frag nach.',
    '- Kanten: l1 = vorne (lange Seite), l2 = hinten, b1 = links (kurze Seite), b2 = rechts; 0 = keine, 1 = Dekor 1, 2 = Dekor 2.',
    '- Löschen nur, wenn der Benutzer es klar will; bei Unklarheit erst nachfragen. Jede Anfrage kann der Benutzer mit',
    '  „Rückgängig“ zurücknehmen.',
    '- Bearbeitungen (Bohrungen, Fräsungen, Werkzeuge) änderst du nicht – nur Daten für Liste, Zuschnitt und Etiketten.',
    '- Sag am Ende in ein, zwei Sätzen, was du geändert hast (oder was noch zu tun ist).',
    '',
    'Sägemodus (Plattensäge, Schritt für Schritt): saegen_status liest Platte, Schritt, Streifen, Maß und was danach kommt;',
    'saegen_steuern blättert (weiter, zurück, Streifen, Platte, gehe_zu …), druckt Etiketten und schaltet Etiketten-Modus,',
    'Ansage und Vollbild. Kommt die Anfrage „[Gesprochen an der Säge]“, antworte in einem kurzen Satz ohne Aufzählungen –',
    'der Text wird vorgelesen. Maße dann als Zahl mit „Millimeter“.',
  ].join('\n');

  const int = (d, o) => Object.assign({ type: 'integer', description: d }, o || {});
  const num = (d, o) => Object.assign({ type: 'number', description: d }, o || {});
  const str = (d, o) => Object.assign({ type: 'string', description: d }, o || {});
  const obj = (props, req) => ({ type: 'object', properties: props, required: req || [], additionalProperties: false });
  const EDGE = { type: 'integer', enum: [0, 1, 2] };

  const TOOLS = [
    { name: 'teile_lesen', description: 'Liest alle Bauteile der Programmliste: Nummer, Name, Maße L × B × D (fertig), Anzahl, Material (key und Name), Kanten, Faserrichtung, Profil, zweiseitig, Bearbeitungszeit je Stück (Sekunden), Warnungen, Programmdatei.',
      input_schema: obj({}) },
    { name: 'stueckliste_lesen', description: 'Liest die Stückliste: Positionen (gleiche Teile zusammengefasst) mit Bauteil-Nummern, Anzahl, Maßen, Zuschnittmaß (roh), Material, Kanten; dazu Summen (Teile, m² je Material, Kantenband-Meter, Zeit).',
      input_schema: obj({}) },
    { name: 'zuschnitt_lesen', description: 'Liest den Zuschnittplan: Einstellungen (Plattenformat, Schnittfuge, Besäumen, Faser, Richtung, Ziel) und je Gruppe (Material + Dicke) Format, Anzahl Platten, Ausnutzung, Teile, nicht passende Teile.',
      input_schema: obj({}) },
    { name: 'materialien_lesen', description: 'Liest die wählbaren Materialien/Dekore mit Schlüssel (key) und Namen, dazu die Standard-Platte und die Kantenband-Einstellungen.',
      input_schema: obj({}) },
    { name: 'teile_aendern', description: 'Ändert ein oder mehrere Bauteile. Nur angegebene Felder werden geändert.',
      input_schema: obj({ aenderungen: { type: 'array', minItems: 1, maxItems: 500, items: obj({
        teil: int('Bauteil-Nummer (ab 1)', { minimum: 1 }),
        name: str('neuer Teilename (wird auch Programmname, Umlaute werden umgeschrieben)', { minLength: 1, maxLength: 80 }),
        anzahl: int('Stückzahl', { minimum: 0, maximum: 9999 }),
        material: str('Material-Schlüssel aus materialien_lesen; leer = wie Einstellung/Name', { maxLength: 200 }),
        kanten: obj({ l1: EDGE, l2: EDGE, b1: EDGE, b2: EDGE }),
        kanten_auto: { type: 'boolean', description: 'true = eigene Kanten entfernen, wieder nach den Kantenregeln vorbelegen' },
        faser: str('Faserrichtung im Zuschnitt', { enum: ['auto', 'long', 'cross', 'free'] }),
      }, ['teil']) } }, ['aenderungen']) },
    { name: 'teile_sortieren', description: 'Sortiert die Programmliste neu. reihenfolge = Bauteil-Nummern in der neuen Reihenfolge; nicht genannte Teile folgen in ihrer bisherigen Reihenfolge. Danach haben die Teile neue Nummern.',
      input_schema: obj({ reihenfolge: { type: 'array', minItems: 1, maxItems: 2000, items: int('Bauteil-Nummer', { minimum: 1 }) } }, ['reihenfolge']) },
    { name: 'teile_loeschen', description: 'Löscht Bauteile aus der Liste (Programm, Stückliste, Zuschnitt). Nur auf klaren Wunsch des Benutzers.',
      input_schema: obj({ teile: { type: 'array', minItems: 1, maxItems: 2000, items: int('Bauteil-Nummer', { minimum: 1 }) } }, ['teile']) },
    { name: 'teil_anlegen', description: 'Legt ein rechteckiges Teil von Hand an (wird nur umfräst, kommt in Stückliste, Zuschnitt und Etiketten).',
      input_schema: obj({ name: str('Name', { minLength: 1, maxLength: 80 }), laenge: num('Länge in mm', { minimum: 10, maximum: 6000 }),
        breite: num('Breite in mm', { minimum: 10, maximum: 3000 }), dicke: num('Dicke in mm', { minimum: 1, maximum: 200 }),
        anzahl: int('Stückzahl', { minimum: 1, maximum: 9999 }), material: str('Material-Schlüssel aus materialien_lesen', { maxLength: 200 }) },
      ['name', 'laenge', 'breite', 'dicke']) },
    { name: 'zuschnitt_einstellen', description: 'Ändert Einstellungen des Zuschnittplans. Mit gruppe (Schlüssel aus zuschnitt_lesen) und format gilt das Plattenformat nur für diese Gruppe (format null = wieder Standard).',
      input_schema: obj({ platte_laenge: num('Plattenformat Länge (mm)', { minimum: 100, maximum: 10000 }), platte_breite: num('Plattenformat Breite (mm)', { minimum: 100, maximum: 5000 }),
        schnittfuge: num('Schnittfuge (mm)', { minimum: 0, maximum: 20 }), besaeumen: num('Besäumen ringsum (mm)', { minimum: 0, maximum: 100 }),
        faser: { type: 'boolean', description: 'Maserung beachten (Holzdekore lange Seite längs)' },
        richtung: str('Schnittrichtung', { enum: ['auto', 'long', 'cross'] }), ziel: str('Ziel der Anordnung', { enum: ['waste', 'cuts'] }),
        roh: { type: 'boolean', description: 'mit Zuschnittmaß (roh, Zugabe) statt Fertigmaß' },
        gruppe: str('Gruppen-Schlüssel aus zuschnitt_lesen', { maxLength: 200 }),
        format: { type: ['object', 'null'], properties: { L: num('Länge', { minimum: 100, maximum: 10000 }), W: num('Breite', { minimum: 100, maximum: 5000 }) }, required: ['L', 'W'], additionalProperties: false, description: 'Format nur für die Gruppe; null = Standard' } }) },
    { name: 'seite_zeigen', description: 'Wechselt die Ansicht der Seite (zum Zeigen eines Ergebnisses).',
      input_schema: obj({ seite: str('Seite', { enum: ['programme', 'moebel3d', 'stueckliste', 'zuschnitt', 'saegen', 'etiketten', 'material'] }),
        teil: int('Bauteil-Nummer, die gewählt werden soll (Programme)', { minimum: 1 }) }, ['seite']) },
    { name: 'saegen_status', description: 'Liest den Stand im Sägemodus: aktuelle Platte (Material, Dicke, Nummer), Schritt, Streifen, Art des Schnitts, Maß am Anschlag, Richtung, fertige Teile, was danach kommt, Etiketten-Modus, Ansage, Liste aller Platten mit Haken „geschnitten“.',
      input_schema: obj({}) },
    { name: 'saegen_steuern', description: 'Steuert den Sägemodus (öffnet ihn bei Bedarf). gehe_zu mit schritt, streifen und/oder platte (Nummern wie angezeigt, ab 1; platte = Nummer innerhalb des aktuellen Materials, mit gruppe_material auch ein anderes). Gibt den neuen Stand zurück.',
      input_schema: obj({ aktion: str('Aktion', { enum: ['weiter', 'zurueck', 'naechster_streifen', 'vorheriger_streifen', 'naechste_platte', 'vorherige_platte', 'von_vorn',
        'gehe_zu', 'drucken', 'streifen_etikett', 'vollbild_an', 'vollbild_aus', 'etiketten_aus', 'etiketten_fenster', 'etiketten_automatisch', 'ansage_an', 'ansage_aus', 'vorlesen'] }),
        schritt: int('Schritt-Nummer (gehe_zu)', { minimum: 1 }), streifen: int('Streifen-Nummer (gehe_zu)', { minimum: 1 }), platte: int('Platten-Nummer (gehe_zu)', { minimum: 1 }),
        gruppe_material: str('Teil des Material-Namens für gehe_zu mit platte, z. B. „U708“', { maxLength: 80 }) }, ['aktion']) },
  ];

  // Prüfung der Eingaben nach dem Schema (die KI-Ausgabe ist ungeprüft): Fehlertext oder ''
  function validate(v, s, path) {
    path = path || 'eingabe';
    if (!s) return '';
    const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
    const isT = (t) => (t === 'null' ? v === null : t === 'array' ? Array.isArray(v) : t === 'integer' ? Number.isInteger(v) :
      t === 'number' ? typeof v === 'number' && isFinite(v) : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : typeof v === t);
    if (types.length && !types.some(isT)) return path + ': erwartet ' + types.join('/');
    if (s.enum && !s.enum.includes(v)) return path + ': erlaubt ' + s.enum.join(', ');
    if (v === null) return '';
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) return path + ': mindestens ' + s.minimum;
      if (s.maximum !== undefined && v > s.maximum) return path + ': höchstens ' + s.maximum;
    }
    if (typeof v === 'string') {
      if (s.minLength !== undefined && v.length < s.minLength) return path + ': zu kurz';
      if (s.maxLength !== undefined && v.length > s.maxLength) return path + ': zu lang';
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) return path + ': mindestens ' + s.minItems + ' Einträge';
      if (s.maxItems !== undefined && v.length > s.maxItems) return path + ': höchstens ' + s.maxItems + ' Einträge';
      for (let i = 0; i < v.length; i++) { const e = validate(v[i], s.items, path + '[' + i + ']'); if (e) return e; }
    }
    if (isT('object') && s.properties) {
      for (const k of s.required || []) if (!(k in v)) return path + '.' + k + ' fehlt';
      for (const k of Object.keys(v)) {
        if (!s.properties[k]) { if (s.additionalProperties === false) return path + '.' + k + ' ist unbekannt'; continue; }
        const e = validate(v[k], s.properties[k], path + '.' + k);
        if (e) return e;
      }
    }
    return '';
  }
  const toolOf = (name) => TOOLS.find((t) => t.name === name);

  // Werkzeugergebnis als Text (JSON, gekürzt, damit die Anfrage nicht ausufert)
  function resultText(r) {
    let t;
    try { t = typeof r === 'string' ? r : JSON.stringify(r); } catch (e) { t = String(r); }
    return t.length > 60000 ? t.slice(0, 60000) + ' … (gekürzt)' : t;
  }

  // ein Werkzeugaufruf: Eingabe prüfen, ausführen → { content, isError }
  async function callTool(name, input, exec) {
    const tool = toolOf(name);
    const bad = !tool ? 'unbekanntes Werkzeug ' + name : validate(input, tool.input_schema);
    if (bad) return { content: 'Ungültige Eingabe: ' + bad, isError: true };
    try { return { content: resultText(await exec(name, input)), isError: false }; } catch (e) { return { content: 'Fehler: ' + (e && e.message ? e.message : String(e)), isError: true }; }
  }

  /*
   * ChatGPT (OpenAI Responses-API): das Gespräch läuft über previous_response_id (conv.prevId). Werkzeuge als „function“,
   * Ergebnisse als function_call_output. Bei einem Fehler mitten in der Schleife zurück auf den Stand davor (sonst hinge das
   * Gespräch an unbeantworteten Aufrufen).
   */
  const openaiTools = () => TOOLS.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.input_schema, strict: false }));
  const reasons = (m) => /^(gpt-([5-9]|\d\d)|o\d)/.test(m);
  async function runOpenAI(o) {
    const conv = o.conv;
    const startId = conv.prevId || null;
    const maxSteps = o.maxSteps || 16;
    const steps = [];
    let text = '';
    let input = [{ role: 'user', content: o.text }];
    try {
      for (let i = 0; i < maxSteps; i++) {
        const req = { model: o.model || OPENAI_DEFAULT, instructions: SYSTEM, input: input, tools: openaiTools(), max_output_tokens: 16000 };
        if (conv.prevId) req.previous_response_id = conv.prevId;
        if (reasons(req.model)) req.reasoning = { effort: o.effort || 'medium' };
        const r = await o.client.responses.create(req);
        const out = Array.isArray(r.output) ? r.output : [];
        const said = [];
        let refusal = '';
        for (const it of out) {
          if (it.type !== 'message' || !Array.isArray(it.content)) continue;
          for (const c of it.content) { if (c.type === 'output_text' && c.text) said.push(c.text); if (c.type === 'refusal') refusal = c.refusal || 'abgelehnt'; }
        }
        const calls = out.filter((it) => it.type === 'function_call');
        if (said.length) { text = said.join('\n').trim(); if (o.onStep && text) o.onStep({ type: 'text', text: text }); }
        if (refusal) { conv.prevId = r.id; return { text: text || 'Die KI hat diese Anfrage abgelehnt: ' + refusal, stop: 'refusal', steps: steps }; }
        // abgeschnitten: angefangene Aufrufe nicht ausführen, Gespräch beim Stand davor lassen
        if (r.status === 'incomplete') { conv.prevId = startId; return { text: text || 'Antwort zu lang – bitte die Anfrage aufteilen.', stop: 'max_tokens', steps: steps }; }
        conv.prevId = r.id;
        if (!calls.length) return { text: text, stop: 'end_turn', steps: steps };
        input = [];
        for (const c of calls) {
          let args = null;
          try { args = c.arguments ? JSON.parse(c.arguments) : {}; } catch (e) { args = null; }
          const res = args === null ? { content: 'Ungültige Eingabe: kein gültiges JSON', isError: true } : await callTool(c.name, args, o.exec);
          steps.push({ name: c.name, input: args, error: res.isError ? res.content : null });
          if (o.onStep) o.onStep({ type: 'tool', name: c.name, input: args, error: res.isError ? res.content : null });
          input.push({ type: 'function_call_output', call_id: c.call_id, output: res.content });
        }
      }
    } catch (e) {
      conv.prevId = startId;
      throw e;
    }
    // zu viele Schritte: offene Aufrufe nicht hängen lassen
    conv.prevId = startId;
    return { text: text || 'Abgebrochen: zu viele Schritte in einer Anfrage.', stop: 'steps', steps: steps };
  }

  /*
   * Eine Anfrage des Benutzers bis zur fertigen Antwort: Werkzeuge ausführen, Ergebnisse zurück, bis die KI fertig ist.
   * history wird nur angehängt (Antworten vollständig, mit Denkblöcken). onStep({ type: 'tool'|'text', … }) für die Anzeige.
   */
  async function run(o) {
    const history = o.history;
    const maxSteps = o.maxSteps || 16;
    const steps = [];
    let text = '';
    for (let i = 0; i < maxSteps; i++) {
      const req = {
        model: o.model || DEFAULT_MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        tools: TOOLS,
        messages: history,
        cache_control: { type: 'ephemeral' },
      };
      // Gründlichkeit (effort) und Ersatzmodell bei Ablehnung nur bei Modellen, die es können
      if (!/haiku/.test(req.model)) req.output_config = { effort: o.effort || 'medium' };
      if (/opus-5|sonnet-5-5|fable/.test(req.model)) { req.betas = ['server-side-fallback-2026-07-01']; req.fallbacks = 'default'; }
      const msg = await o.client.beta.messages.create(req);
      history.push({ role: 'assistant', content: msg.content });
      const said = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (said) { text = said; if (o.onStep) o.onStep({ type: 'text', text: said }); }
      if (msg.stop_reason === 'refusal') return { text: text || 'Die KI hat diese Anfrage abgelehnt.', stop: 'refusal', steps: steps };
      // abgeschnitten: angefangene Werkzeugaufrufe nicht ausführen
      if (msg.stop_reason === 'max_tokens') return { text: text || 'Antwort zu lang – bitte die Anfrage aufteilen.', stop: 'max_tokens', steps: steps };
      if (msg.stop_reason === 'pause_turn') continue;
      const uses = msg.content.filter((b) => b.type === 'tool_use');
      if (msg.stop_reason !== 'tool_use' || !uses.length) return { text: text, stop: msg.stop_reason, steps: steps };
      // alle Ergebnisse in einer Nachricht zurück (auch Fehler, als is_error)
      const results = [];
      for (const u of uses) {
        const { content, isError } = await callTool(u.name, u.input, o.exec);
        steps.push({ name: u.name, input: u.input, error: isError ? content : null });
        if (o.onStep) o.onStep({ type: 'tool', name: u.name, input: u.input, error: isError ? content : null });
        results.push({ type: 'tool_result', tool_use_id: u.id, content: content, is_error: isError || undefined });
      }
      history.push({ role: 'user', content: results });
    }
    return { text: text || 'Abgebrochen: zu viele Schritte in einer Anfrage.', stop: 'steps', steps: steps };
  }

  // Fehler des SDK in Werkstattsprache
  function errorText(e, A) {
    const is = (n) => A && A[n] && e instanceof A[n];
    if (is('AuthenticationError')) return 'API-Schlüssel ungültig – bitte in den KI-Einstellungen prüfen.';
    if (is('PermissionDeniedError')) return 'Kein Zugriff mit diesem API-Schlüssel (Rechte/Modell prüfen).';
    if (is('RateLimitError')) {
      // OpenAI: code insufficient_quota = kein Guthaben (häufigster Fall bei neuen Konten), sonst Anfragen pro Minute
      const code = String(e.code || (e.error && e.error.code) || (e.error && e.error.error && e.error.error.code) || '');
      const msg = String(e.message || '');
      if (/insufficient_quota|billing|credit balance/i.test(code + ' ' + msg)) {
        return 'Kein Guthaben für die API: Im Konto des Anbieters Guthaben aufladen (OpenAI: platform.openai.com → Settings → Billing → „Add to credit balance“; ' +
          'ein ChatGPT-Abo zählt nicht). Danach ein paar Minuten warten und nochmal versuchen.';
      }
      return 'Zu viele Anfragen in kurzer Zeit (Limit des Kontos) – eine Minute warten und nochmal. Bleibt es, Limits im Konto prüfen' +
        (msg ? ' (Meldung: ' + msg.slice(0, 160) + ')' : '') + '.';
    }
    if (is('NotFoundError')) return 'Modell nicht gefunden – Modellnamen prüfen (⚙ Einstellungen → „Modelle laden“).';
    if (is('BadRequestError')) return 'Anfrage abgelehnt: ' + (e.message || '');
    if (is('APIConnectionError')) return 'Keine Verbindung zur KI (Internet? Firewall?).';
    if (is('InternalServerError')) return 'Die KI ist gerade gestört – bitte gleich nochmal.';
    if (is('APIError')) return 'Fehler der KI (' + (e.status || '?') + '): ' + (e.message || '');
    return 'Fehler: ' + (e && e.message ? e.message : String(e));
  }

  // kurze Beschreibung eines Werkzeugaufrufs für den Verlauf
  const TOOL_TEXT = { teile_lesen: 'Teile gelesen', stueckliste_lesen: 'Stückliste gelesen', zuschnitt_lesen: 'Zuschnitt gelesen', materialien_lesen: 'Materialien gelesen',
    teile_aendern: 'Teile geändert', teile_sortieren: 'Liste sortiert', teile_loeschen: 'Teile gelöscht', teil_anlegen: 'Teil angelegt',
    zuschnitt_einstellen: 'Zuschnitt eingestellt', seite_zeigen: 'Ansicht gewechselt', saegen_status: 'Sägemodus gelesen', saegen_steuern: 'Säge' };
  function toolText(s) {
    let t = TOOL_TEXT[s.name] || s.name;
    const i = s.input || {};
    if (s.name === 'teile_aendern' && Array.isArray(i.aenderungen)) t += ' (' + i.aenderungen.length + ')';
    if ((s.name === 'teile_loeschen') && Array.isArray(i.teile)) t += ': Nr. ' + i.teile.join(', ');
    if (s.name === 'teil_anlegen') t += ': ' + i.name;
    if (s.name === 'saegen_steuern') t += ': ' + String(i.aktion || '').replace(/_/g, ' ') + (i.streifen ? ' Streifen ' + i.streifen : '') + (i.platte ? ' Platte ' + i.platte : '') + (i.schritt ? ' Schritt ' + i.schritt : '');
    return t;
  }

  return { PROVIDERS, DEFAULT_PROVIDER, OPENAI_MODELS, OPENAI_DEFAULT, MODELS, DEFAULT_MODEL, EFFORTS, SYSTEM, TOOLS, validate, run, runOpenAI, openaiTools, errorText, toolText, resultText };
});
