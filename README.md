# STEP → XCS für SCM Maestro

Werkzeug, das aus Plattenteilen (STEP) automatisch Xilog-Skripte (`.xcs`) erzeugt.
Der X-Konverter von Maestro übersetzt sie anschließend in `.pgmx`.

```
STEP oder DXF (Onshape o. a. CAD) ──► Web-Tool / CLI ──► .xcs ──► X-Konverter ──► .pgmx ──► Maestro
```

## Benutzen

**Im Browser:** `web/index.html` öffnen (Doppelklick genügt, es läuft komplett offline im Browser).
STEP-Dateien hineinziehen, Draufsicht und Bearbeitungen prüfen, ggf. *Drehen 90°* / *Wenden*,
dann *Speichern* (einzeln) oder *Alle als ZIP*.

**Etiketten:** *Etikett* (am Teil) bzw. *Etiketten* (alle Teile) öffnet eine Vorschau, *Drucken* druckt über den Browser
auf den Etikettendrucker – je Teil ein Etikett mit Teilename (= Dateiname), Maßen L × B × D, Profil, „Seite 1 + 2“ bei
zweiseitigen Teilen, Datum, Anzahl der Bearbeitungen und einer schwarz-weißen Draufsicht mit Länge/Breite, Nullpunkt,
Bohrungen (Kantenbohrungen als Striche), Durchbrüchen und Taschen. Größe (Vorgabe 40 × 60 mm), Drehung um 90° (wenn der
Drucker das Etikett quer einzieht), Draufsicht an/aus und eine Zusatzzeile (Auftrag, Kunde …) unter *Werkzeuge & Regeln →
Etiketten*. Im Druckdialog den Etikettendrucker wählen, Papier = Etikettgröße, Ränder „Keine“, Skalierung 100 %.

**DXF (2D-Zeichnung):** wird wie STEP geladen, ohne Layer-Steuerung. Die größte geschlossene Kontur ist das Teil
(lange Seite in X, *Drehen 90°* möglich), alles darin wird vorgeschlagen: Kreis mit passendem Bohrer → Bohrung
(Ø ≥ 30: 13 mm tief, sonst 12), anderer Kreis oder geschlossene Kontur → Durchbruch; was in einem Durchbruch liegt, fällt mit
heraus (ignorieren), was in einer Tasche liegt, wird Insel. Im Kasten *DXF-Erkennung* rechts lassen sich die Plattendicke
(Vorgabe in *Werkzeuge & Regeln*, 19 mm) und je Kontur Art (Bohrung, Durchbruch, Tasche, Insel, ignorieren) und Tiefe ändern;
✓ markiert den Vorschlag. Gelesen werden LINE, ARC, CIRCLE, LWPOLYLINE/POLYLINE (mit Bögen), ELLIPSE und SPLINE (als
kurze Geraden), Blöcke (INSERT, auch gedreht/gespiegelt) und die Einheit (`$INSUNITS`); Texte, Maße, Schraffuren und der
Papierbereich (Layouts, Zeichnungsrahmen) werden übergangen, doppelt gezeichnete Konturen nur einmal verwendet, Kreise
aus Bögen/Polylinien als Kreis erkannt, offene Linienzüge und Konturen außerhalb des Teils als Hinweis gemeldet. 3D-Ansicht und *Wenden*
gibt es nur für STEP.

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
`--zweiseitig` (Teile mit Bearbeitungen von unten als `_S1`/`_S2`),
`--kugelfraesen` (gewölbte Flächen zeilenfräsen, lädt OpenCascade), `--4achs` (gewölbte Oberseite als Zylinder 4-achsig mit
dem Schaftfräser abzeilen, übrige Flächen Kugelfräser), `--oszillieren`, `--schleifen` (siehe unten), `--dicke mm` (Plattendicke für `.dxf`, Standard 19;
Erkennungen wie vorgeschlagen).

### Vorschub und Drehzahl

