# Weckwop

Werkstatt-Programm für Plattenteile – vom 3D-Modell bis zum fertigen, beschrifteten Teil: Projekte, CNC-Programme für
SCM Maestro, Stückliste, Zuschnittplan, Sägemodus, Etiketten, Möbel 3D und Material (früher „Step2Maestro“ bzw. „STEP2XCS“).
Aus Plattenteilen (STEP/DXF) erzeugt es automatisch Xilog-Skripte (`.xcs`).
Der X-Konverter von Maestro übersetzt sie anschließend in `.pgmx`.

```
STEP oder DXF (Onshape o. a. CAD) ──► Web-Tool / CLI ──► .xcs ──► X-Konverter ──► .pgmx ──► Maestro
```

## Benutzen

**Im Browser:** `web/index.html` öffnen (Doppelklick genügt, es läuft komplett offline im Browser).
STEP-Dateien hineinziehen, Draufsicht und Bearbeitungen prüfen, ggf. *Drehen 90°* / *Wenden*,
dann *Speichern* (einzeln) oder *Alle als ZIP*.

**Etiketten:** *Etikett* (am Teil) bzw. *Etiketten* (alle Teile) öffnet eine Vorschau, *Drucken* druckt über den Browser
auf den Etikettendrucker – je Teil ein Etikett: schwarzer Kopf mit **Bauteil-Nr.** (wie im Zuschnittplan, gleiche Teile
dieselbe) und **Material**, Teilename (= Dateiname), Maße L × B × D groß, bei zweiseitigen Teilen ein schwarzer Balken
**„⇅ 2-SEITIG · WENDEN“** (Bearbeitung von unten ohne zweite Seite: gestrichelt „! Unterseite beachten“), **Kantenbelegung**
(in der Draufsicht dicke Striche an den Seiten – Dekor 1 durchgezogen, Dekor 2 gestrichelt – und darunter je Dekor Name und
Seiten bzw. „ringsum“), Fußzeile mit Datum, Profil und Anzahl der Bearbeitungen; Draufsicht schwarz-weiß mit Länge/Breite,
Nullpunkt, Bohrungen (Kantenbohrungen als Striche), Durchbrüchen und Taschen; an der Bemaßung wahlweise das **Fertigmaß** (aus dem Modell)
oder das **Zuschnittmaß** (wie im Zuschnittplan: Rohmaß mit Aufmaß bzw. Fertigmaß, ggf. ohne Kantendicke) – für das
automatische Etikett unter *Werkzeuge & Regeln → Etiketten → Bemaßung der Draufsicht*, im Konfigurator je Draufsicht
(*Draufsicht Fertigmaß* / *Draufsicht Zuschnitt*, umschaltbar am Element; auch beide auf einem Etikett). Breite Etiketten (z. B. 60 × 40): Kopf
oben, Text links, Draufsicht rechts.

**Etiketten** (eigene Spalte oben neben *Listen*; auch über *✎ Gestalten …* in der Etiketten-Vorschau oder *Werkzeuge &
Regeln → Etiketten*): links die **Druckliste** (je Bauteil an/aus und Anzahl Etiketten, Vorgabe = Anzahl aus der Stückliste;
Klick auf ein Teil = Vorschau; *N Etiketten drucken*), in der Mitte das Etikett, rechts der **Konfigurator** – das Etikett
selbst aufbauen, an einem echten Teil als Vorschau.
- **Elemente:** Text (mit Feldern), Draufsicht, Kanten-Legende, Hinweis 2-seitig, Strichcode (Code 128), Linie, Rahmen.
- **Felder** in Texten: `{nr}` `{name}` `{masse}` `{L}` `{B}` `{D}` `{material}` `{kanten}` `{kantentext}` `{zuschnitt}`
  `{anzahl}` `{seiten}` `{bearbeitung}` `{zeit}` `{profil}` `{datum}` `{auftrag}` (= Zusatzzeile) `{datei}` – leere Felder fallen
  samt Trenner „ · “ weg.
- **Bedienen:** Element ziehen (Raster 0,5 mm, mit Alt frei), Griff unten rechts = Größe, Pfeiltasten ±0,5 mm (Umschalt ±2 mm),
  Entf löscht, Strg + D dupliziert. Rechts: Lage/Größe in mm, Schriftgröße, Schriftart, fett/kursiv, Ausrichtung, *weiß auf
  schwarz*, *verkleinern bis es passt*, *umbrechen*; Ebenen nach vorn/hinten.
- **Vorlagen:** Standard (wie automatisch), Kompakt (große Schrift), mit Strichcode, leer. Größe und Drehung oben; bei anderer
  Etikettgröße wird das Layout anteilig mitskaliert. Strichcode: Hinweis, wenn der schmalste Strich unter 0,25 mm (zu fein
  für 203 dpi) liegt.
- Jede Änderung wird sofort gespeichert (eigenes Layout); *Automatisch verwenden* schaltet zurück auf das automatische Etikett. Größe (Vorgabe 40 × 60 mm), Drehung um 90° (wenn der
Drucker das Etikett quer einzieht), Draufsicht an/aus und eine Zusatzzeile (Auftrag, Kunde …) unter *Werkzeuge & Regeln →
Etiketten*. Im Druckdialog den Etikettendrucker wählen, Papier = Etikettgröße, Ränder „Keine“, Skalierung 100 %.

