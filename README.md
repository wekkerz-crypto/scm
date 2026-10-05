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

**Auf einem Webserver** (z. B. Strato-Webspace, Testserver): `npm run build:web` → `dist/Step2Maestro-Webserver.zip`
mit dem Ordner `step2maestro/` zum Hochladen und `ANLEITUNG.txt` (Hochladen per SFTP/Datei-Manager, Subdomain,
Verzeichnisschutz, Einbinden in den Strato KI-Website-Builder per Link oder iframe). Rein statisch, kein PHP; die Schriften
liegen lokal bei (`tools/webserver/fonts`, statt Google Fonts), `.htaccess` sperrt Suchmaschinen und Browser-Cache.

**Kommandozeile** (Node.js ≥ 18):

```bash
node cli/step2xcs.js teil.step weitere.step -o ausgabe/ --bat
```

Weitere Schalter: `--step mm` (Zustellung), `--no-order-rule`, `--schraege-5achs` (Schrägen an Rundungen 5-achsig fräsen),
`--zweiseitig` (Teile mit Bearbeitungen von unten als `_S1`/`_S2`),
`--kugelfraesen` (gewölbte Flächen zeilenfräsen, lädt OpenCascade), `--4achs` (gewölbte Oberseite als Zylinder 4-achsig mit
dem Schaftfräser abzeilen, übrige Flächen Kugelfräser), `--oszillieren`, `--schleifen` (siehe unten), `--dicke mm` (Plattendicke für `.dxf`, Standard 19;
Erkennungen wie vorgeschlagen).

### Zapfen auf einer Schräge (z. B. Gehrung mit Feder)

Ragt aus einer schrägen Kante über die ganze Dicke ein Zapfen heraus (Beispiel `test/fixtures/zapfen.step`: Gehrung 45°,
Zapfen 134,5 × 13,8, 8 mm hoch), wird die Kante nicht mehr durchgesägt (das würde den Zapfen abtrennen), sondern:
1. **Vorschnitt** parallel zur Schräge, um die Zapfenhöhe (+ *Zugabe*) nach außen versetzt – Säge (Vorgabe) oder
   schräg gefräst (*Werkzeuge & Regeln → Fasen, Rundungen & schräge Kanten*).
2. **Tasche auf der geneigten Ebene** in Höhe der Zapfenoberseite (`CreateWorkplane("Zapfen_n", …)`): die ganze Fläche der
   Schräge, rundum um Fräserradius + 1 größer, mit dem **Zapfen als Insel**, so tief wie der Zapfen (Fräser `E020`
   senkrecht zur Schräge). Mit Zugabe > 0 wird vorher die Zapfenoberseite plan gefräst.
Mehrere Zapfen mit verschiedener Höhe: in Stufen von oben nach unten (Inseln = die Zapfen, die über die Stufe ragen).
Der Rand der Tasche wird so groß, dass der Fräser zwischen Zapfen und Rand durchpasst. Nur die Innenkontur des Zapfens wird
Insel – Taschen/Bohrungen in derselben Schräge werden wie sonst auf der Schräge bearbeitet. Reicht ein Zapfen bis an den
Rand der Schräge (oder eine Feder über die ganze Länge): nichts ausgegeben, Hinweis. Die Platte wird so gelegt, dass die
Schräge nach oben zeigt; zeigt sie nach unten, gilt sie als Bearbeitung von unten (zweiseitig: auf Seite 2). An der Unterkante der
Schräge taucht der Fräser um ≈ Radius × sin(Neigung) unter die Platte – dort keine Sauger/Gehäuse über der Kante.

### Clamex (Lamello P-System)

**So in der STEP modellieren:** die Nut so, wie die Scheibe sie fräst – Kreis **Ø 100** (Radius 50) auf der Mittelebene der
Nut, Mittelpunkt **36 mm** vor der Oberfläche (= 14 mm tief), symmetrisch in Nutbreite (z. B. 6 mm) extrudieren und abziehen.
Das Tool erkennt jedes Kreissegment R 40–60 zwischen zwei parallelen Wänden 3–12 mm Abstand als Clamex-Nut (nicht als Tasche
oder gewölbte Fläche) – in der Kante, auf einer Gehrung oder in der Fläche (Beispiele `test/fixtures/schrank1.step`,
`test/fixtures/clamex_korpus.step`). Auch Nuten aus Bauteil-Bibliotheken (Lamello), deren Nutgrund eine Extrusions- oder
Freiformfläche ist, werden erkannt (an den Seitenwänden mit Kreisbogen); mehrere Nuten auf einer Achse werden getrennt.

