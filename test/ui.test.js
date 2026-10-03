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
