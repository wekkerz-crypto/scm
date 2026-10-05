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

test('Web-Tool: Reihenfolge-Regel mit der Maus ziehen', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.evaluate(() => { const l = document.getElementById('rulelist'); l.closest('details').open = true; l.scrollIntoView({ block: 'start' }); });
    const cats = () => p.$$eval('#rulelist li.rrow', (x) => x.map((e) => e.dataset.cat));
    const before = await cats();
    const i = before.indexOf('format');
    assert.ok(i > 0);
    // ganze Zeile packen (nicht nur der Griff) und vor die erste ziehen
    const row = await (await p.$('#rulelist li.rrow[data-cat="format"] .nm')).boundingBox();
    const first = await (await p.$('#rulelist li.rrow')).boundingBox();
    await p.mouse.move(row.x + 20, row.y + row.height / 2);
    await p.mouse.down();
    await p.mouse.move(row.x + 20, first.y + 3, { steps: 12 });
    await p.mouse.up();
    const after = await cats();
    assert.strictEqual(after[0], 'format');
    assert.deepStrictEqual(after.slice(1), before.filter((c) => c !== 'format'));
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('step2xcs.settings.v1') || 'null'));
    if (stored && stored.orderRule) assert.strictEqual(stored.orderRule.seq[0], 'format');
    // Esc bricht ab, Klick auf ↑/↓ verschiebt weiter um eins
    const r2 = await (await p.$('#rulelist li.rrow[data-cat="format"] .nm')).boundingBox();
    await p.mouse.move(r2.x + 20, r2.y + r2.height / 2);
    await p.mouse.down();
    await p.mouse.move(r2.x + 20, r2.y + 300, { steps: 8 });
    await p.keyboard.press('Escape');
    await p.mouse.up();
    assert.strictEqual((await cats())[0], 'format');
    await p.click('#rulelist [data-rule="format"][data-dir="1"]');
    assert.strictEqual((await cats())[1], 'format');
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Draufsicht zoomen, Haltestege am Durchbruch umschalten', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.locator('.part').first().locator('.sel').click();
    // Haltestege: Umschalter an der Bearbeitung, Marken in der Draufsicht, TAB im Programm
    assert.strictEqual(await p.$$eval('#view polygon.tabmark', (x) => x.length), 0);
    await p.click('[data-tabs][data-on="1"]');
    assert.ok((await p.$$eval('#view polygon.tabmark', (x) => x.length)) >= 1);
    assert.match(await p.textContent('#xcs'), /SetParametricAttribute2\("TAB"/);
    await p.click('[data-tabs][data-on="0"]');
    assert.strictEqual(await p.$$eval('#view polygon.tabmark', (x) => x.length), 0);
    // Zoom: Mausrad vergrößert, „Ganz“ zeigt wieder alles
    const vb = () => p.$eval('#view svg', (s) => s.viewBox.baseVal.width);
    const full = await vb();
    const box = await (await p.$('#view')).boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.wheel(0, -400);
    await p.waitForTimeout(100);
    assert.ok((await vb()) < full * 0.8, 'vergrößert');
    assert.notStrictEqual(await p.textContent('#zoomk'), '100 %');
    await p.click('[data-z="fit"]');
    assert.ok(Math.abs((await vb()) - full) < 1e-6);
    await p.click('[data-z="in"]');
    assert.ok((await vb()) < full);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Möbel 3D – Baugruppe mit Nummern, Ein-/Ausblenden, Wählen, Messen', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.click('#clear');
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#pick')]);
    await chooser.setFiles(fixture('clamex_korpus.step'));
    await p.waitForFunction(() => document.querySelectorAll('.part').length === 6);
    // Nummer auch in der Programmliste
    assert.strictEqual(await p.textContent('.part .pnum'), '1');
    await p.click('[data-page="model"]');
    assert.ok(await p.$eval('.bench', (b) => getComputedStyle(b).display === 'none'));
    await p.waitForFunction(() => document.querySelectorAll('#mlabelwrap .mlab').length === 6, null, { timeout: 60000 });
    assert.strictEqual(await p.$$eval('#mtable tr[data-num]', (x) => x.length), 6);
    // Ausblenden und nur ein Bauteil
    await p.click('#mtable [data-mvis="5"]');
    assert.ok(await p.$eval('#mtable tr[data-num="5"]', (t) => t.classList.contains('off')));
    await p.click('#mall');
    assert.ok(!(await p.$eval('#mtable tr[data-num="5"]', (t) => t.classList.contains('off'))));
    // Zeile wählen → Hinweis unten, Nummer hervorgehoben
    await p.click('#mtable tr[data-num="3"] .nm');
    assert.match(await p.textContent('#mhud'), /Bauteil 3 · Aufkantung_3 · 462 × 500 × 19/);
    // Messen in der Vorderansicht: Unterboden oben bis Aufkantung unten = 462 (lichte Höhe)
    await p.click('[data-mview="front"]');
    await p.waitForTimeout(300);
    await p.click('#mmeasure');
    const pos = await p.$$eval('#mlabelwrap .mlab', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [e.textContent, r.x + r.width / 2, r.y + r.height / 2]; }));
    const a = pos.find((q) => q[0] === '4');
    const b = pos.find((q) => q[0] === '3');
    await p.mouse.click(a[1] + 30, a[2] + 3);
    await p.mouse.click(b[1] + 30, b[2] + 3);
    assert.match(await p.textContent('#mhud'), /ΔZ 462 /);
    await p.keyboard.press('Escape');
    assert.strictEqual(await p.getAttribute('#mmeasure', 'aria-pressed'), 'false');
    // zurück zu den Programmen
    await p.click('[data-page="pgmx"]');
    assert.ok(await p.$eval('#modelpage', (m) => m.hidden));
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
    const names = () => p.$$eval('.part .n', (x) => x.map((n) => n.textContent.replace(/^\d+/, '')));
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
    assert.strictEqual(await p.$eval('.part[aria-current="true"] .n', (x) => x.textContent.replace(/^\d+/, '')), second);
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

