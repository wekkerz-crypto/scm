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

test('Web-Tool: Möbel 3D – Baugruppe mit Nummern, Ein-/Ausblenden, Wählen, Messen mit Fang, Bemaßen, Explosion, Schnitt, Bild', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
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
    // Kantenbelegung: Schalter „Kanten“ (bleibt gespeichert); Schmalflächen mit Kantenband bekommen eine eigene Gruppe
    await p.check('#medges');
    assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('step2xcs.settings.v1') || '{}').modelEdges), true);
    const groups = await p.evaluate(() => {
      const T = window.THREE;
      const g = new T.BoxGeometry(800, 400, 19).toNonIndexed();
      const m = View3D.boardMaterials(T, g, 'weiss', null, { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], e: { l1: 2, l2: 0, b1: 1, b2: 0 } });
      // hervorheben: Kantenband in der Signalfarbe
      const h = View3D.boardMaterials(T, g, 'weiss', null, { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], e: { l1: 2, l2: 0, b1: 1, b2: 0 }, hl: '#22a34a', hl2: '#e8590c' });
      return { mats: m.length, groups: g.groups.map((x) => [x.count, x.materialIndex]), hl: h[2].color.getHexString() + '/' + h[2].userData.tint.getHexString() };
    });
    // 4 Dreiecke Ober-/Unterseite, 4 offene Schmalflächen (L2, B2), 2 mit Dekor 1 (B1), 2 mit Dekor 2 (L1)
    assert.deepStrictEqual(groups, { mats: 4, groups: [[12, 0], [12, 1], [6, 2], [6, 3]], hl: '22a34a/22a34a' });
    assert.ok(!(await p.isDisabled('#medgehl')));
    await p.check('#medgehl');
    assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('step2xcs.settings.v1') || '{}').modelEdgeHl), true);
    await p.uncheck('#medgehl');
    await p.uncheck('#medges');
    // Plattenfarbe: für alle (Einstellung) und je Bauteil, „wie Einstellung“ nimmt sie wieder weg
    await p.click('#mboard');
    await p.click('.bpick [data-bkey="weiss"]');
    assert.match(await p.textContent('#mboard'), /Weiß/);
    // Kanten: Oberfläche bleibt, nur die Schmalflächen als Spanplatte; Fenster bleibt offen bis „Fertig“
    await p.click('.bpick [data-bedge="span"]');
    assert.match(await p.textContent('#mboard'), /Weiß · Kante Spanplatte/);
    await p.click('.bpick [data-bdone]');
    assert.strictEqual(await p.$$eval('.bpick', (x) => x.length), 0);
    await p.click('#mtable [data-mboard="3"]');
    await p.click('.bpick [data-bkey="nuss"]');
    assert.match(await p.getAttribute('#mtable [data-mboard="3"]', 'title'), /Nussbaum/);
    assert.ok(await p.$eval('#mtable [data-mboard="3"]', (b) => b.classList.contains('own')));
    await p.click('#mtable [data-mboard="3"]');
    await p.click('.bpick [data-binh]');
    assert.match(await p.getAttribute('#mtable [data-mboard="3"]', 'title'), /Weiß · Kante Spanplatte \(wie Einstellung\)/);
    assert.strictEqual(await p.$$eval('.bpick', (x) => x.length), 0);
    // Fokus: nur ein Bauteil, nochmal = wieder alle
    await p.click('#mtable [data-monly="2"]');
    assert.strictEqual(await p.$$eval('#mtable tr.off', (x) => x.length), 5);
    assert.match(await p.textContent('#msolo'), /Nur Bauteil 2/);
    assert.strictEqual(await p.getAttribute('#mtable [data-monly="2"]', 'aria-pressed'), 'true');
    await p.click('#mtable [data-monly="2"]');
    assert.strictEqual(await p.$$eval('#mtable tr.off', (x) => x.length), 0);
    assert.ok(await p.$eval('#msolo', (m) => m.hidden));
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
    // Fang-Markierung unter dem Mauszeiger, Gummiband mit Abstand
    await p.mouse.move(b[1] + 30, b[2] + 3);
    await p.waitForFunction(() => !document.querySelector('.msnap').hidden && document.querySelector('.mlab.meas.live'));
    assert.match(await p.getAttribute('.msnap', 'data-kind'), /^(end|mid|center|edge|face)$/);
    await p.mouse.click(b[1] + 30, b[2] + 3);
    assert.match(await p.textContent('#mhud'), /ΔZ 462 /);
    // Explosionsansicht: Bauteile rücken auseinander, Maße bleiben wie zusammengebaut
    await p.keyboard.press('Escape');
    await p.$eval('#mexpl', (e) => { e.value = 50; e.dispatchEvent(new Event('input')); });
    await p.waitForTimeout(200);
    const pos2 = await p.$$eval('#mlabelwrap .mlab', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [e.textContent, r.x + r.width / 2, r.y + r.height / 2]; }));
    const a2 = pos2.find((q) => q[0] === '4');
    const b2 = pos2.find((q) => q[0] === '3');
    assert.ok(b2[2] - a2[2] < b[2] - a[2] - 50, 'Aufkantung und Unterboden weiter auseinander');
    await p.click('#mmeasure');
    await p.mouse.click(a2[1] + 30, a2[2] + 3);
    await p.mouse.click(b2[1] + 30, b2[2] + 3);
    assert.match(await p.textContent('#mhud'), /ΔZ 462 .*wie zusammengebaut/);
    // Bemaßen: Maße bleiben stehen (auch nach Esc), Richtung Z, Liste rechts, löschen
    await p.click('#mdim');
    assert.strictEqual(await p.getAttribute('#mmeasure', 'aria-pressed'), 'false');
    await p.click('#mdimaxis [data-dimaxis="z"]');
    await p.mouse.click(a2[1] + 30, a2[2] + 3);
    await p.mouse.click(b2[1] + 30, b2[2] + 3);
    await p.mouse.click(a2[1] - 40, a2[2] + 3);
    await p.mouse.click(b2[1] - 40, b2[2] + 3);
    await p.keyboard.press('Escape');
    assert.strictEqual(await p.$$eval('#mdimlist li[data-dim]', (x) => x.length), 2);
    assert.match(await p.textContent('#mdimlist'), /Z 462 mm.*Bauteil 4 → 3/);
    assert.ok((await p.$$eval('#mlabelwrap .mlab.dim:not(.dot)', (x) => x.map((e) => e.textContent))).includes('Z 462'));
    await p.click('#mdimlist [data-dimdel]');
    assert.strictEqual(await p.$$eval('#mdimlist li[data-dim]', (x) => x.length), 1);
    await p.click('#mdimclear');
    assert.strictEqual(await p.$$eval('#mlabelwrap .mlab.dim', (x) => x.length), 0);
    await p.keyboard.press('Escape');
    assert.strictEqual(await p.getAttribute('#mmeasure', 'aria-pressed'), 'false');
    // Schnittebene, Explosion abspielen, Bild speichern
    await p.click('[data-msec="z"]');
    assert.ok(!(await p.$eval('#msecpos', (e) => e.disabled)));
    await p.click('#msecflip');
    await p.click('[data-msec=""]');
    assert.ok(await p.$eval('#msecpos', (e) => e.disabled));
    // steht auf 50 % → spielt zurück auf 0, dann wieder auseinander auf 100
    await p.click('#mexplplay');
    await p.waitForFunction(() => document.querySelector('#mexpl').value === '0', null, { timeout: 15000 });
    await p.click('#mexplplay');
    await p.waitForFunction(() => document.querySelector('#mexpl').value === '100', null, { timeout: 15000 });
    const [png] = await Promise.all([p.waitForEvent('download'), p.click('#msnap')]);
    assert.strictEqual(png.suggestedFilename(), 'moebel_3d.png');
    const head = require('fs').readFileSync(await png.path()).subarray(0, 4);
    assert.deepStrictEqual([...head], [0x89, 0x50, 0x4e, 0x47]);
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
    // Etikett: Hinweis „2-seitig – wenden“
    await p.click('#label');
    await p.waitForSelector('#labeldlg[open] .lbl');
    assert.match(await p.textContent('#labeldlg .lbl .two'), /2-SEITIG · WENDEN/);
    await p.click('#lclose');
    // zurück auf einseitig
    await p.click('[data-two="0"]');
    assert.strictEqual(await p.inputValue('#fname'), 'zweiseitig.xcs');
    // einseitig mit Bearbeitung von unten: Etikett warnt
    await p.click('#label');
    await p.waitForSelector('#labeldlg[open] .lbl');
    assert.match(await p.textContent('#labeldlg .lbl .two.warn'), /Unterseite beachten/);
    await p.click('#lclose');
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
    // Kopf mit Nr. und Material, Kanten-Legende, Fußzeile
    assert.match(await p.textContent('#labeldlg .lbl .hd .no'), /^\d+$/);
    assert.ok((await p.textContent('#labeldlg .lbl .hd .mt')).length > 0);
    assert.ok(await p.$('#labeldlg .lbl .eg'));
    assert.match(await p.textContent('#labeldlg .lbl .ft'), /\d\d\.\d\d\.\d\d/);
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

