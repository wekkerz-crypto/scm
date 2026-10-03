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

**Als Programm (Windows):** `STEP2XCS.exe` doppelklicken. Die .exe (ca. 2 MB, keine Installation) enthält das
komplette Web-Tool, entpackt es nach `%LOCALAPPDATA%\STEP2XCS\app` und öffnet es im Standardbrowser – ohne Internet,
ohne Server. Einstellungen und Favoriten bleiben erhalten, weil der Ort immer gleich ist. Beim ersten Start meldet
Windows ggf. „Der Computer wurde durch Windows geschützt“ (unsigniert) → *Weitere Informationen* → *Trotzdem ausführen*.
Meldet der Virenscanner die unsignierte .exe fälschlich als Virus, die **portable Variante** nehmen
(`STEP2XCS-portabel.zip`: Ordner an festen Ort kopieren, `index.html` bzw. `STEP2XCS starten.cmd` doppelklicken) –
gleicher Funktionsumfang, ohne .exe. Dauerhaft hilft nur eine Code-Signatur.
Bauen: `npm run build:exe` (Go ≥ 1.21) → `dist/STEP2XCS.exe`; Quelltext in `exe/`.

**Kommandozeile** (Node.js ≥ 18):

```bash
node cli/step2xcs.js teil.step weitere.step -o ausgabe/ --bat
```

Weitere Schalter: `--step mm` (Zustellung), `--no-order-rule`, `--schraege-5achs` (Schrägen an Rundungen 5-achsig fräsen),
`--kugelfraesen` (gewölbte Flächen zeilenfräsen, lädt OpenCascade).

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

### Teilename

Der Name kommt aus der STEP: der Teilename aus dem CAD, bei nichtssagenden Namen wie „Part 1“ der Name der STEP-Datei
(bei mehreren Körpern mit `_2`, `_3` …). Umlaute werden umgeschrieben (ä → ae, ö → oe, ü → ue, ß → ss), Leerzeichen
werden zu `_`, andere Sonderzeichen ebenfalls. Derselbe Name gilt für Anzeige, `.xcs`, ZIP und – über `konvertieren.bat` –
für die `.pgmx`. Beispiel: `Tür Öffnung groß` → `Tuer_Oeffnung_gross.xcs` → `Tuer_Oeffnung_gross.pgmx`.

## Was erkannt wird

