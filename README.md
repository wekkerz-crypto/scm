# STEP → XCS für SCM Maestro

Werkzeug, das aus Plattenteilen (STEP) automatisch Xilog-Skripte (`.xcs`) erzeugt.
Der X-Konverter von Maestro übersetzt sie anschließend in `.pgmx`.

```
STEP (Onshape o. a. CAD) ──► Web-Tool / CLI ──► .xcs ──► X-Konverter ──► .pgmx ──► Maestro
```

## Benutzen

**Im Browser:** `web/index.html` öffnen (Doppelklick genügt, es läuft komplett offline im Browser).
STEP-Dateien hineinziehen, Draufsicht und Bearbeitungen prüfen, ggf. *Drehen 90°* / *Wenden*,
dann *Speichern* (einzeln) oder *Alle als ZIP*.

**Kommandozeile** (Node.js ≥ 18):

```bash
node cli/step2xcs.js teil.step weitere.step -o ausgabe/ --bat
```

### Umwandeln in .pgmx mit `konvertieren.bat`

Jede ZIP aus dem Web-Tool (und die CLI mit `--bat`) enthält eine `konvertieren.bat`.
ZIP auf dem Maestro-PC entpacken, `konvertieren.bat` doppelklicken: alle `.xcs` im Ordner werden mit dem
X-Konverter (Modus 0, Handbuch Kap. 8) in `.pgmx` umgewandelt, standardmäßig in den Unterordner `pgmx`.

Die drei Pfade stehen oben in der `.bat` und lassen sich im Web-Tool unter *Werkzeuge & Regeln* einmalig einstellen:

| Einstellung | Standard |
|---|---|
| X-Konverter | `C:\Program Files\SCM Group\Maestro\XConverter.exe` (Installation in der Werkstatt) |
| Werkzeugdatei | `C:\Users\Public\Documents\SCM Group\Maestro\Tlgx\def.tlgx` (Installation in der Werkstatt) |
| Zielordner `.pgmx` | leer = Unterordner `pgmx` neben der `.bat` |

## Was erkannt wird

| Geometrie im STEP | XCS-Ausgabe |
|---|---|
| Plattenmaße L × B × D | `CreateFinishedWorkpieceBox`, Rohteil +2 mm je Seite |
| Außenkontur rechteckig | Formatfräsen Rechteck (`E014`, Tiefe D+3, Korrektur rechts) |
| Sonderkontur (Ausschnitte, Rundungen, Schrägen) | Standard: ganze Außenkontur **am Stück** als eine Bahn; umschaltbar auf „Rechteck + Ausschnitte einzeln“ (`E016`, Tiefe D+2) |
| Durchbrüche (innen) | geschlossene Fräsbahn (`E016`) |
| Bohrung von oben (Sackloch / durch) | `CreateDrill` Spitze `"P"` / `"L"` (durch: Tiefe D+2) |
| Bohrung, für die kein Bohrer existiert und die durchgeht | Kreisfräsung entlang der Kontur (`E016`) |
| Bohrung in der Kante links/rechts/vorne/hinten | `SelectWorkplane(...)` + horizontale `CreateDrill` |
| gleichabständige Lochreihen | `CreatePattern(...)` |
| durchgehende Nut | Säge `066`, zwei Durchgänge wie im Beispiel |
| Falz an einer Kante | Fräsbahn entlang der Falzflanke (ggf. mehrere Bahnen) |
| Tasche (auch mit Inseln, Eckenradius-Prüfung) | `CreateContourPocket` (Bohrungen im Taschenboden werden von oben gebohrt) |
| runde Vertiefung von oben ohne passenden Bohrer | Kreistasche: `CreateCircleCenterRadius` + `CreateContourPocket` (Hinweis, wenn der Fräser nicht hineinpasst). Runde Taschen werden **immer im Uhrzeigersinn** ausgeräumt (`CreateContourParallelStrategy(true, 0 …)`) |
| Tasche in einer Kante (Stirn- oder Längsseite, z. B. Langloch, auch schräg gedreht) | `SelectWorkplane("Left"/"Right"/"Front"/"Back")` + `CreateContourPocket` in Kantenkoordinaten (wie die Kantenbohrungen). Passt der Taschenfräser nicht hinein, wird automatisch der größte passende Fräser gewählt |
| Fase oben / unten | `CreateChamfer` entlang der Kontur **am Stück**, auch über Rundungen (Kegelflächen), umlaufend als geschlossene Bahn; auch um Durchbrüche |
| schräge Kante über die ganze Dicke (Gehrung), gerade von Kante zu Kante | Standard: **Sägeschnitt** `CreateBladeCut` mit Neigung (Säge `E070`, Säge rechts, Material links); Einstellung *Schräge Kanten von Kante zu Kante* auf „fräsen“ stellt auf `CreateSlantedRoughFinish` um |
| schräge Kante, die nicht durchläuft | `CreateSlantedRoughFinish` mit geneigtem Werkzeug (5-Achs) |
| Tasche oder Bohrung senkrecht auf einer schrägen Fläche (z. B. auf der Schnittfläche der Säge) | eigene Ebene `CreateWorkplane(name, X0, Y0, Z0, Drehung Z, Neigung X)` + `SelectWorkplane`, darauf `CreateContourPocket` bzw. `CreateDrill`; kommt in der Reihenfolge nach den Sägeschnitten |
| schräge Bohrung | `CreateSlantedDrill` (5-Achs) |
| Zustellungen | `CreateUnidirectionalMillingStrategy` (Konturen) / `CreateContourParallelStrategy` (Taschen) |
| Bearbeitungen von unten | nur **Hinweis** – Platte wenden |

