import { html, useState, useEffect, api, fehler, meldung, Haken, Laden } from "../ui.js";
import { Viewer } from "../viewer.js";

// Zwei 3D-Bilder je Möbel für die Übersichtsblätter rendern (geschlossen + geöffnet)
async function renderBilder(p, erg, vorgaben, fortschritt) {
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:-5000px;top:0;width:1500px;height:1000px";
  document.body.appendChild(box);
  const v = new Viewer(box);
  try {
    for (let mi = 0; mi < erg.moebel.length; mi++) {
      const e = erg.moebel[mi];
      if (!e.bauteile.length) continue;
      fortschritt(`Rendere ${e.bezeichnung} …`);
      v.setTeile(e.bauteile, vorgaben.platten, { ansichtBehalten: false, koerper: e.koerper });
      v.setOffen("alle", 0, true);
      v.ansicht("iso", 1.5);
      await new Promise((r) => setTimeout(r, 900)); // Texturen laden
      const zu = v.bild({ breite: 1800, hoehe: 1250, transparent: true });
      v.setOffen("alle", 1, true);
      v.ansicht("iso_links", 1.65);
      await new Promise((r) => setTimeout(r, 200));
      const auf = v.bild({ breite: 1800, hoehe: 1250, transparent: true });
      await api.post(`/api/projekte/${p.id}/render`, { bild: zu, name: `blatt_${mi}_1` });
      await api.post(`/api/projekte/${p.id}/render`, { bild: auf, name: `blatt_${mi}_2` });
    }
  } finally {
    v.zerstoeren();
    box.remove();
  }
}

export function ZeichnungTab({ p, erg, vorgaben, aktiv, setAktiv }) {
  const [svgs, setSvgs] = useState(null);
  const [koloriert, setKoloriert] = useState(true);
  const [laeuft, setLaeuft] = useState("");
  const moebel = p.daten.moebel || [];
  useEffect(() => {
    if (!moebel.length) return;
    setSvgs(null);
    api.get(`/api/projekte/${p.id}/zeichnung/${aktiv}`).then(setSvgs).catch(fehler);
  }, [aktiv, erg]);
  if (!moebel.length) return html`<div class="karte">Noch kein Möbel im Projekt.</div>`;

  const blaetter = async () => {
    try {
      await renderBilder(p, erg, vorgaben, setLaeuft);
      setLaeuft("");
      meldung("3D-Bilder erstellt – PDF wird geladen");
      window.location.href = `/api/projekte/${p.id}/export/zeichnungen.pdf`;
    } catch (e) { setLaeuft(""); fehler(e); }
  };
  const ansicht = (name) => svgs?.[name] && html`<div class="karte zeichnung">
    <div class="zeile"><b>${svgs[name].titel}</b></div>
    <div class="svg-rahmen" dangerouslySetInnerHTML=${{ __html: koloriert ? svgs[name].koloriert : svgs[name].linien }}></div></div>`;

  return html`
    <div class="karte zeile">
      <select style="max-width:320px" value=${aktiv} onChange=${(ev) => setAktiv(Number(ev.target.value))}>
        ${moebel.map((x, i) => html`<option value=${i}>${i + 1}. ${x.bezeichnung}</option>`)}</select>
      <${Haken} wert=${koloriert} aendern=${setKoloriert} label="koloriert (Materialfarben)" />
      <span class="abstand"></span>
      <a class="knopf" href=${`/api/projekte/${p.id}/export/zeichnung_${aktiv}.dxf`}>DXF</a>
      <a class="knopf" href=${`/api/projekte/${p.id}/export/zeichnungen.pdf`} title="mit den zuletzt erstellten 3D-Bildern">PDF (ohne neue Bilder)</a>
      <button class="knopf primaer" disabled=${!!laeuft} onClick=${blaetter}>${laeuft || "Übersichtsblätter erstellen (A3-PDF)"}</button>
    </div>
    ${!svgs ? html`<${Laden} />` : html`
      <div class="zeichnungen">
        ${ansicht("oben")}
        <div></div>
        ${ansicht("front")}${ansicht("seite")}
        ${ansicht("innen")}
      </div>`}
    <p class="leise klein">Blatt 1: Front-, Seiten-, Innenansicht und Draufsicht bemaßt im passenden Maßstab, Blatt 2: zwei 3D-Ansichten
      (geschlossen / geöffnet) mit kolorierter Front- und Seitenansicht. Anschlagsymbol: Spitze zeigt zur Bandseite.</p>`;
}
