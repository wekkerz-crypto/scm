'use strict';
// KI-Assistent (Schleife, Prüfung der Werkzeugeingaben) und Sprachbefehle – ohne Netz, mit Attrappe des Clients
const test = require('node:test');
const assert = require('node:assert');
const Assist = require('../web/js/assist.js');
const Voice = require('../web/js/voice.js');

const fake = (replies) => {
  const reqs = [];
  return { reqs, beta: { messages: { create: async (r) => { reqs.push(JSON.parse(JSON.stringify(r))); return replies[reqs.length - 1]; } } } };
};

test('KI-Assistent: Werkzeuge ausführen, Ergebnisse in einer Nachricht, ungültige Eingaben als Fehler', async () => {
  const c = fake([
    { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'tool_use', id: 'a', name: 'teile_lesen', input: {} },
      { type: 'tool_use', id: 'b', name: 'teile_aendern', input: { aenderungen: [{ teil: 0 }] } }, { type: 'tool_use', id: 'c', name: 'gibtsnicht', input: {} }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Fertig.' }] },
  ]);
  const history = [{ role: 'user', content: 'Hallo' }];
  const calls = [];
  const r = await Assist.run({ client: c, history, exec: (n, i) => { calls.push(n); return { ok: true }; } });
  assert.strictEqual(r.text, 'Fertig.');
  assert.deepStrictEqual(calls, ['teile_lesen']); // nur gültige Aufrufe ausgeführt
  assert.strictEqual(c.reqs.length, 2);
  assert.strictEqual(c.reqs[0].model, 'claude-opus-5-5');
  assert.deepStrictEqual(c.reqs[0].output_config, { effort: 'medium' });
  assert.strictEqual(c.reqs[0].fallbacks, 'default');
  // Verlauf nur angehängt: Antwort samt Denkblock unverändert, dann alle Ergebnisse in einer Nachricht
  assert.strictEqual(history[1].content[0].type, 'thinking');
  const res = history[2].content;
  assert.strictEqual(res.length, 3);
  assert.ok(!res[0].is_error);
  assert.match(res[1].content, /teil: mindestens 1/);
  assert.ok(res[1].is_error && res[2].is_error);
  assert.strictEqual(history.length, 4);
});

