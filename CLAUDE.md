# Weckwop (früher Step2Maestro / STEP → XCS für SCM Maestro) – Hinweise für die Arbeit am Projekt

Ausgangsbasis (Tag `basis-1.0`) für weitere Projekte rund um SCM Xilog Maestro, X-Konverter und 5-Achs-Maschine.
Benutzer und Werkstatt sprechen Deutsch: Oberfläche, Hinweise, README und Commit-Nachrichten auf Deutsch.

## Aufbau

- `web/index.html` – nur Seitenaufbau (HTML), läuft offline; Stil `web/css/step2maestro.css`; Programm der Oberfläche in
  `web/js/app/01-…12-….js` (klassische Skripte, gemeinsamer globaler Bereich – Reihenfolge der `<script>`-Tags einhalten;
  beim Laden nur Funktionen aus derselben oder früheren Dateien aufrufen, Asynchrones wie `loadDecors()` erst in `13-projekte-start.js`):
  01 Grundlagen/Einstellungen, 02 Teile/Sitzung/Projektdatei, 03 Anzeige, 04 Etiketten, 05 Stückliste, 06 Zuschnitt, 07 Sägemodus/Sprache,
  08 PDF/Seiten/Möbel 3D/Material/Dekore, 09 Profile/Ansicht/Animation, 10 Speichern/Ereignisse, 11 Schnittstelle/KI, 12 Zeichnungen, 13 Projekte/Start.
  Module in `web/js/` (UMD, Browser und Node):
  `step.js` (STEP lesen), `panel.js` (Erkennung), `xcs.js` (Planung + Programm), `convert.js` (Namen, .bat),
  `toolpath.js` (Animation), `tools.js` (.tlgx). `tools-default.js` und `sample.js` erzeugt `node tools/build_defaults.js`.
- `web/js/view3d.js` – 3D-Ansicht (three.js + OpenCascade/occt-import-js aus `web/js/vendor`, lädt bei Bedarf);
  Bewegungen tragen dafür `pts3`/`ax3`/`disc` (5-Achs entlang Rundungen: `ax3s` je Punkt, Kugelfräser: `ball`) aus
  `toolpath.js`, Teile `panel.tf` (Modell → Plattenkoordinaten).
- Möbel 3D (Seite oben umschaltbar, `state.page` 'pgmx'/'model'): `web/js/model3d.js` (`Model3D.Viewer`: Baugruppe in
  Modellkoordinaten, Nummern, Ein-/Ausblenden, Transparenz, Explosion `setExplode` (Versatz je Teil `offset`), Wählen,
  Messen mit Fang `snapAt` – Fangpunkte je Teil `snapFeatures` aus den Kanten; Maße aus `local` = ohne Explosion; Bemaßen (`mode` 'dim', `dims`, `addDim`/`drawDims`, SVG `drawDimSvg`) –
  Maße bleiben stehen, Liste `#mdimlist`; `assign` ordnet OpenCascade-Netze über den
  Hüllquader den Bauteilen zu); Nummer = Platz in der Programmliste (`.pnum`).
  Plattenfarbe: `View3D.MATERIALS`/`boardOf` (id oder '#rrggbb', '/u' einfarbig; Kanten nach '|': `EDGES` span/multiplex/mdf
  oder '#rrggbb'; `boardMaterials` → [Oberfläche, Schmalflächen], `boardFrame` = Dicke/lange Seite → Maserung längs L), Einstellung `boardMaterial`, je Teil `part.board`
  (Sitzung), `boardPicker` in `app/08-moebel3d-material.js`, `Viewer.setBoards`.
  Material aus dem Namen: `StepToXcs.materialOf` → `solid.material`, Farbe `solid.color` (`colorsByItem` in `step.js`)
  → `nameBoard` in `app/08-moebel3d-material.js` (Einstellung `boardFromName`), Reihenfolge `part.board` < Name < Einstellung.
  Dekor-Bibliothek: `tools/webserver/dekore/` (`api.php` PHP 8 + GD: list offen (Sitzung nur mit Cookie), setup nur mit Datei `EINRICHTEN`
  (in der ZIP, danach gelöscht), Login mit Sperre je Adresse (`daten/fehlversuche.json`), Ändern unter `lockDb()` + `loadDb(true)`,
  save/upload/delete mit Sitzung + X-CSRF,
  Daten `daten/dekore.json`, Bilder `bilder/KEY.jpg` + `vorschau/`; `index.html` = Verwaltung) → `loadDecors` in `app/08-moebel3d-material.js` (nur http/https)
  → `View3D.setDecors`, Schlüssel 'dek:KEY' (`boardOf` mit tex/thumb/scale, `surfMaterial` Bildtextur), `nameBoard` per `decorKey`.
  Schnitt `setSection` (clippingPlanes in `applyLook`), Bild `snapshot()` (Leinwand + Schilder/Maße nachgezeichnet).
