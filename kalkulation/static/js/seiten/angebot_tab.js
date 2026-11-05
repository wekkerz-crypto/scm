import { html, useState, api, fehler, meldung, Feld, Text, Haken, Laden, eur } from "../ui.js";

export function AngebotTab({ p, erg, aendern }) {
  const [laeuft, setLaeuft] = useState(false);
  const a = p.daten.angebot || {};
  const setA = (f, v) => aendern((n) => { n.daten.angebot = { ...(n.daten.angebot || {}), [f]: v }; });
  const moebel = p.daten.moebel || [];
  const textErstellen = async (ohne_ki) => {
    setLaeuft(true);
    try {
      const r = await api.post(`/api/projekte/${p.id}/angebotstext`, { ohne_ki });
      setA("text", r.text);
      meldung(r.quelle === "ki" ? "Angebotstext von Claude erstellt" : "Angebotstext aus Vorlage erstellt (ohne KI)");
    } catch (e) { fehler(e); }
    setLaeuft(false);
  };
  const exp = (art, text) => html`<a class="knopf" href=${`/api/projekte/${p.id}/export/${art}`}>${text}</a>`;
  if (!erg) return html`<${Laden} />`;
  return html`
    <div class="karte"><h3 style="margin-top:0">Angebot</h3><div class="raster">
      <${Feld} label="Angebotsnummer"><${Text} wert=${a.nummer} platzhalter=${p.id.slice(0, 6).toUpperCase()} aendern=${(v) => setA("nummer", v)} /><//>
      <${Feld} label="Angebotsdatum"><input type="date" value=${a.datum || ""} onChange=${(e) => setA("datum", e.target.value)} /><//>
      <${Feld} label="Betreff" breit><${Text} wert=${a.betreff} platzhalter=${p.name} aendern=${(v) => setA("betreff", v)} /><//>
      <${Feld} label="Einleitung" breit><${Text} mehrzeilig zeilen=${2} wert=${a.einleitung} aendern=${(v) => setA("einleitung", v)}
        platzhalter="Sehr geehrte Damen und Herren, vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen an:" /><//>
    </div></div>
    <div class="karte">
      <div class="zeile"><h3 class="abstand" style="margin-top:0">Angebotstext (Leistungsbeschreibung)</h3>
        <button class="knopf" disabled=${laeuft} onClick=${() => textErstellen(true)}>aus Vorlage</button>
        <button class="knopf primaer" disabled=${laeuft} onClick=${() => textErstellen(false)}>${laeuft ? "Claude schreibt …" : "Text mit KI erstellen"}</button></div>
      <${Text} mehrzeilig zeilen=${12} wert=${a.text} aendern=${(v) => setA("text", v)} platzhalter="Beschreibung der Möbel – frei editierbar" />
      ${moebel.length > 1 && html`<p class="leise klein">Bei mehreren Möbeln steht dieser Text unter den Positionen. Optional eigener Text je Position:</p>`}
      ${moebel.length > 1 && moebel.map((m, i) => html`<${Feld} label=${`Pos. ${i + 1}: ${m.bezeichnung}`}>
        <${Text} mehrzeilig zeilen=${2} wert=${(a.positionstexte || [])[i]} aendern=${(v) => { const l = [...(a.positionstexte || [])]; l[i] = v; setA("positionstexte", l); }} /><//>`)}
      <${Feld} label="Schlusstext"><${Text} mehrzeilig zeilen=${2} wert=${a.schluss} aendern=${(v) => setA("schluss", v)} platzhalter="(Standard aus Vorgaben → Firma)" /><//>
    </div>
    <div class="karte"><div class="zeile" style="align-items:flex-start">
      <div class="abstand"><h3 style="margin-top:0">Bild im Angebot</h3>
        <${Haken} wert=${a.mit_bild !== false} aendern=${(v) => setA("mit_bild", v)} label="Renderbild ins PDF übernehmen" />
        <${Haken} wert=${a.mit_zeichnungen} aendern=${(v) => setA("mit_zeichnungen", v)} label="Übersichtsblätter (Zeichnungen A3) anhängen" />
        <p class="leise klein">Bild im Tab „3D-Modell“ → „Als Angebotsbild“ speichern.</p></div>
      ${a.render && html`<img src=${`/api/projekte/${p.id}/dateien/renders/${a.render}?v=${Date.now()}`} style="max-width:360px;border:1px solid var(--rand);border-radius:6px" />`}
    </div></div>
    <div class="karte"><div class="zeile"><div class="abstand"><span class="leise">Angebotssumme</span>
      <div class="gross-zahl">${eur(erg.kalkulation.netto)} netto · ${eur(erg.kalkulation.brutto)} brutto</div></div>
      <a class="knopf primaer" href=${`/api/projekte/${p.id}/export/angebot.pdf`}>Angebot als PDF</a></div></div>
    <div class="karte"><h3 style="margin-top:0">Exporte</h3><div class="zeile">
      ${exp("stueckliste.pdf", "Stückliste PDF")} ${exp("stueckliste.csv", "Stückliste CSV")}
      ${exp("zuschnitt.pdf", "Zuschnitt PDF")} ${exp("zuschnitt.csv", "Zuschnitt CSV")}
      ${exp("kalkulation.pdf", "Kalkulation PDF")} ${exp("zeichnungen.pdf", "Zeichnungen A3 PDF")} ${exp("modell.step", "3D-Modell STEP AP242")} ${exp("cnc.zip", "CNC (DXF je Teil)")}
    </div></div>`;
}