| Geometrie im STEP | XCS-Ausgabe |
|---|---|
| Plattenmaße L × B × D | `CreateFinishedWorkpieceBox`, Rohteil +2 mm je Seite |
| Außenkontur rechteckig | Formatfräsen Rechteck (`E014`, Tiefe D+3, Korrektur rechts) |
| Formatfräsen zweistufig (Umschalter Normal/Zweistufig in den Einstellungen und je Teil in der Schrittliste) | Vorfräsen `CreateRoughFinish("Milling_1_Vor", …, Aufmaß)` mit Werkzeug 1, dann Werkzeug 2 auf Endmaß, gleiche Geometrie |
| Sonderkontur (Ausschnitte, Rundungen, Schrägen) | Standard: ganze Außenkontur **am Stück** als eine Bahn; umschaltbar auf „Rechteck + Ausschnitte einzeln“ (`E016`, Tiefe D+2) |
| Durchbrüche (innen), auch mit Fase oder Falz am Rand | geschlossene Fräsbahn (`E016`) entlang der engsten Stelle |
| Bohrung von oben (Sackloch / durch) | `CreateDrill` Spitze `"P"` / `"L"` (durch: Tiefe D+2) |
| Bohrung, für die kein Bohrer existiert und die durchgeht | Kreisfräsung entlang der Kontur (`E016`) |
| Bohrung in der Kante links/rechts/vorne/hinten | `SelectWorkplane(...)` + horizontale `CreateDrill` |
| gleichabständige Lochreihen | `CreatePattern(...)` |
| durchgehende Nut | Säge `066`, zwei Durchgänge wie im Beispiel; ein Durchgang, wenn die Nut so breit wie das Blatt ist; Hinweis bei Steg oder zu schmaler Nut |
| Falz an einer Kante | Fräsbahn entlang der Falzflanke (ggf. mehrere Bahnen) |
| Tasche (auch mit Inseln, Eckenradius-Prüfung) | `CreateContourPocket` (Bohrungen im Taschenboden werden von oben gebohrt) |
| runde Vertiefung von oben ohne passenden Bohrer | Kreistasche: `CreateCircleCenterRadius` + `CreateContourPocket` (Hinweis, wenn der Fräser nicht hineinpasst). Runde Taschen werden **immer im Uhrzeigersinn** ausgeräumt (`CreateContourParallelStrategy(true, 0 …)`) |
| Tasche in einer Kante (Stirn- oder Längsseite, z. B. Langloch, auch schräg gedreht) | `SelectWorkplane("Left"/"Right"/"Front"/"Back")` + `CreateContourPocket` in Kantenkoordinaten (wie die Kantenbohrungen). Passt der Taschenfräser nicht hinein, wird automatisch der größte passende Fräser gewählt |
| Fase oben / unten | `CreateChamfer` entlang der Kontur **am Stück**, auch über Rundungen (Kegelflächen), umlaufend als geschlossene Bahn; auch um Durchbrüche |
| schräge Kante über die ganze Dicke (Gehrung), gerade von Kante zu Kante | Standard: **Sägeschnitt** `CreateBladeCut("Saegeschnitt_1", …)` mit Neigung, in der Liste „Sägeschnitt 45°“, eigene Art *Sägeschnitte* in der Reihenfolge-Regel (Säge `E070`, Säge rechts, Material links); Einstellung *Schräge Kanten von Kante zu Kante* auf „fräsen“ stellt auf `CreateSlantedRoughFinish` um |
| schräge Kante, die nicht durchläuft | `CreateSlantedRoughFinish` mit geneigtem Werkzeug (5-Achs) |
| Tasche oder Bohrung senkrecht auf einer schrägen Fläche (z. B. auf der Schnittfläche der Säge) | eigene Ebene `CreateWorkplane(name, X0, Y0, Z0, Drehung Z, Neigung X)` + `SelectWorkplane`, darauf `CreateContourPocket` bzw. `CreateDrill`; kommt in der Reihenfolge nach den Sägeschnitten |
| schräge Bohrung | `CreateSlantedDrill` (5-Achs) |
| Schräge über die ganze Dicke **an Rundungen** (Kegelflächen, z. B. umlaufend geschrägte Platte mit Eckenradien, schräger Ausschnitt, schräges Rundloch) | Schalter je Teil *Schräge an Rundungen: Aus / 5-Achs fräsen* (erscheint nur, wenn so etwas erkannt wird). An: ganze Kontur am Stück mit `CreateSlantedRoughFinish` (Werkzeug quer zur Bahn geneigt, `E016`, Tiefe D+2), Bahn um r / cos(Neigung) zur Abfallseite versetzt, gerade Abschnitte gehören mit dazu (keine Sägeschnitte). Aus: wie bisher, Hinweis |
| **gewölbte Flächen** von oben (Kugelmulde, Hohlkehle, gerundete Kante, Freiform) | Schalter je Teil *Gewölbte Flächen: Aus / Zeilenfräsen* (nur, wenn erkannt). An: Zeilenfräsen mit dem Kugelfräser (`E055`), Bahn aus dem 3D-Netz berechnet (Kugel berührt Fläche, Kanten und Ecken – schneidet nirgends ins Teil), Vorfräsen in Stufen und Schlichten, ausgegeben als explizite Werkzeugbahn `CreateToolpath` / `AddSegmentToToolpath`. Aus: Hinweis |
| Zustellungen | `CreateUnidirectionalMillingStrategy` (Konturen) / `CreateContourParallelStrategy` (Taschen) |
| Bearbeitungen von unten | nur **Hinweis** – Platte wenden |
| Auflagefläche unten | **Sauger-Vorschlag**: `SetBarPosition(Konsole, X)` und `SetSuctionCupPosition(Nr, Y, Winkel, "Code")` – siehe unten |