Die Schnittwerte kommen aus der Werkzeugdatei (`.tlgx`, je Werkzeug Standard und Bereich: Vorschub und Eintauchen in
m/min, Drehzahl in U/min). In der Schrittliste zeigt jede Bearbeitung sie in einem Untermenü (bei Bohrungen: Drehzahl und
Bohrvorschub des Bohrers mit passendem Ø). Bleibt ein Feld leer, steht im Programm `-1` – Maestro nimmt dann den Wert
aus seiner Werkzeugdatei. Ein eigener Wert gilt nur für diese Bearbeitung dieses Teils und wird direkt in den Befehl
geschrieben (`inputSpeed`, `rotSpeed`, `speed` bei `CreateRoughFinish`, `CreateContourPocket`, `CreateChamfer`,
`CreateSlantedRoughFinish`, `CreateSlot`, `CreateBladeCut`; `rotSpeed`, `boringSpeed` bei `CreateDrill`). Werte außerhalb
des Bereichs aus der Werkzeugdatei werden markiert und als Hinweis gemeldet. Ein anderes Werkzeug setzt die eigenen Werte
zurück. Beim zweistufigen Formatfräsen gelten sie für den Nachfräser (der Vorfräser behält die Werte aus der Datei).

### Oszillieren und Schleifen (*Werkzeuge & Regeln → Oszillieren & Schleifen*, auch je Werkstück-Profil)

- **Formatfräsen oszillierend:** Die Frästiefe pendelt entlang der Kontur zwischen *mindestens* und *höchstens* unter der
  Platte (Vorgabe 2–8 mm), damit die Schneide über die ganze Länge genutzt wird. Ein Durchgang ohne Zustellung;
  Hinweis, wenn Dicke + höchstens länger als die Schneide ist (E014: 28 mm → bei 19 mm Platte höchstens 9 mm).
- **Schleifen mit der Schleifwalze** (`E091`, Ø 70,5, Schneidenlänge 90) nach dem Formatfräsen entlang der Außenkontur, immer
  oszillierend, Walze ragt *mindestens* 10 bis *höchstens* 30 mm unter die Platte (einstellbar), **An- und Abfahrt immer
  im Bogen** (`SetApproachStrategy(false, true, Faktor)`, Bogen = Faktor × Walzenradius), Überlappung am Ende 20 mm.
  Mehrere Umläufe: jeder weitere um eine halbe Schwingung versetzt. *Schleifzugabe*: das Formatfräsen bleibt um diesen
  Wert größer (`overMaterial`), die Walze schleift auf Endmaß. Innenecken/-rundungen kleiner als der Walzenradius → Hinweis.
