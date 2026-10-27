# Übergabe: Weckwop – Weiterarbeit mit Claude (Firmenkonto)

Stand: 27.10.2026, Zweig `claude/blissful-wright-70n9um`, letzter Commit `7ef2b4d`
(„Ecken enger als der Fräser …“). Tags: `basis-1.0`, `stand-2026-10-06`, `stand-2026-10-07`.
`npm test`: 120/120 grün.

## Was das Projekt ist

Weckwop (früher Step2Maestro / STEP2XCS) liest STEP- und DXF-Dateien von Möbelteilen und erzeugt daraus Programme für
SCM Xilog Maestro (`.xcs`, `.pgmx`) für die 5-Achs-Maschine. Dazu kommen Stückliste, Kantenband, Zuschnittplan, Sägemodus
mit Parallelanschlag und Sprachsteuerung, Etiketten, Möbel 3D, Zeichnungen und Projektverwaltung.
Die Werkstatt spricht Deutsch: **Oberfläche, README, Commit-Nachrichten und Antworten an den Benutzer auf Deutsch.**

## So startest du in einer neuen Sitzung

1. Repo `wekkerz-crypto/scm` öffnen, Zweig `claude/blissful-wright-70n9um` (oder von dort weiterverzweigen).
2. **`CLAUDE.md` lesen** – dort stehen Aufbau, alle Modul- und Funktionsnamen und die Regeln. Das ist die eigentliche
   Entwicklerdoku und wird mit jedem Feature gepflegt. `README.md` = Benutzerdoku und Tabelle „Noch zu prüfen an der Maschine“.
3. `npm test` ausführen (Node, `node:test`; UI-Tests brauchen Playwright und werden sonst übersprungen).
4. Maestro-Befehle immer im Handbuch prüfen: `pdftotext -layout maestro/doku/Maestro_MSL_KI_Referenz.pdf`;
   bestätigte Programme aus der Werkstatt: `maestro/beispiele/*.xcs`.

## Arbeitsablauf nach jeder Änderung (so wurde bisher gearbeitet)

1. `npm test`.
2. Ausgabe aller Testteile vorher/nachher vergleichen (nur gewollte Unterschiede). Dazu gab es ein Hilfsskript `dump.js` im
   Scratchpad der alten Sitzung. Es liegt nicht im Repo; bei Bedarf neu schreiben (alle Fixtures konvertieren, `.xcs` und Hinweise ablegen, `diff -rq`).
3. Oberfläche mit Playwright-Screenshot ansehen, hell und dunkel.
4. README und CLAUDE.md nachziehen.
5. Commit auf Deutsch, push auf den Zweig (bei Netzfehlern bis zu 4 Wiederholungen mit Wartezeit). **Keinen PR anlegen, außer er wird verlangt.**
6. Pakete bauen: `npm run build:exe` (→ `dist/Weckwop.exe`), `build:web`, `build:pi`, `build:docker`.
7. Auf Wunsch die Web-Version als Artifact veröffentlichen und die `.exe` an den Benutzer schicken.

Commit-Fuß (laut Sitzungsvorgabe): `Co-Authored-By: …` und `Claude-Session: …`. Keine Modellnamen in Code oder Commits.

## Wichtige Regeln aus der Werkstatt

- Koordinaten wie Maestro: Ursprung vorne links unten, X = Länge, Y = Breite, Z = Dicke.
- Feld IJ (X ≤ 1300) bzw. IL; bei Y > 620 AB / AD.
- Teilenamen: Umlaute umschreiben, Leerzeichen → `_`, für `.xcs` und `.pgmx` gleich.
- Neue Oberfläche nur aus den Bausteinen des Design-Systems (oben in `web/css/step2maestro.css`): `.btn`, `.seg`, Tokens `--sp-*`, `--r*`, `--fs-*`, `--h*`.
  Blau = Navigation/Hauptaktion, grün = an/los, rot = löschen/stopp. Farben der Bearbeitungsarten nicht ändern.