**Einstellungen** (*Werkzeuge & Regeln*) sind nach Bearbeitungsart gruppiert: Bohren, Taschen, Formatfräsen & Konturen,
Säge, Fasen & schräge Kanten, Gekrümmte Flächen (Kugelfräser, Zeilenabstand, Zustellung beim Vorfräsen, Punktabstand,
Toleranz, Abheben), Arbeitsfeld & Rohteil, X-Konverter. Taschen haben eine eigene **Zustelltiefe** (0 = wie Fräsen),
die Säge eine eigene **Extra-Tiefe** und optional **Vorritzen** (`CreateSectioningMillingStrategy(Tiefe, Abstand außen, 0)`
vor dem `CreateBladeCut`: erster Schnitt in Ritztiefe, Rückweg auf volle Tiefe).

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

**3D-Ansicht:** Umschalter *2D | 3D* an der Ansicht. Das Bauteil wird mit OpenCascade (occt-import-js, WebAssembly)
aus der STEP vernetzt und mit three.js dargestellt: Holzoberfläche, Körperkanten, Schatten, Rohteil als Umriss, Nullpunkt
mit Achsen; drehen/verschieben/zoomen mit der Maus, Ansichten *Iso / Oben / Vorne*. Die Animation läuft in 3D mit:
Werkzeug mit Spindel in echter Größe und Lage (senkrecht, liegend an der Kante, gekippt auf schrägen Ebenen, geneigtes
Sägeblatt), Bahnspuren in den Farben der Bearbeitungsarten, gleiche Zeitleiste wie in 2D. Alles liegt lokal in
`web/js/vendor` (three.js r147 MIT, occt-import-js/OpenCascade LGPL – Lizenztexte dort) und lädt erst beim ersten
Umschalten; funktioniert offline und aus der .exe.

**Animation der Werkzeugbahn:** Große Draufsicht (fast volle Bildschirmhöhe, Knopf *Vollbild*), die
Bearbeitungsschritte als eigenes Fenster rechts daneben, das beim Scrollen stehen bleibt. Teile und Laden stehen als
Leiste links daneben, jedes Teil mit Mini-Vorschau und × zum einzelnen Entfernen; STEP-Dateien können überall auf die Seite gezogen werden. Beim Abspielen startet die
Ansicht mit der Rohplatte (Holzmaserung, Aufmaß); der Fräser trägt das Material ab – je tiefer, desto dunkler,
durchgefräst zeigt den Tisch, Innenstücke von Durchbrüchen fallen heraus. Bearbeitungen von der Kante (Kantenbohrungen, Kantentaschen) zeigen das Werkzeug liegend, so wie es von oben
gesehen in die Kante fährt, mit Schneide, Schaft und Aggregat. Werkzeug als drehender Fräser/Bohrer in
echter Größe, Bohrungen maßstäblich, Vorschau der kommenden Bahnen, Eilgänge mit Pfeil. Zeitleiste mit allen
Schritten (Klick springt hin), Klick auf einen Schritt in der Liste springt ebenfalls, der aktuelle Schritt ist
hervorgehoben. Taschen sind vereinfacht zeilenweise dargestellt (`web/js/toolpath.js`); maßgeblich bleibt die
Simulation in Maestro.

**Sauger-Vorschlag:** Für jedes Teil schlägt das Tool Konsolen (X) und Drehsauger (Y, Winkel) vor – große Sauger
145×145, wo sie passen, sonst schmale 145×55, bei sehr schmalen Teilen 145×30. Der 145×55 ist **exzentrisch**: die
Saugfläche sitzt 45 mm neben der Drehachse (bei 0° in +Y) und läuft beim Drehen um sie herum – Y im Programm ist die
Drehachse, die Saugfläche wird daneben gerechnet (0°/180°, 90°/270° bzw. parallel zu schrägen Kanten); so kommt sie auch an
schmale Teile und Ränder, das Gehäuse darf dabei über die Platte hinausstehen; Drehsauger auch parallel zu schrägen Kanten. Abstand zur Plattenkante
(Formatfräser, Säge) und zu allem, was durchgeht (Durchbrüche, Durchgangsbohrungen), Auflagefläche = Unterseite. Anzeige
gestrichelt in der Draufsicht und als Sauger/Konsolen unter der Platte in 3D; Ausgabe direkt nach
`SetWorkpieceSetupPosition`. Einstellungen unter *Sauger & Konsolen* (Codes wie in Maestro, Maße, Anzahl Konsolen,
Abstände; Ausgabe abschaltbar).