- Umsetzung: Die Kontur wird an den Wendepunkten geteilt, jeder Punkt bekommt seine Tiefe mit `SetAttribute("DEPTH", …)`
  (Handbuch 3.8.5.1.2); Maestro rechnet Radiuskorrektur und Bogen-An-/Abfahrt weiter selbst. Die Schwingungslänge
  (*Weg je Schwingung*, Vorgabe 300 mm) wird so angepasst, dass ganze Schwingungen auf einen Umlauf passen – Ende auf
  derselben Tiefe wie der Anfang.

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
| Außenkontur rechteckig | Formatfräsen Rechteck (`E014`, Tiefe D+3, Korrektur rechts), Verlassen im Bogen mit 2 mm Überlappung (`SetRetractStrategy(false, true, 2, 2)`, einstellbar) |
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
| Schräge über die ganze Dicke **an Rundungen** (Kegelflächen, z. B. umlaufend geschrägte Platte mit Eckenradien, schräger Ausschnitt, schräges Rundloch) | Schalter je Teil *Schräge an Rundungen: Aus / 5-Achs fräsen* (erscheint nur, wenn so etwas erkannt wird). An: ganze Kontur am Stück mit `CreateSlantedRoughFinish` (Werkzeug quer zur Bahn geneigt, `E016`, Tiefe D+2), Bahn um r / cos(Neigung) zur Abfallseite versetzt, gerade Abschnitte gehören mit dazu (keine Sägeschnitte); an einem Ausschnitt nach dem Durchbruch. Aus: gerade Abschnitte wie bisher (Säge/Schrägfräsen), die Kegel gehören zur Kontur (Formatfräsen bzw. senkrechter Durchbruch an der engsten Stelle), Hinweis |
| **gewölbte Flächen** von oben (Kugelmulde, Hohlkehle, gerundete Kante, runder Nutgrund, Freiform) | Schalter je Teil *Gewölbte Flächen: Aus / Kugelfräser / 4-Achs Schaftfräser* (nur, wenn erkannt). *Kugelfräser:* Zeilenfräsen mit `E055`, Bahn aus dem 3D-Netz berechnet (Kugel berührt Fläche, Kanten und Ecken – schneidet nirgends ins Teil, an gewölbten Rändern fräst die Kugelseite bis unten, nie unter die Plattenunterseite, nicht über Durchbrüchen und Rundlöchern; kommt nach den Durchbrüchen), Vorfräsen in Stufen und Schlichten, explizite Werkzeugbahn `CreateToolpath` / `AddSegmentToToolpath`. Flächen, die weder oben noch unten anstoßen, nur wenn sie nach oben zeigen (z. B. runder Nutgrund). Aus: Hinweis |
| **Zylinderfläche nach außen gewölbt** als ganze Oberseite (über volle Länge und Breite), Achse liegend in X oder Y | Wahl *4-Achs Schaftfräser* (Neigung bis 45°, einstellbar; darüber oder bei anderen Formen Kugelfräser): je Zeile eine tangential geneigte Ebene `CreateWorkplane(…, Drehung Z, Neigung X)`, darauf eine Gerade längs der Achse über die ganze Länge (+ Ein-/Auslauf), `CreateRoughFinish` Tiefe 0, Werkzeugmitte – der Fräser (`E020`) steht senkrecht auf der Fläche und fräst mit der Stirn. Vorfräsen in Schichten (10 mm) auf größerem Radius nur dort, wo Rohteil ist; Schlichten mit 10 mm Zeilenabstand (Resthöhe ≈ s² / 8R, bei R 310: 0,04 mm). Kein 3D-Netz nötig |
| **Kantenrundung** (nach außen gerundet, Radius bis 5,5 mm) oben oder unten an Außenkontur oder Durchbruch (nicht an Rundlöchern – dort Kugelfräser) | Radiusfräser R2: oben `E061` mit Tiefe 0, unten `E060` mit Tiefe = Dicke + dz (dz = 1), entlang der Kontur mit Korrektur rechts, umlaufend mit An-/Abfahren wie das Formatfräsen, offene Kanten mit tangentialem Auslauf an Außenecken (endet die Rundung an einer Innenecke oder mitten in der Kante: Hinweis); eigene Art *Kantenrundungen* nach dem Formatfräsen. Andere Radien: Hinweis (Radius in den Einstellungen). Hohlkehlen sind gewölbte Flächen (Kugelfräser) |
| Zustellungen | `CreateUnidirectionalMillingStrategy` (Konturen) / `CreateContourParallelStrategy` (Taschen) |
| Bearbeitungen von unten (Bohrungen, Taschen, Nuten, Falze, Flächen) | Hinweis; Schalter je Teil **Einseitig / Zweiseitig** (erscheint nur dann). *Zweiseitig*: zwei Programme `Name_S1.xcs` / `Name_S2.xcs` (auch .pgmx und ZIP). **Seite 1** wie bisher mit Rohteil-Aufmaß und Formatfräsen. **Seite 2** = Platte um die Y-Achse gewendet (X → L − x, Y bleibt, Nullpunkt wieder vorne links unten), nur was von Seite 1 nicht ging (Sacklöcher, Taschen, Nuten, Falze, Flächen von unten), ohne Rohteil-Versatz (`CreateRawWorkpiece(…, 0, 0, 0, 0, …)`, `SetWorkpieceSetupPosition(0, 0, 0, 0)`), ohne Formatfräsen, Durchbrüche, Durchgangsbohrungen, Kanten und Rundungen. In der Ansicht *Seite 1 / Seite 2* umschalten (Werkzeuge, Zustellung, Reihenfolge, Löschen je Seite). Sauger meiden auf beiden Seiten die offenen Stellen der Gegenseite |
| Auflagefläche unten | **Sauger-Vorschlag**: `SetBarPosition(Konsole, X)` und `SetSuctionCupPosition(Nr, Y, Winkel, "Code")` – siehe unten |

