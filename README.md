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

| Einstellung | Standard (aus dem Handbuch) |
|---|---|
| X-Konverter | `C:\Program Files (x86)\Scm Group\Maestro\XConverter.exe` |
| Werkzeugdatei | `C:\Program Files (x86)\Scm Group\Maestro\Tlgx\def.tlgx` |
| Zielordner `.pgmx` | leer = Unterordner `pgmx` neben der `.bat` |

## Was erkannt wird

| Geometrie im STEP | XCS-Ausgabe |
|---|---|
| Plattenmaße L × B × D | `CreateFinishedWorkpieceBox`, Rohteil +2 mm je Seite |
| Außenkontur | Formatfräsen Rechteck (`E014`, Tiefe D+3, Korrektur rechts) |
| Abweichungen vom Rechteck (Sockelausschnitt, Rundungen, Schrägen) | offene Fräsbahn mit Linien/Bögen (`E016`, Tiefe D+2) |
| Durchbrüche (innen) | geschlossene Fräsbahn (`E016`) |
| Bohrung von oben (Sackloch / durch) | `CreateDrill` Spitze `"P"` / `"L"` (durch: Tiefe D+2) |
| Bohrung, für die kein Bohrer existiert und die durchgeht | Kreisfräsung (`E016`) |
| Bohrung in der Kante links/rechts/vorne/hinten | `SelectWorkplane(...)` + horizontale `CreateDrill` |
| gleichabständige Lochreihen | `CreatePattern(...)` |
| durchgehende Nut | Säge `066`, zwei Durchgänge wie im Beispiel |
| Falz an einer Kante | Fräsbahn entlang der Falzflanke (ggf. mehrere Bahnen) |
| Tasche (auch mit Inseln, Eckenradius-Prüfung) | `CreateContourPocket` (Bohrungen im Taschenboden werden von oben gebohrt) |
| Fase oben / unten an einer geraden Kante | `CreateChamfer` (Breite × Höhe, Werkzeugposition oben/unten) |
| schräge Kante über die ganze Dicke (Gehrung) | `CreateSlantedRoughFinish` mit geneigtem Werkzeug (5-Achs) |
| schräge Bohrung | `CreateSlantedDrill` (5-Achs) |
| Zustellungen | `CreateUnidirectionalMillingStrategy` (Konturen) / `CreateContourParallelStrategy` (Taschen) |
| Bearbeitungen von unten, Fasen an Rundungen | nur **Hinweis** – Platte wenden bzw. in Maestro ergänzen |

**Werkzeuge:** Das Web-Tool liest die Werkzeugliste (`.tlgx`) mit Durchmesser und Schneidenlänge.
Für jede Fräsbearbeitung gibt es eine Auswahlliste mit allen Fräsern, Favoriten (★ unter *Werkzeuge & Regeln*)
stehen oben. Zustellung global oder je Bearbeitung; Warnung, wenn die Zustellung länger als die Schneide ist.
`node tools/build_defaults.js` erzeugt die eingebaute Standardliste neu.

**Animation der Werkzeugbahn:** Unter der Draufsicht lässt sich die Bearbeitung in Programmreihenfolge abspielen
(Tempo, Schieberegler zum Spulen, Anzeige von Bearbeitung und Werkzeug). Das Werkzeug wird mit seinem Durchmesser aus
der Werkzeugliste gezeigt, Konturen mit Radiuskorrektur, Taschen vereinfacht zeilenweise plus Nachkontur
(`web/js/toolpath.js`). Maßgeblich bleibt die Simulation in Maestro.

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