test('KI-Assistent: Ablehnung und abgeschnittene Antwort führen keine Werkzeuge aus; Haiku ohne effort', async () => {
  const c = fake([{ stop_reason: 'max_tokens', content: [{ type: 'tool_use', id: 'a', name: 'teile_loeschen', input: { teile: [1] } }] }]);
  let ran = 0;
  const r = await Assist.run({ client: c, history: [{ role: 'user', content: 'x' }], model: 'claude-haiku-4-5', exec: () => { ran++; } });
  assert.strictEqual(r.stop, 'max_tokens');
  assert.strictEqual(ran, 0);
  assert.strictEqual(c.reqs[0].output_config, undefined);
  assert.strictEqual(c.reqs[0].fallbacks, undefined);
  const c2 = fake([{ stop_reason: 'refusal', content: [] }]);
  const r2 = await Assist.run({ client: c2, history: [{ role: 'user', content: 'x' }], exec: () => { ran++; } });
  assert.strictEqual(r2.stop, 'refusal');
  assert.strictEqual(ran, 0);
  // Fehler im Werkzeug → is_error, Schleife läuft weiter
  const c3 = fake([{ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'teile_sortieren', input: { reihenfolge: [3] } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Nr. 3 gibt es nicht.' }] }]);
  const h3 = [{ role: 'user', content: 'x' }];
  await Assist.run({ client: c3, history: h3, exec: () => { throw new Error('Bauteil 3 gibt es nicht'); } });
  assert.match(h3[2].content[0].content, /^Fehler: Bauteil 3/);
});

test('KI-Assistent: Schemas der Werkzeuge sind geschlossen und gültig', () => {
  for (const t of Assist.TOOLS) {
    assert.strictEqual(t.input_schema.type, 'object', t.name);
    assert.strictEqual(t.input_schema.additionalProperties, false, t.name);
    assert.ok(t.description.length > 20, t.name);
  }
  const sch = Assist.TOOLS.find((t) => t.name === 'zuschnitt_einstellen').input_schema;
  assert.strictEqual(Assist.validate({ gruppe: 'eiche|19', format: { L: 2500, W: 1250 } }, sch), '');
  assert.strictEqual(Assist.validate({ gruppe: 'eiche|19', format: null }, sch), '');
  assert.match(Assist.validate({ richtung: 'diagonal' }, sch), /erlaubt/);
  assert.match(Assist.validate({ schnittfuge: '4' }, sch), /erwartet number/);
});

test('Sprachbefehle: Wendungen im Sägemodus', () => {
  const cases = { 'Weiter': 'next', 'okay': 'next', 'Zurück': 'prev', 'drucken': 'print', 'Etikett': 'print', 'nächster Streifen': 'strip',
    'Nächsten Streifen bitte': 'strip', 'nächste Platte': 'sheet', 'nochmal': 'say', 'Vollbild': 'fullon', 'Vollbild aus': 'fulloff', 'Mikrofon aus': 'off',
    'passt': 'next', 'erledigt': 'next', 'einen zurück': 'prev', 'vorheriger Streifen': 'prevstrip', 'vorherige Platte': 'prevsheet', 'von vorne': 'reset',
    'Streifen Etikett': 'printstrip', 'Ansage aus': 'sayoff', 'Ansage an': 'sayon', 'wie weit sind wir': 'status', 'was kommt danach': 'preview',
    'Hilfe': 'help', 'Hallo Kollege': null, 'ein Streifen': null, '': null };
  for (const [t, c] of Object.entries(cases)) assert.strictEqual(Voice.parse(t), c, t);
  // mit Nummern (Ziffern, Zahlwörter, Ordnungszahlen)
  assert.deepStrictEqual(Voice.parseCmd('Streifen drei'), { cmd: 'gostrip', n: 3 });
  assert.deepStrictEqual(Voice.parseCmd('zum dritten Streifen'), { cmd: 'gostrip', n: 3 });
  assert.deepStrictEqual(Voice.parseCmd('Platte Nummer 2'), { cmd: 'gosheet', n: 2 });
  assert.deepStrictEqual(Voice.parseCmd('Schritt einundzwanzig'), { cmd: 'gostep', n: 21 });
  assert.deepStrictEqual(Voice.parseCmd('Etiketten aus'), { cmd: 'lmode', arg: 'off' });
  assert.deepStrictEqual(Voice.parseCmd('automatisch drucken'), { cmd: 'lmode', arg: 'auto' });
  assert.ok(Voice.GRAMMAR.includes('[unk]') && Voice.GRAMMAR.includes('streifen fünf'));
  // Zeichnungen
  const dc = { 'Zeichnung': 'drawon', 'zeig mir die Zeichnung': 'drawon', 'Zeichnung zu': 'drawoff', 'Zeichnung schließen': 'drawoff', 'nächste Seite': 'pagenext',
    'umblättern': 'pagenext', 'vorherige Seite': 'pageprev', 'Seite zurück': 'pageprev' };
  for (const [t, c] of Object.entries(dc)) assert.strictEqual(Voice.parse(t), c, t);
  assert.deepStrictEqual(Voice.parseCmd('Seite drei'), { cmd: 'gopage', n: 3 });
  assert.ok(Voice.GRAMMAR.includes('seite zwei') && Voice.GRAMMAR.includes('zeichnung zu'));
});

test('KI-Assistent mit ChatGPT: Gespräch über previous_response_id, abgeschnittene Antwort und Fehler lassen den alten Stand', async () => {
  const mk = (replies) => { const reqs = []; return { reqs, responses: { create: async (r) => { reqs.push(JSON.parse(JSON.stringify(r))); const x = replies[reqs.length - 1]; if (x instanceof Error) throw x; return x; } } }; };
  const conv = { prevId: 'alt' };
  const c = mk([{ id: 'n1', status: 'incomplete', output: [{ type: 'function_call', call_id: 'a', name: 'teile_loeschen', arguments: '{"teile":[1' }] }]);
  let ran = 0;
  const r = await Assist.runOpenAI({ client: c, conv, text: 'x', exec: () => { ran++; } });
  assert.strictEqual(r.stop, 'max_tokens');
  assert.strictEqual(ran, 0);
  assert.strictEqual(conv.prevId, 'alt');
  assert.strictEqual(c.reqs[0].previous_response_id, 'alt');
  assert.strictEqual(c.reqs[0].instructions, Assist.SYSTEM);
  // Fehler nach einem Werkzeugaufruf: zurück auf den Stand vor der Anfrage
  const c2 = mk([{ id: 'n2', status: 'completed', output: [{ type: 'function_call', call_id: 'a', name: 'teile_lesen', arguments: '{}' }] }, new Error('Netz weg')]);
  await assert.rejects(Assist.runOpenAI({ client: c2, conv, text: 'x', exec: () => ({}) }), /Netz weg/);
  assert.strictEqual(conv.prevId, 'alt');
  // Modell ohne Denkstufe (gpt-4.1): kein reasoning
  const c3 = mk([{ id: 'n3', status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'nein' }] }] }]);
  const r3 = await Assist.runOpenAI({ client: c3, conv: { prevId: null }, text: 'x', model: 'gpt-4.1', exec: () => ({}) });
  assert.strictEqual(c3.reqs[0].reasoning, undefined);
  assert.strictEqual(r3.stop, 'refusal');
  assert.ok(Assist.openaiTools().every((t) => t.type === 'function' && t.strict === false && t.parameters.type === 'object'));
});

test('KI-Assistent: Fehler 429 unterscheidet „kein Guthaben“ und „zu viele Anfragen“', () => {
  class RateLimitError extends Error { constructor(m, code) { super(m); this.code = code; } }
  const A = { RateLimitError };
  assert.match(Assist.errorText(new RateLimitError('429 You exceeded your current quota, please check your plan and billing details.', 'insufficient_quota'), A), /Kein Guthaben/);
  assert.match(Assist.errorText(new RateLimitError('429 Rate limit reached for gpt-5.5', 'rate_limit_exceeded'), A), /Zu viele Anfragen[\s\S]*Rate limit reached/);
});