test('Web-Tool: Etiketten-Konfigurator (Elemente ziehen, Felder, Vorlage, Druck, wieder automatisch)', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await p.click('#label');
    await p.waitForSelector('#labeldlg[open]');
    await p.click('#ldes');
    await p.waitForSelector('#labeldes[open] #ldlabel');
    assert.match(await p.textContent('.ldmode'), /Automatisch/);
    const n0 = await p.$$eval('#ldlabel [data-li]', (x) => x.length);
    assert.ok(n0 >= 8);
    // Element ziehen: Lage in mm (Raster 0,5) gespeichert
    const sel = '#ldlabel [data-li] >> nth=2';
    const id = await p.getAttribute(sel, 'data-li');
    const bb = await p.locator(sel).boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await p.mouse.down();
    await p.mouse.move(bb.x + bb.width / 2 + 40, bb.y + bb.height / 2 + 60, { steps: 6 });
    await p.mouse.up();
    const stored = () => p.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => { try { return 'labelLayout' in JSON.parse(localStorage.getItem(x)); } catch (e) { return false; } });
      return k ? JSON.parse(localStorage.getItem(k)).labelLayout : undefined;
    });
    let lay = await stored();
    const it = lay.items.find((e) => e.id === id);
    assert.ok(it.y > 10 && (it.x * 2) % 1 === 0, JSON.stringify(it));
    assert.match(await p.textContent('.ldmode'), /Eigenes Layout/);
    // Feld als Text hinzufügen, Text ändern, fett
    await p.selectOption('#ldfield', 'material');
    lay = await stored();
    assert.strictEqual(lay.items.length, n0 + 1);
    await p.fill('textarea[data-ldp="text"]', 'Material: {material}');
    await p.check('input[data-ldp="bold"]');
    assert.match(await p.textContent('#ldlabel'), /Material: /);
    // Vorlage mit Strichcode
    await p.selectOption('#ldtpl', 'barcode');
    await p.click('#ldtplgo');
    assert.ok(await p.$('#ldlabel .li-bc svg rect'));
    // Löschen per Taste
    await p.click('#ldlabel [data-li] >> nth=0');
    const n1 = await p.$$eval('#ldlabel [data-li]', (x) => x.length);
    await p.keyboard.press('Delete');
    assert.strictEqual(await p.$$eval('#ldlabel [data-li]', (x) => x.length), n1 - 1);
    // fertig → Vorschau und Druck mit eigenem Layout
    await p.click('#ldclose');
    await p.waitForSelector('#labeldlg[open] .lbl .lin.free');
    await p.click('#lprint');
    assert.strictEqual(await p.evaluate(() => window.__printed), 1);
    assert.ok(await p.$('#printarea .lbl .lin.free .li-bc'));
    // wieder automatisch
    await p.click('#label');
    await p.click('#ldes');
    await p.click('#ldauto');
    assert.strictEqual(await stored(), null);
    await p.click('#ldclose');
    await p.waitForSelector('#labeldlg[open] .lbl');
    assert.strictEqual(await p.$('#labeldlg .lbl .lin.free'), null);
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

