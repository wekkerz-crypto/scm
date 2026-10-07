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
    'Nächsten Streifen bitte': 'strip', 'nächste Platte': 'sheet', 'nochmal': 'say', 'Vollbild': 'full', 'Mikrofon aus': 'off', 'Hallo Kollege': null, '': null };
  for (const [t, c] of Object.entries(cases)) assert.strictEqual(Voice.parse(t), c, t);
  assert.ok(Voice.GRAMMAR.includes('[unk]'));
});
