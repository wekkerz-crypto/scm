# Tischlerei-Kalkulation

Lokale Web-App zur Kalkulation von Möbeln:
**Handskizze fotografieren → Claude erkennt das Möbel → parametrisches 3D-Modell prüfen →
Stückliste, Plattenoptimierung, Kalkulation → Angebotstext und PDF-Angebot**, dazu STEP-AP242- und CNC-Export.

Die App läuft auf dem Werkstatt- bzw. Büro-Rechner im Browser und ist im lokalen Netz auch vom Handy erreichbar
(Skizzen-Upload per QR-Code). Die Oberfläche ist komplett auf Deutsch.

---

## 1. Installation auf dem eigenen Rechner

### Variante A – fertige Windows-exe (empfohlen)

1. Auf GitHub im Repository **Actions → „Tischlerei-Kalkulation (Windows-exe)“** öffnen, den neuesten grünen Lauf
   anklicken und unter *Artifacts* **Tischlerei-Kalkulation-Windows** herunterladen.
   (Bei einem Versions-Tag wie `v1.0.0` liegt die ZIP zusätzlich unter *Releases*.)
2. ZIP entpacken, z. B. nach `C:\Programme\Tischlerei-Kalkulation` oder auf den Desktop.
3. `Tischlerei-Kalkulation.exe` doppelklicken. Der Browser öffnet sich automatisch mit `http://localhost:8000`.
   Das schwarze Fenster zeigt die Adresse fürs Handy und muss offen bleiben; schließen = App beenden.
4. Beim ersten Start fragt die Windows-Firewall nach Netzwerkzugriff: **„Private Netzwerke“ erlauben**,
   sonst funktioniert der Handy-Upload nicht.

Die Daten liegen getrennt vom Programm unter **`Dokumente\Tischlerei-Kalkulation`**. Ein Update ersetzt also nur den
Programmordner; Projekte, Preise und Regeln bleiben erhalten.

> Hinweis zur Größe: Der Programmordner ist ca. 500 MB groß (ZIP ca. 150–200 MB). Fast alles davon ist der
> 3D-Kernel OpenCascade, der für den STEP-Export gebraucht wird.

### Variante B – aus dem Quellcode (Git)

