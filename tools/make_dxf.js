#!/usr/bin/env node
/*
 * Erzeugt die DXF-Testteile in test/fixtures (Handarbeit, ohne Bibliothek): node tools/make_dxf.js
 *   platte.dxf – 600 × 400 mit gerundeter Ecke (LWPOLYLINE mit bulge), Bohrungen Ø8/Ø35, Rundloch Ø50,
 *   Rechteck-Durchbruch aus LINEs, Langloch (Polylinie mit Bögen), Block mit Ø5, Ellipse, Text, Maß und eine offene Linie.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const out = [];
const put = (...kv) => { for (let i = 0; i < kv.length; i += 2) out.push(String(kv[i]), String(kv[i + 1])); };

put(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
// Block: Bohrung Ø5 um den Basispunkt
put(0, 'SECTION', 2, 'BLOCKS');
put(0, 'BLOCK', 8, '0', 2, 'BOHR5', 70, 0, 10, 0, 20, 0, 30, 0);
put(0, 'CIRCLE', 8, '0', 10, 0, 20, 0, 30, 0, 40, 2.5);
put(0, 'ENDBLK', 8, '0');
put(0, 'ENDSEC');

put(0, 'SECTION', 2, 'ENTITIES');
// Außenkontur: hinten rechts Ecke R20 (bulge tan(90°/4))
const b = Math.tan(Math.PI / 8);
put(0, 'LWPOLYLINE', 8, 'Kontur', 90, 5, 70, 1);
put(10, 0, 20, 0);
put(10, 600, 20, 0);
put(10, 600, 20, 380, 42, b.toFixed(10));
put(10, 580, 20, 400);
put(10, 0, 20, 400);
// Bohrungen Ø8 (Sackloch) und Ø35 (Topf)
for (const [x, y] of [[50, 50], [550, 50], [50, 350]]) put(0, 'CIRCLE', 8, 'Bohr', 10, x, 20, y, 30, 0, 40, 4);
put(0, 'CIRCLE', 8, 'Bohr', 10, 100, 20, 200, 30, 0, 40, 17.5);
// Rundloch Ø50 (kein Bohrer)
put(0, 'CIRCLE', 8, 'Loch', 10, 300, 20, 300, 30, 0, 40, 25);
// Rechteck-Durchbruch 120 × 80 aus Einzellinien (gemischte Richtung)
const L = (x1, y1, x2, y2) => put(0, 'LINE', 8, 'Loch', 10, x1, 20, y1, 30, 0, 11, x2, 21, y2, 31, 0);
L(200, 60, 320, 60); L(320, 140, 320, 60); L(320, 140, 200, 140); L(200, 60, 200, 140);
// Langloch 100 × 20 als Polylinie mit Halbkreisen
put(0, 'LWPOLYLINE', 8, 'Loch', 90, 4, 70, 1);
put(10, 410, 20, 190);
put(10, 490, 20, 190, 42, 1);
put(10, 490, 20, 210);
put(10, 410, 20, 210, 42, 1);
// Block-Bohrung Ø5
put(0, 'INSERT', 8, 'Bohr', 2, 'BOHR5', 10, 520, 20, 320, 30, 0);
// Ellipse 60 × 30 (Mittelpunkt 400/320)
put(0, 'ELLIPSE', 8, 'Loch', 10, 400, 20, 320, 30, 0, 11, 30, 21, 0, 31, 0, 40, 0.5, 41, 0, 42, 2 * Math.PI);
// Text, Maß, offene Linie
put(0, 'TEXT', 8, 'Text', 10, 10, 20, 10, 30, 0, 40, 5, 1, 'Platte');
put(0, 'DIMENSION', 8, 'Mass', 10, 0, 20, -20, 30, 0);
L(-50, -50, -10, -50);
put(0, 'ENDSEC', 0, 'EOF');

const file = path.join(__dirname, '..', 'test', 'fixtures', 'platte.dxf');
fs.writeFileSync(file, out.join('\r\n') + '\r\n');
console.log('geschrieben:', file);
