'use strict';
// Parallelanschlag am Pi (tools/pi/anschlag.py im Weckwop-Dienst) gegen einen nachgebildeten ESP32/FluidNC (Pseudo-Terminal)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

let hasPy = false;
try { execFileSync('python3', ['-c', 'import pty, termios'], { stdio: 'ignore' }); hasPy = true; } catch (e) { /* ohne Python überspringen */ }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('Anschlag: Werte an FluidNC, Referenzfahrt, Fahren mit Spielausgleich, Grenzen, Kalibrieren, Einstellungen', { skip: (!hasPy || process.platform === 'win32') && 'Python/pty fehlt' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weckwop-anschlag-'));
  const fake = spawn('python3', [path.join(__dirname, 'fixtures', 'fake_fluidnc.py'), path.join(dir, 'port'), path.join(dir, 'log')], { stdio: 'ignore' });
  let dienst = null;
  try {
    for (let i = 0; i < 50 && !fs.existsSync(path.join(dir, 'port')); i++) await wait(50);
    const port = fs.readFileSync(path.join(dir, 'port'), 'utf8');
    fs.writeFileSync(path.join(dir, 'anschlag.json'), JSON.stringify({ port, steigung: 5, mikro: 16, referenz: 1300, max: 1300, spiel: 2 }));
    dienst = spawn('python3', [path.join(__dirname, '..', 'tools', 'pi', 'weckwop-dienst.py'), 'http://diskstation:8080/'],
      { env: Object.assign({}, process.env, { WECKWOP_DIENST_PORT: '8769', WECKWOP_ANSCHLAG_CONF: path.join(dir, 'anschlag.json') }), stdio: 'ignore' });
    const U = 'http://127.0.0.1:8769';
    const H = { 'X-Weckwop': '1', 'Content-Type': 'application/json' };
    const get = async (p) => (await fetch(U + p, { headers: H })).json();
    const post = async (p, b) => (await fetch(U + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) })).json();
    const until = async (fn, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { const s = await get('/anschlag'); if (fn(s)) return s; await wait(100); } throw new Error('Zeit abgelaufen'); };
    let s = await until((x) => x.verbunden);
    assert.strictEqual(s.referenziert, false);
    assert.strictEqual(s.steps_per_mm, 200 * 16 / 5);
    // Werte gehen als $/…= an den ESP32
    await wait(300);
    const log = () => fs.readFileSync(path.join(dir, 'log'), 'utf8');
    assert.match(log(), /^\$\/axes\/x\/steps_per_mm=640\.0000$/m);
    assert.match(log(), /^\$\/axes\/x\/homing\/mpos_mm=1300$/m);
    assert.match(log(), /^\$\/axes\/x\/max_travel_mm=1300\.000$/m);
    // ohne Referenzfahrt nicht fahren
    assert.match((await post('/anschlag/fahren', { mm: 500 })).fehler, /Referenzfahrt/);
    await post('/anschlag/referenz');
    s = await until((x) => x.referenziert && x.zustand === 'Idle');
    assert.strictEqual(s.pos, 1300);
    // nach unten: direkt; nach oben: erst Ziel + Spiel, dann Ziel (Spielausgleich)
    await post('/anschlag/fahren', { mm: 523.4 });
    s = await until((x) => x.zustand === 'Idle' && Math.abs(x.pos - 523.4) < 0.01);
    await post('/anschlag/fahren', { mm: 800 });
    await until((x) => x.zustand === 'Idle' && Math.abs(x.pos - 800) < 0.01);
    const moves = log().split('\n').filter((l) => /^G1 /.test(l));
    assert.deepStrictEqual(moves, ['G1 X523.400 F2000', 'G1 X802.000 F2000', 'G1 X800.000 F2000']);
    // außerhalb des Verfahrwegs, ungültige Einstellungen
    assert.match((await post('/anschlag/fahren', { mm: 1400 })).fehler, /außerhalb/);
    assert.match((await post('/anschlag/einstellungen', { vorschub: 9000 })).fehler, /Höchstgeschwindigkeit/);
    assert.match((await post('/anschlag/einstellungen', { steigung: 0 })).fehler, /Spindelsteigung/);
    // Kalibrieren: gemessen 801,5 statt 800 → Versatz +1,5
    s = await post('/anschlag/kalibrieren', { ist: 801.5 });
    assert.strictEqual(s.ok, true);
    assert.strictEqual(s.offset, 1.5);
    assert.strictEqual(s.pos, 801.5);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'anschlag.json'), 'utf8')).offset, 1.5);
    // Einstellungen ändern: gespeichert, an den ESP32, neue Referenzfahrt nötig
    const e = await get('/anschlag/einstellungen');
    assert.ok(e.felder.some((f) => f.key === 'beschl' && f.gruppe === 'Fahren'));
    s = await post('/anschlag/einstellungen', { beschl: 300, steigung: 4 });
    assert.strictEqual(s.ok, true);
    assert.strictEqual(s.referenziert, false);
    await wait(300);
    assert.match(log(), /^\$\/axes\/x\/acceleration_mm_per_sec2=300$/m);
    assert.match(log(), /^\$\/axes\/x\/steps_per_mm=800\.0000$/m);
    // fremde Seite darf nichts
    assert.strictEqual((await fetch(U + '/anschlag/fahren', { method: 'POST', headers: { 'X-Weckwop': '1', Origin: 'https://fremd.example' }, body: '{"mm":10}' })).status, 403);
  } finally {
    if (dienst) dienst.kill();
    fake.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