test('Web-Tool: Einstellungen und Teileliste bleiben nach dem Neuladen', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.evaluate(() => { document.getElementById('settings').open = true; document.getElementById('rulebox').open = true; });
    assert.match(await p.textContent('#savestate'), /Automatisch gespeichert/);
    // Einstellung ändern: sofort gespeichert, kein Knopf nötig
    await p.click('#ruleon');
    const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('step2xcs.settings.v1') || '{}'));
    assert.strictEqual((await stored()).orderRule.on, false);
    assert.ok(!(await p.$eval('#savebar', (b) => b.classList.contains('dirty'))));
    // eigene Datei laden, ein Beispiel entfernen, ein Teil drehen
    const names = () => p.$$eval('.part .n', (x) => x.map((e) => e.textContent));
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#pick')]);
    await chooser.setFiles(fixture('korpus1.step'));
    await p.waitForFunction(() => document.querySelectorAll('.part').length === 7);
    await p.locator('.part').first().locator('.del').click();
    await p.locator('.part', { hasText: 'Rechte_Seite' }).last().locator('.sel').click();
    await p.click('#rot');
    const dims = await p.textContent('.dims');
    const before = await names();
    assert.strictEqual(before.length, 6);
    await p.waitForTimeout(500);
    await p.reload();
    await p.waitForSelector('.part');
    assert.deepStrictEqual(await names(), before, 'gleiche Teile nach dem Neuladen');
    assert.strictEqual(await p.textContent('.dims'), dims, 'gewähltes Teil mit Drehung');
    assert.strictEqual(await p.$eval('#ruleon', (c) => c.checked), false);
    // Liste leeren bleibt leer (keine Beispiele mehr)
    await p.click('#clear');
    await p.waitForTimeout(500);
    await p.reload();
    await p.waitForTimeout(800);
    assert.strictEqual((await names()).length, 0);
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