**Material** (eigene Spalte, erste Fassung – wird noch überarbeitet): alles zur Materialdefinition an einer Stelle.
*Materialien im Projekt* (Art, Schmalflächen, Dicken mit Anzahl, Fläche, Plattenformat, Kante Dekor 1; *Ändern …* setzt ein
anderes Material für alle Bauteile damit), *Standard* (Platte für alle Teile, Material aus dem Bauteilnamen), *Kantenband*
(Dicke, Dekor 1/2, Farbe, Zugabe, Abzug vom Zuschnitt), *Rohplatten* (Format, Schnittfuge, Besäumen, Maserung, eigene Formate je
Material), *Eigene Farben* und **Dekore**: Bilder direkt hineinziehen oder mit *+ Bilder* wählen (mehrere auf einmal) –
der Dateiname wird zum Code („U708 ST9.jpg“ → U708 ST9), dazu Name, Maserung (H… vorbelegt) und Bildbreite in mm. Das
Programm verkleinert die Bilder (≤ 1200 px, JPEG) und speichert sie im Browser – geht auch offline (.exe, Pi). Teile mit dem
Code im Namen bekommen das Bild in Möbel 3D; *Exportieren*/*Importieren* (.json) für andere PCs oder den Pi; in der
Projektdatei (.s2m) gehen die benutzten Dekor-Bilder mit. Liegt das Programm auf dem Webserver, kommen die Dekore der
Server-Bibliothek dazu (eigene Bilder gehen bei gleichem Code vor). **Mehrere Dekore auf einmal:** Haken an den Dekoren
(oder *Alle*), dann in der Leiste darüber *Name* suchen → ersetzen (z. B. „Egger“ → „EGGER Eurodekor“; *Suchen* leer = ganzen
Namen setzen), *Bild* in mm setzen oder − 20 % / + 25 % (Maserung feiner/gröber) und *Maserung* an/aus – gilt sofort in
Möbel 3D, Listen und Etiketten. Dekore der Server-Bibliothek ändert man dort (*Server-Bibliothek ↗*). Es sind dieselben Werte wie in Stückliste, Zuschnitt und
Einstellungen – Änderung an einer Stelle gilt überall.

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

**Als Programm (Windows):** `Weckwop.exe` doppelklicken. Die .exe (ca. 2 MB, keine Installation) enthält das
komplette Web-Tool, entpackt es nach `%LOCALAPPDATA%\STEP2XCS\app` und öffnet es im Standardbrowser – ohne Internet,
ohne Server. Einstellungen und Favoriten bleiben erhalten, weil der Ort immer gleich ist (der Ordner heißt weiter
`STEP2XCS` – so sind nach dem Umstieg von `STEP2XCS.exe` alle Projekte, Einstellungen und Dekore gleich wieder da). Beim ersten Start meldet
Windows ggf. „Der Computer wurde durch Windows geschützt“ (unsigniert) → *Weitere Informationen* → *Trotzdem ausführen*.
Meldet der Virenscanner die unsignierte .exe fälschlich als Virus, die **portable Variante** nehmen
(`Weckwop-portabel.zip`: Ordner an festen Ort kopieren, `index.html` bzw. `Weckwop starten.cmd` doppelklicken) –
gleicher Funktionsumfang, ohne .exe. Dauerhaft hilft nur eine Code-Signatur.
Bauen: `npm run build:exe` (Go ≥ 1.21) → `dist/Weckwop.exe`; Quelltext in `exe/`.
Interne Namen bleiben wegen der gespeicherten Daten und laufender Installationen: Speicher-Schlüssel `step2xcs.*`,
Dateiformat `step2maestro-projekt`, Ordner `step2maestro/` im Webserver-Paket, Docker-Container `step2maestro`,
`window.Step2Maestro.api` (neu: `window.Weckwop.api`) und der Programmkopf `SetComment("STEP2XCS: …")`.

**Auf einem Webserver** (z. B. Strato-Webspace, Testserver): `npm run build:web` → `dist/Weckwop-Webserver.zip`
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
- Je Bauteil **ein-/ausblenden** (Auge) und **Fokus** (nur dieses Bauteil, heranzoomen; nochmal klicken = wieder alle), *Alle zeigen*; **Transparenz** für alle (das gewählte bleibt deckend).
- **Plattenfarbe:** *Platten* oben (gilt für alle, auch Einstellungen → 3D-Ansicht) – Eiche hell, Buche, Ahorn/Birke,
  Kirschbaum, Nussbaum, MDF roh, Weiß, Lichtgrau, Anthrazit, Schwarz oder eine eigene Farbe (mit/ohne Maserung) mit
  eigenem **Namen** (z. B. „Egger U999“) – benannte Farben bleiben unter *Eigene Farben* in der Auswahl (✕ entfernt) und
  erscheinen so in Stückliste und Zuschnittplan. Je Bauteil
  über das Farbfeld in der Liste (blau umrandet = eigene Farbe, *Wie Einstellung* nimmt sie zurück); gilt auch in der
  3D-Ansicht des Teils und wird mit der Teileliste gespeichert.
  **Kanten (Schmalflächen)** getrennt von der Oberfläche: *Wie Oberfläche*, *Spanplatte* (Späne), *Multiplex* (Furnierlagen),
  *MDF* oder *Kantenband* in einer Farbe – z. B. Oberfläche Weiß mit Spanplattenkante. Die Maserung läuft immer längs der
  langen Seite des Teils (auch auf den Schmalflächen und bei schrägen Teilen).
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
  Neuladen der Seite bleiben die Maße erhalten (auch in der Projektdatei).

- **Schnittebene:** *Schnitt* X / Y / Z, Regler für die Lage, ⇄ zeigt die andere Seite – Falze, Nuten und Verbindungen von
  innen ansehen; der Rahmen zeigt die Ebene.
- **Explosion abspielen** (▶): Teile fahren weich auseinander bzw. wieder zusammen.
- **Bild** speichert die Ansicht als PNG (mit Nummern, Maßen, Messung); **PDF** schreibt Ansicht, Maße und Stückliste als
  PDF-Datei (A4 quer); **Drucken** über den Browser.

### Listen: Stückliste, Zuschnittplan, Zeit

Dritte Seite oben (**Listen**):
- **Stückliste:** alle Teile mit Anzahl, Bezeichnung, L × B × D, Material/Kanten (Plattenfarbe), Zuschnittmaß (roh, mit
  Rohteil-Aufmaß), Fläche, geschätzter Zeit und Programmname. *Gleiche Teile zusammenfassen* (gleiche Maße, Farbe und
  gleiches Programm). **Anzahl** je Position änderbar (wird mit der Teileliste bzw. im Projekt gespeichert). Summen: Teile,
  m² je Material und Dicke, Bearbeitungszeit gesamt. **CSV / Excel** (Semikolon, deutsche Kommazahlen) und **Drucken / PDF**.
  **Material ändern:** Klick auf das Material einer Position öffnet die Farbauswahl (Dekore, Holzarten, eigene Farben, Kanten;
  *Wie Einstellung* = wieder aus dem Namen bzw. Standard). **Mehrfachauswahl** mit den Haken vorne (Umschalt + Klick = Bereich,
  Haken im Kopf = alle) – dann gilt *Material ändern …* bzw. der Klick auf das Material einer gewählten Zeile für alle gewählten.
  **Material tauschen** (rechts über der Liste): je Material im Projekt ein Knopf – stellt alle Teile mit diesem Material auf ein
  anderes um; ☑ daneben wählt alle Positionen mit diesem Material aus.
  **Regeln lernen:** Nach einer Änderung von Hand (Material, Kanten, Faser) erscheint über der Liste *Für ähnliche Teile
  merken – Name enthält „seite“ → Material Anthrazit · Kanten L1 D1*. Das Stichwort ist aus dem Bauteilnamen vorgeschlagen
  (ohne Nummern und Dekor-Codes) und änderbar; *Als Regel merken* speichert es am Gerät. Ab dann bekommen alle Teile, deren
  Name das Wort enthält, diese Werte automatisch – in jedem Projekt, solange am Teil nichts von Hand gewählt ist (ein Dekor
  im Bauteilnamen wie „U708 ST9“ geht beim Material vor). In der Liste steht dann „Regel“. Verwalten unter **Regeln …**
  (Stichwort ändern, Material/Kanten/Faser entfernen, löschen, abschalten, Nachfrage aus); Projektdateien nehmen die Regeln
  mit, beim Öffnen auf einem anderen Gerät kommen fehlende dazu.
  **+ Neues Bauteil anlegen** (großer Knopf rechts in der Leiste): Name, Länge, Breite, Dicke, Anzahl, Material – das Teil wird als Rechteck-Platte gerechnet (wie eine
  DXF) und landet mit **Formatfräsen** (umfräst) in den Programmen, in Zuschnitt, Sägen und Etiketten; Kanten danach in der
  Liste setzen, gespeichert mit der Projektdatei. **Löschen** je Position (Papierkorb, zweimal klicken) entfernt die Bauteile
  ganz – auch aus den Programmen.
- **Sägeplatz mit Raspberry Pi 5:** `npm run build:pi` → `dist/Weckwop-Pi.zip` mit `einrichten.sh` (Zebra an USB über
  CUPS mit Treiber „Zebra ZPL Label Printer“ als Standarddrucker in Etikettgröße, Bildschirm bleibt an, Chromium startet beim
  Anmelden im Vollbild mit `--kiosk-printing` → Etiketten ohne Druckdialog), `ANLEITUNG-PI.txt` (Einkaufsliste, Schritte,
  Probleme) und `step2maestro/` für den Offline-Betrieb (`--offline`, ohne Dekor-Bibliothek).
- **Dekor-Bibliothek – Sicherheit:** Das erste Passwort lässt sich nur festlegen, solange die (leere) Datei `dekore/EINRICHTEN`
  da ist (liegt in der ZIP, wird danach gelöscht); nach 5 Fehlversuchen ist die Anmeldung von dieser Adresse 15 Minuten
  gesperrt; Änderungen laufen unter einer Sperre, eine beschädigte Liste wird nie überschrieben; beim reinen Lesen kein Cookie.
- **Dekor-Bibliothek (Webserver):** Im Webserver-Paket liegt `dekore/` – eine Verwaltung im Browser (PHP, Passwort) zum
  Hochladen, Benennen und Pflegen eurer Standard-Dekore (Bild, Code, Name, Hersteller, Maserung, Farbe, Bildbreite in mm).
  Dateiname = Code (`U708_ST9.jpg` → „U708 ST9“). Weckwop lädt die Liste beim Start: Bauteile mit diesem Code im
  Namen bekommen das Dekor mit Bild (Möbel 3D), Namen (Listen) und Maserung (Zuschnitt); in jeder Plattenauswahl unter
  *Dekore (Bibliothek)*. Anleitung in der `ANLEITUNG.txt` des Pakets; offline (.exe) wie bisher Farben.
- **Material aus dem Bauteilnamen:** Steht im Namen ein Dekor in Klammern (z. B. „KP_1_ OB (U708 ST9)“) oder ein Dekor-Code
  wie `U708_ST9` / `H1145 ST10`, wird er die Platte des Teils – mit der Farbe aus der STEP (sonst nach dem Code: W weiß, U grau,
  H Holz mit Maserung, F Stein). Stückliste, Zuschnitt und Möbel 3D gruppieren danach; je Teil von Hand änderbar, abschaltbar in
  *Einstellungen › 3D-Ansicht* (Beispiel `test/fixtures/schrank3.step`).
- **Kantenband:** In der Stückliste je Position die Seiten anklicken – **L1** vorne / **L2** hinten (lange Seiten, Länge L),
  **B1** links / **B2** rechts (Breite B); jeder Klick wechselt *keine → Dekor 1 (schwarz) → Dekor 2 (blau gestreift)*, der Knopf
  **ringsum** in der Mitte setzt alle vier Seiten auf einmal. Alle Kanten sind gleich dick (oben einstellbar, Vorgabe 1 mm).
  **Dekor 1** heißt wie die Platte (z. B. U708 ST9), wenn kein Name eingetragen ist; **Dekor 2** mit eigenem Namen und Farbe
  (für Möbel 3D). Unten die **Laufmeter je Kantendekor** (mit Zugabe je Kante, Vorgabe 50 mm). Wahlweise *Kantendicke vom
  Zuschnitt abziehen* (Länge − B1 − B2, Breite − L1 − L2; auch im Zuschnittplan). Kanten stehen in CSV (je Seite das Dekor,
  Dicke, Laufmeter), PDF/Druck („L1 D1 · B2 D2“), auf dem Etikett (Strich an der Seite: Dekor 1 durchgezogen, Dekor 2
  gestrichelt) und in der Projektdatei.
  **Kanten-Regeln …** belegt automatisch vor (Teile ohne eigene Kanten, in der Liste mit „Regel“ markiert): je Regel
  „Name enthält“ (Wörter mit Komma, Umlaute egal, * = alle übrigen) → *ringsum*, *Vorderkante im Möbel*, *Längsseiten* oder
  *keine*, mit Dekor 1 oder 2; die erste passende Regel gilt. Vorgabe: Tür/Front/Blende/Klappe/Schublade ringsum, Rückwand
  keine, alle übrigen die Vorderkante. *Vorderkante im Möbel* = die Schmalseite, die zur Möbelvorderseite zeigt (einstellbar,
  Vorgabe −Y wie in Onshape). Ein Klick auf eine Seite setzt die Kanten des Teils von Hand; „Eigene Kanten aller Teile
  löschen“ stellt wieder alles auf die Regeln.
  In **Möbel 3D** zeigt der Schalter **Kanten** die Kantenbelegung: Seiten mit Kantenband im Dekor (bzw. in der eingestellten
  Kantenfarbe), offene Seiten als Rohkante (Spanplatte bzw. die gewählte Kante Multiplex/MDF); aus = Ansicht wie bisher.
  Dekor 2 in seiner eigenen Farbe. **hervorheben** färbt die Kanten zusätzlich in Signalfarben – Dekor 1 grün, Dekor 2 orange
  (beide wählbar) – so sieht man auf einen Blick, was womit bekantet ist.
- **Sägen** (dritter Reiter): eine Platte Schritt für Schritt an der Plattensäge – erst der **Anschnitt** (Fabrikkante längs
  und quer besäumen), dann **Streifen** abtrennen, darin die **Querschnitte**, **Nachschnitte** (nur noch ein Teil im
  Stück, der Überstand kommt als Abfall ab) und Abfall-Schnitte. Groß das Maß ab Anschlag, dazu was im Stück liegt, welche
  Teile danach fertig sind und was als Reststück übrig bleibt. In der Zeichnung: das abzutrennende Stück blau, der Schnitt
  rot mit Pfeil, fertige Teile grau mit ✓. Weiter/Zurück mit den Knöpfen oder → / Leertaste / ←; Platte wählbar.
  **Etiketten beim Sägen** (Umschalter oben in der Leiste, auch im Vollbild): *Aus* – keine Etiketten; *Fenster* – nach
  jedem fertigen Teil bzw. Streifen ein Fenster zum Antippen; *Automatisch* – ein Klick auf *Weiter* druckt die Etiketten der
  eben fertig gewordenen Teile (und das Streifen-Etikett) sofort, ohne Fenster, in einem Druckauftrag (am Pi im Kiosk ohne
  Druckdialog). Streifen-Etiketten mit dazu oder nicht: *⚙ Schnittfolge → Etikett*.
  **Streifen-Etiketten** zum Zuordnen: groß „Streifen 1 / 4“, Material + Dicke, „Platte 1 / 5“, Breite × Länge, Bauteil-Nr.
  im Streifen und eine kleine Skizze der Platte (dieser Streifen schwarz) – im Sägemodus nach jedem abgetrennten Streifen als
  Fenster (abschaltbar unter *⚙ Schnittfolge*) und als Knopf auf der Karte, im Zuschnittplan je Platte *🏷 Streifen-Etiketten*.
  Im **Vollbild** sind Platten-Umschalter, Auswahl und *Weiter / Zurück* groß für Touch; Weiter/Zurück bleiben unten stehen.
  **Weiter** ist grün und größer als *Zurück* (im Vollbild sehr groß), ebenso *Nächste Platte* und *Weiter sägen*.
  **Sprachbefehle** (*🎤 Sprache* in der Leiste) – viele Wendungen werden verstanden:
  *weiter* („okay“, „passt“, „fertig“, „ja“, „erledigt“, „geschnitten“), *zurück* („einen zurück“), *drucken* („Etikett“,
  „ausdrucken“ – druckt die Etiketten im offenen Fenster, sonst das Streifen-Etikett), *Streifen-Etikett*, *nächster Streifen*
  (springt zum ersten Schnitt des nächsten Streifens, ohne Etiketten), *vorheriger Streifen*, *nächste / vorherige Platte*,
  **mit Nummer** *„Streifen drei“, „zum dritten Streifen“, „Platte 2“, „Schritt einundzwanzig“* (Zahlen als Ziffer, Wort oder
  Ordnungszahl; Platte = Nummer im aktuellen Material), *von vorn*, *wie weit* (sagt Platte, Schritt, Streifen, fertige Teile),
  *was kommt danach*, *nochmal* (Schritt und Maß vorlesen), *Etiketten aus / Fenster / automatisch*, *Ansage an / aus*
  („Ruhe“), *Vollbild / Vollbild aus*, *Hilfe* (liest die Befehle vor), *Mikrofon aus*. Unter der Karte steht, was verstanden
  wurde; geht etwas nicht (z. B. „Streifen 5“ auf einer Platte mit 3), wird der Grund angezeigt und vorgelesen.
  **🔊 Ansage** liest nach jedem Schritt „Schritt 4. Streifen 2. Querschnitt, quer. 604 Millimeter.“ vor (Sprachausgabe des
  Browsers; währenddessen zählt nichts als Befehl).
  **🤖 KI** (neben Sprache): Sätze, die kein fester Befehl sind – „bring mich zur zweiten Platte U708, Streifen 3“, „wie viele
  Teile fehlen noch?“, „welches Teil kommt als nächstes?“ – gehen an den KI-Assistenten (ChatGPT bzw. Claude, Schlüssel im
  KI-Fenster); er steuert den Sägemodus über `saegen_steuern` und die Antwort wird vorgelesen. Feste Befehle bleiben sofort und
  ohne Internet. Erkennung: in Chrome/Edge die des Browsers (braucht Internet); **offline** mit Vosk, wenn
  `js/vendor/vosk/vosk.js` und `model-de.tar.gz` daliegen (`tools/pi/sprache_holen.sh`; Raspberry Pi: `einrichten.sh
  --sprache`) – Vosk kennt dann nur die Befehlswörter (Grammatik, sicherer im Lärm); mit *🤖 KI* den ganzen Wortschatz.
  Am besten mit Headset-Mikrofon. Seite oder Reiter verlassen schaltet das Mikrofon aus.
  **Streifen nummeriert:** am Plattenrand (Längsstreifen links, Querstreifen vorne) steht die Nummer jedes Streifens mit
  einer Klammer über seine Breite – der aktuelle blau gefüllt, fertige blass; auf der Karte „Streifen 2/4“, in der Liste
  *Danach* „S2“. Auch im Zuschnittplan (mit *Schnittfolge*), im Druck und im PDF – so lassen sich viele Platten
  hintereinander streifenweise abarbeiten.
  Oben auf der Karte riesig die Zahl, die **am Anschlag einzustellen** ist; fertig geschnittene Teile verschwinden aus der
  Zeichnung. Jedes Teil ist mit **Nr., Maß und Name** beschriftet (passend in die Fläche, schmale Teile gedreht – auch im
  Zuschnittplan). Sobald Teile fertig sind, öffnet sich ein großes Fenster **„Fertig geschnitten“**: Tippen auf ein Teil druckt
  sein Etikett (wie unter *Etiketten*, über den Druckdialog des Browsers; abschaltbar in der Schnittfolge).
  **⛶ Vollbild** (oder Taste F, zurück mit Esc) für den Bildschirm an der Säge. Oben **Zoom** *Platte* (50–160 %: größer =
  Zeichnung höher, Karte rechts schmaler, die große Zahl passt sich an; Strg + Mausrad) und *Schrift* (Strg + Umschalt +
  Mausrad). Die **Übersicht** zeigt alle Platten je Material als Felder – fertig gesägte mit ✓ („2 / 5 Platten
  geschnitten“), Tippen springt zu der Platte; *Haken löschen* setzt zurück. **⚙ Schnittfolge** stellt ein, wie geschnitten
  wird: Anschnitt längs/quer einzeln und welcher zuerst; erste Schnitte wie im Zuschnittplan, längs oder quer; Reihenfolge
  *jeden Streifen gleich fertig* oder *erst alle Streifen, dann quer*; Anschlag/Beginn links oder rechts, vorne oder hinten;
  Maß als *abgetrenntes Stück* (Parallelanschlag) oder *Restmaß* (Programmanschlag); Nachschnitte *sofort*, *nach jedem
  Streifen* oder *am Schluss gesammelt*, bis zu welchem Überstand (mm / %) ein Schnitt Nachschnitt heißt, ab wann ein Rest
  Reststück ist. Gemerkt im Browser; „Standard“ setzt zurück.
- **Zuschnittplan:** Teile auf Rohplatten (Format, Schnittfuge, Besäumrand einstellbar) je Material und Dicke, mit
  durchgehenden Schnitten wie an der Plattensäge; mit Maserung bleibt die lange Seite längs der Plattenlänge, Dekore werden
  bei Bedarf gedreht. Rohmaß oder Fertigmaß wählbar. Zeichnung je Platte so groß wie das Fenster (Teileliste daneben bzw.
  darunter), jedes Teil mit Nr., Maß und vollem Namen beschriftet, Ausnutzung. **Zoom** in der Leiste: *Platte* (− / + /
  Einpassen, 30–100 %, Vorgabe 70 %, auch Strg + Mausrad über der Platte) und *Schrift* (50–250 %, auch Strg + Umschalt +
  Mausrad) – die Beschriftung wächst um die Teilmitte und darf dann über kleine Teile hinausragen; gilt auch für Druck und PDF.
  **Übersicht** oben: je Material und Dicke Anzahl Platten, Format, Teile, Teilefläche und Ausnutzung, darunter die Summe
  („3 Platten zu schneiden · 10 Teile“) – auch als erste Seite im PDF und im Druck.
  Die Anordnung beginnt immer **oben links** (an der hinteren Kante), die Schnittfolge entsprechend ab oben – in
  *⚙ Schnittfolge* „Längs ab: oben (hinten) / unten (vorne)“; Plan, Sägemodus und PDF zeigen dieselbe Folge.
  **Plattenformat je Material:** im Kopf jeder Gruppe *Format L × B* (z. B. andere Plattengröße bei einem Dekor) – die Gruppe
  wird neu angeordnet, ↺ = wieder das allgemeine Format. **Je Platte:** an jeder Platte eigenes Format (z. B. ein Reststück:
  *+ Platte*, auf 1200 × 800 stellen, Teile darauf ziehen); verkleinern geht nur, wenn alle Teile darauf weiter passen.
  **Erster Schnitt:** *längs bevorzugt* = erst Streifen über die ganze Plattenlänge, darin quer ablängen; *quer bevorzugt* =
  erst Streifen über die ganze Plattenbreite, darin längs; *automatisch* = was am besten passt. **Ziel:** *minimaler
  Verschnitt* (wenig Platten, möglichst großes Reststück) oder *optimale Schnitte* (wenig Schnitte, gleich breite Teile im
  selben Streifen, einfach zu sägen). Es werden mehrere Anordnungen gerechnet und die beste nach dem Ziel genommen.
  Besäumt (*Anschnitt*) wird an der Anfangsseite; an der fernen Seite bekommt ein Teil, das bis an den Besäumrand reicht, einen
  eigenen Schnitt (sonst bliebe die Fabrikkante dran). Die Nummer eines Schnitts steht an seinem Anfang.
  **Schnittfolge** (abschaltbar): nummerierte, durchgehende Schnitte wie an der Plattensäge – zuerst in der gewählten Richtung einen Streifen ab,
  diesen quer dazu fertig schneiden, dann weiter am Rest; Abfall wird mit abgetrennt. Ist eine Anordnung von Hand nicht durchgehend
  trennbar, kommt ein Hinweis. **Teileliste je Platte** (☐ zum Abhaken, Nr., Bezeichnung, Maß, Stück) neben der Zeichnung,
  auch im Druck und im PDF.
  Die Teile sind leicht **schraffiert** (nicht hinter der Schrift): bei Holz mit Maserung in Faserrichtung (längs der langen
  Seite), bei Dekor schräg – auch im Druck und im PDF.
  **Faserrichtung je Position** (Spalte *Faser* in der Stückliste): *Auto* (nach Material: Maserung längs, Dekor frei),
  *längs*, *quer* (gedreht) oder *frei* (drehen erlaubt).
  **Von Hand anordnen:** Teile mit der Maus ziehen – rasten an Plattenrand (Besäumen) und Nachbarteilen (mit Schnittfuge)
  ein, auch auf eine andere Platte derselben Gruppe; *+ Platte* hängt eine leere Platte an; Klick wählt ein Teil,
  **↻ Drehen** (oder Doppelklick) dreht es – am Rand rückt es dabei nach innen (Hinweis bei Maserung); überlappt es, bleibt das Teil liegen. *Automatisch anordnen* verwirft die eigene Anordnung (ändern sich Teile
  oder Plattenformat, wird ohnehin neu angeordnet). **PDF speichern** schreibt Stückliste bzw. Zuschnittplan direkt als
  PDF-Datei (eine Platte je Seite, ohne Druckdialog); **Drucken** über den Browser. In der Online-Version (claude.ai) sperrt
  der Browser den Druckdialog – dort speichern alle Druck-Knöpfe gleich ein PDF.
- **Kippen 90°** (Sonder-Knopf neben *Wenden*, nur für Sonderteile): Teil auf die lange Kante (Breite ↔ Dicke), beim zweiten Druck
  auf die kurze Kante (Länge ↔ Dicke), beim dritten wieder flach; *Drehen 90°* und *Wenden* gehen in jeder Lage. Solange
  gekippt, ist der Knopf orange und am Teil steht „Sonderlage – Spannmittel/Sauger von Hand prüfen“ (Sauger passen meist nicht).
- **Wie oft läuft ein Programm:** oben im Teil *Anzahl* (dieses Bauteils, wie in der Stückliste) und „Programm läuft 4×
  (gleiches Programm: Nr. 2, 3) · gesamt ≈ 5:06 min“ – Bauteile mit gleichem Programm werden zusammengezählt. Auf der Teilekarte
  ein grüner Hinweis „3× = ≈ …“ (bei 0× grau), oben in der Teileliste die Summe „12 Programmläufe · ≈ 10:58 min gesamt“.
- **Bearbeitungszeit** (geschätzt) steht auch an jeder Teilekarte und oben im Teil (Tooltip: Fräsen, Bohren, Eilgang,
  Werkzeugwechsel, Auflegen). Aus Bahnlänge ÷ Vorschub (Werkzeugdatei bzw. eigene Schnittwerte), Zustellungen, Bohrungen,
  Eilgang und Werkzeugwechsel; Werte unter Einstellungen → *Zeitschätzung*. Mit dem **Korrekturfaktor** an die echte
  Maschinenzeit anpassen (gemessene ÷ geschätzte Zeit an 2–3 Teilen).

### Projekte (Startseite)

Beim Öffnen zeigt Weckwop die **Projektseite** (erster Reiter *Projekte*): oben das **aktuelle Projekt** mit Name,
Kunde/Auftrag und Notiz, Zustand („gespeichert 07.10. 10:42 · Server“ bzw. „ungespeicherte Änderungen“), **💾 Speichern**,
*Als neues Projekt speichern*, *＋ Neues Projekt* und **Weiter bearbeiten ▶** (zur zuletzt benutzten Seite). Darunter die
**Liste der Projekte** mit Suche (Name, Kunde, Material), Teile/Stück, Material, Platten und Änderungsdatum; je Projekt
*Öffnen*, *Kopie*, *Datei* (.s2m) und *Löschen* (zweimal klicken). Oben in der Leiste: *Projekte* (zur Projektseite) und
*Speichern* (mit • bei ungespeicherten Änderungen). Vor dem Öffnen/Neu wird bei ungespeicherten Änderungen nachgefragt.

**Ablage:** auf dem **Server** (Diskstation/Docker oder Webspace – für alle Geräte: Büro, Laptop, Pi an der Säge) oder **in
diesem Browser** (nur dieses Gerät, ohne Server). Gibt es einen Server, ist er vorgewählt; der Umschalter *🖧 Server / 💻
Dieser Browser* zeigt beide Listen. Auf dem Server werden Projekte gepackt gespeichert (`projekte/daten/*.s2m.gz` +
`projekte.json`), gelöschte kommen in den Papierkorb (`projekte/daten/papierkorb/`). Hat ein anderes Gerät dasselbe Projekt
inzwischen gespeichert, fragt *Speichern* nach (überschreiben oder nicht). Zugang: mit dem Passwort der Dekor-Verwaltung
(Anmelden auf der Projektseite) oder – nur für einen Server im eigenen Netz – offen (`S2M_OFFEN=1` bzw. Datei
`projekte/OFFEN`).

**Projektordner (lesbar, als Sicherung):** Beim Speichern auf dem Server schreibt Weckwop zusätzlich einen normalen
Ordner je Projekt (Name = Projektname, bei Umbenennen mit umbenannt): `Projekt.s2m` (das ganze Projekt als lesbares JSON),
`Info.txt`, `STEP/` (die geladenen STEP-/DXF-Dateien, Stand beim Speichern), `Programme/` (alle .xcs inkl. `_S1`/`_S2` und
`konvertieren.bat` für den X-Konverter), `Stueckliste.csv`, `Stueckliste.pdf`, `Zuschnittplan.pdf` und `Versionen/` (die
letzten 20 Stände von `Projekt.s2m`). STEP und Programme werden bei jedem Speichern neu geschrieben (keine alten Programme);
gelöschte Projekte: Ordner wird in „… (gelöscht Datum)“ umbenannt. Ort: `S2M_ORDNER` (Docker: `/daten/ordner`, per Volume
in einen freigegebenen Ordner der Diskstation legbar, z. B. `\\diskstation\Werkstatt\Weckwop-Projekte`), sonst
`projekte/daten/ordner`. **Sicherungsordner am PC** (Chrome/Edge, *💾 Sicherungsordner am PC wählen …* auf der
Projektseite): denselben Ordner bei jedem Speichern zusätzlich in einen Ordner auf dem PC bzw. ein Netzlaufwerk – auch ohne
Server (Projekte im Browser); der Browser fragt nach dem Neustart einmal nach der Erlaubnis.

**STEP aktualisieren** (Projektseite, *↻ Dateiname*): neue Version einer STEP-Datei einlesen. Teile werden über ihren Namen
in der STEP zugeordnet und behalten Drehlage, Feld, Programmname, Werkstück-Profil, Werkzeuge/Bearbeitungs-Änderungen,
Material, Anzahl, Kanten und Faser (auch einen umbenannten Namen); neue Teile kommen dazu (hinter die anderen der Datei),
fehlende werden nach Nachfrage entfernt. Danach speichern.

**Startadressen:** `…/index.html#saegen` öffnet gleich den Sägemodus (für den Pi), ebenso `#programme`, `#moebel`,
`#listen`, `#zuschnitt`, `#etiketten`, `#material`, `#projekte`.

**Projektdatei (.s2m)** zum Weitergeben/Sichern: *Aktuelles als Datei* bzw. *Datei* in der Liste; *Datei öffnen (.s2m)*
(oder auf die Seite ziehen) lädt eine. Inhalt: alle STEP/DXF-Dateien, alle Änderungen je Teil (Drehung, Feld, Werkzeuge,
Reihenfolge, Profil …), Teile von Hand, die Maße aus Möbel 3D, die **Stückliste** (Anzahl, Plattenfarben/Dekore, Kantenband
je Teil, Faser, Kanten-Einstellungen und -Regeln), der **Zuschnittplan** (Plattenformat, Schnittfuge, Besäumen,
Richtung/Ziel, Format je Material und je Platte, von Hand verschobene Pläne, Haken „geschnitten“, Stand im Sägemodus),
benutzte eigene Dekor-Bilder, Name/Kunde/Notiz und die **Einstellungen** (Werkzeuge, Regeln, Sauger …). Weichen die
Einstellungen eines Projekts von denen des Rechners ab, wird beim Öffnen gefragt, ob sie übernommen werden (Pfade zu
X-Konverter/Werkzeugdatei bleiben immer die des Rechners). Am Gerät bleiben: Ansicht, Zoom/Schrift und die
Säge-Einstellungen (*⚙ Schnittfolge*). Ältere .s2m-Dateien (ohne Listen) gehen weiter.

### Docker / Diskstation

`npm run build:docker` → `dist/Weckwop-Docker.zip` (Ordner `step2maestro-docker/`: `Dockerfile`, `docker-compose.yml`,
`start.sh`, `ANLEITUNG-DOCKER.txt`, Programm). Ein Container (PHP 8.3 + Apache + GD) stellt alles für die Werkstatt bereit:
Programm, **Projektablage**, Dekor-Bibliothek, **ChatGPT über den Server** (`OPENAI_API_KEY` in `docker-compose.yml` – die
Geräte brauchen keinen eigenen Schlüssel; `ki/openai.php` reicht nur `POST /v1/responses` und `GET /v1/models` weiter) und
die **Offline-Spracherkennung** (Vosk wird beim Bauen geholt, `SPRACHE=1`). Daten im Volume `./daten` (Projekte, Dekore,
Bilder – mit Hyper Backup sichern). Auf der Synology: Container Manager → Projekt → Ordner mit `docker-compose.yml`; Aufruf
`http://<diskstation>:8080/`. Der Pi an der Säge: `einrichten.sh --url http://<diskstation>:8080/ --sprache` (erlaubt das
Mikrofon für diese http-Adresse). Vorteil gegenüber dem Webspace: alles bleibt im eigenen Netz, schnell, ohne Internet
nutzbar (außer ChatGPT), Projekte zentral für alle Geräte, ein KI-Schlüssel für alle.

### KI-Assistent (✨ oben rechts)

Ein Fenster rechts, in dem man in Werkstattsprache sagt, was zu tun ist – z. B. „Sortiere nach Material und Dicke, große
Teile zuerst“, „Alle Fronten Kanten ringsum“, „Die Seiten 2× statt 1×“, „Plattenformat für U708 auf 2800 × 2070“, „Wie viele
Platten brauche ich?“, „Sägen: geh zu Platte 2, Streifen 3“. Die KI liest und ändert über die **Programm-Schnittstelle** nur
Daten für Liste, Zuschnitt und Etiketten: Namen, Anzahl, Material/Dekor, Kanten, Faser, Reihenfolge, Teile von Hand
anlegen/löschen, Zuschnitt-Einstellungen, Ansicht, und sie **steuert den Sägemodus** (blättern, Streifen/Platte/Schritt,
drucken, Etiketten-Modus, Ansage, Vollbild) – **keine Bearbeitungen**. Jeder Schritt steht im Verlauf („› Teile geändert
(4)“); **↶ Rückgängig** nimmt alle Änderungen der letzten Anfrage zurück. *Neu* beginnt ein neues Gespräch.

**Anbieter** unter *⚙ Einstellungen* im Fenster: **ChatGPT (OpenAI)** – Standard – oder **Claude (Anthropic)**, je mit
eigenem **API-Schlüssel** (ChatGPT: platform.openai.com → API keys; Claude: console.anthropic.com → API Keys; Abrechnung über
das jeweilige Konto – ein ChatGPT-/Claude-Abo zählt dafür nicht). „merken“ speichert die Schlüssel im Browser dieses Geräts
(sonst nur bis zum Schließen). **Modell** frei eintragbar mit Vorschlägen (ChatGPT: *gpt-5.5* Standard, *gpt-5.4-mini*,
*gpt-5.4-nano*; Claude: *claude-opus-5-5*, *claude-sonnet-5-5*, *claude-haiku-4-5*); **Modelle laden** holt die Liste,
die das eigene Konto benutzen darf. *Gründlichkeit* (schnell/normal/gründlich). Gesendet werden nur die Listendaten (Namen,
Maße, Material, Kanten, Zuschnitt, Stand beim Sägen), keine STEP-Dateien. Braucht Internet; läuft in der .exe, auf dem
Webserver und am Pi. ChatGPT läuft über die Responses-API (Werkzeuge als Funktionen, Gespräch über `previous_response_id`);
bei Claude übernimmt bei einer Ablehnung automatisch ein Ersatzmodell (`fallbacks: "default"`).

**Programm-Schnittstelle** `window.Weckwop.api` (auch für eigene Skripte, z. B. in der Browser-Konsole):
`teile_lesen()`, `stueckliste_lesen()`, `zuschnitt_lesen()`, `materialien_lesen()`, `teile_aendern({aenderungen: [{teil,
name, anzahl, material, kanten: {l1, l2, b1, b2}, kanten_auto, faser}]})`, `teile_sortieren({reihenfolge: [Nr …]})`,
`teile_loeschen({teile: [Nr …]})`, `teil_anlegen({name, laenge, breite, dicke, anzahl, material})`,
`zuschnitt_einstellen({platte_laenge, platte_breite, schnittfuge, besaeumen, faser, richtung, ziel, roh, gruppe, format})`,
`seite_zeigen({seite, teil})`, `saegen_status()`, `saegen_steuern({aktion, schritt, streifen, platte, gruppe_material})`, `projekt()`. Eingaben und Rückgaben sind einfache Daten (JSON), Fehler als Exception mit
deutschem Text; die Schemas stehen in `web/js/assist.js` (`Assist.TOOLS`).

## Was erkannt wird

| Geometrie im STEP | XCS-Ausgabe |
|---|---|
| Plattenmaße L × B × D | `CreateFinishedWorkpieceBox`, Rohteil +2 mm je Seite |
| Außenkontur rechteckig | Formatfräsen Rechteck (`E014`, Tiefe D+3, Korrektur rechts), Verlassen im Bogen mit 2 mm Überlappung (`SetRetractStrategy(false, true, 2, 2)`, einstellbar) |
| Formatfräsen zweistufig (Umschalter Normal/Zweistufig in den Einstellungen und je Teil in der Schrittliste) | Vorfräsen `CreateRoughFinish("Milling_1_Vor", …, Aufmaß)` mit Werkzeug 1, dann Werkzeug 2 auf Endmaß, gleiche Geometrie |
| Sonderkontur (Ausschnitte, Rundungen, Schrägen) | Standard: ganze Außenkontur **am Stück** als eine Bahn; umschaltbar auf „Rechteck + Ausschnitte einzeln“ (`E016`, Tiefe D+2) |
| Durchbrüche (innen), auch mit Fase oder Falz am Rand | geschlossene Fräsbahn (`E016`) entlang der engsten Stelle |
| Bohrung von oben (Sackloch / durch) | `CreateDrill` Spitze `"P"` / `"L"` (durch: Tiefe D+2) |
| Überlappende Bohrungen gleichen Durchmessers (bis Ø20) in einer Reihe, auch zur Kante offen – z. B. **Lamello Cabineo** (3 × Ø15, Tiefe 11, Abstand 11,2) | je Mitte ein `CreateDrill` statt einer Tasche (Hinweis in der Liste; Beispiel `test/fixtures/cabineo.step`) |
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

Am Sägeplatz bzw. mit echtem Konto noch nicht ausprobiert:

- **Sprachbefehle offline (Vosk) am Pi:** Laden des deutschen Modells, Erkennung der Befehlswörter mit Headset an der
  laufenden Säge; Mikrofon-Freigabe im Kiosk (`--use-fake-ui-for-media-stream`). Getestet sind nur die Befehle, die Anbindung
  mit nachgebildeter Erkennung und dass ein defektes Modell sauber gemeldet wird.
- **Docker auf der Diskstation:** Abbild hier nur ohne GD-Erweiterung gebaut (Paketquellen gesperrt) – Start, Datenordner,
  Projektablage, lesbare Projektordner, Konflikt-Prüfung und ChatGPT-Weiterleitung im Container geprüft; der vollständige Bau (mit GD für die
  Dekor-Bilder und Vosk) läuft erst auf der Diskstation.
- **KI-Assistent mit echtem API-Schlüssel:** Claude – Verbindung aus dem Browser zur API ist geprüft (Antwort „Schlüssel
  ungültig“ kommt richtig an); ChatGPT – die Verbindung zu api.openai.com war aus der Entwicklungsumgebung nicht erreichbar,
  also noch gar nicht geprüft (Abruf direkt aus dem Browser, CORS). Beide Abläufe sind mit nachgebildeten Antworten getestet;
  eine echte Sitzung mit Schlüssel steht noch aus. Falls ChatGPT „Keine Verbindung zur KI“ meldet, obwohl Internet da ist:
  dann sperrt OpenAI Aufrufe direkt aus dem Browser – Abhilfe wäre ein kleiner Vermittler auf dem Webserver.

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
| `web/` | Web-Tool: `index.html` (Seitenaufbau), `css/step2maestro.css` (Aussehen), `js/app/01–12` (Programm der Oberfläche, nach Bereichen: Grundlagen, Teile, Anzeige, Etiketten, Stückliste, Zuschnitt, Sägemodus, Möbel 3D/Material, Ansicht, Speichern, Schnittstelle/KI, Projekte) und die JS-Module `step.js` (STEP-Leser), `panel.js` (Erkennung), `xcs.js` (Ausgabe), `surface.js` (Kugelfräser-Bahn), `occtmesh.js` (3D-Netz), `dxf.js` (DXF-Leser), `assist.js` (KI-Assistent), `voice.js` (Sprachbefehle); `js/vendor/openai.js` / `anthropic.js` = OpenAI- bzw. Anthropic-SDK als Browser-Skript (`tools/build_openai.sh`, `tools/build_anthropic.sh`) |
| `cli/` | Kommandozeilen-Aufruf |
| `tools/webserver/` | Webspace-Paket: `dekore/` (Dekor-Bibliothek), `projekte/` (Projektablage), `ki/` (ChatGPT über den Server), Anleitung |
| `tools/docker/` | Docker für die Diskstation: `Dockerfile`, `docker-compose.yml`, `start.sh`, `ANLEITUNG-DOCKER.txt` |
| `test/` | Tests (`npm test`) und Test-STEP/DXF-Dateien |
| `tools/` | `make_fixtures.py` erzeugt einen Teil der Test-STEP-Dateien (CadQuery; die übrigen stammen aus Onshape/Werkstatt), `make_dxf.js` die Test-DXF, `build_defaults.js` die eingebaute Werkzeugliste und Beispiele, `build_exe.sh`/`build_web.sh` die Pakete, `webserver/` Anleitung, `.htaccess` und Schriften für den Webserver |
| `step/` | Original-STEP-Exporte aus Onshape |
| `maestro/beispiele/` | Beispiel-Programme (.xcs) aus Maestro – Referenz für das Format |
| `maestro/werkzeuge/` | Werkzeugdaten (`def.tlgx`) |
| `maestro/makros/` | SCM-Makros |
| `maestro/doku/` | Handbuch der Script-Sprache (MSL-Referenz, Rev. 17), Makrohilfe `SawCut_Lamello` (Clamex) |
