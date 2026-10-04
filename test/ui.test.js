'use strict';
// Oberflächentest im Browser (Playwright). Wird übersprungen, wenn Playwright nicht installiert ist.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

let chromium = null;
for (const id of ['playwright', '/opt/node-tools/node_modules/playwright']) {
  try { chromium = require(id).chromium; break; } catch (e) { /* weiter suchen */ }
}

const page = 'file://' + path.join(__dirname, '..', 'web', 'index.html');
const fixture = (n) => path.join(__dirname, 'fixtures', n);

test('Web-Tool: STEP laden per Knopf und Ablegen, Liste leeren', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    const count = () => p.$$eval('.part', (x) => x.length);
    const start = await count();

    const pick = async (files) => {
      const before = await count();
      const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 3000 }), p.click('#pick')]);
      await chooser.setFiles(files);
      await p.waitForFunction((n) => document.querySelectorAll('.part').length > n, before);
    };
    await pick([fixture('testplatte.step')]);
    assert.strictEqual(await count(), start + 1);
    await pick([fixture('seitenwand_32.step'), fixture('oberboden_27.step')]);
    assert.strictEqual(await count(), start + 3);

    // Ablegen per Drag & Drop
    const text = require('fs').readFileSync(fixture('fuenfachs.step'), 'utf8');
    const dt = await p.evaluateHandle((t) => { const d = new DataTransfer(); d.items.add(new File([t], 'drop.step')); return d; }, text);
    await p.dispatchEvent('body', 'dragenter', { dataTransfer: dt });
    assert.ok(await p.evaluate(() => !document.getElementById('dropover').hidden));
    await p.dispatchEvent('body', 'drop', { dataTransfer: dt });
    await p.waitForFunction((n) => document.querySelectorAll('.part').length === n, start + 4);
    assert.ok(await p.evaluate(() => document.getElementById('dropover').hidden));

    // Liste leeren, danach wieder laden
    await p.click('#clear');
    assert.strictEqual(await count(), 0);
    await pick([fixture('testplatte.step')]);
    assert.strictEqual(await count(), 1);
    assert.match(await p.textContent('#xcs'), /CreateFinishedWorkpieceBox\("Workpiece", 900, 400, 18\)/);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Bearbeitungsschritte mit der Maus verschieben', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.locator('.part').nth(2).locator('.sel').click();
    const names = () => p.$$eval('tbody.grp .jump', (x) => x.map((e) => e.textContent));
    const before = await names();
    assert.strictEqual(before[before.length - 1], 'Formatfräsen');
    const grip = await (await p.$('[data-grip="format"]')).boundingBox();
    const first = await (await p.$('tbody.grp')).boundingBox();
    await p.mouse.move(grip.x + 5, grip.y + 5);
    await p.mouse.down();
    await p.mouse.move(grip.x + 5, first.y + 3, { steps: 12 });
    await p.mouse.up();
    const after = await names();
    assert.strictEqual(after[0], 'Formatfräsen');
    assert.deepStrictEqual(after.slice(1), before.slice(0, -1));
    const xcs = await p.textContent('#xcs');
    assert.ok(xcs.indexOf('CreateRoughFinish("Milling_1"') < xcs.indexOf('CreateDrill'), 'Programm folgt der Reihenfolge');
    // Esc bricht ab
    const g2 = await (await p.$('[data-grip="format"]')).boundingBox();
    await p.mouse.move(g2.x + 5, g2.y + 5);
    await p.mouse.down();
    await p.mouse.move(g2.x + 5, g2.y + 300, { steps: 8 });
    await p.keyboard.press('Escape');
    await p.mouse.up();
    assert.strictEqual((await names())[0], 'Formatfräsen');
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Schalter Hell/Dunkel', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ colorScheme: 'light' });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg();
    assert.strictEqual(await p.getAttribute('[data-theme-set="light"]', 'aria-pressed'), 'true');
    await p.click('[data-theme-set="dark"]');
    assert.notStrictEqual(await bg(), light);
    assert.strictEqual(await p.getAttribute('[data-theme-set="dark"]', 'aria-pressed'), 'true');
    await p.reload();
    await p.waitForSelector('.part');
    assert.notStrictEqual(await bg(), light, 'Wahl bleibt nach dem Neuladen');
    await p.click('[data-theme-set="light"]');
    assert.strictEqual(await bg(), light);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Teile links mit Vorschau, einzeln löschen', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    const names = () => p.$$eval('.part .n', (x) => x.map((n) => n.textContent));
    const before = await names();
    assert.ok(before.length >= 2);
    assert.strictEqual(await p.$$eval('.part svg.thumb', (x) => x.length), before.length);
    // Leiste steht links neben der Ansicht
    const a = await (await p.$('#parts')).boundingBox();
    const d = await (await p.$('#detail')).boundingBox();
    assert.ok(a.x + a.width <= d.x + 1 && a.y < d.y + 50);
    // zweites Teil auswählen, erstes löschen: Auswahl bleibt beim zweiten
    await p.locator('.part').nth(1).locator('.sel').click();
    const second = before[1];
    await p.locator('.part').nth(0).hover();
    await p.locator('.part').nth(0).locator('.del').click();
    const after = await names();
    assert.deepStrictEqual(after, before.slice(1));
    assert.strictEqual(await p.$eval('.part[aria-current="true"] .n', (x) => x.textContent), second);
    assert.ok((await p.$eval('#detail .title', (x) => x.textContent)).includes(second));
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: 3D-Ansicht mit Animation', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.locator('.part').nth(2).locator('.sel').click(); // 5-Achs-Testplatte
    await p.click('[data-vmode="3d"]');
    await p.waitForFunction(() => { const m = document.getElementById('v3msg'); return m && m.hidden && document.querySelector('#v3slot canvas'); }, null, { timeout: 60000 });
    assert.strictEqual(await p.$eval('#view', (v) => v.hidden), true);
    // Animation: Werkzeug und Spuren erscheinen, Anzeige läuft mit
    await p.evaluate(() => { const r = document.getElementById('apos'); r.value = 500; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await p.waitForTimeout(300);
    assert.ok((await p.$eval('#hud', (h) => h.textContent)).includes('/'));
    // zurück auf 2D, die Wahl bleibt gespeichert
    await p.click('[data-vmode="2d"]');
    assert.strictEqual(await p.$eval('#view', (v) => v.hidden), false);
    await p.reload();
    await p.waitForSelector('.part');
    assert.strictEqual(await p.$eval('#view', (v) => v.hidden), false);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Schalter für gekrümmte Flächen nur bei Bedarf', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    const pick = async (files) => {
      const before = await p.$$eval('.part', (x) => x.length);
      const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 3000 }), p.click('#pick')]);
      await chooser.setFiles(files);
      await p.waitForFunction((n) => document.querySelectorAll('.part').length > n && document.getElementById('xcs'), before);
    };
    // ebenes Teil: kein Schalter; Programmcode zunächst eingeklappt
    await pick([fixture('testplatte.step')]);
    assert.strictEqual(await p.$eval('#xcsbox', (d) => d.open), false);
    assert.strictEqual(await p.$('#curvedbox'), null);
    // Schräge an Rundungen: nur dieser Schalter, eingeschaltet → 5-Achs-Bahn statt Sägeschnitte
    await pick([fixture('schraege_rund.step')]);
    assert.ok(await p.$('#curvedbox'));
    assert.strictEqual(await p.$$eval('[data-curved="surface"]', (x) => x.length), 0);
    assert.match(await p.textContent('#xcs'), /CreateBladeCut/);
    await p.click('[data-curved="slant"][data-on="1"]');
    await p.waitForFunction(() => /CreateSlantedRoughFinish\("SlantedMilling_1"/.test(document.getElementById('xcs').textContent));
    assert.doesNotMatch(await p.textContent('#xcs'), /CreateBladeCut/);
    // Mulde: Zeilenfräsen lädt das 3D-Netz und schreibt die Bahn
    await pick([fixture('mulde.step')]);
    assert.strictEqual(await p.$$eval('[data-curved="slant"]', (x) => x.length), 0);
    assert.strictEqual(await p.$$eval('[data-curved="surface"][data-on="flat4"]', (x) => x.length), 0); // kein Zylinder allein
    await p.click('[data-curved="surface"][data-on="ball"]');
    await p.waitForFunction(() => /CreateToolpath\("Surface_Path_2"/.test(document.getElementById('xcs').textContent), null, { timeout: 60000 });
    assert.match(await p.textContent('#opstable'), /Gewölbte Fläche \(Kugel\) zeilenfräsen/);
    // gewölbter Block: dritte Wahl 4-Achs mit dem Schaftfräser (ohne 3D-Netz)
    await pick([fixture('woelbung.step')]);
    await p.click('[data-curved="surface"][data-on="flat4"]');
    await p.waitForFunction(() => /CreateWorkplane\("Abzeilen_1_01"/.test(document.getElementById('xcs').textContent));
    assert.match(await p.textContent('#opstable'), /4-Achs abzeilen/);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Einstellungen erst mit „Einstellungen speichern“ dauerhaft', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.evaluate(() => { document.getElementById('settings').open = true; document.getElementById('rulebox').open = true; });
    assert.match(await p.textContent('#savestate'), /Alle Änderungen gespeichert/);
    // Regel ändern: wirkt sofort, ist aber noch nicht gespeichert
    await p.click('#ruleon');
    assert.match(await p.textContent('#savestate'), /Ungespeicherte Änderungen/);
    assert.ok(await p.$eval('#savebar', (b) => b.classList.contains('dirty')));
    assert.ok(await p.$eval('#rulebox .savebar', (b) => b.classList.contains('dirty'))); // auch in der Regel-Leiste
    const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('step2xcs.settings.v1') || '{}'));
    assert.notStrictEqual((await stored()).orderRule && (await stored()).orderRule.on, false);
    await p.click('#savesettings');
    assert.match(await p.textContent('#savestate'), /Alle Änderungen gespeichert/);
    assert.strictEqual((await stored()).orderRule.on, false);
    await p.reload();
    await p.waitForSelector('.part');
    assert.strictEqual(await p.$eval('#ruleon', (c) => c.checked), false);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: zweiseitig (Seite 1/2) und Bearbeitung löschen/wiederherstellen', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    const before = await p.$$eval('.part', (x) => x.length);
    const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 3000 }), p.click('#pick')]);
    await chooser.setFiles([fixture('zweiseitig.step')]);
    await p.waitForFunction((n) => document.querySelectorAll('.part').length > n, before);
    // Teil ohne Bearbeitung von unten: kein Schalter – hier ja
    assert.ok(await p.$('[data-two="1"]'));
    assert.strictEqual(await p.$('[data-side]'), null);
    await p.click('[data-two="1"]');
    assert.strictEqual(await p.inputValue('#fname'), 'zweiseitig_S1.xcs');
    assert.match(await p.textContent('#xcs'), /CreateRawWorkpiece\("Workpiece", 2, 2, 2, 2, 0, 0\)/);
    await p.click('[data-side="2"]');
    assert.strictEqual(await p.inputValue('#fname'), 'zweiseitig_S2.xcs');
    assert.match(await p.textContent('#xcs'), /CreateRawWorkpiece\("Workpiece", 0, 0, 0, 0, 0, 0\)/);
    assert.doesNotMatch(await p.textContent('#opstable'), /Formatfräsen/);
    assert.match(await p.textContent('.part[aria-current="true"]'), /Seite 2/);
    // Löschen auf Seite 2: Schritt verschwindet, steht unter „Gelöscht“, wiederherstellbar
    const rows = () => p.$$eval('#opstable tbody.grp', (x) => x.length);
    const n0 = await rows();
    await p.click('#opstable [data-suppress]');
    assert.strictEqual(await rows(), n0 - 1);
    assert.strictEqual(await p.$$eval('.suppressed li [data-restore]', (x) => x.length), 1);
    // in der Draufsicht rot dort, wo die gelöschte Bearbeitung wäre
    assert.ok(await p.$$eval('#view svg .suppressed-ops > *', (x) => x.length) > 0);
    assert.match(await p.textContent('#view svg .suppressed-ops'), /Gelöscht: /);
    await p.click('[data-side="1"]'); // Seite 1 bleibt unberührt
    assert.strictEqual(await p.$('.suppressed'), null);
    await p.click('[data-side="2"]');
    await p.click('.suppressed [data-restore]');
    assert.strictEqual(await rows(), n0);
    assert.strictEqual(await p.$('.suppressed'), null);
    assert.strictEqual(await p.$('#view svg .suppressed-ops'), null);
    // zurück auf einseitig
    await p.click('[data-two="0"]');
    assert.strictEqual(await p.inputValue('#fname'), 'zweiseitig.xcs');
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});
