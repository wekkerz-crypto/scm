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