test('Web-Tool: Listen (Stückliste, Zuschnitt, Zeit) und Projektdatei speichern/öffnen', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const fs = require('fs');
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    // Zeit an der Teilekarte
    assert.match(await p.textContent('.part'), /≈ \d+:\d\d min/);
    await p.click('[data-page="lists"]');
    await p.waitForSelector('table.bom tbody tr');
    const rows = await p.$$eval('table.bom tbody tr', (x) => x.length);
    assert.strictEqual(rows, 3);
    // Anzahl ändern → Summe und Zähler oben
    await p.fill('[data-bomqty="1"]', '4');
    await p.press('[data-bomqty="1"]', 'Tab');
    await p.waitForFunction(() => /\b6\b Teile/.test(document.querySelector('.bomsum').textContent));
    assert.strictEqual(await p.textContent('#ptn-lists'), '6');
    // hier ohne Vorbelegung nach Regeln (eigener Test unten)
    await p.click('#erules');
    await p.uncheck('#erauto');
    await p.click('#erclose');
    // ringsum: alle vier Seiten auf einmal (keine → Dekor 1 → Dekor 2 → keine)
    await p.click('[data-bomedge="1"][data-side="all"]');
    assert.strictEqual(await p.textContent('table.bom tbody tr:nth-child(2) .et'), 'L1 D1 · L2 D1 · B1 D1 · B2 D1');
    await p.click('[data-bomedge="1"][data-side="all"]');
    await p.click('[data-bomedge="1"][data-side="all"]');
    assert.strictEqual(await p.textContent('table.bom tbody tr:nth-child(2) .et'), '');
    // Kantenband: L1 Dekor 2 (2 × klicken), B2 Dekor 1 → Text, Laufmeter je Dekor, Zuschnitt mit Abzug (1 mm je Kante)
    await p.click('[data-bomedge="0"][data-side="l1"]');
    await p.click('[data-bomedge="0"][data-side="l1"]');
    await p.click('[data-bomedge="0"][data-side="b2"]');
    assert.strictEqual(await p.textContent('table.bom tbody tr:first-child .et'), 'L1 D2 · B2 D1');
    assert.match(await p.textContent('.bomsum'), /Kante Dekor 2 · 1 mm: [\d,]+ m/);
    assert.match(await p.textContent('.bomsum'), /Kante Eiche hell · 1 mm: [\d,]+ m/);
    const before = await p.textContent('table.bom tbody tr:first-child td:nth-child(9)');
    await p.check('#ededuct');
    const after = await p.textContent('table.bom tbody tr:first-child td:nth-child(9)');
    const nums = (t) => t.split('×').map((x) => parseFloat(x.trim().replace(',', '.')));
    assert.deepStrictEqual(nums(after), [nums(before)[0] - 1, nums(before)[1] - 1]);
    await p.uncheck('#ededuct');
    // CSV
    const [csv] = await Promise.all([p.waitForEvent('download'), p.click('#lcsv')]);
    const text = fs.readFileSync(await csv.path(), 'utf8');
    assert.match(text, /^﻿"Pos";"Anzahl";"Bezeichnung"/);
    assert.match(text, /\n2;4;"kp1_-_Oberboden"/);
    assert.match(text, /"Kante L1";"Kante L2";"Kante B1";"Kante B2";"Kantendicke mm";"Kantenband m"/);
    assert.match(text, /\n1;1;[^\n]*;"Dekor 2";;;"Eiche hell";1;/);
    // Zuschnittplan
    await p.click('[data-ltab="cut"]');
    await p.waitForSelector('svg.sheet');
    assert.strictEqual(await p.$$eval('svg.sheet .pt', (x) => x.length), 6);
    // Projekt speichern, Liste leeren, Projekt öffnen → Teile und Anzahl wieder da
    await p.click('[data-page="pgmx"]');
    const [proj] = await Promise.all([p.waitForEvent('download'), p.click('#projsave')]);
    assert.match(proj.suggestedFilename(), /\.s2m$/);
    const file = await proj.path();
    await p.click('#clear');
    await p.waitForSelector('.empty');
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#projopen')]);
    await chooser.setFiles({ name: 'projekt.s2m', mimeType: 'application/json', buffer: fs.readFileSync(file) });
    await p.waitForFunction(() => document.querySelectorAll('.part').length === 3);
    assert.strictEqual(await p.textContent('#ptn-lists'), '6');
    await p.click('[data-page="lists"]');
    await p.click('[data-ltab="bom"]');
    assert.strictEqual(await p.textContent('table.bom tbody tr:first-child .et'), 'L1 D2 · B2 D1');
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Zuschnittplan von Hand verschieben, als PDF speichern; eigene Farbe mit Namen', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const fs = require('fs');
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.click('[data-page="lists"]');
    await p.click('[data-ltab="cut"]');
    await p.waitForSelector('svg.sheet g.cp');
    // Zoom: Vorgabe 70 %, kleiner/größer/einpassen ändert die Breite der Zeichnung
    assert.strictEqual(await p.textContent('#czoomv'), '70 %');
    const sw = () => p.$eval('#cutsheets svg.sheet', (e) => e.getBoundingClientRect().width);
    const w70 = await sw();
    await p.click('[data-czoom="-1"]');
    assert.strictEqual(await p.textContent('#czoomv'), '60 %');
    assert.ok((await sw()) < w70);
    await p.click('[data-czoom="fit"]');
    assert.strictEqual(await p.textContent('#czoomv'), '100 %');
    assert.ok((await sw()) > w70);
    // Schrift: eigener Zoom, Beschriftung um die Teilmitte vergrößert
    assert.strictEqual(await p.textContent('#cfontv'), '100 %');
    await p.click('[data-cfont="1"]');
    await p.click('[data-cfont="1"]');
    assert.strictEqual(await p.textContent('#cfontv'), '120 %');
    assert.ok((await p.$$eval('#cutsheets .plab', (x) => x.map((g) => g.getAttribute('transform') || ''))).every((t) => /scale\(1\.2\)/.test(t)));
    await p.click('[data-cfont="-1"]');
    await p.click('[data-cfont="-1"]');
    assert.ok(!(await p.$eval('#cutsheets .plab', (g) => g.getAttribute('transform') || '')).includes('scale'));
    // Schnittfolge an: Streifen-Nummern am Rand der Platten
    assert.ok((await p.$$eval('#cutsheets .strips .sm', (x) => x.length)) >= 1);
    // Übersicht: Platten insgesamt = Summe der Gruppen
    const ov = await p.$eval('.cutover', (e) => ({ h: e.querySelector('h3').textContent, sum: e.querySelector('tfoot .big').textContent,
      rows: Array.from(e.querySelectorAll('tbody .big')).map((x) => +x.textContent) }));
    assert.strictEqual(ov.rows.reduce((a, b) => a + b, 0), +ov.sum);
    assert.match(ov.h, new RegExp('^Übersicht ' + ov.sum + ' Platten? zu schneiden'));
    assert.strictEqual(+ov.sum, await p.$$eval('#cutsheets svg.sheet', (x) => x.length));
    // Platte ganz ins Bild holen (sie ist so groß wie das Fenster), dann ein Teil ziehen: an eine freie Stelle rechts unten
    await p.$eval('svg.sheet', (e) => e.scrollIntoView({ block: 'end' }));
    const g = await p.$('svg.sheet g.cp');
    const uid = await g.getAttribute('data-uid');
    const svg = await p.$('svg.sheet');
    const sb = await svg.boundingBox();
    const gb = await g.boundingBox();
    await p.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await p.mouse.down();
    await p.mouse.move(sb.x + sb.width - gb.width / 2 - 8, sb.y + sb.height * 0.72, { steps: 8 }); // Teile beginnen oben links → unten rechts frei
    await p.mouse.up();
    await p.waitForSelector('[data-cutreset]');
    assert.match(await p.textContent('.cutgrp h3'), /von Hand angeordnet/);
    // Schnittfolge (nummerierte Linien) und Teileliste je Platte
    assert.ok(await p.$$eval('svg.sheet .cuts line', (x) => x.length) > 3);
    assert.match(await p.textContent('table.sheetlist'), /Nr\..*Bezeichnung.*Stk\./);
    const moved = await p.$eval('svg.sheet g.cp[data-uid="' + uid + '"] rect', (r) => +r.getAttribute('x'));
    assert.ok(moved > 1500, 'nach rechts verschoben: ' + moved);
    // auf ein anderes Teil ziehen geht nicht (bleibt liegen)
    const parts = await p.$$('svg.sheet g.cp');
    const a = await parts[0].boundingBox();
    const b = await parts[1].boundingBox();
    const before = await p.$eval('svg.sheet', (s) => s.innerHTML);
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await p.mouse.down();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
    await p.mouse.up();
    await p.waitForTimeout(100);
    assert.strictEqual(await p.$eval('svg.sheet', (s) => s.innerHTML), before);
    // Klick wählt, ↻ dreht (Maße getauscht)
    const sel = await p.$('svg.sheet g.cp[data-uid="' + uid + '"]');
    const dims0 = await sel.$eval('rect', (r) => [+r.getAttribute('width'), +r.getAttribute('height')]);
    await sel.click();
    await p.waitForSelector('.cutsel [data-cutrot]');
    await p.click('.cutsel [data-cutrot]');
    const dims1 = await p.$eval('svg.sheet g.cp[data-uid="' + uid + '"] rect', (r) => [+r.getAttribute('width'), +r.getAttribute('height')]);
    assert.deepStrictEqual(dims1, [dims0[1], dims0[0]]);
    // PDF als Datei
    const [pdf] = await Promise.all([p.waitForEvent('download'), p.click('#lpdf')]);
    assert.strictEqual(pdf.suggestedFilename(), 'zuschnittplan.pdf');
    const head = fs.readFileSync(await pdf.path(), 'latin1');
    assert.match(head, /^%PDF-1\.4/);
    assert.match(head, /Zuschnittplan/);
    // automatisch anordnen
    await p.click('[data-cutreset]');
    assert.ok(!(await p.$('[data-cutreset]')));
    // Faserrichtung je Position: quer → Teil im Plan gedreht; Stückliste als PDF
    await p.click('[data-ltab="bom"]');
    await p.selectOption('[data-bomgrain="0"]', 'cross');
    const [bpdf] = await Promise.all([p.waitForEvent('download'), p.click('#lpdf')]);
    assert.strictEqual(bpdf.suggestedFilename(), 'stueckliste.pdf');
    assert.match(fs.readFileSync(await bpdf.path(), 'latin1'), /Stückliste|St\xfcckliste/);
    await p.click('[data-ltab="cut"]');
    const rot = await p.$eval('svg.sheet g.cp[data-uid^="1#"] title', (t) => t.textContent);
    assert.match(rot, /gedreht/);
    // eigene Farbe mit Namen → in Stückliste und Auswahl
    await p.click('[data-page="model"]');
    await p.click('#mboard');
    await p.fill('.bpick .ownname', 'Egger U999');
    await p.click('.bpick [data-bown]');
    assert.match(await p.textContent('#mboard'), /Egger U999/);
    assert.match(await p.textContent('.bpick'), /Eigene Farben.*Egger U999/);
    await p.keyboard.press('Escape');
    await p.click('[data-page="lists"]');
    await p.click('[data-ltab="bom"]');
    assert.match(await p.textContent('table.bom'), /Egger U999/);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: im claude.ai-Artifact (Drucken gesperrt) speichern die Druck-Knöpfe ein PDF', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    // Fähigkeit „downloads“ wie im Artifact nachbilden; window.print darf nicht aufgerufen werden
    await p.addInitScript(() => {
      window.__saved = [];
      window.claude = { use: async () => ({ save: async (o) => { window.__saved.push(o.filename + ':' + (o.data && o.data.size)); } }) };
      window.print = () => { window.__printed = true; };
    });
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.click('[data-page="lists"]');
    await p.click('#lprintbtn');
    await p.click('[data-ltab="cut"]');
    await p.click('#lprintbtn');
    await p.waitForFunction(() => window.__saved.length === 2);
    const saved = await p.evaluate(() => window.__saved);
    assert.match(saved[0], /^stueckliste\.pdf:\d{3,}/);
    assert.match(saved[1], /^zuschnittplan\.pdf:\d{3,}/);
    assert.ok(!(await p.evaluate(() => window.__printed)));
    // Möbel 3D: PDF mit Bild
    await p.click('[data-page="model"]');
    await p.waitForFunction(() => document.querySelectorAll('#mlabelwrap .mlab').length >= 3, null, { timeout: 60000 });
    await p.click('#mpdf');
    await p.waitForFunction(() => window.__saved.length === 3);
    assert.match((await p.evaluate(() => window.__saved))[2], /^moebel_3d\.pdf:\d{4,}/);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Kanten nach Regeln vorbelegen und Sägemodus Schritt für Schritt', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    await p.click('#clear');
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#pick')]);
    await chooser.setFiles(fixture('schrank3.step'));
    await p.waitForFunction(() => document.querySelectorAll('.part').length === 10, null, { timeout: 60000 });
    await p.click('[data-page="lists"]');
    await p.click('[data-ltab="bom"]');
    const edgesBy = () => p.$$eval('table.bom tbody tr', (rs) => Object.fromEntries(rs.map((r) => [r.querySelector('td:nth-child(3) b').textContent.split(',')[0],
      r.querySelector('.et').textContent + (r.querySelector('.eauto') ? ' R' : '')])));
    // Standardregeln: Türen ringsum, Rückwand keine, alle übrigen die Vorderkante im Möbel (−Y)
    let e = await edgesBy();
    assert.strictEqual(e.KP_1_Tuer_1_W1000_ST9, 'L1 D1 · L2 D1 · B1 D1 · B2 D1 R');
    assert.strictEqual(e.KP_1_RW_U708_ST9, ' R');
    assert.strictEqual(e.KP_1_SW_L_U708_ST9, 'L1 D1 R');
    assert.strictEqual(e.KP_1_OB_U708_ST9, 'L1 D1 R');
    // Regel ändern: Türen mit Dekor 2; von Hand gesetzte Kanten gehen vor
    await p.click('#erules');
    await p.selectOption('[data-er="0"][data-f="deco"]', '2');
    e = await edgesBy();
    assert.strictEqual(e.KP_1_Tuer_2_W1000_ST9, 'L1 D2 · L2 D2 · B1 D2 · B2 D2 R');
    const k = await p.$$eval('table.bom tbody tr', (rs) => rs.findIndex((r) => r.textContent.includes('KP_1_RW')));
    await p.click(`[data-bomedge="${k}"][data-side="l1"]`);
    e = await edgesBy();
    assert.strictEqual(e.KP_1_RW_U708_ST9, 'L1 D1');
    await p.click('#erreset');
    e = await edgesBy();
    assert.strictEqual(e.KP_1_RW_U708_ST9, ' R');
    // Sägemodus: Platte U708 19 mm – Anschnitt, Streifen, …, am Ende alle Teile fertig
    await p.click('[data-ltab="saw"]');
    await p.waitForSelector('#sawview .sawcard');
    const opts = await p.$$eval('#sawsheet option', (o) => o.map((x) => x.textContent));
    const i19 = opts.findIndex((t) => /U708 ST9 19 mm/.test(t));
    await p.selectOption('#sawsheet', { index: i19 });
    assert.match(await p.textContent('.sawcard .sk'), /Anschnitt/);
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    assert.match(await p.textContent('.sawcard .sk'), /Streifen/);
    assert.match(await p.textContent('.sawcard .fl'), /Anschlag einstellen/);
    assert.match(await p.textContent('.sawcard .big'), /^\d+(,\d)?mm$/);
    // Streifen: Nummern am Plattenrand, aktueller hervorgehoben, auf der Karte „Streifen n/N“
    assert.ok((await p.$$eval('#sawview .strips .sm', (x) => x.length)) >= 2);
    assert.match(await p.textContent('.sawcard .sstrip'), /^Streifen 1\/\d+$/);
    assert.strictEqual(await p.textContent('#sawview .strips .sm.cur .st'), '1');
    // Beschriftung: Nr., Maß und Name an jedem Teil
    assert.ok((await p.$$eval('#sawview .plab', (x) => x.map((g) => g.textContent))).every((t) => /^Nr\. \d+/.test(t) && /×/.test(t)));
    await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    let kinds = new Set();
    let pops = 0;
    for (let n = 0; n < 60 && !(await p.isDisabled('[data-saw="next"]')); n++) {
      if (await p.$('.sawpop')) {
        // fertiges Teil: Etikett-Fenster, Tippen druckt das Etikett
        pops++;
        if (pops === 1) {
          await p.click('.sawtile');
          assert.strictEqual(await p.evaluate(() => window.__printed), 1);
          assert.match(await p.textContent('#printarea'), /KP_1_/);
          assert.match(await p.textContent('.sawtile'), /gedruckt/);
        }
        await p.click('[data-saw="popclose"]');
        continue;
      }
      kinds.add(await p.textContent('.sawcard .sk'));
      await p.click('[data-saw="next"]');
    }
    if (await p.$('.sawpop')) await p.click('[data-saw="popclose"]');
    assert.ok(pops >= 3, 'Etikett-Fenster ' + pops);
    assert.ok(kinds.has('Nachschnitt'), [...kinds].join(', '));
    assert.match(await p.textContent('.sawcard'), /ist geschnitten/);
    // Übersicht: diese Platte abgehakt
    assert.match(await p.textContent('.sawover .so-t'), /^1 \/ \d+ Platten geschnitten/);
    assert.strictEqual(await p.$$eval('.sawover .so-s.done', (x) => x.length), 1);
    assert.ok(await p.$eval('.sawover .so-s.cur', (e) => e.classList.contains('done')));
    // fertige Teile sind aus der Zeichnung verschwunden
    assert.strictEqual(await p.$$eval('#sawview svg.sheet rect.pt', (x) => x.length), 0);
    await p.keyboard.press('ArrowLeft');
    assert.ok(!(await p.isDisabled('[data-saw="next"]')));
    // Schnittfolge einstellen: ohne Anschnitt quer, erst alle Streifen, Restmaß zeigen
    await p.click('[data-saw="cfg"]');
    await p.uncheck('[data-sawcfg="trimCross"]');
    await p.uncheck('[data-sawcfg="labelPopup"]');
    await p.selectOption('[data-sawcfg="order"]', 'strips');
    await p.selectOption('[data-sawcfg="measure"]', 'remain');
    const seq = [];
    for (let n = 0; n < 40 && !(await p.isDisabled('[data-saw="next"]')); n++) { seq.push(await p.textContent('.sawcard .sk')); await p.click('[data-saw="next"]'); }
    assert.strictEqual(seq.filter((x) => x === 'Anschnitt').length, 1);
    const lastStrip = seq.lastIndexOf('Streifen');
    const firstCross = seq.findIndex((x) => /Querschnitt/.test(x));
    assert.ok(lastStrip >= 0 && firstCross > lastStrip, seq.join(', '));
    await p.click('[data-saw="reset"]');
    // Zoom Platte (CSS) und Schrift (neu gezeichnet)
    const sh = () => p.$eval('#sawview svg.sheet', (e) => e.getBoundingClientRect().height);
    const h100 = await sh();
    await p.click('[data-szoom="-1"]');
    await p.click('[data-szoom="-1"]');
    assert.strictEqual(await p.textContent('#szoomv'), '80 %');
    assert.ok((await sh()) < h100);
    await p.click('[data-szoom="1"]');
    await p.click('[data-szoom="1"]');
    await p.click('[data-sfont="1"]');
    assert.strictEqual(await p.textContent('#sfontv'), '110 %');
    assert.match(await p.$eval('#sawview .plab', (g) => g.getAttribute('transform') || ''), /scale\(1\.1\)/);
    await p.click('[data-sfont="-1"]');
    await p.keyboard.press('ArrowRight');
    assert.match(await p.textContent('.sawcard .fl'), /Restmaß/);
    // Vollbild mit F, zurück mit Esc
    await p.keyboard.press('f');
    assert.ok(await p.$eval('#sawview', (e) => e.classList.contains('sawfull')));
    await p.keyboard.press('Escape');
    assert.ok(!(await p.$eval('#sawview', (e) => e.classList.contains('sawfull'))));
    await p.click('[data-saw="cfgreset"]');
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Web-Tool: Teil in der Stückliste anlegen und löschen, Plattenformat je Material und je Platte', { skip: !chromium && 'Playwright nicht installiert' }, async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(page);
    await p.waitForSelector('.part');
    const n0 = await p.$$eval('.part', (x) => x.length);
    await p.click('[data-page="lists"]');
    await p.click('[data-ltab="bom"]');
    // neues Teil: Rechteck als Platte, mit Anzahl und Material → Programm nur Formatfräsen
    await p.click('#bomnewbtn');
    await p.fill('#np-name', 'Fachboden extra');
    await p.fill('#np-L', '700');
    await p.fill('#np-W', '350');
    await p.fill('#np-T', '19');
    await p.fill('#np-qty', '3');
    await p.click('#np-add');
    assert.strictEqual(await p.$$eval('.part', (x) => x.length), n0 + 1);
    const row = await p.$$eval('table.bom tbody tr', (rs) => rs.map((r) => r.textContent).find((t) => /Fachboden_extra/.test(t)));
    assert.match(row, /700\s*350\s*19/);
    assert.strictEqual(await p.$eval('table.bom tbody tr:last-child [data-bomqty]', (e) => e.value), '3');
    // löschen: erster Klick fragt, zweiter löscht
    const k = await p.$$eval('table.bom tbody tr', (rs) => rs.findIndex((r) => /Fachboden_extra/.test(r.textContent)));
    await p.click(`[data-bomdel="${k}"]`);
    assert.match(await p.textContent(`[data-bomdel="${k}"]`), /Löschen\?/);
    assert.strictEqual(await p.$$eval('.part', (x) => x.length), n0 + 1);
    await p.click(`[data-bomdel="${k}"]`);
    assert.strictEqual(await p.$$eval('.part', (x) => x.length), n0);
    assert.ok(!(await p.textContent('table.bom')).includes('Fachboden_extra'));
    // Plattenformat je Material: neu angeordnet, in der Übersicht
    await p.click('[data-ltab="cut"]');
    await p.waitForSelector('svg.sheet');
    await p.fill('[data-gfmt][data-f="L"] >> nth=0', '2500');
    await p.press('[data-gfmt][data-f="L"] >> nth=0', 'Enter');
    assert.match(await p.textContent('.cutover tbody tr'), /2500 × 2070/);
    assert.ok(await p.$('[data-gfmtreset]'));
    // einzelne Platte: leere Platte anhängen und als Reststück 1200 × 800 – Teile, die nicht passen, verhindern das Verkleinern
    await p.click('[data-cutadd] >> nth=0');
    const last = await p.$$eval('#cutsheets .cutover + .cutgrp .sheetfig', (x) => x.length - 1);
    const inp = (f, i) => `#cutsheets .cutover + .cutgrp [data-sfmt][data-si="${i}"][data-f="${f}"]`;
    await p.fill(inp('L', last), '1200');
    await p.press(inp('L', last), 'Enter');
    await p.fill(inp('W', last), '800');
    await p.press(inp('W', last), 'Enter');
    assert.match(await p.textContent('.cutover tbody tr'), /2500 × 2070, 1200 × 800/);
    assert.strictEqual(await p.$eval(`#cutsheets .cutover + .cutgrp .sheetfig >> nth=${last}`, (e) => e.querySelector('svg.sheet').getAttribute('aria-label')), 'Platte ' + (last + 1) + ' 1200 × 800');
    await p.fill(inp('W', 0), '200');
    await p.press(inp('W', 0), 'Enter');
    assert.match(await p.textContent('#toast'), /Passt nicht/);
    assert.strictEqual(await p.$eval(inp('W', 0), (e) => e.value), '2070');
    await p.click('[data-gfmtreset]');
    assert.ok(!(await p.$('[data-gfmtreset]')));
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// Dekor-Bibliothek (PHP auf dem Webspace): eingebauter PHP-Server mit web/ + tools/webserver/dekore in einem Testordner
const { execFileSync, spawn } = require('child_process');
let hasPhp = false;
try { execFileSync('php', ['-v'], { stdio: 'ignore' }); hasPhp = true; } catch (e) { /* ohne PHP überspringen */ }
test('Dekor-Bibliothek: Passwort, Hochladen, Bearbeiten – Step2Maestro übernimmt Namen per Code', { skip: (!chromium && 'Playwright nicht installiert') || (!hasPhp && 'PHP nicht installiert') }, async () => {
  const fs = require('fs');
  const os = require('os');
  const zlib = require('zlib');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's2m-dek-'));
  const root = path.join(__dirname, '..');
  fs.cpSync(path.join(root, 'web'), path.join(dir, 'app'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'app', 'dekore'));
  for (const f of ['api.php', 'index.html']) fs.copyFileSync(path.join(root, 'tools', 'webserver', 'dekore', f), path.join(dir, 'app', 'dekore', f));
  // kleines PNG (einfarbig grau, 64 × 32) als Dekorbild U708_ST9.png
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (~c) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const W = 64, H = 32;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = 200; raw[o + 2] = 196; }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  const img = path.join(dir, 'U708_ST9.png');
  fs.writeFileSync(img, png);
  const port = 18000 + Math.floor(Math.random() * 2000);
  const srv = spawn('php', ['-S', '127.0.0.1:' + port, '-t', dir], { stdio: 'ignore' });
  const browser = await chromium.launch();
  try {
    await new Promise((r) => setTimeout(r, 600));
    const p = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    const base = 'http://127.0.0.1:' + port + '/app/';
    await p.goto(base + 'dekore/');
    // erstes Passwort, dann Bild hochladen (Code aus dem Dateinamen), Namen eintragen
    await p.waitForSelector('#setup:not([hidden])');
    await p.fill('#pw1', 'werkstatt1');
    await p.fill('#pw2', 'werkstatt1');
    await p.click('#setupform button');
    await p.waitForSelector('#upload:not([hidden])');
    await p.setInputFiles('#files', img);
    await p.waitForSelector('.dek[data-key="U708_ST9"]');
    await p.click('.dek[data-key="U708_ST9"]');
    await p.fill('#f_name', 'Lichtgrau');
    await p.click('#save');
    await p.waitForFunction(() => document.querySelector('#grid').textContent.includes('Lichtgrau'));
    // ohne Anmeldung keine Änderung möglich
    const anon = await (await fetch(base + 'dekore/api.php', { method: 'POST', body: new URLSearchParams({ a: 'delete', key: 'U708_ST9' }) })).json();
    assert.strictEqual(anon.ok, false);
    const list = await (await fetch(base + 'dekore/api.php?a=list')).json();
    assert.deepStrictEqual(list.dekore.map((d) => [d.code, d.name]), [['U708 ST9', 'Lichtgrau']]);
    assert.ok(/^#[0-9a-f]{6}$/.test(list.dekore[0].color) && list.dekore[0].bild);
    // Step2Maestro über http: Bauteile „… (U708 ST9)“ bekommen das Dekor aus der Bibliothek
    await p.goto(base);
    await p.waitForSelector('.part');
    await p.click('#clear');
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#pick')]);
    await chooser.setFiles(fixture('schrank3.step'));
    await p.waitForFunction(() => document.querySelectorAll('.part').length === 10, null, { timeout: 60000 });
    await p.click('[data-page="lists"]');
    await p.click('[data-ltab="bom"]');
    await p.waitForFunction(() => document.querySelector('#bomview').textContent.includes('U708 ST9 Lichtgrau'));
    assert.ok((await p.textContent('#bomview')).includes('W1000 ST9')); // nicht in der Bibliothek: wie bisher
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
    srv.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