**Werkzeuge:** Das Web-Tool liest die Werkzeugliste (`.tlgx`) mit Durchmesser und Schneidenlänge.
Für jede Fräsbearbeitung gibt es eine Auswahlliste mit allen Fräsern, Favoriten (★ unter *Werkzeuge & Regeln*)
stehen oben. Zustellung global oder je Bearbeitung; Warnung, wenn die Zustellung länger als die Schneide ist.
`node tools/build_defaults.js` erzeugt die eingebaute Standardliste neu.

**Frästiefe:** Durchgehende Fräsungen (Formatfräsen, Konturausschnitte, Durchbrüche, Rundlöcher) fräsen
Plattendicke + Zugabe (Einstellungen *Formatfräsen: Dicke +* bzw. *Ausschnitte: Dicke +*). Je Teil lässt sich die Tiefe
in der Bearbeitungsliste im Feld *Tiefe* absolut in mm setzen; ist sie kleiner als die Plattendicke, gibt es einen Hinweis.

**Reihenfolge:**
- *Reihenfolge-Regel* unter *Werkzeuge & Regeln*: die Bearbeitungsarten (Bohrungen oben, Kantenbohrungen, schräge
  Bohrungen, Nuten, Taschen, Falze, Fasen, schräge Kanten, Durchbrüche, Konturausschnitte, Formatfräsen) mit ↑/↓ in
  die gewünschte Folge bringen, mit *Regel verwenden* zu- und abschalten. Standard: erst bohren, dann fräsen,
  Formatfräsen zuletzt. Ist die Regel aus, bleibt die erkannte Reihenfolge (wie in den Maestro-Beispielen).
  CLI: `--no-order-rule`.
- Je Teil lässt sich jede Bearbeitung zusätzlich verschieben: am Griff ⠿ mit gedrückter Maus (oder Finger) an die
  gewünschte Stelle ziehen (Esc bricht ab), oder mit ↑/↓. Gleiche Bohrungen wandern als Block, ein Falz mit allen
  Bahnen; das hat Vorrang vor der Regel.
- Programm, Nummerierung und Animation folgen der Reihenfolge; nach Kantenbohrungen wird vor Fräsungen automatisch
  wieder `SelectWorkplane("Top")` gesetzt.

**Animation der Werkzeugbahn:** Große Draufsicht (fast volle Bildschirmhöhe, Knopf *Vollbild*), die
Bearbeitungsschritte als eigenes Fenster rechts daneben, das beim Scrollen stehen bleibt. Teile und Laden stehen als
Leiste darüber; STEP-Dateien können überall auf die Seite gezogen werden. Beim Abspielen startet die
Ansicht mit der Rohplatte (Holzmaserung, Aufmaß); der Fräser trägt das Material ab – je tiefer, desto dunkler,
durchgefräst zeigt den Tisch, Innenstücke von Durchbrüchen fallen heraus. Bearbeitungen von der Kante (Kantenbohrungen, Kantentaschen) zeigen das Werkzeug liegend, so wie es von oben
gesehen in die Kante fährt, mit Schneide, Schaft und Aggregat. Werkzeug als drehender Fräser/Bohrer in
echter Größe, Bohrungen maßstäblich, Vorschau der kommenden Bahnen, Eilgänge mit Pfeil. Zeitleiste mit allen
Schritten (Klick springt hin), Klick auf einen Schritt in der Liste springt ebenfalls, der aktuelle Schritt ist
hervorgehoben. Taschen sind vereinfacht zeilenweise dargestellt (`web/js/toolpath.js`); maßgeblich bleibt die
Simulation in Maestro.

**Hell/Dunkel:** Schalter oben rechts; die Wahl wird im Browser gemerkt (ohne Wahl gilt die Systemeinstellung).

**Farben:** Jede Bearbeitungsart hat eine feste Farbe, gleich in Draufsicht, Schrittliste (farbiger Balken links),
Zeitleiste und am Werkzeug in der Animation: Bohrung oben blau, Tasche orange, Fräsen/Kontur grün-türkis, Nut/Falz gelb,
Fase/schräge Kante pink, schräge Bohrung grün, Kante (Bohrung/Tasche) violett. Die Palette ist für hell und dunkel
getrennt abgestimmt und auch bei Farbsehschwäche unterscheidbar; die Legende unter der Ansicht nennt alle Farben.

