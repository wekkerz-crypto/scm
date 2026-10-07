/*
 * KI-Assistent (Claude über die Anthropic-API, im Browser): hilft bei Stückliste, Sortieren, Material, Kanten und Zuschnitt.
 * Die KI ruft Werkzeuge auf (TOOLS) – ausgeführt werden sie von der Seite über die Programm-Schnittstelle
 * (window.Step2Maestro.api in index.html). Dieses Modul kennt nur die Werkzeuge, die Prüfung der Eingaben und die Schleife
 * Anfrage → Werkzeuge → Ergebnis → Anfrage …; den Client (Anthropic-SDK, js/vendor/anthropic.js) gibt die Seite mit.
 *   run({ client, model, effort, history, exec, onStep, maxSteps }) – hängt an history an (nur anhängen, nie ändern:
 *   Denkblöcke bleiben gültig), ruft exec(name, input) je Werkzeug und liefert { text, stop, steps }.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Assist = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5 (Standard)'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (schneller, günstiger)'],
    ['claude-haiku-4-5', 'Claude Haiku 4.5 (am günstigsten)'],
  ];
  const DEFAULT_MODEL = 'claude-opus-5-5';
  const EFFORTS = [['low', 'schnell'], ['medium', 'normal'], ['high', 'gründlich']];

  const SYSTEM = [
    'Du bist der Assistent in „Step2Maestro“, einem Werkzeug einer Schreinerei: STEP/DXF-Bauteile werden zu Programmen für die',
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
        const tool = toolOf(u.name);
        let content;
        let isError = false;
        const bad = !tool ? 'unbekanntes Werkzeug ' + u.name : validate(u.input, tool.input_schema);
        if (bad) { content = 'Ungültige Eingabe: ' + bad; isError = true; }
        else {
          try { content = resultText(await o.exec(u.name, u.input)); } catch (e) { content = 'Fehler: ' + (e && e.message ? e.message : String(e)); isError = true; }
        }
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
    if (is('RateLimitError')) return 'Zu viele Anfragen oder Guthaben aufgebraucht – kurz warten bzw. in der Anthropic-Konsole prüfen.';
    if (is('BadRequestError')) return 'Anfrage abgelehnt: ' + (e.message || '');
    if (is('APIConnectionError')) return 'Keine Verbindung zur KI (Internet? Firewall?).';
    if (is('InternalServerError')) return 'Die KI ist gerade gestört – bitte gleich nochmal.';
    if (is('APIError')) return 'Fehler der KI (' + (e.status || '?') + '): ' + (e.message || '');
    return 'Fehler: ' + (e && e.message ? e.message : String(e));
  }

  // kurze Beschreibung eines Werkzeugaufrufs für den Verlauf
  const TOOL_TEXT = { teile_lesen: 'Teile gelesen', stueckliste_lesen: 'Stückliste gelesen', zuschnitt_lesen: 'Zuschnitt gelesen', materialien_lesen: 'Materialien gelesen',
    teile_aendern: 'Teile geändert', teile_sortieren: 'Liste sortiert', teile_loeschen: 'Teile gelöscht', teil_anlegen: 'Teil angelegt',
    zuschnitt_einstellen: 'Zuschnitt eingestellt', seite_zeigen: 'Ansicht gewechselt' };
  function toolText(s) {
    let t = TOOL_TEXT[s.name] || s.name;
    const i = s.input || {};
    if (s.name === 'teile_aendern' && Array.isArray(i.aenderungen)) t += ' (' + i.aenderungen.length + ')';
    if ((s.name === 'teile_loeschen') && Array.isArray(i.teile)) t += ': Nr. ' + i.teile.join(', ');
    if (s.name === 'teil_anlegen') t += ': ' + i.name;
    return t;
  }

  return { MODELS, DEFAULT_MODEL, EFFORTS, SYSTEM, TOOLS, validate, run, errorText, toolText, resultText };
});