**Weitere Funktionen aus dem Handbuch** (Einstellungen; alles außer dem Kommentar ist standardmäßig aus, bis in
Maestro geprüft):

| Einstellung | Ausgabe |
|---|---|
| *Programmkopf → Kommentar und Beschreibung* (an) | `SetComment("STEP2XCS: <Teil>")`, `SetDescription("L x B x D mm, n Bearbeitungen")` direkt nach `SetMachiningParameters` |
| *Programmkopf → Maestro optimiert beim Laden* | `SetOptimization(true)` |
| *Programmkopf → Tisch beim Laden einrichten* | `SetAutoSetup(true)` (z. B. mit dem Sauger-Vorschlag) |
| *Programmkopf → Werkstück: echte Außenkontur* | bei Sonderteilen Kontur als Polylinie + `CreateFinishedWorkpieceFromExtrusion("Workpiece", D)` statt Quader; Rohteil bleibt der Quader mit Aufmaß |
| *Formatfräsen & Konturen → Haltestege* | bei Durchbrüchen/Rundlöchern `SetParametricAttribute2("TAB", Länge, Höhe, 0.5)` in der Mitte der längsten Elemente (alle oder nur kleine Innenstücke) |
| *Formatfräsen & Konturen → spiralförmig eintauchen* | vor Durchbrüchen/Rundlöchern `CreateHelicMillingStrategy(Zustellung, letzte Zustellung, Schlichtgang)` |
| *Bohren → In Stufen bohren ab Tiefe* | vor tiefen Bohrungen `CreateMultiStepDrillingStrategy(true, Anzahl, Tiefe je Stufe, true)`, danach `CreateSingleStepDrillingStrategy()` |

**Hell/Dunkel:** Schalter oben rechts; die Wahl wird im Browser gemerkt (ohne Wahl gilt die Systemeinstellung).

**Farben:** Jede Bearbeitungsart hat eine feste Farbe, gleich in Draufsicht, Schrittliste (farbiger Balken links),
Zeitleiste und am Werkzeug in der Animation: Bohrung oben blau, Tasche orange, Fräsen/Kontur grün-türkis, Nut/Falz gelb,
Fase/schräge Kante pink, schräge Bohrung grün, Kante (Bohrung/Tasche) violett. Die Palette ist für hell und dunkel
getrennt abgestimmt und auch bei Farbsehschwäche unterscheidbar; die Legende unter der Ansicht nennt alle Farben.

Ausrichtung: Die längste Seite wird X, Bearbeitungsseite ist die Seite mit den meisten Bearbeitungen.
Nullpunkt vorne links unten. Werkzeuge, Zugaben und Bohrerlisten sind im Web-Tool unter
*Werkzeuge & Regeln* einstellbar (Standard aus `maestro/werkzeuge/def.tlgx` und den Beispielen).

## In Maestro bestätigt

- **Arbeitsfeld** (`SetMachiningParameters`, Vorgabe aus der Werkstatt, im Web-Tool unter *Werkzeuge & Regeln* änderbar):

  | Breite Y | Länge X bis 1300 mm | Länge X über 1300 mm |
  |---|---|---|
  | bis 620 mm | `IJ` | `IL` |
  | über 620 mm | `AB` | `AD` |

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
- **Handbuch widerspricht sich (Tabelle ↔ Beispiel) – in Maestro prüfen:**
  - `CreateHelicMillingStrategy`: ausgegeben in der Form des Beispiels `(Zustellung, letzte Zustellung, true/false)`;
    die Tabelle nennt `(Zustellung, Schlichtgang, letzte Zustellung)`.
  - `CreateMultiStepDrillingStrategy(true, n, t, true)`: laut Tabelle „true = Tiefe je Stufe t verwenden“; die Kommentare
    der Beispiele sagen das Gegenteil. Passt die Stufenzahl nicht, `true` ↔ `false` tauschen.
  - Haltesteg `SetParametricAttribute2("TAB", 5, 2, 0.5)`: Bedeutung von 5/2 (Länge/Höhe) aus dem Beispiel abgeleitet.
  - `CreateFinishedWorkpieceFromExtrusion`: Kontur vor dem Werkstück, Nullpunkt = linke untere Ecke der Kontur.
