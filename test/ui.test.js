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
    await p.click('.part:nth-of-type(3)');
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
