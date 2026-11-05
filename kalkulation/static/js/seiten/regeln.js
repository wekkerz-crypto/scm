import { html, useState, useEffect, api, fehler, meldung, Feld, Zahl, Text, Auswahl, Haken, Laden, klon } from "../ui.js";

const KANTEN_ART = [["vorne", "nur vorne"], ["rundum", "rundum"], ["keine", "keine"]];

export const REGEL_ABSCHNITTE = [
  ["Konstruktionsart", [
    { k: "bauweise", l: "Bauweise", t: "auswahl", o: [["seiten_durchgehend", "Seiten durchgehend (Böden eingelegt)"], ["boeden_durchgehend", "Böden durchgehend (Seiten eingestellt)"], ["oberboden_aufliegend", "Oberboden aufliegend, Unterboden eingelegt"]] },
    { k: "staerke_korpus", l: "Stärke Korpus (wenn Material ohne Stärke)", t: "zahl", e: "mm" },
    { k: "staerke_fachboden", l: "Stärke Fachboden", t: "zahl", e: "mm" },
  ]],
  ["Standardmaterialien", [
    { k: "material_korpus", l: "Korpus", t: "material" },
    { k: "material_rueckwand", l: "Rückwand", t: "material" },
    { k: "material_front", l: "Fronten", t: "material" },
    { k: "material_fachboden", l: "Fachböden", t: "material" },
    { k: "material_sockel", l: "Sockelblende", t: "material" },
  ]],
  ["Rückwand", [
    { k: "rueckwand_art", l: "Art", t: "auswahl", o: [["genutet", "eingenutet"], ["gefaelzt", "eingefälzt"], ["aufgesetzt", "aufgesetzt"], ["keine", "keine Rückwand"]] },
    { k: "staerke_rueckwand", l: "Stärke (Fallback)", t: "zahl", e: "mm" },
    { k: "rueckwand_nuttiefe", l: "Nut-/Falztiefe", t: "zahl", e: "mm" },
    { k: "rueckwand_abstand_hinten", l: "Nutabstand von hinten", t: "zahl", e: "mm" },
    { k: "rueckwand_luft", l: "Spiel je Seite", t: "zahl", e: "mm", s: 0.5 },
  ]],
  ["Aufdoppelung (Innenkorpus + Sichtseiten)", [
    { k: "abschluss_seiten", l: "Seitlicher Abschluss (Standard)", t: "auswahl", o: [["sichtseite", "Sichtseite aufgedoppelt"], ["passblende", "Passblende (Nische)"], ["keine", "keiner"]] },
    { k: "abdeckplatte_oben", l: "Abdeckplatte oben", t: "haken" },
    { k: "sichtseite_bis_boden", l: "Sichtseiten/Passblenden bis zum Boden", t: "haken", h: "verdeckt den Sockel seitlich" },
    { k: "material_sichtseite", l: "Material Sichtseiten", t: "material", leer: "wie Fronten" },
    { k: "kante_sichtseite", l: "Kante Sichtseiten", t: "kante", leer: "wie Fronten" },
    { k: "kanten_sichtseite", l: "Sichtseiten bekanten", t: "auswahl", o: [["vorne", "vorne"], ["keine", "keine"]] },
    { k: "passblende_breite", l: "Passblende Standardbreite", t: "zahl", e: "mm" },
    { k: "passblendenleiste_tiefe", l: "Passblendenleiste Tiefe", t: "zahl", e: "mm", h: "0 = ohne Leiste" },
  ]],
  ["Sockel", [
    { k: "sockel_art", l: "Art", t: "auswahl", o: [["blende", "Sockelfüße + Sockelblende"], ["fuesse", "nur Sockelfüße"], ["keiner", "kein Sockel"]] },
    { k: "sockel_hoehe", l: "Sockelhöhe", t: "zahl", e: "mm" },
    { k: "sockelblende_rueckversatz", l: "Rückversatz Blende", t: "zahl", e: "mm" },
    { k: "staerke_sockel", l: "Stärke Blende (Fallback)", t: "zahl", e: "mm" },
    { k: "sockelfuss_abstand_seite", l: "Sockelfuß Abstand Seite", t: "zahl", e: "mm", h: "Füße an den Ecken + unter jeder Mittelwand" },
    { k: "sockelfuss_abstand_vorne", l: "Sockelfuß Abstand vorne", t: "zahl", e: "mm" },
    { k: "sockelfuss_abstand_hinten", l: "Sockelfuß Abstand hinten", t: "zahl", e: "mm" },
  ]],
  ["Fronten", [
    { k: "front_aufschlag", l: "Aufschlag", t: "auswahl", o: [["aufliegend", "aufliegend"], ["eingelegt", "eingelegt"]] },
    { k: "front_fuge", l: "Fugenmaß", t: "zahl", e: "mm", s: 0.5 },
    { k: "staerke_front", l: "Stärke (Fallback)", t: "zahl", e: "mm" },
    { k: "tuer_doppel_ab_breite", l: "Doppeltür ab Breite (KI-Hinweis)", t: "zahl", e: "mm" },
    { k: "griff_je_front", l: "Griff je Front", t: "haken" },
    { k: "griff_laenge", l: "Grifflänge", t: "zahl", e: "mm" },
    { k: "griff_abstand_kante", l: "Griff Abstand Kante", t: "zahl", e: "mm" },
    { k: "topfbohrung_abstand_kante", l: "Topfbohrung Abstand Kante", t: "zahl", e: "mm", s: 0.5 },
    { k: "topfbohrung_abstand_ende", l: "Topfbohrung Abstand oben/unten", t: "zahl", e: "mm" },
    { k: "topfbohrung_durchmesser", l: "Topfbohrung Ø", t: "zahl", e: "mm" },
    { k: "topfbohrung_tiefe", l: "Topfbohrung Tiefe", t: "zahl", e: "mm" },
  ]],
  ["Kanten", [
    { k: "kanten_korpus", l: "Korpus", t: "auswahl", o: KANTEN_ART },
    { k: "kante_korpus", l: "Kante Korpus", t: "kante" },
    { k: "kanten_front", l: "Fronten", t: "auswahl", o: KANTEN_ART },
    { k: "kante_front", l: "Kante Fronten", t: "kante" },
    { k: "kanten_fachboden", l: "Fachböden", t: "auswahl", o: KANTEN_ART },
    { k: "kante_fachboden", l: "Kante Fachböden", t: "kante" },
    { k: "kanten_sockel", l: "Sockelblende", t: "auswahl", o: KANTEN_ART },
    { k: "kante_sockel", l: "Kante Sockel", t: "kante" },
    { k: "kantenstaerke_abziehen", l: "Kantenstärke vom Zuschnitt abziehen", t: "haken" },
    { k: "kanten_zugabe_mm", l: "Zugabe je Kante (Verbrauch)", t: "zahl", e: "mm" },
  ]],
  ["Fachböden & Lochreihe", [
    { k: "fachboden_luft", l: "Spiel je Seite", t: "zahl", e: "mm", s: 0.5 },
    { k: "fachboden_rueckversatz_vorne", l: "Rückversatz vorne", t: "zahl", e: "mm" },
    { k: "fachboden_abstand_hinten", l: "Abstand hinten", t: "zahl", e: "mm" },
    { k: "fachbodentraeger_je_boden", l: "Träger je Boden", t: "zahl" },
    { k: "lochreihe_abstand_vorne", l: "Lochreihe Abstand vorne", t: "zahl", e: "mm" },
    { k: "lochreihe_abstand_hinten", l: "Lochreihe Abstand hinten", t: "zahl", e: "mm" },
    { k: "lochreihe_raster", l: "Lochraster", t: "zahl", e: "mm" },
    { k: "lochreihe_durchmesser", l: "Bohrung Ø", t: "zahl", e: "mm" },
    { k: "lochreihe_tiefe", l: "Bohrtiefe", t: "zahl", e: "mm" },
  ]],
  ["Schubkästen", [
    { k: "schubkasten_bauart", l: "Bauart", t: "auswahl", o: [["universal", "Universalschubkasten (selbst gebaut)"], ["system", "Kaufteil-System klein/mittel/groß"]] },
    { k: "schubkasten_material", l: "Zargenmaterial", t: "material" },
    { k: "schubkasten_boden_material", l: "Bodenmaterial", t: "material" },
    { k: "schubkasten_seitenluft", l: "Seitenluft je Seite (Führung)", t: "zahl", e: "mm", s: 0.5 },
    { k: "schubkasten_nl_raster", l: "Nennlängen-Raster", t: "zahl", e: "mm" },
    { k: "schubkasten_nl_min", l: "kleinste Nennlänge", t: "zahl", e: "mm" },
    { k: "schubkasten_tiefenabzug", l: "Abstand Rückwand", t: "zahl", e: "mm" },
    { k: "schubkasten_hoehe_abzug", l: "Zargenhöhe = Fronthöhe −", t: "zahl", e: "mm" },
    { k: "schubkasten_luft_unten", l: "Luft unten", t: "zahl", e: "mm" },
    { k: "schubkasten_luft_oben", l: "Luft oben", t: "zahl", e: "mm" },
    { k: "schubkasten_nut_abstand", l: "Bodennut Abstand Unterkante", t: "zahl", e: "mm" },
    { k: "schubkasten_nuttiefe", l: "Bodennut Tiefe", t: "zahl", e: "mm" },
    { k: "schubkasten_kanten_oben", l: "Zargen oben bekanten", t: "haken" },
    { k: "schubkasten_system", l: "System (Kaufteil)", t: "text" },
    { k: "schubkasten_klein_bis", l: "„klein“ bis Fronthöhe", t: "zahl", e: "mm" },
    { k: "schubkasten_mittel_bis", l: "„mittel“ bis Fronthöhe", t: "zahl", e: "mm", h: "darüber „groß“" },
  ]],
];