Ausrichtung: Die längste Seite wird X, Bearbeitungsseite ist die Seite mit den meisten Bearbeitungen.
Nullpunkt vorne links unten. Werkzeuge, Zugaben und Bohrerlisten sind im Web-Tool unter
*Werkzeuge & Regeln* einstellbar (Standard aus `maestro/werkzeuge/def.tlgx` und den Beispielen).

## In Maestro bestätigt

- **Arbeitsfeld** (`SetMachiningParameters`): Teile bis 1300 mm Länge `IJ`, darüber `IL` (Vorgabe aus der Werkstatt,
  im Web-Tool unter *Werkzeuge & Regeln* änderbar).

Die Onshape-Teile `kp1 - Oberboden` und `kp1 - Rechte Seite` (Ordner `step/`) wurden mit dem Tool
umgewandelt, im X-Konverter als Script importiert und als Maestro-Programm angelegt. Damit belegt:

- Programmkopf, Rohteil, Formatfräsen (`CreatePolyline` / `CreateRoughFinish`)
- Bohrungen von oben inkl. Lochreihen (`CreatePattern`)
- horizontale Bohrungen links/rechts (`SelectWorkplane("Left"/"Right")`)
- Kreisfräsung mit Bögen (`AddArc2PointCenterToPolyline`) für das Rundloch Ø 100

## Noch zu prüfen an der Maschine

Aus den Beispielen abgeleitet, aber noch nicht in Maestro getestet:

- **Kantenbohrungen vorne/hinten:** Ebenennamen `"Front"`/`"Back"` sind laut Handbuch Standardebenen;
  lokales System: Ursprung unten links, X waagerecht, Z aus der Ebene heraus (passt zur Umsetzung).
  Links/rechts ist durch `27_Oberboden.xcs` und den Maestro-Import belegt.
- **Nut:** Der Wert `-8,8` beim 2. Sägedurchgang ist laut Handbuch das Aufmaß (`overMaterial`) von `CreateSlot`.
  Die Lage der Nut (Flanke + Breite zur positiven Seite) passt dazu, ist aber noch nicht in Maestro geprüft.
- **Falz und Durchbrüche:** gibt es in den Beispielen nicht.
- **Sägeschnitt schräg (`CreateBladeCut`):** Winkel laut Handbuch zur Z-Achse (90 = senkrecht); ausgegeben wird 90 − Neigung,
  wenn die Platte unten breiter ist. Ob Maestro die Neigung zur richtigen Seite kippt, in der Simulation prüfen.
- **Schräge Ebenen (`CreateWorkplane` mit Ursprung und Drehungen):** erst um Z, dann um die neue X-Achse; Ursprung an der
  unteren Kante der Schräge, lokales Y die Schräge hinauf. Lage der Tasche/Bohrungen in der Simulation prüfen.
- **Taschen in den Kanten:** Geometrie in denselben Kantenkoordinaten wie die Kantenbohrungen (X waagerecht, Y = Höhe ab
  Plattenunterseite); in Maestro noch nicht simuliert.
- **5-Achs-Befehle** (nach Handbuch, noch nicht in Maestro getestet):
  - `CreateChamfer`: Geometrie = scharfe Kante vor dem Fasen, Werkzeugposition 2 (rechts, oben) bzw. 3 (rechts, unten).
  - `CreateSlantedRoughFinish`: Geometrie = Oberkante der schrägen Fläche, Winkel B = Neigung gegen die Senkrechte,
    Werkzeuganstellung 1/2 je nach Neigungsrichtung, Korrektur rechts.
  - `CreateSlantedDrill`: Eintrittspunkt in Werkstückkoordinaten; Winkel A = Richtung der Werkzeugachse in XY
    gegen X, Winkel B = Neigung gegen Z (0° = senkrecht von oben). Im Handbuch widersprechen sich Tabelle und Beispiel.
  - Zustellungs-Strategien: Parameterreihenfolge laut Handbuch-Tabelle.

## Ordner

| Ordner | Inhalt |
|---|---|
| `web/` | Web-Tool (`index.html`) und die JS-Module `step.js` (STEP-Leser), `panel.js` (Erkennung), `xcs.js` (Ausgabe) |
| `cli/` | Kommandozeilen-Aufruf |
| `test/` | Tests (`npm test`) und Test-STEP-Dateien |
| `tools/` | `make_fixtures.py` erzeugt die Test-STEP-Dateien (CadQuery), `build_defaults.js` die eingebaute Werkzeugliste und Beispiele |
| `step/` | Original-STEP-Exporte aus Onshape |
| `maestro/beispiele/` | Beispiel-Programme (.xcs) aus Maestro – Referenz für das Format |
| `maestro/werkzeuge/` | Werkzeugdaten (`def.tlgx`) |
| `maestro/makros/` | SCM-Makros |
| `maestro/doku/` | Handbuch der Script-Sprache (MSL-Referenz, Rev. 17) |
| `featurescript/` | ursprünglich geplanter Weg über Onshape-FeatureScript (derzeit nicht verfolgt) |