**Programm – Standard: SCM-Makro `SawCut_Lamello`** (Makrohilfe: `maestro/doku/SawCut_Lamello_Makrohilfe.pdf`) genau wie
in den Werkstatt-Programmen `maestro/beispiele/5_…10_` (Korpus mit Clamex P-14; Vergleich im Test, Zeichen für Zeichen):
`CreateMacro("SawCut_Lamello_n", "SawCut_Lamello", …)` mit 48 Werten nach Position, je **Kante/Linie ein Makro** – Start →
Ende über alle Verbinder (gleicher Abstand), Anzahl an Position 28; sonst je Verbinder ein Makro (Ende 200 mm weiter, Anzahl 1).
Drei Vorlagen (*Werkzeuge & Regeln → Clamex*, Platzhalter `{sx} {sy} {ex} {ey} {angle} {angleZ} {T} {n} {h} {type} {saw}`):
- **Kante** (Winkel 90, `E030`), **Gehrung** nach dem Sägeschnitt (Winkel 90 − Neigung, z. B. 45; Säge des Schnitts, Punkt auf
  der längeren Kante), **Fläche** (Winkel 0, `E032`, Laufrichtung längs der Nut).
- *Winkel um Z* = Laufrichtung: vorne 0, rechts 90, hinten 180, links −90. *Höhe* (Pos. 41) = Oberkante → Nutmitte entlang der
  Schnittfläche (z. B. 8,54 bei 19 mm), *Nuttyp* (Pos. 43) aus der Nuttiefe („14“ = P-14).

**Drehlage wie in der Werkstatt** (*Arbeitsfeld & Rohteil → Lage auf der Maschine*, Standard *wie im Korpus-Modell*): X der
Platte = Korpusbreite (Modell-X), liegt sie nicht in der Platte die Höhe (Modell-Z, Seitenwände), sonst die Tiefe (Modell-Y);
Y zeigt in positive Modellrichtung. So kommen die Korpusteile genau wie in `5_`–`10_`. Würde die Breite Y dadurch über die
Feldgrenze (620 mm) gehen, bleibt die lange Seite in X. Für Einzelteile ohne Korpus-Lage: *lange Seite in X*.

**Alternativ direkt** (*Clamex-Nuten: direkt mit dem Scheibenfräser*): Scheibenfräser `E030` (auf Blattmitte vermessen),
Werkzeugachse = Nutachse:
- Nut in der **Kante** (Scheibe waagerecht): Ebene `Top`, Spindel von oben, Tiefe bis zur Nutmitte.
- Nut in der **Fläche** (Scheibe senkrecht): Kanten-Ebene `Left`/`Right`/`Front`/`Back` auf der näheren Seite, Werkzeug
  waagerecht über der Platte; ab 60 mm von der Kante Hinweis (Reichweite/Kollision).
- Bahn: `CreatePolyline` von außen bis zur Scheibenmitte und auf demselben Weg zurück, `CreateRoughFinish(…, Korrektur 0)`.
- Nuten von unten nur als Hinweis (Platte wenden/zweiseitig); Nutachse geneigt: direkt nicht unterstützt (Makro: ja).

### Vorschub und Drehzahl

Wird unter *Werkzeugliste & Favoriten* eine andere Werkzeugdatei geladen, ersetzt sie die bisherige (bleibt gespeichert)
und alle geladenen Teile werden sofort neu berechnet – Durchmesser, Schneidenlängen, Vorschub und Drehzahl kommen dann aus
der neuen Datei. Steht ein eingestelltes Werkzeug nicht darin, gibt es einen Hinweis.
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
- Umsetzung: Die Kontur bleibt wie ohne Oszillation; die Tiefe steht am Ende jedes Elements (`SetAttribute("DEPTH", …)`)
  und an den Wendepunkten mitten im Element (`SetParametricAttribute("DEPTH", Tiefe, Lage 0–1)`, Handbuch 3.8.5.1.2); Maestro rechnet Radiuskorrektur und Bogen-An-/Abfahrt weiter selbst. Die Schwingungslänge
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


