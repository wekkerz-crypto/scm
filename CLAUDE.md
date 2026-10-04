# STEP → XCS für SCM Maestro – Hinweise für die Arbeit am Projekt

Ausgangsbasis (Tag `basis-1.0`) für weitere Projekte rund um SCM Xilog Maestro, X-Konverter und 5-Achs-Maschine.
Benutzer und Werkstatt sprechen Deutsch: Oberfläche, Hinweise, README und Commit-Nachrichten auf Deutsch.

## Aufbau

- `web/index.html` – ganzes Web-Tool (CSS + JS inline), läuft offline; Module in `web/js/` (UMD, Browser und Node):
  `step.js` (STEP lesen), `panel.js` (Erkennung), `xcs.js` (Planung + Programm), `convert.js` (Namen, .bat),
  `toolpath.js` (Animation), `tools.js` (.tlgx). `tools-default.js` und `sample.js` erzeugt `node tools/build_defaults.js`.
- `web/js/view3d.js` – 3D-Ansicht (three.js + OpenCascade/occt-import-js aus `web/js/vendor`, lädt bei Bedarf);
  Bewegungen tragen dafür `pts3`/`ax3`/`disc` (5-Achs entlang Rundungen: `ax3s` je Punkt, Kugelfräser: `ball`) aus
  `toolpath.js`, Teile `panel.tf` (Modell → Plattenkoordinaten).
- Gekrümmte Flächen (je Teil `overrides.curved = {slant, surface}`, Schalter nur sichtbar, wenn erkannt):
  `panel.curvedSlants` (Schräge an Rundungen → `slantpath`, `offsetRun` in `xcs.js`) und `panel.curvedSurfaces`
  (→ `surface`: `surface.js` Drop-Cutter auf dem Netz aus `occtmesh.js`; Node: `OcctMesh.loadNode()`, Browser: `View3D.load()`).
  Zylinder (liegend, konvex) zusätzlich `cyl` → `cyl4` (4-Achs, eine geneigte Ebene je Zeile, `cyl4Plan` in `xcs.js`).
- Kantenrundungen bis R 5,5 an Kontur/Durchbruch: `panel.edgeRounds` → Kontur-Ops `edge-…` (`profile: true`, Radiusfräser
  E061 oben / E060 unten, keine Zustellung).
- Zweiseitig (je Teil `overrides.twoSided`, nur wenn `panel.bottom`): `convertSolid` rechnet die Gegenseite
  (`PanelAnalyzer.turnOverY`, um Y gewendet) mit – ihre offenen Stellen sperren die Sauger (`openZones` → `avoid`);
  Ergebnis `side2` (`write(…, { side: 2 })`: nur Bearbeitungen von unten, Rohteil ohne Versatz), Dateien `_S1`/`_S2`,
  Überschreibungen Seite 2 in `overrides2`. Löschen: `overrides.suppress` (Gruppen) → `result.suppressed`.
- Werkstück-Profile: `settings.profiles` (5 × {name, values}), Schlüssel `XcsWriter.PROFILE_KEYS`; Teil `part.profile`
  → `convertSolid(…, { profile })` legt `applyProfile` über die Einstellungen (Reihenfolge: Einstellung < Profil < Teil).
- DXF (2D): `dxf.js` (`DxfReader.analyze`, ohne Layer; größte Kontur = Teil, Vorschläge je Kontur mit stabiler `id`)
  → `convertDxf` in `convert.js`; Änderungen je Teil in `overrides.dxf = {T, features: {id: {kind, depth}}}`, Drehen über
  `orientation.rot`. Test-DXF: `node tools/make_dxf.js`.
- Oszillieren/Schleifen: `op.osc = {min, max}` (Tiefen ab Oberseite) → `oscillate()` in `xcs.js` teilt die Kontur an den
  Wendepunkten, je Punkt `SetAttribute("DEPTH")`; `fmtOp.osc` (Einstellung `oscMill`), Schleifen = Op `sand` (Kategorie
  `sand`, Werkzeugart `sand` = SandMill, An-/Abfahrt im Bogen, `passes`, Schleifzugabe → `finishAllowance` am Formatfräsen).
- Clamex: `findClamex` in `panel.js` (Zylinder R 40–60 hohl + zwei Wände ⟂ Achse, Abstand 3–12) → `panel.clamex`
  `{c, a, n, r, w, depth, chord}`; `clamexPlan` in `xcs.js` wählt Ebene (Top bzw. Kante) und Bahn, Op `clamex-i`.
- Schnittwerte: `tools.js` liest je Werkzeug `tech = {feed, rot, descent}` (je [Standard, min, max]); je Teil/Seite
  `overrides.tech = {Gruppe: {feed, rot, descent}}` → `S3`/`SD` in `xcs.js` (sonst `-1` = Werkzeugdatei).
- Etiketten (Browser-Druck): `labelHtml`/`labelSketch`/`openLabels` in `index.html`, Einstellungen `label*` (40 × 60 mm);
  gedruckt wird nur `#printarea` mit `@page` in Etikettgröße (`#labelpage`), schwarz-weiß für Thermodrucker.
- `exe/` – kleine Windows-.exe (Go), bettet `web/` ein und öffnet es im Browser; bauen mit `npm run build:exe` → `dist/`.
- `cli/step2xcs.js` – Kommandozeile. `test/` – `npm test` (node:test; UI-Tests mit Playwright, werden ohne übersprungen).
- `maestro/doku/Maestro_MSL_KI_Referenz.pdf` – Handbuch der Script-Sprache; Befehlsparameter **immer** dort prüfen
  (`pdftotext -layout`). `maestro/beispiele/*.xcs` – Programme aus der Werkstatt, in Maestro bestätigt.

## Regeln

- Koordinaten wie Maestro: Ursprung vorne links unten, X = Länge, Y = Breite, Z = Dicke. Kanten-Ebenen
  Left/Right/Front/Back: lokales X waagerecht, Y = Höhe ab Unterseite (Left: X = B − y, Right: X = y, Back: X = L − x).
- Schräge Ebenen: `CreateWorkplane(name, X0, Y0, Z0, Drehung Z, Neigung X)` – erst um Z, dann um die neue X-Achse.
- Sauger: Vorschlag in `xcs.js` (`planSuction`), Codes/Maße in den Einstellungen; Auflagefläche `panel.base` (Unterseite).
- Werkstatt-Vorgaben: Feld IJ (X ≤ 1300) / IL; bei Y > 620 AB / AD. X-Konverter
  `C:\Program Files\SCM Group\Maestro\XConverter.exe`, Werkzeuge `C:\Users\Public\Documents\SCM Group\Maestro\Tlgx\def.tlgx`.
- Teilenamen: aus der STEP (bei „Part 1“ o. Ä. Dateiname), Umlaute umschreiben, Leerzeichen → `_`, gleich für .xcs und .pgmx.
- Farben der Bearbeitungsarten sind eine feste, validierte Palette (Tokens `--drill`, `--pocket`, `--mill`, `--saw`,
  `--chamfer`, `--sdrill`, `--hdrill`); nicht umfärben, ohne neu zu validieren.
- Nach Änderungen: `npm test`; Ausgabe aller Testteile vorher/nachher vergleichen (nur gewollte Unterschiede);
  Oberfläche mit Playwright-Screenshot hell und dunkel ansehen.
- Noch nicht in Maestro bestätigte Befehle stehen im README unter „Noch zu prüfen an der Maschine“ – dort pflegen.