Voraussetzung: Python 3.11–3.13 ([python.org](https://www.python.org/downloads/), bei der Installation „Add to PATH“ anhaken).

```bash
git clone https://github.com/wekkerz-crypto/scm.git
```

```bash
cd scm/kalkulation
```

Windows: `start.bat` doppelklicken. Linux/macOS: `./start.sh`.
Beim ersten Start wird automatisch eine Python-Umgebung (`.venv`) eingerichtet und alles installiert.
Danach läuft die App unter `http://localhost:8000`, die Daten liegen in `kalkulation/daten/`, das nicht ins Git kommt.

Startoptionen (exe und `python -m app`): `--port 8080`, `--nur-lokal` (nicht im Netz erreichbar), `--kein-browser`.
Den Datenordner kann man mit der Umgebungsvariable `TISCHLEREI_DATEN` umlegen, z. B. auf ein NAS.

### Die exe selbst bauen (Windows)

```bash
cd scm/kalkulation
```

```bash
py -3.12 -m venv .venv
```

```bash
.venv\Scripts\pip install -r requirements-dev.txt
```

```bash
.venv\Scripts\pyinstaller --noconfirm tischlerei.spec
```

Ergebnis: `dist\Tischlerei-Kalkulation\Tischlerei-Kalkulation.exe`.

### KI einrichten

Unter **Vorgaben & Preise → KI** den API-Schlüssel des Claude-Accounts eintragen
(erstellen unter console.anthropic.com → API Keys). Er wird nur lokal gespeichert. Ohne Schlüssel funktioniert alles
außer Skizzenanalyse und KI-Angebotstext; für den Angebotstext gibt es dann eine einfache Vorlage.

---

## 2. Ablauf

1. **Projekt anlegen**: Kunde, Name, Notizen, optional aus einer Vorlage.
2. **Skizzen & KI**: Foto hochladen, am Rechner oder per QR-Code vom Handy. Drehen, Kontrast und Zuschneiden sind möglich.
3. **Skizze analysieren**: Claude liest die Skizze nach den hinterlegten **Konstruktionsregeln** und liefert ein
   strukturiertes Datenmodell (kein Geometrie-Raten). Fehlende oder widersprüchliche Maße kommen als **Rückfrage mit Vorschlag**,
   z. B. „Tiefe nicht erkennbar – 560 mm übernehmen?“. Antworten gehen per Tastatur oder Mikrofon.
4. **3D-Modell prüfen**: Drehen, Standardansichten, Parallelprojektion, Schnittebenen X/Y/Z, Fronten oder einzelne Teile ausblenden,
   Bauteil anklicken und Name, Material oder Kanten ändern. Maße, Einteilung und Materialien links ändern; das Modell wird neu aufgebaut.
5. **Stückliste & Zuschnitt**: automatisch benannte Teile in Baureihenfolge, Zuschnittmaße, Plattenoptimierung mit Faserrichtung,
   Sägeblatt und Besäumrand, umschaltbar zwischen ganzen Platten und m² mit Verschnitt.
6. **Kalkulation**: Material, Kanten, Beschläge, Zusatzpositionen, CNC-Maschine, Arbeit, Zuschläge, Netto/MwSt./Brutto.
   Jede Position zeigt ihre Herleitung (Menge × Einzelpreis).
7. **Angebot & Export**: Angebotstext (Claude oder Vorlage, editierbar), Angebots-PDF mit Briefkopf und Renderbild,
   Stückliste/Zuschnitt (PDF, CSV), Kalkulation (PDF), **STEP AP242**, **CNC-DXF je Bauteil**.

Zum Ausprobieren gibt es auf der Startseite ein Testprojekt: Unterschrank mit Tür und Fachboden.

---

## 3. Architektur

```
kalkulation/
├── app/                  Python-Backend (FastAPI)
│   ├── modell.py         Datenmodell eines Möbels (Spalten → Fächer → Fronten/Einlegeböden)
│   ├── generator.py      deterministischer Generator: Datenmodell + Regeln → Bauteile mit Metadaten
│   ├── zuschnitt.py      Plattenoptimierung (Guillotine, sägegerecht, Faserrichtung)
│   ├── kalkulation.py    Kalkulation mit Herleitung, Zuschläge, Netto/Brutto
│   ├── berechnung.py     Gesamtablauf je Projekt, Stückliste, Preisanteile je Möbel
│   ├── step_export.py    B-Rep-Körper mit OpenCascade → STEP AP242 (Namen, Farben, Baugruppen)
│   ├── cnc_export.py     DXF je Bauteil (Kontur, Nut/Falz, Lochreihen, Topfbohrungen), Layer konfigurierbar
│   ├── ki.py             Claude: Skizzenanalyse (Vision + JSON-Schema), Rückfragen, Angebotstext
│   ├── pdf.py            Angebot, Stückliste, Zuschnittpläne, Kalkulation (reportlab), CSV
│   ├── bilder.py         Skizzen-Vorverarbeitung, Texturen entzerren und kachelbar machen
│   ├── db.py             SQLite + Dateiablage
│   ├── defaults.py       Startwerte für Regeln und Vorgaben (Beispielpreise!)
│   └── main.py           REST-API
├── static/               Frontend ohne Build-Schritt (Preact + htm, Three.js lokal mitgeliefert)
├── tests/                pytest
├── tischlerei.spec       PyInstaller-Konfiguration für die exe
└── start.bat / start.sh  Start aus dem Quellcode
```

**Entscheidung 3D-Kernel: OpenCascade im Backend (Python, OCP), Three.js im Browser.**

* Die KI erzeugt nur das Datenmodell. Daraus baut `generator.py` deterministisch die Bauteile als Plattenkörper mit
  Name, Material, Stärke, Kanten (L1/L2/B1/B2), Faserrichtung, Bearbeitungen und Baureihenfolge.
  **Eine** Quelle speist 3D-Ansicht, Stückliste, Zuschnitt, Kalkulation, STEP und CNC.
* Den STEP-AP242-Export mit Namen und Baugruppen erledigt OpenCascade im Backend am zuverlässigsten (XCAF-Dokument).
  Nuten und Falze werden als echte boolesche Schnitte im B-Rep abgezogen. opencascade.js im Browser wäre ein
  20–60 MB großer WASM-Download und bringt bei achsparallelen Plattenteilen keinen Vorteil.
* Die Ansicht in Three.js braucht keine Tessellierung vom Server: Plattenteile sind Quader und werden direkt aus den
  Bauteildaten erzeugt. Die Texturen-UVs folgen der Faserrichtung im echten Maßstab. Das hält die Bedienung flüssig.
* Für spätere Freiformteile (Rundungen, Ausschnitte) kann der Server dieselben OCP-Körper tessellieren und als
  glTF liefern; die Schnittstelle ist darauf vorbereitet.

**Kalkulation Maschine (Vorschlag, in den Vorgaben einstellbar):**
Fräsweg = Σ Umfang aller Zuschnittteile + Σ Nutlängen, × Wegfaktor (An- und Abfahren).
Modus „Vorschub“: Zeit = Fräsweg ÷ Vorschub + Teile × Rüstzeit, Kosten = Zeit × Maschinenstundensatz.
Alternativ Modus „lfm“: Fräsweg × Preis je lfm.

---

## 4. Tests

```bash
cd kalkulation
```

```bash
python -m pytest -q tests
```

Geprüft werden Bauteilmaße am Testmöbel, Kollisionsfreiheit (Rückwand nur in der Nut), alle Bauweisen und
Rückwandarten, Zuschnitt ohne Überlappung und mit Faserrichtung, Summen der Kalkulation, alle PDF/CSV/DXF-Exporte,
STEP AP242 mit Namen sowie der API-Ablauf.

---

## 5. Offene Punkte / nächste Schritte

* **Startwerte**: Alle Preise und Regeln in `defaults.py` sind Beispielwerte. In der App unter *Konstruktionsregeln* und
  *Vorgaben & Preise* auf die eigenen Werte setzen.
* **Egger-Texturen**: Vor dem Hochladen die Nutzungsbedingungen von Egger prüfen. Die Texturen bleiben lokal im Datenordner.
* **CNC/Maestro**: Der DXF-Export ist eine Übergabe mit konfigurierbarer Layerkonvention. Den direkten `.pgmx`-Export
  für SCM Maestro baut man am besten mit den Beispielprogrammen und Makros in `../maestro/` (siehe Haupt-README).
* **Technische 2D-Zeichnungen** (Ansichten, Schnitte, Bemaßung als PDF/DXF): noch nicht umgesetzt. Die Bauteildaten und
  OCP-Körper sind die Grundlage dafür.
* **Raumszene** mit externem Bildgenerator: bewusst nicht in V1.
* **Schubkasten-Innenkasten**: Schubkästen werden als Kaufteil-System (klein/mittel/groß nach Fronthöhe) kalkuliert;
  Zargen oder Böden als eigene Bauteile sind möglich, sobald das System feststeht.
* **Spracheingabe** nutzt die Web-Speech-API des Browsers (Chrome/Edge). Am Rechner über `localhost` funktioniert sie,
  am Handy nur über HTTPS.