- Interne Namen bleiben (alte Daten und Installationen): `step2xcs.*` in localStorage/IndexedDB, Ordner `step2maestro/`, `SetComment("STEP2XCS: …")`.
- Neue Maestro-Befehle, die noch nicht an der Maschine bestätigt sind, im README unter „Noch zu prüfen an der Maschine“ eintragen.

## Zuletzt gebaut (diese Sitzung)

- Schmale Teile (≤ 150 mm breit oder Profil): beim Import wählen – alles fräsen, Seiten fräsen + Stirnseiten sägen, nur sägen
  (`narrowModeOf`, Einstellung `narrowRule`).
- Stückliste direkt bearbeiten (Name, Maße), neues Bauteil anlegen.
- Sägemodus „Von Hand“: Maßeingabe, Kettenmaß, Rechner, Sprache; Anschlag fährt mit „Weiter“.
- Sägemodus-Knopf oben rechts, Anzeige „wer ist im Projekt“, Verdrahtungsplan für den Anschlag.
- Einheitliches Design-System für die ganze Oberfläche.
- **Zuletzt (Commit `7ef2b4d`):** Ecken enger als der Fräser. `fittingMill` wählt für Taschen und Durchbrüche automatisch einen
  passenden Fräser (z. B. E031 Ø6 bei R3-Ecken) mit Hinweis. Ein von Hand gewählter zu großer Fräser gibt die Warnung
  „Ausbuchtungen an den Ecken“. In der Anzeige schlägt die Werkzeugbahn an solchen Innenecken keine Schlaufe mehr
  (`offsetPath` in `toolpath.js`).

## Offen / als Nächstes

- **Küchenplatte prüfen:** Das Teil „CAD_Kuechenplatte_1000x520x19“ lag nicht vor; der Fehler wurde nur mit einer nachgebauten
  DXF reproduziert. Wenn die STEP-Datei da ist: laden, Hinweise zu Eckenradius und Fräser prüfen, Programm in Maestro ansehen.
- Von der Maschine noch nicht bestätigt: alles unter „Noch zu prüfen an der Maschine“ im README, dazu der neue automatische Fräser für Durchbrüche.
- Angeboten, aber nicht gebaut: Strichcode-Verfolgung / Teile-Status, Reststück-Lager, Bestellliste, Kalkulation, kostenlose KI (Ollama),
  `.pgmx` automatisch erzeugen, Reihenfolge Säge/Fräser bei schmalen Teilen als Standard.

## Stolperstellen

- Skripte in `web/js/app/01–13` teilen einen globalen Bereich; die Reihenfolge der `<script>`-Tags in `web/index.html` einhalten.
  Beim Laden nur Funktionen aus derselben oder früheren Dateien aufrufen.
- `web/js/*.js` (Module) sind UMD und laufen im Browser und in Node; `tools-default.js` und `sample.js` werden mit `node tools/build_defaults.js` erzeugt.
- Eingabefelder für Maße als Textfeld mit `inputmode="decimal"` bauen (Komma muss gehen), nicht als `type=number`.
- `lst.hand` immer an Ort und Stelle ändern (`hand()` liefert dasselbe Objekt), sonst geht der Zustand verloren.
- Der Artifact-Veröffentlichungsweg verlangt, geänderte Dateien vorher zu lesen; mit `cmp` gegen `git show HEAD~1:…` prüfen, dann erneut veröffentlichen.
- Der Parallelanschlag (`tools/pi/anschlag.py`, FluidNC auf ESP32) hat Tests mit einem Fake-Gerät (`test/anschlag.test.js`, `test/fixtures/fake_fluidnc.py`).
  Pins in `tools/pi/anschlag/config.yaml` und im Verdrahtungsplan müssen gleich bleiben.

## Hinweis zu Zugängen

Schlüssel (ChatGPT/Claude), Server-Zugänge und Passwörter der Dekor-Verwaltung stehen **nicht** im Repo und müssen auf dem
Firmenkonto neu hinterlegt werden (Browser-Einstellungen bzw. `ki/schluessel.php`, `OPENAI_API_KEY` auf dem Server).