export function RegelFeld({ f, wert, aendern, vorgaben }) {
  let el;
  if (f.t === "zahl") el = html`<${Zahl} wert=${wert} aendern=${aendern} einheit=${f.e} schritt=${f.s || 1} />`;
  else if (f.t === "auswahl") el = html`<${Auswahl} wert=${wert} aendern=${aendern} optionen=${f.o} />`;
  else if (f.t === "haken") el = html`<${Haken} wert=${wert} aendern=${aendern} label="ja" />`;
  else if (f.t === "material") el = html`<${Auswahl} wert=${wert} aendern=${aendern} leer=${f.leer} optionen=${(vorgaben?.platten || []).map((p) => [p.id, p.name])} />`;
  else if (f.t === "kante") el = html`<${Auswahl} wert=${wert} aendern=${aendern} leer=${f.leer} optionen=${(vorgaben?.kanten || []).map((k) => [k.id, k.name])} />`;
  else el = html`<${Text} wert=${wert} aendern=${aendern} />`;
  return html`<${Feld} label=${f.l} hinweis=${f.h}>${el}<//>`;
}

export function RegelnSeite() {
  const [regeln, setRegeln] = useState(null);
  const [vorgaben, setVorgaben] = useState(null);
  const [geaendert, setGeaendert] = useState(false);
  useEffect(() => {
    api.get("/api/regeln").then(setRegeln).catch(fehler);
    api.get("/api/vorgaben").then(setVorgaben).catch(fehler);
  }, []);
  if (!regeln || !vorgaben) return html`<${Laden} />`;
  const setze = (k, v) => { setRegeln({ ...regeln, [k]: v }); setGeaendert(true); };
  const speichern = async () => {
    try { setRegeln(await api.put("/api/regeln", regeln)); setGeaendert(false); meldung("Konstruktionsregeln gespeichert"); } catch (e) { fehler(e); }
  };
  const zuruecksetzen = async () => {
    if (!confirm("Alle Konstruktionsregeln auf die Startwerte zurücksetzen?")) return;
    setRegeln(await api.post("/api/regeln/zuruecksetzen")); setGeaendert(false);
  };
  const staffel = regeln.scharniere_staffel || [];
  const setStaffel = (i, j, v) => { const s = klon(staffel); s[i][j] = v; setze("scharniere_staffel", s); };

  return html`
    <div class="zeile"><h1 class="abstand">Konstruktionsregeln</h1>
      <button class="knopf" onClick=${zuruecksetzen}>Startwerte</button>
      <button class="knopf primaer" disabled=${!geaendert} onClick=${speichern}>Speichern</button></div>
    <p class="leise">Diese Regeln werden der KI bei jeder Skizzenanalyse mitgegeben und vom 3D-Generator angewendet.
      Einzelne Möbel können einzelne Punkte (Bauweise, Rückwand, Sockel, Aufschlag) abweichend festlegen.</p>
    ${REGEL_ABSCHNITTE.map(([titel, felder]) => html`<div class="karte"><h3 style="margin-top:0">${titel}</h3>
      <div class="raster">${felder.map((f) => html`<${RegelFeld} f=${f} wert=${regeln[f.k]} aendern=${(v) => setze(f.k, v)} vorgaben=${vorgaben} />`)}</div></div>`)}
    <div class="karte"><h3 style="margin-top:0">Scharnieranzahl nach Türhöhe</h3>
      ${staffel.map(([bis, anz], i) => html`<div class="zeile" style="margin-bottom:6px">
        bis <span style="width:120px"><${Zahl} wert=${bis} aendern=${(v) => setStaffel(i, 0, v)} einheit="mm" /></span>
        → <span style="width:80px"><${Zahl} wert=${anz} aendern=${(v) => setStaffel(i, 1, v)} /></span> Scharniere
        <button class="knopf klein gefahr" onClick=${() => setze("scharniere_staffel", staffel.filter((_, j) => j !== i))}>✕</button></div>`)}
      <button class="knopf klein" onClick=${() => setze("scharniere_staffel", [...staffel, [99999, 2]])}>+ Stufe</button>
    </div>
    <div class="karte"><h3 style="margin-top:0">Weitere Regeln (Freitext für die KI)</h3>
      <${Text} mehrzeilig zeilen=${6} wert=${regeln.weitere_regeln} aendern=${(v) => setze("weitere_regeln", v)}
        platzhalter="z. B. Hängeschränke immer ohne Sockel und mit 320 mm Tiefe. Türen über 600 mm Breite als Doppeltür. Schubkästen immer mit Vollauszug." />
    </div>
    <div class="zeile ende"><button class="knopf primaer" disabled=${!geaendert} onClick=${speichern}>Speichern</button></div>`;
}