- Listen (`state.page` 'lists'): Stückliste `bomRows` (gleiche Teile zusammengefasst, Anzahl `part.qty`), CSV, Druck A4 `printA4`;
  Kantenband je Teil `part.edges = {l1, l2, b1, b2}` (0/1/2 = keine/Dekor 1/Dekor 2, L1 vorne Y=0, B1 links X=0; alle `lst.edgeMm`
  dick, Namen `lst.edgeName1` (leer = Platte)/`edgeName2`, Farbe `edgeColor2`, `decoName`): `edgeWidget`,
  `edgeMeters`, `edgeDeduct`, Mitte „ringsum“ = `data-side="all"` (`lst.edgeExtra/edgeDeduct`), Etikett `labelSketch(…, edges)`.
  Vorbelegung `autoEdges`/`edgeRuleOf` (`lst.edgeAuto`, `edgeRules` [{match, sides all|front|long|none, deco}], `edgeFront`
  '-y' …; nur ohne `part.edges`), Feld `#erpanel` (`renderEdgeRules`).
  Möbel 3D: Schalter `#medges` (Einstellung `modelEdges`) → `bandsOf` = {m: panel.tf.m, e, c2, hl, hl2} → `boardMaterials(…, bands)`
  (`boardUV`: Gruppe 2 = Schmalflächen mit Dekor 1, 3 = Dekor 2, Seite nach der Normalen in Plattenkoordinaten; hervorheben
  `#medgehl`/`#medgecol`/`#medgecol2` = `modelEdgeHl`/`modelEdgeColor`/`modelEdgeColor2`, eigene Materialfarbe in `userData.tint` –
  `applyLook` lässt sie stehen), `Viewer.setBoards(boards, bands)`.
  Zuschnittplan `web/js/cutplan.js` (`CutPlan.plan`, Guillotine, Schnittfuge/Besäumen/Maserung; `cutSequence` rechnet von der
  besäumten Anfangsseite bis an die ferne Plattenkante (dort Schnitt am Stück); manueller Plan `sig` ohne dir/goal; `dir` auto/long/cross =
  `packFree` bzw. Streifen `packStrips`, `goal` waste/cuts wählt aus Varianten; `cutSequence` mit `dir`; `fits` beim Verschieben
  von Hand → `lst.manual[Gruppe] = {sig, sheets}`; Zoom `lst.cutZoom` → CSS `--cz` an `#cutsheets` (`setCutZoom`, `--ar` je Platte), Schrift `lst.cutFont`/`lst.sawFont`
  (`setCutFont`/`setSawFont` → 4. Parameter von `partLabelSvg`, skaliert um die Teilmitte), Sägemodus-Platte `lst.sawZoom` → `--sz`
  an `#sawview` (Karte schmaler, große Zahl in `cqi` mit `--nl` = Zeichenzahl); Anordnung oben links `cutOpts().fromTop` (y gespiegelt in `plan`), `SAW_CFG.startY` 'back', `seqOf` nimmt die Säge-Einstellungen; Format je Gruppe `lst.groupSheet[key]` (`fmtOf`/`cutOptsOf`, `g.fmt`), je Platte `lst.manual[key].sheets[i].L/W`
  (`data-sfmt`, nur wenn alle Teile passen); Übersicht `cutOverview`/`cutOverviewHtml` (auch
  erste PDF-Seite), im Sägemodus `sawOverHtml` mit `lst.sawDone[key] = sawSig(x)`; Sägemodus `lst.tab` 'saw': `renderSaw`/`sawSteps`/`sawText`/`sawSvg`, Stand
  `lst.saw = {key, step}`, Einstellungen `lst.sawCfg` (`SAW_CFG`: trimLong/trimCross/trimFirst, primary, startX/startY → `flipX`/`flipY`,
  order depth|strips, trims now|strip|end, trimMax/trimPct, restMin, measure piece|remain, labelPopup), Vollbild `sawFull` (Klasse `sawfull`);
  fertige Teile nicht mehr gezeichnet, Beschriftung `partLabelSvg` (auch `sheetSvg`), Etikett-Fenster `sawPop`/`sawPopHtml` →
  `sawPart` (uid id#n → Bauteil über `items[].pp`) → `printLabels`;
  Schnitte mit `level`/`kind`/`size`/`rest`/`side`/`done`/`strip`/`tg`/`sn` aus `cutSequence`, dazu `strips` [{n, region, dir, parts}]
  → Nummern am Rand `stripMarks` (Zuschnittplan, Sägemodus, PDF); Streifen-Etikett `stripLabelHtml`/`stripsOf`/`printStripLabels`
  (Etiketten-Modus `sawLabelMode(cfg)` = `SAW_CFG.labelMode` off|popup|auto, alt `labelPopup`; Umschalter `data-lmode`; auto druckt in `sawGo('next')`
  per `printLabelHtml`; Sägemodus `sawPop.strip`, `SAW_CFG.stripPopup`, `data-saw="striplbl"`; Zuschnittplan `data-striplbl`), Druck allgemein `printLabelHtml`), PDF-Datei über `web/js/pdf.js` (`MiniPdf`, ohne Druckdialog) in `cutPdf`.
  Material in der Stückliste: Knopf je Position `data-bommat`, Auswahl `bomSel` (Set der Bauteile, Haken `data-bomsel`, Umschalt = Bereich
  über `bomLast`, `#bomselall`, `#bomselmat`, `#bomselnone`), Tauschen je Material `data-bomswap`, Auswahl je Material `data-bomselk` –
  alle über `bomBoardPick(anchor, parts, value, learnIt)` → `boardPicker` → `p.board`.
  Gelernte Regeln: `learn` (localStorage `RULES_KEY` = {on, ask, list [{match, board?, edges?, grain?, when}]}, neueste zuerst),
  `learnedOf(p, feld)` in `boardKeyOf` (nach `nameBoard`), `edgesOf` (vor `autoEdges`), `grainOf`; `nameMatches` (gleiche Wortlogik
  wie Kanten-Regeln); Angebot nach Änderung von Hand `learnOffer` → Leiste `.bomlearn` (`learnBarHtml`/`learnBarWire`, Stichwort
  `learnWord`, `learnAdd`), Verwaltung `learnedHtml`/`learnedWire` oben im Feld „Regeln …“ (`#erpanel`); Projektdatei `data.regeln`
  → `mergeLearned` (nur fehlende Stichwörter).
  Neues Bauteil anlegen (Knopf `#bomnewbtn` rechts in `.lbar`, nur Stückliste; Feld `#bomnew`, `renderBomNew`/`addManualPart`): Rechteck als DXF (`rectDxf`) über `addDxf(text, name,
  {T, board, qty})` → nur Formatfräsen; Löschen `data-bomdel` (zweiter Klick).
  Eigene Farben mit Namen: Schlüssel `#rrggbb[/u]~Name`, gemerkt in `settings.customBoards`. Programmläufe `progRuns()` (Teil → Stücklisten-Position, `row.qty` × Zeit; `#pqty` oben im Teil, `.chip.runs`, `.runsum`). Zeit: `Toolpath.estimate`
  (Einstellungen `est*`), `partTime` in `app/03-anzeige.js`. Projektdatei: siehe Projekte.
- Zeichnungen (`state.page` 'drawings', `#drwpage`, Reiter mit Zähler `#ptn-drw`, Adresse `#zeichnungen`): `app/12-zeichnungen.js` –
  `drw` = {list [{id, name, mime, size, data (Data-URL)}], i, page, fit page|width, zoom, over}; IndexedDB `DRW_KEY` (nicht localStorage),
  `drwClean` (nur PDF/PNG/JPG/WebP/GIF), `addDrawingFiles` (auch PDF-Ablegen auf jeder Seite in `10-…`), `drwSet` (applyProject/projNew),
  Projektdatei `data.zeichnungen` (`drwPayload`), `projSig` zählt mit, Projektordner `Zeichnungen/` (`drwBytes`, PHP `rmTree` + `backupWrite`);
  Anzeige pdf.js 3.11 (`js/vendor/pdfjs`, `drwLib` lädt pdf.worker.min.js als Skript = Hauptfaden, auch file://; `isEvalSupported: false`),
  `drwViewHtml(big)`/`drwWire`/`drwPaint` (Leinwand × devicePixelRatio, ≤ 16 MP), `drwGo(±1)` über Dateigrenzen, `drwGoto`; Fenster
  `#drwover` (`drwOverlay`, Esc, Tasten mit Vorrang vor dem Sägemodus) – Sägemodus `data-saw="drw"`/Taste Z, `sawAction('zeichnung_…')` →
  `drwAction`; Sprache drawon/drawoff/pagenext/pageprev/gopage n (offen: next/prev blättern). Reiter oben: 7 Spalten ab 1300 px, sonst umbrechend.
- Projekte (Startseite, `state.page` 'start', `#startpage`, `renderStart`; beim Start immer, außer Adresse `#saegen` … `HASH_PAGES`):
  aktuelles Projekt `proj` (localStorage `step2xcs.project.v1`: id, store 'server'|'local', name, kunde, notiz, basis, sig = `projSig()`
  → `projDirty`/`projMark` (• an `#projsave`), `projLeaveOk`), `projSave`/`projOpen`/`projNew`/`projCopy`/`projDelete`/`projExport`;
  Server `projekte/api.php` (list/get/save mit basis → 409/meta/copy/delete → papierkorb; gzip `*.s2m.gz`; Zugang = Sitzung der
  Dekor-Verwaltung (Cookie-Pfad = Programmordner) oder offen `S2M_OFFEN=1`/Datei `projekte/OFFEN`, X-CSRF), Browser = IndexedDB
  `projekte.v1` + `projekt:<id>`; `srvRefresh` prüft auch `ki/openai.php` (ChatGPT über den Server: `kiSrv`, `aiServer()` →
  SDK mit baseURL `ki/openai.php/v1` + X-CSRF; Schlüssel `OPENAI_API_KEY` bzw. `ki/schluessel.php`; Test-Ziel `S2M_OPENAI_URL`).
  Lesbarer Projektordner: `projFolderFiles(data)` (Projekt.s2m, Info.txt, STEP/, Programme/ + konvertieren.bat, Stueckliste.csv/.pdf
  (`bomPdf(true)`), Zuschnittplan.pdf (`cutPdf(true)`)) → Server `a=ordner` (ZIP ohne Packen, `zipEntries`/`safePath`, Ordner
  `S2M_ORDNER` bzw. `projekte/daten/ordner`, Name = `folderName`, `proj.ordner`, Versionen/ 20 Stände) bzw. Sicherungsordner am PC
  (`backup`, File System Access, Handle in IndexedDB `sicherungsordner`, `backupReady(true)` gleich beim Klick, `backupWrite`).
  STEP aktualisieren: `updateStep(oldFileId, text, label)` (Zuordnung über `stepName`, übernimmt orientation/field/fileName/profile/
  board/qty/grain/edges/overrides/overrides2 und den Namen; fehlende nach Nachfrage weg), Knöpfe `data-stepupd`, Feld `#stepupd`.
  Docker: `tools/docker/` (php:8.3-apache + GD, Volume `/daten` per Symlink an dekore/daten|bilder|vorschau und projekte/daten,
  Vosk beim Bauen), `npm run build:docker`; Pi `einrichten.sh` setzt für http-Adressen `--unsecurely-treat-insecure-origin-as-secure`.
- Projektdatei .s2m (`projectPayload`/`applyProject`, Datei: `saveProject`/`openProject`): `data.session` (Teile) + `data.lists` (`projectLists()`, Schlüssel `PROJECT_LST_KEYS` – Ansicht/Zoom/`sawCfg` bleiben
  am Gerät) + `data.settings` (beim Öffnen Nachfrage, wenn anders; `SETTINGS_LOCAL` = Pfade bleiben); `syncListInputs()` zieht die Felder nach.
- Programm-Schnittstelle `window.Weckwop.api` (`app/11-schnittstelle-ki.js`, `api`): teile_lesen, stueckliste_lesen, zuschnitt_lesen, materialien_lesen,
  teile_aendern, teile_sortieren, teile_loeschen, teil_anlegen, zuschnitt_einstellen, seite_zeigen, saegen_status, saegen_steuern, projekt –
  nur Listendaten und Sägemodus, keine Bearbeitungen.
  KI-Assistent `web/js/assist.js` (`Assist.TOOLS` = gleiche Namen, `validate`, `callTool`; Anbieter `PROVIDERS` – Standard ChatGPT:
  `runOpenAI` = Responses-API `client.responses.create`, Werkzeuge `openaiTools()` (function, strict false), Gespräch `conv.prevId` =
  previous_response_id (bei Fehler/abgeschnitten zurück auf den Stand davor), `reasoning` nur gpt-5+/o-Modelle, Modell `OPENAI_DEFAULT`;
  Claude: `run` = `client.beta.messages.create`, `claude-opus-5-5`, `fallbacks: 'default'` + Beta `server-side-fallback-2026-07-01`, Verlauf
  nur anhängen) → Fenster `#aipanel` (`ai.provider`, `aiAsk` für Chat (`aiState.chat`) und Säge (`aiState.saw`, `aiVoice`), `aiUndo` = Stand
  vor der Anfrage über `restoreFrom` + Hinweis an die KI, Schlüssel je Anbieter `step2xcs.ai.v1.key[.openai]`, „Modelle laden“ = models.list);
  SDKs als Browser-Skript `web/js/vendor/openai.js` / `anthropic.js` (`tools/build_openai.sh` / `build_anthropic.sh`, `loadSdk`, `dangerouslyAllowBrowser`).
- Sprachbefehle im Sägemodus: `web/js/voice.js` (`Voice.parseCmd` → {cmd, n, arg}: next/prev/strip/prevstrip/sheet/prevsheet/gostrip n/gosheet n/
  gostep n/reset/print/printstrip/lmode/sayon/sayoff/say/status/preview/help/fullon/fulloff/off, Zahlen `numOf`; `Voice.create` mit
  `onFree` (kein Befehl → KI bei `lst.sawAi`), Web Speech oder Vosk offline aus `js/vendor/vosk/` (vosk.js + model-de.tar.gz, nur http;
  `GRAMMAR` außer bei `free()`; `tools/pi/sprache_holen.sh`, Pi `einrichten.sh --sprache` mit lokalem http.server :8765), `Voice.say` Ansage)
  → `voiceCommand` → `sawAction(aktion, o)` (= Werkzeug saegen_steuern, Fehler als Text zum Vorlesen), `sawStatusObj`/`sawStatusText`,
  `sawPrintNow`/`sawSay`; `lst.sawSay`, `lst.sawAi`; Weiter-Knopf `.btn.go` (grün `--on`).
- Gekrümmte Flächen (je Teil `overrides.curved = {slant, surface}`, Schalter nur sichtbar, wenn erkannt):
  `panel.curvedSlants` (Schräge an Rundungen → `slantpath`, `offsetRun` in `xcs.js`) und `panel.curvedSurfaces`
  (→ `surface`: `surface.js` Drop-Cutter auf dem Netz aus `occtmesh.js`; Node: `OcctMesh.loadNode()`, Browser: `View3D.load()`).
  Zylinder (liegend, konvex) zusätzlich `cyl` → `cyl4` (4-Achs, eine geneigte Ebene je Zeile, `cyl4Plan` in `xcs.js`).
- Abgesetzter Falz (`panel.rebates` mit `from`/`to`, zu einer Kante offen): Bahn in Werkzeugmitte, `rebateStopReturn`
  (je Teil `overrides.rebateReturn`): mit Rückweg (Mitte auf der Kante) oder einfach ein-, durch-, austauchen.
- Profil (Rahmenholz/Leiste, `panel.profile`: L ≥ 6 W, Rechteck, nur Falze/Nuten längs X + Bohrungen), `profileRule` 'saw':
  Stufen als Falze (`stepped`), Stirnseiten `blade-end-…` statt Formatfräsen, Rohteil nur in X, Falze hinten (`analyze` dreht 180°).
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
- Oszillieren/Schleifen: `op.osc = {min, max}` (Tiefen ab Oberseite) → `oscillate()` in `xcs.js`: Kontur bleibt ganz (nicht
  zerteilen – brach in Maestro die Korrektur), Elementende `SetAttribute("DEPTH")`, Wendepunkte `SetParametricAttribute("DEPTH", t, u)`; `fmtOp.osc` (Einstellung `oscMill`), Schleifen = Op `sand` (Kategorie
  `sand`, Werkzeugart `sand` = SandMill, An-/Abfahrt im Bogen, `passes`, Schleifzugabe → `finishAllowance` am Formatfräsen).
- Zapfen auf Schräge: `bossOf` in `panel.js` (herausragende Flächen an einer Innenkontur der schrägen Fläche) →
  `slantWall.boss = {height, plane, islands, bottomZ}`; `xcs.js`: Vorschnitt auf versetzter Linie (`tenonPrecut`) und
  Tasche mit Insel auf Ebene `Zapfen_n` (`tenonTool`, `tenonAllowance`). Nach unten zeigend → `bottom` (wenden).
- Cabineo (überlappende Bohrungen): Boden nur aus Bögen gleichen Radius (≤ 10) um ≥ 2 Mitten in einer Reihe, Abstand < Ø,
  sonst nur Linien auf der Plattenkante → `drillCombo` in `panel.js` → Bohrungen von oben (`combo: true`) statt Tasche.
- Clamex: `findClamex` in `panel.js` (Zylinder R 40–60 hohl + zwei Wände ⟂ Achse, Abstand 3–12; oder nur Wandpaare mit
  Kreisbogen – Nutgrund Extrusion/Freiform aus Lamello-Bibliothek) → `panel.clamex` `{c, a, n, r, w, depth, chord}`;
  Standard `clamexMode: 'macro'` → `clamexMacros` (je Kante/Linie ein Makro, Anzahl) und `CreateMacro(…, "SawCut_Lamello", …)`
  nach Position mit `clamexTplEdge/Miter/Face` – gleich den Werkstatt-Programmen `maestro/beispiele/5_`–`10_` (Test
  `clamex_korpus.step`); sonst `clamexPlan` (Ebene Top bzw. Kante, Bahn), Op `clamex-i`.
- Kippen (Sonderteile): `orientation.tilt` 1 = lange Kante (90° um X, W ↔ T), 2 = kurze Kante (90° um Y, L ↔ T) – in `frame(prep, rot,
  flip, tilt)` vor Wenden/Drehen, auch `turnOverY`; Knopf `#tilt` (nur von Hand, nie automatisch), Hinweis in `warnings`.
- Böden (Nut, Falz, Tasche, „von unten“) nur, wenn über (unter) der Fläche kein Material liegt (`isWall` in `extract`) – sonst Wand.
- Drehlage: `orientRule` 'model' (Standard, Werkstatt) – X = Modell-X (Korpusbreite), sonst Z, sonst Y, Y positiv
  (`modelRot` in `panel.js`), nicht wenn W dadurch > `fieldWidth`; 'long' = lange Seite in X (Tests setzen 'long').
- Sägeschnitt wie Werkstatt: Linie Oberkante von Kante zu Kante (`bladeOverrun` 0), `CreateSectioningMillingStrategy(2, 50, 0)`,
  Extra-Tiefe 20; Nuten weiter mit `sawOverrun`.
- Schnittwerte: `tools.js` liest je Werkzeug `tech = {feed, rot, descent}` (je [Standard, min, max]); je Teil/Seite
  `overrides.tech = {Gruppe: {feed, rot, descent}}` → `S3`/`SD` in `xcs.js` (sonst `-1` = Werkzeugdatei).
- Etiketten (Browser-Druck): `labelHtml`/`labelSketch`/`openLabels` in `app/04-etiketten.js`, Einstellungen `label*` (40 × 60 mm);
  Kopf `.hd` (Nr. aus `lblNums` = `labelNums()` je Druck, Material), Hinweis `.two` (side2) / `.two.warn` (canTwoSided),
  Kanten-Legende `.eg`, Fußzeile `.ft`; breit: `.wrow` (Text links, Draufsicht rechts);
  Etiketten-Konfigurator: `web/js/labels.js` (`LabelLayout`: `FIELDS`, `TEMPLATES`/`layoutOf`, `scaled`, `fill`, `render`/`itemHtml`,
  `code128`; Elemente text/two/sketch/edges/barcode/box in mm) → Einstellung `labelLayout` ({w, h, items}, null = automatisch),
  `labelData(part)` (Felder, `sketch(w, h, dims)` – dims 'fertig'|'zuschnitt' am Element, sonst Einstellung `labelSketchDims`;
  Zuschnitt = `cutDimsOf(part)` wie im Zuschnittplan, `edgeList`, `two`), Seite `state.page` 'labels' (`#lblpage` – nicht `labelpage`, das ist der
  @page-Stil): `ldInit`/`renderLD`/`ldWire` (`ld`, Druckliste `ld.print` je Teil {on, n}, `ldPrintHtml`), `openLabelDesigner(part)` wechselt dorthin;
  Seite 'material' (`#matpage`, `renderMat`): Materialien im Projekt, Standard, Kantenband, Rohplatten, eigene Farben, Dekore – Felder
  gekoppelt an `lst`/`settings` (Zwillinge in Stückliste/Zuschnitt werden nachgezogen); Dekor-Bilder lokal: `localDecors`
  (IndexedDB `DECOR_KEY`, je {key, code, name, grain, scale, color, img, thumb} als Data-URL), `decorImage`/`addDecorFiles`,
  `decorSectionHtml`/`decorWire` (Sammeländerung: Auswahl `decSel` (Schlüssel), `decBulkHtml`/`decBulkWire` – Name suchen/ersetzen, `scale` setzen/×0,8/×1,25, `grain`), `mergeDecors` (Import, Projektdatei `data.dekore`), `applyDecors` = Server (`serverDecors`) + lokal;
  auf der Material-Seite gehen abgelegte Bilder in die Dekore statt an `loadFiles`;
  gedruckt wird nur `#printarea` mit `@page` in Etikettgröße (`#labelpage`), schwarz-weiß für Thermodrucker.
- Name „Weckwop“, Logo = Korpus (Kopf in `index.html`, Favicon, `exe/winres/icon.png` → `go-winres make` → `rsrc_windows_amd64.syso`).
  Interne Namen bleiben (Daten/Installationen): `step2xcs.*` (localStorage/IndexedDB), `step2maestro-projekt`/`-dekore`, Ordner
  `step2maestro/` (Webserver/Pi/Docker), `%LOCALAPPDATA%\STEP2XCS\app`, `SetComment("STEP2XCS: …")`, `window.Step2Maestro` (= `window.Weckwop`).
- `exe/` – kleine Windows-.exe `Weckwop.exe` (Go), bettet `web/` ein und öffnet es im Browser; bauen mit `npm run build:exe` → `dist/`.
  Webserver-Paket: `npm run build:web` → `dist/Weckwop-Webserver.zip` (`tools/webserver/`: ANLEITUNG.txt für Strato,
  `.htaccess`, Schriften lokal – Google-Fonts-Link wird dabei ersetzt).
- Raspberry Pi am Sägeplatz: `tools/pi/einrichten.sh` (CUPS + Zebra USB `drv:///sample.drv/zebra.ppd`, Autostart
  `~/.local/bin/step2maestro-kiosk.sh` per XDG-Autostart und labwc, Chromium `--kiosk --kiosk-printing`), `ANLEITUNG-PI.txt`;
  Paket `npm run build:pi` → `dist/Weckwop-Pi.zip` (`tools/build_pi.sh`, nutzt das Webserver-Paket ohne PHP).
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

## Stand (Tag `stand-2026-10-07`)

- Gesichert am 7.10.2026, Zweig `claude/blissful-wright-70n9um`: Programm aufgeteilt (index.html 245 Zeilen, `css/step2maestro.css`,
  `js/app/01–12`), sonst gleiche Funktion wie zuvor.
- Enthalten: Projekte/Startseite (Server/Browser, Projektordner, Sicherungsordner, STEP aktualisieren), Projektdatei .s2m mit
  Stückliste/Zuschnitt/Einstellungen, KI-Assistent (ChatGPT Standard, Claude), `window.Weckwop.api`, Sprachbefehle im Sägemodus
  (Web Speech/Vosk, „🤖 KI“), großer grüner Weiter-Knopf, Docker (Diskstation), Pi mit `--sprache`.
- Prüfstand: `npm test` 108/108 grün; Ausgabe aller Testteile unverändert gegenüber dem Stand vor der Aufteilung; alle 6 Seiten
  laden ohne Fehler, hell/dunkel geprüft.
- Pakete: `npm run build:exe`, `build:web`, `build:pi`, `build:docker` – alle enthalten `css/` und `js/app/`.
- Angeboten, noch nicht gebaut: kostenlose KI (Ollama), Reststück-Lager, .pgmx automatisch, Strichcode-Verfolgung, Kalkulation, Bestellliste.