### Möbel 3D (Gesamtansicht)

Oben umschalten zwischen **Programme** (STEP → PGMX, wie bisher) und **Möbel 3D**: alle geladenen STEP-Bauteile
zusammengebaut, so wie sie im Modell stehen (OpenCascade, three.js – offline, lädt beim ersten Öffnen).
- Drehen (linke Maustaste), verschieben (rechte Maustaste/Shift), zoomen (Mausrad); Ansichten Iso, Oben, Vorne, Rechts, Einpassen.
- **Bauteil-Nummern** am Bauteil und in der Liste rechts (Name, Maße) – dieselben Nummern wie in der Programmliste.
  Klick auf Bauteil oder Zeile wählt es (blau, unten Name/Maße, *Im Programm öffnen*), Doppelklick auf die Zeile zoomt hin.
- Je Bauteil **ein-/ausblenden** (●/◌), **nur** dieses zeigen, *Alle zeigen*; **Transparenz** für alle (das gewählte bleibt deckend).
- **Explosionsansicht** (Regler 0–100 %): die Bauteile rücken von der Mitte der Baugruppe weg; Nummern und Messungen wandern mit.
- **Messen mit Fang:** zwei Punkte anklicken, unter dem Mauszeiger zeigt eine Markierung, worauf eingerastet wird –
  □ Endpunkt/Ecke, ○ Kreismitte (mit Radius, auch Bögen und Bohrungen), △ Kantenmitte, ✕ Kante, sonst Fläche; Alt gedrückt
  = ohne Fang. Nach dem ersten Punkt Gummiband mit laufendem Abstand. Ergebnis Abstand und ΔX/ΔY/ΔZ, bei zwei parallelen
  Flächen zusätzlich der senkrechte Abstand (z. B. Plattendicke, lichte Weite). Maße gelten immer wie zusammengebaut, auch
  in der Explosionsansicht. Esc beendet.
- **Bemaßen** (📐): wie Messen mit Fang, aber die Maße **bleiben stehen** – als Maßlinie mit Pfeilen und Hilfslinien,
  nach außen versetzt, auch beim Drehen, in der Explosion und nach dem Wechsel zu den Programmen. Richtung wählbar:
  *Direkt* (Abstand der Punkte) oder nur *X*, *Y*, *Z*. Rechts die Liste **Maße** (Wert, Bauteile, ✕ löschen,
  *Alle löschen*); Entf löscht das letzte Maß. Maße an ausgeblendeten Bauteilen werden nicht gezeigt. Nach dem
  Neuladen der Seite sind die Maße weg.

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
| Stufenfalz (Stufe neben einem tieferen Falz, z. B. Fensterprofil) | eigener Falz bis zur Kante, flache Stufe vor der tiefen |
| **Profil** (Rahmenholz, Leiste: mindestens 6 × so lang wie breit, rechteckiger Umriss, nur Falze/Nuten über die ganze Länge und Bohrungen; Einstellung *Profile*) | jede Stufe ein Falz mit geradem An-/Auslauf, **Stirnseiten gesägt** (90°) statt Formatfräsen, Rohteil-Aufmaß nur in X, Lage: volle Kante vorne an den Anschlägen, Stufen hinten (Beispiel `test/fixtures/rahmenholz.step`) |
| Abgesetzter Falz (zu einer Kante offen, endet vor den Seiten, mindestens 3 × so lang wie breit) | Fräsbahn in Werkzeugmitte (Korrektur 0), Mitte einen Fräserradius vor den Enden. Zwei Varianten (Einstellung *Abgesetzter Falz: nochmal zurück*, je Teil an der Bearbeitung *Einfach / Mit Rückweg*): **mit Rückweg** (Standard) – außen über die offene Kante eintauchen, an der Flanke entlang, zurück mit der Mitte auf der Plattenkante (an den Enden bleibt nichts stehen), austauchen; **einfach** – außen eintauchen, an der Flanke entlang, über die Kante austauchen (breiter Falz: je Bahn eigenes Ein-/Austauchen). Hinweis: Innenecken bleiben mit Fräserradius rund |
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

