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
node cli/step2xcs.js teil.step weitere.step -o ausgabe/
```

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
| Taschen, Bearbeitungen von unten, schräge Bohrungen | nur **Hinweis** – in Maestro ergänzen bzw. Platte wenden |

Ausrichtung: Die längste Seite wird X, Bearbeitungsseite ist die Seite mit den meisten Bearbeitungen.
Nullpunkt vorne links unten. Werkzeuge, Zugaben und Bohrerlisten sind im Web-Tool unter
*Werkzeuge & Regeln* einstellbar (Standard aus `maestro/werkzeuge/def.tlgx` und den Beispielen).

## In Maestro bestätigt

Die Onshape-Teile `kp1 - Oberboden` und `kp1 - Rechte Seite` (Ordner `step/`) wurden mit dem Tool
umgewandelt, im X-Konverter als Script importiert und als Maestro-Programm angelegt. Damit belegt:

- Programmkopf, Rohteil, Formatfräsen (`CreatePolyline` / `CreateRoughFinish`)
- Bohrungen von oben inkl. Lochreihen (`CreatePattern`)
- horizontale Bohrungen links/rechts (`SelectWorkplane("Left"/"Right")`)
- Kreisfräsung mit Bögen (`AddArc2PointCenterToPolyline`) für das Rundloch Ø 100

## Noch zu prüfen an der Maschine

Aus den Beispielen abgeleitet, aber noch nicht in Maestro getestet:

- **Feld `IJ`/`IL`:** Regel „lang ab 1500 mm → `IL`“ ist geschätzt (Beispiele: 2305 → IL, ≤ 646 → IJ).
- **Kantenbohrungen vorne/hinten:** Ebenennamen `"Front"`/`"Back"` und deren lokale X-Richtung.
  Links/rechts ist durch `27_Oberboden.xcs` belegt.
- **Nut:** Lage des Segments auf der Flanke und Bedeutung des Versatzes beim 2. Sägedurchgang.
- **Falz und Durchbrüche:** gibt es in den Beispielen nicht.

## Ordner

| Ordner | Inhalt |
|---|---|
| `web/` | Web-Tool (`index.html`) und die JS-Module `step.js` (STEP-Leser), `panel.js` (Erkennung), `xcs.js` (Ausgabe) |
| `cli/` | Kommandozeilen-Aufruf |
| `test/` | Tests (`npm test`) und Test-STEP-Dateien |
| `tools/` | `make_fixtures.py` erzeugt die Test-STEP-Dateien mit CadQuery |
| `step/` | Original-STEP-Exporte aus Onshape |
| `maestro/beispiele/` | Beispiel-Programme (.xcs) aus Maestro – Referenz für das Format |
| `maestro/werkzeuge/` | Werkzeugdaten (`def.tlgx`) |
| `maestro/makros/` | SCM-Makros |
| `featurescript/` | ursprünglich geplanter Weg über Onshape-FeatureScript (derzeit nicht verfolgt) |