test('Web-Tool: Werkstück-Profile oben (benennen, aktiv, je Teil, neue Teile)', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    assert.strictEqual(await p.$$eval('#profilebar [data-profile]', (x) => x.length), 5);
    assert.ok(await p.$('#profileedit svg') && await p.$('#profileall svg'));
    assert.strictEqual(await p.$$eval('#profilebar [aria-pressed="true"]', (x) => x.length), 0);
    // Profil 2 (Massivholz) für das gewählte Teil: aktiv, zweistufig im Programm
    await p.click('#profilebar [data-profile="1"]');
    assert.strictEqual(await p.$eval('#profilebar [data-profile="1"]', (b) => b.getAttribute('aria-pressed')), 'true');
    assert.match(await p.textContent('#xcs'), /_Vor"/);
    assert.match(await p.textContent('.part[aria-current="true"]'), /Massivholz/);
    // umbenennen und Werkzeug setzen im Bereich „Werkstück-Profile“
    await p.click('#profileedit');
    await p.fill('#pname', 'Massivholz Eiche');
    await p.dispatchEvent('#pname', 'change');
    assert.match(await p.textContent('#profilebar [data-profile="1"]'), /Massivholz Eiche/);
    await p.selectOption('#profedit select[data-pkey="contourTool"]', 'E020');
    assert.match(await p.textContent('#xcs'), /CreateRoughFinish\("Milling_\d+", [\d.]+, "", TypeOfProcess\.GeneralRouting, "E020"/);
    // noch einmal klicken: ohne Profil
    await p.click('#profilebar [data-profile="1"]');
    assert.strictEqual(await p.$$eval('#profilebar [aria-pressed="true"]', (x) => x.length), 0);
    assert.doesNotMatch(await p.textContent('#xcs'), /_Vor"/);
    // Profil 1 wählen, dann neues Teil: bekommt Profil 1
    await p.click('#profilebar [data-profile="0"]');
    const before = await p.$$eval('.part', (x) => x.length);
    const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 3000 }), p.click('#pick')]);
    await chooser.setFiles([fixture('testplatte.step')]);
    await p.waitForFunction((n) => document.querySelectorAll('.part').length > n, before);
    assert.strictEqual(await p.$eval('#profilebar [data-profile="0"]', (b) => b.getAttribute('aria-pressed')), 'true');
    assert.match(await p.textContent('#xcs'), /Profil Spanplatte/);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: DXF laden, Vorschläge ändern (Art, Tiefe, Dicke)', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    const before = await p.$$eval('.part', (x) => x.length);
    const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 3000 }), p.click('#pick')]);
    await chooser.setFiles([fixture('platte.dxf')]);
    await p.waitForFunction((n) => document.querySelectorAll('.part').length > n, before);
    assert.strictEqual(await p.inputValue('#fname'), 'platte.xcs');
    assert.match(await p.textContent('#xcs'), /CreateFinishedWorkpieceBox\("Workpiece", 600, 400, 19\)/);
    assert.strictEqual(await p.$('#flip'), null); // DXF: nur drehen
    assert.strictEqual(await p.$$eval('#dxfbox [data-dxfkind]', (x) => x.length), 9);
    // Dicke ändern
    await p.fill('#dxfT', '25');
    await p.dispatchEvent('#dxfT', 'change');
    await p.waitForFunction(() => /600, 400, 25\)/.test(document.getElementById('xcs').textContent));
    // Rechteck-Durchbruch → Tasche, Tiefe 8
    const id = await p.$$eval('#dxfbox li', (rows) => {
      const r = rows.find((x) => /Kontur 120×80/.test(x.textContent));
      return r.querySelector('select').dataset.dxfkind;
    });
    await p.selectOption('[data-dxfkind="' + id + '"]', 'pocket');
    await p.waitForSelector('[data-dxfdepth="' + id + '"]');
    await p.fill('[data-dxfdepth="' + id + '"]', '8');
    await p.dispatchEvent('[data-dxfdepth="' + id + '"]', 'change');
    await p.waitForFunction(() => /Tasche 120×80×8/.test(document.getElementById('opstable').textContent));
    // 3D: Hinweis statt Modell
    await p.click('[data-vmode="3d"]');
    await p.waitForFunction(() => /nur für STEP/.test(document.getElementById('v3msg').textContent));
    await p.click('[data-vmode="2d"]');
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Etiketten 40 × 60 (Vorschau, Druckbereich, Seitengröße)', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    // ein Teil: Name, Maße, Draufsicht mit Bemaßung
    await p.click('#label');
    await p.waitForSelector('#labeldlg[open] .lbl');
    assert.strictEqual(await p.$$eval('#labeldlg .lbl', (x) => x.length), 1);
    const txt = await p.textContent('#labeldlg .lbl');
    assert.match(txt, /\d+ × \d+ × \d+/);
    assert.ok(await p.$('#labeldlg .lbl svg text'));
    await p.click('#lprint');
    assert.strictEqual(await p.evaluate(() => window.__printed), 1);
    assert.match(await p.textContent('#labelpage'), /size: 40mm 60mm; margin: 0/);
    assert.strictEqual(await p.evaluate(() => getComputedStyle(document.querySelector('#printarea .lbl')).width), '151.181px'); // 40 mm
    // alle Teile: je Teil ein Etikett
    const n = await p.$$eval('.part', (x) => x.length);
    await p.click('#labelall');
    await p.waitForSelector('#labeldlg[open]');
    assert.strictEqual(await p.$$eval('#labeldlg .lbl', (x) => x.length), n);
    await p.click('#lclose');
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Vorschub/Drehzahl je Bearbeitung (Untermenü)', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    const box = 'details.tech[data-techgrp="format"]';
    await p.waitForSelector(box);
    // Werte aus der Werkzeugdatei als Vorgabe
    assert.match(await p.textContent(box + ' summary'), /12 m\/min · 15000 U\/min · 3 m\/min\s+Werkzeugdatei/);
    await p.click(box + ' summary');
    assert.strictEqual(await p.getAttribute(box + ' input[data-tech="feed"]', 'placeholder'), '12');
    await p.fill(box + ' input[data-tech="feed"]', '14');
    await p.dispatchEvent(box + ' input[data-tech="feed"]', 'change');
    await p.waitForFunction(() => /"E014", "-1", 2, "-1", "-1", 14\);/.test(document.getElementById('xcs').textContent));
    assert.ok(await p.$(box + '[open]')); // bleibt offen
    assert.match(await p.textContent(box + ' summary'), /eigene Werte/);
    // zurück auf Werkzeugdatei
    await p.click(box + ' [data-techreset]');
    await p.waitForFunction(() => /"E014", "-1", 2, "-1", "-1", "-1"\);/.test(document.getElementById('xcs').textContent));
    // Bohrungen: Drehzahl und Bohrvorschub
    assert.ok(await p.$('details.tech[data-techgrp^="drill:"] input[data-tech="rot"]'));
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: andere Werkzeugdatei laden → Teile und Schnittwerte neu berechnet', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const fs = require('fs');
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('details.tech[data-techgrp="format"]');
    // E014 mit anderem Vorschub (10 statt 12), E016 entfernt
    let t = fs.readFileSync(path.join(__dirname, '..', 'maestro', 'werkzeuge', 'def.tlgx'), 'utf8');
    const i = t.indexOf('>E014</Name>');
    const j = t.indexOf('<FeedRate>', i);
    t = t.slice(0, j) + t.slice(j).replace(/<Standard>12<\/Standard>/, '<Standard>10</Standard>');
    t = t.replace('>E016</Name>', '>E016X</Name>');
    const file = path.join(require('os').tmpdir(), 'andere.tlgx');
    fs.writeFileSync(file, t);
    await p.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
    await p.setInputFiles('#tlgx', file);
    await p.waitForFunction(() => /10 m\/min/.test(document.querySelector('details.tech[data-techgrp="format"] summary').textContent));
    assert.match(await p.textContent('aside.steps'), /Werkzeug E016 steht nicht in der Werkzeugdatei/);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});