**Einstellungen** (*Werkzeuge & Regeln*) wirken sofort und werden sofort im Browser gespeichert („✓ Automatisch gespeichert“;
erlaubt der Browser keinen Speicher, steht dort „Nicht gespeichert“). Auch die **Teileliste** bleibt nach dem Neuladen erhalten:
geladene STEP/DXF-Dateien mit allen Änderungen je Teil (Drehung, Feld, Werkzeuge, Reihenfolge, Profil, gelöschte
Bearbeitungen …) und das gewählte Teil (IndexedDB im Browser, je Gerät und Adresse). Die Beispielteile kommen nur beim
allerersten Öffnen; *Liste leeren* bleibt leer. Sie sind nach Bearbeitungsart gruppiert: Bohren, Taschen, Formatfräsen & Konturen,
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
- *Reihenfolge-Regel* (eigener aufklappbarer Bereich unter *Werkzeuge & Regeln*): die Bearbeitungsarten (Bohrungen oben, Kantenbohrungen, schräge
  Bohrungen, Nuten, Taschen, Falze, Fasen, schräge Kanten, Sägeschnitte, Bearbeitungen auf schrägen Ebenen, gewölbte
  Flächen, Durchbrüche, Konturausschnitte, Formatfräsen, Clamex, Schleifen, Kantenrundungen) mit der Maus an die richtige Stelle
  ziehen (Zeile packen, Esc bricht ab; am Handy am Griff ⠿) oder mit ↑/↓ in die gewünschte Folge bringen, mit
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
| *Formatfräsen & Konturen → Haltestege* | bei Durchbrüchen/Rundlöchern `SetParametricAttribute2("TAB", Länge, Höhe, 0.5)` in der Mitte der längsten Elemente (alle oder nur kleine Innenstücke); je Durchbruch direkt an der Bearbeitung *Haltestege Aus / An*. Stege sind in der Draufsicht und der Animation als Klötzchen quer über der Fräsbahn markiert, in 3D orange |
| *Formatfräsen & Konturen → spiralförmig eintauchen* | vor Durchbrüchen/Rundlöchern `CreateHelicMillingStrategy(Zustellung, letzte Zustellung, Schlichtgang)` |
| *Bohren → In Stufen bohren ab Tiefe* | vor tiefen Bohrungen `CreateMultiStepDrillingStrategy(true, Anzahl, Tiefe je Stufe, true)`, danach `CreateSingleStepDrillingStrategy()` |

**Hell/Dunkel:** Schalter oben rechts; die Wahl wird im Browser gemerkt (ohne Wahl gilt die Systemeinstellung).

**Farben:** Jede Bearbeitungsart hat eine feste Farbe, gleich in Draufsicht, Schrittliste (farbiger Balken links),
Zeitleiste und am Werkzeug in der Animation: Bohrung oben blau, Tasche orange, Fräsen/Kontur grün-türkis, Nut/Falz gelb,
Fase/schräge Kante pink, schräge Bohrung grün, Kante (Bohrung/Tasche) violett. Die Palette ist für hell und dunkel
getrennt abgestimmt und auch bei Farbsehschwäche unterscheidbar; die Legende unter der Ansicht nennt alle Farben.
**Zoom** in der Draufsicht (2D, auch während der Animation): Mausrad an der Mausposition, Ziehen verschiebt, Doppelklick oder
*Ganz* zeigt das ganze Teil; Knöpfe −/+ unten links, am Handy mit zwei Fingern.
**Werkzeugwechsel** zeigt die Animation, sobald das Fräswerkzeug wechselt (Bohrungen laufen über das Bohraggregat): Eilgang
zum Wechselplatz links neben der Platte, kurze Pause mit „⟳ alt → neu“, in der Anzeige *Werkzeugwechsel*. Beim **zweistufigen
Formatfräsen** sind Vor- und Nachfräsen eigene Abschnitte der Zeitleiste; das Vorfräsen ist heller (gleicher Farbton), die
Bahnmitte ist in der 2D-Ansicht in der Farbe der Stufe eingezeichnet, in 3D die Spur.

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
- **Oszillieren beim Formatfräsen:** Kontur unverändert wie ohne Oszillation, Tiefe am Elementende
  `SetAttribute("DEPTH", Tiefe)` (nach dem Element) und an den Wendepunkten im Element
  `SetParametricAttribute("DEPTH", Tiefe, Lage 0–1)` – Kontur geschlossen, Tiefe pendelt. (Die erste Fassung zerteilte die
  Kontur an den Wendepunkten; daran brach Maestro die Werkzeugkorrektur ab – entfernt.)