**Einstellungen** (*Werkzeuge & Regeln*) wirken sofort; dauerhaft gespeichert werden sie mit dem Knopf *Einstellungen
speichern* in der Kopfzeile (zeigt ungespeicherte Änderungen an, beim Schließen kommt eine Nachfrage). Sie sind nach Bearbeitungsart gruppiert: Bohren, Taschen, Formatfräsen & Konturen,
Säge, Fasen, Rundungen & schräge Kanten (u. a. Radiusfräser oben/unten mit Tiefe), Gekrümmte Flächen (Kugelfräser,
Zeilenabstand, Zustellung, Punktabstand, Toleranz, Abheben; 4-Achs: Schaftfräser, Zeilenabstand, Schichtdicke),
Sauger & Konsolen, Programmkopf, Arbeitsfeld & Rohteil, X-Konverter. Taschen haben eine eigene **Zustelltiefe** (0 = wie Fräsen),
die Säge eine eigene **Extra-Tiefe** und optional **Vorritzen** (`CreateSectioningMillingStrategy(Tiefe, Abstand außen, 0)`
vor dem `CreateBladeCut`: erster Schnitt in Ritztiefe, Rückweg auf volle Tiefe).

**Werkzeuge:** Das Web-Tool liest die Werkzeugliste (`.tlgx`) mit Durchmesser und Schneidenlänge.
Für jede Fräsbearbeitung gibt es eine Auswahlliste mit allen Fräsern, Favoriten (★ im eigenen Bereich *Werkzeugliste & Favoriten*)
stehen oben. Zustellung global oder je Bearbeitung; Warnung, wenn die Zustellung länger als die Schneide ist.
`node tools/build_defaults.js` erzeugt die eingebaute Standardliste neu.

**Frästiefe:** Durchgehende Fräsungen (Formatfräsen, Konturausschnitte, Durchbrüche, Rundlöcher) fräsen
Plattendicke + Zugabe (Einstellungen *Formatfräsen: Dicke +* bzw. *Ausschnitte: Dicke +*). Je Teil lässt sich die Tiefe
in der Bearbeitungsliste im Feld *Tiefe* absolut in mm setzen; ist sie kleiner als die Plattendicke, gibt es einen Hinweis.

**Werkstück-Profile:** Ganz oben stehen fünf frei benennbare Knöpfe (Vorgabe: *Spanplatte*, *Massivholz* = Formatfräsen
zweistufig, *Profil 3* bis *Profil 5*). Ein Klick gibt dem gewählten Teil dieses Profil (aktiver Knopf farbig, noch einmal
klicken = ohne Profil); neue Teile bekommen das zuletzt gewählte, *Für alle Teile* setzt es überall. Im Bereich
*Werkstück-Profile* je Profil Name und die Werte, die es festlegt: Formatfräser, zweistufig ja/nein, Vorfräser, Aufmaß,
Zugabe, Zustellungen, Fräser für Ausschnitte/Taschen/Falz/Fasen/Schrägen, Radiusfräser, Sägen, Kugel- und 4-Achs-Fräser.
Leere Felder nehmen die Einstellung aus *Werkzeuge & Regeln*; Änderungen am einzelnen Teil gehen dem Profil vor.
Das Profil steht im Programmkopf (`SetComment("STEP2XCS: Teil - Profil Massivholz")`). CLI: `--profil 1…5`.