- **Sauger (`SetBarPosition`, `SetSuctionCupPosition`):** Codes der Sauger müssen genau wie in der Maestro-Spannmittelliste
  heißen (Vorgabe `H75-M-145x145`, `H75-M-145x55`, `H75-M-145x30` wie in der Spannmittelliste). Zu prüfen: Koordinaten zum Werkstück-Nullpunkt (fertiges
  Teil), Sauger-Nummer je Konsole ab 1, Winkel 0° = lange Seite in X. Exzentrischer 145×55: Lage bei 0° aus der Maestro-
  Simulation abgelesen (Saugfläche 45 mm in +Y); **Drehrichtung** bei 90°/270° prüfen – zählt Maestro im Uhrzeigersinn,
  in den Einstellungen *Saugerwinkel im Uhrzeigersinn zählen* einschalten. Gehäuse ragt teils unter den Plattenrand:
  prüfen, dass der Formatfräser (Dicke + 3) es nicht berührt.
- **Taschen in den Kanten:** Geometrie in denselben Kantenkoordinaten wie die Kantenbohrungen (X waagerecht, Y = Höhe ab
  Plattenunterseite); in Maestro noch nicht simuliert.
- **Gekrümmte Flächen** (neu, standardmäßig aus; erst in der Maestro-Simulation prüfen):
  - Schräge an Rundungen: `CreatePolyline` mit Bögen + `CreateSlantedRoughFinish(…, Winkel B, Anstellung 1/2, …)` wie bei
    geraden Schrägen. Zu prüfen: ob Maestro die Neigung entlang der Bögen quer zur Bahn mitführt (Anstellung 1/2), ob die
    Bahn = Werkzeugmitte auf der Oberseite ist (Versatz r / cos B) und wie das Werkzeug am Startpunkt (Mitte der längsten
    Geraden) eintaucht – ohne Anfahrstrategie, ggf. Tempo/Anfahrt in Maestro ergänzen.
  - Zeilenfräsen: Bereich als Rechteck-`CreatePolyline`, `CreateRoughFinish` ohne Strategie, dann `CreateToolpath` +
    `AddSegmentToToolpath` (Handbuch 3.8.16). Angenommen: Koordinaten in der Ebene „Top“, Z relativ zur Oberseite
    (negativ = ins Material, wie im Handbuch-Beispiel), Punkt = **Spitze** des Kugelfräsers, ohne Radiuskorrektur.
    Zwischen den Zeilen wird auf +5 mm über der Oberseite abgehoben. Bahn im 3D-Netz von OpenCascade berechnet:
    Abweichung zur echten Fläche bis etwa 0,05 mm (Sehnenfehler), immer auf der sicheren Seite (Aufmaß, nie Einschnitt).
    Viele Punkte (Mulde 600 × 400: rund 6000 Zeilen) – Ladezeit in Maestro beobachten.
  - Zeilenfräsen braucht das 3D-Netz: im Web-Tool lädt OpenCascade beim Einschalten automatisch, in der
    Kommandozeile mit `--kugelfraesen`.
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
| `web/` | Web-Tool (`index.html`) und die JS-Module `step.js` (STEP-Leser), `panel.js` (Erkennung), `xcs.js` (Ausgabe), `surface.js` (Kugelfräser-Bahn), `occtmesh.js` (3D-Netz) |
| `cli/` | Kommandozeilen-Aufruf |
| `test/` | Tests (`npm test`) und Test-STEP-Dateien |
| `tools/` | `make_fixtures.py` erzeugt die Test-STEP-Dateien (CadQuery), `build_defaults.js` die eingebaute Werkzeugliste und Beispiele |
| `step/` | Original-STEP-Exporte aus Onshape |
| `maestro/beispiele/` | Beispiel-Programme (.xcs) aus Maestro – Referenz für das Format |
| `maestro/werkzeuge/` | Werkzeugdaten (`def.tlgx`) |
| `maestro/makros/` | SCM-Makros |
| `maestro/doku/` | Handbuch der Script-Sprache (MSL-Referenz, Rev. 17) |
| `featurescript/` | ursprünglich geplanter Weg über Onshape-FeatureScript (derzeit nicht verfolgt) |