## Noch zu prüfen an der Maschine

Aus den Beispielen abgeleitet, aber noch nicht in Maestro getestet:

- **Kantenbohrungen vorne/hinten:** Ebenennamen `"Front"`/`"Back"` sind laut Handbuch Standardebenen;
  lokales System: Ursprung unten links, X waagerecht, Z aus der Ebene heraus (passt zur Umsetzung).
  Links/rechts ist durch `27_Oberboden.xcs` und den Maestro-Import belegt.
- **Nut:** Der Wert `-8,8` beim 2. Sägedurchgang ist laut Handbuch das Aufmaß (`overMaterial`) von `CreateSlot`.
  Die Lage der Nut (Flanke + Breite zur positiven Seite) passt dazu, ist aber noch nicht in Maestro geprüft.
- **Falz und Durchbrüche:** gibt es in den Beispielen nicht.
- **Abgesetzter Falz:** offene Polylinie (Einfahren quer über die Kante, Bahnen, Ausfahren) mit `CreateRoughFinish(…, Korrektur 0)` –
  in der Simulation prüfen, dass die Enden genau sitzen (Mitte = Ende − Fräserradius).
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
- **Zapfen auf Schräge:** Vorschnitt mit versetzter Säge-Linie und Tasche mit Insel auf `CreateWorkplane` (wie Taschen auf
  Schrägen) – in der Simulation prüfen: Lage der Ebene (Ursprung an der Unterkante + Zapfenhöhe), Zapfen bleibt stehen,
  Fräser unter der Platte an der Unterkante.
- **Clamex über `SawCut_Lamello`:** Ausgabe gleich den Werkstatt-Programmen `5_`–`10_` (Kante, Gehrung, Fläche). Offen:
  Positionen 12/13 bei Gehrungen (in `10_SW-Schrag` andere Werte als 145,9), Gehrungen mit anderem Winkel als 45°.
- **Clamex direkt:** Tiefe bis zur Blattmitte (Scheibe auf Blattmitte vermessen), Bahn hin und auf derselben Linie
  zurück, Nut in der Fläche mit waagerechtem Werkzeug auf der Kanten-Ebene – in der Simulation prüfen.
- **Eigene Schnittwerte:** Einheiten laut Handbuch wie in Xilog (V/F in m/min, S in U/min) – an einer Bearbeitung mit
  eigenem Vorschub in Maestro prüfen, dass der Wert so ankommt (nicht als mm/min).
- **Schleifwalze:** `E091` als Werkzeug in `CreateRoughFinish` mit Korrektur rechts, Bogen-An-/Abfahrt und Überlappung;
  Drehzahl/Vorschub kommen aus der Werkzeugdatei. Das Pendeln der Tiefe ist mit dem Formatfräsen bestätigt (s. o.).
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
| `tools/` | `make_fixtures.py` erzeugt die Test-STEP-Dateien (CadQuery), `make_dxf.js` die Test-DXF, `build_defaults.js` die eingebaute Werkzeugliste und Beispiele, `build_exe.sh`/`build_web.sh` die Pakete, `webserver/` Anleitung, `.htaccess` und Schriften für den Webserver |
| `step/` | Original-STEP-Exporte aus Onshape |
| `maestro/beispiele/` | Beispiel-Programme (.xcs) aus Maestro – Referenz für das Format |
| `maestro/werkzeuge/` | Werkzeugdaten (`def.tlgx`) |
| `maestro/makros/` | SCM-Makros |
| `maestro/doku/` | Handbuch der Script-Sprache (MSL-Referenz, Rev. 17), Makrohilfe `SawCut_Lamello` (Clamex) |
| `featurescript/` | ursprünglich geplanter Weg über Onshape-FeatureScript (derzeit nicht verfolgt) |