**Bearbeitung löschen:** In der Schrittliste löscht ✕ eine erkannte Bearbeitung (bei Bohrungen die ganze Gruppe) aus dem
Programm, aus Animation und Zählung. In der Draufsicht und in der 3D-Ansicht ist sie rot dort eingezeichnet, wo sie wäre.
Sie steht unter *Gelöscht / unterdrückt* und lässt sich dort wiederherstellen
(je Teil und Seite; beim Drehen/Wenden zurückgesetzt).

**Reihenfolge:**
- *Reihenfolge-Regel* (eigener aufklappbarer Bereich unter *Werkzeuge & Regeln*, mit eigenem Speichern-Knopf): die Bearbeitungsarten (Bohrungen oben, Kantenbohrungen, schräge
  Bohrungen, Nuten, Taschen, Falze, Fasen, schräge Kanten, Sägeschnitte, Bearbeitungen auf schrägen Ebenen, gewölbte
  Flächen, Durchbrüche, Konturausschnitte, Formatfräsen, Kantenrundungen) mit ↑/↓ in die gewünschte Folge bringen, mit
  *Regel verwenden* zu- und abschalten. Standard: erst bohren, dann fräsen, Formatfräsen und danach die Kantenrundungen
  zuletzt. Fest bleibt: Bearbeitungen auf einer Schnittfläche nach dem Sägeschnitt, die Schräge an einem Ausschnitt nach
  dem Durchbruch. Ist die Regel aus, bleibt die erkannte Reihenfolge (wie in den Maestro-Beispielen).
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
- **DXF-Import:** erzeugt dieselben Befehle wie STEP (Bohrungen, Durchbrüche, Taschen, Sonderkontur); Lage und Drehrichtung
  der Konturen an einer echten Werkstatt-DXF in der Simulation prüfen.
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
- **Überlappung beim Verlassen (Formatfräsen):** `SetRetractStrategy(false, true, 2, 2)` – laut Handbuch 4. Wert =
  Überlappung; die bestätigten Beispiele haben 0. In der Simulation prüfen, dass die Kontur um 2 mm überfahren wird.
- **Formatfräsen zweistufig:** `CreateRoughFinish("Milling_n_Vor", …, Aufmaß)` mit dem Aufmaß als 11. Wert (Handbuch),
  danach dasselbe auf Endmaß – in Maestro noch nicht bestätigt.
- **Eigene Schnittwerte:** Einheiten laut Handbuch wie in Xilog (V/F in m/min, S in U/min) – an einer Bearbeitung mit
  eigenem Vorschub in Maestro prüfen, dass der Wert so ankommt (nicht als mm/min).
- **Oszillieren / Schleifwalze:** `SetAttribute("DEPTH", Tiefe)` nach jedem Konturelement – laut Handbuch Tiefe am
  Endpunkt des Elements. Zu prüfen: Tiefe ab Oberseite wie bei `CreateRoughFinish`, Übergang zwischen den Punkten
  linear (Rampe, keine Stufe), zusammen mit Bogen-An-/Abfahrt und Überlappung. Schleifwalze `E091` als Werkzeug in
  `CreateRoughFinish` mit Korrektur rechts; Drehzahl/Vorschub kommen aus der Werkzeugdatei.
- **Taschen in den Kanten:** Geometrie in denselben Kantenkoordinaten wie die Kantenbohrungen (X waagerecht, Y = Höhe ab
  Plattenunterseite); in Maestro noch nicht simuliert.
- **Zweiseitig, Seite 2:** Rohteil = fertiges Teil (`CreateRawWorkpiece` und `SetWorkpieceSetupPosition` mit 0), Platte um Y
  gewendet, Nullpunkt vorne links unten an den Anschlägen. In der Simulation prüfen, ob die gespiegelte Lage (X → L − x)
  zur Wendung in der Werkstatt passt und die Sauger auf der fertigen Oberseite von Seite 1 richtig sitzen.
