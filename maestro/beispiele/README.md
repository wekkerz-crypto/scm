# Beispielprogramme (.xcs, aus der Werkstatt, in Maestro bestätigt)

Hier 2–3 in Maestro erstellte Programme ablegen, z. B.:
- Platte mit Umfräsen + Bohrungen von oben
- Platte mit Falz + Tasche
- Platte mit Seitenbohrungen

## Clamex über das SCM-Makro `SawCut_Lamello`

`33_SW-Schrag.xcs`, `38_SW-Schrag.xcs`, `40_Mittelseite_st2.xcs` (aus der Werkstatt): Sägeschnitt (`CreateBladeCut`), danach
`CreateMacro("SawCut_Lamello_1", "SawCut_Lamello", …)` mit 48 Werten **nach Position**. Abgeleitet aus dem Vergleich:
1–4 Start X/Y, Ende X/Y auf der Kante · 5 Winkel der Schnittfläche · 18 Säge · 21/46 Clamex-Fräser `E030` · 32 Bohrer `E031` ·
42 Oszillation 1,4 · 47 Winkel um Z = Richtung Start → Ende (links −90, rechts 90, hinten 180) · 7 = 19 (Plattendicke? alle
Teile 19 mm) · 12/13 (150 / 150,13 / 144,86) und 41 (10 / 10,05 / 8,19) unterscheiden sich, Bedeutung offen · übrige gleich.
Makrohilfe: `../doku/SawCut_Lamello_Makrohilfe.pdf`.

### Korpus mit Clamex P-14 (`5_`–`10_`, zu `test/fixtures/clamex_korpus.step`)

`5_Seitenwand_L`, `6_Seitenwand_R`, `7_Aufkantung`, `8_Unterboden`, `9_Zwischenboden`, `10_SW-Schrag` – in der Werkstatt
erstellt (mit .pgmx). Drei Makro-Arten (Vorlagen `clamexTplEdge/Miter/Face` in `web/js/xcs.js`):
- **Kante 90°** (5 Winkel = 90): 7 = Dicke, 8/9 = 5, null, 18/21/46 = `E030`.
- **Gehrung** (nach dem Sägeschnitt, 5 = 45): 8/9 = 1, 5, 12/13 = 145,9 (in 10_ abweichend, Bedeutung offen), 18 = Säge des Schnitts.
- **Fläche** (5 = 0): 7 = null, 41 = 0, 18/21/46 = `E032`.

Gemeinsam: 1–4 Start → Ende über alle Verbinder einer Kante (Laufrichtung = Winkel um Z: vorne 0, rechts 90, hinten 180,
links −90; Fläche längs der Nut, z. B. 90), 28 = Anzahl Verbinder (gleichmäßig zwischen Start und Ende), 41 = Höhe
Oberkante → Nutmitte entlang der Schnittfläche (8,54 bei 19 mm, Gehrung je nach Seite 8,54 / 18,33), 43 = Nuttyp „14“ (P-14).
Sägeschnitt dazu: Linie auf der Oberkante der Gehrung von Kante zu Kante, `CreateSectioningMillingStrategy(2, 50, 0)`,
Winkel 45, Korrektur 2, Extra-Tiefe 20. Das Tool erzeugt diese Programme gleich (Test, Drehlage nach dem Korpus-Modell).