- **Kantenrundung mit dem Radiusfräser:** `E061` (oben, Tiefe 0) und `E060` (unten, Tiefe = Dicke + 1) entlang der Kontur,
  Korrektur rechts wie beim Formatfräsen. In der Simulation prüfen, ob das Profil mit diesen Tiefen genau an der
  Ober-/Unterkante sitzt (sonst Tiefe/dz in den Einstellungen anpassen).
- **4-Achs-Abzeilen (Zylinder):** je Zeile `CreateWorkplane(Name, X0, Y0, Z0, Drehung Z, Neigung X)` tangential an die
  Fläche, `CreateSegment` + `CreateRoughFinish` Tiefe 0 (Werkzeugmitte). Zu prüfen: Werkzeug steht senkrecht zur Ebene,
  Tiefe 0 = Stirn auf der Ebene, Eintauchen außerhalb des Teils (Start vor der Stirnseite), Neigung bis 45° (Einstellung *4-Achs: größte Neigung*) im Kopf.
  Viele Ebenen (Teil 400 × 250: 46) – ggf. später als eine 3D-Bahn (`Create3DRoughFinish`) zusammenfassen.
- **Gekrümmte Flächen** (neu, standardmäßig aus; erst in der Maestro-Simulation prüfen):
  - Schräge an Rundungen: `CreatePolyline` mit Bögen + `CreateSlantedRoughFinish(…, Winkel B, Anstellung 1/2, …)` wie bei
    geraden Schrägen. Zu prüfen: ob Maestro die Neigung entlang der Bögen quer zur Bahn mitführt (Anstellung 1/2), ob die
    Bahn = Werkzeugmitte auf der Oberseite ist (Versatz r / cos B) und wie das Werkzeug am Startpunkt (Mitte der längsten
    Geraden) eintaucht – ohne Anfahrstrategie, ggf. Tempo/Anfahrt in Maestro ergänzen.
  - Zeilenfräsen: Bereich als Rechteck-`CreatePolyline`, `CreateRoughFinish` ohne Strategie, dann `CreateToolpath` +
    `AddSegmentToToolpath` (Handbuch 3.8.16). Angenommen: Koordinaten in der Ebene „Top“, Z relativ zur Oberseite
    (negativ = ins Material, wie im Handbuch-Beispiel), Punkt = **Spitze** des Kugelfräsers, ohne Radiuskorrektur.
    Zwischen den Zeilen wird auf +5 mm über der Oberseite abgehoben. Bahn im 3D-Netz von OpenCascade berechnet:
    Abweichung zur echten Fläche bis etwa 0,05 mm (Sehnenfehler des Netzes: bei Mulden Aufmaß, bei nach außen gewölbten
    Flächen bis etwa so viel zu tief); Zusammenfassen von Punkten nur nach oben (Aufmaß bis 0,02 mm).
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
| `web/` | Web-Tool (`index.html`) und die JS-Module `step.js` (STEP-Leser), `panel.js` (Erkennung), `xcs.js` (Ausgabe), `surface.js` (Kugelfräser-Bahn), `occtmesh.js` (3D-Netz), `dxf.js` (DXF-Leser) |
| `cli/` | Kommandozeilen-Aufruf |
| `test/` | Tests (`npm test`) und Test-STEP/DXF-Dateien |
| `tools/` | `make_fixtures.py` erzeugt die Test-STEP-Dateien (CadQuery), `make_dxf.js` die Test-DXF, `build_defaults.js` die eingebaute Werkzeugliste und Beispiele |
| `step/` | Original-STEP-Exporte aus Onshape |
| `maestro/beispiele/` | Beispiel-Programme (.xcs) aus Maestro – Referenz für das Format |
| `maestro/werkzeuge/` | Werkzeugdaten (`def.tlgx`) |
| `maestro/makros/` | SCM-Makros |
| `maestro/doku/` | Handbuch der Script-Sprache (MSL-Referenz, Rev. 17) |
| `featurescript/` | ursprünglich geplanter Weg über Onshape-FeatureScript (derzeit nicht verfolgt) |
