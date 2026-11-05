import { html, useState, useEffect, useRef, api, fehler, meldung, Feld, Text, Tabs, Laden, klon, eur } from "../ui.js";
import { ModellTab } from "./modell_tab.js";
import { SkizzenTab } from "./skizzen_tab.js";
import { StuecklisteTab, ZuschnittTab, KalkulationTab } from "./listen_tab.js";
import { AngebotTab } from "./angebot_tab.js";

export function Warnungen({ liste }) {
  if (!liste || !liste.length) return null;
  return html`<div class="warnungen">${[...new Set(liste)].map((w) => html`<div>⚠ ${w}</div>`)}</div>`;
}

function UebersichtTab({ p, aendern, erg, aktiv, setAktiv }) {
  const k = p.kunde || {};
  const setK = (f, v) => aendern((n) => { n.kunde = { ...(n.kunde || {}), [f]: v }; });
  const moebel = p.daten.moebel || [];
  const neu = async () => {
    const m = await api.get("/api/moebel/neu");
    aendern((n) => { n.daten.moebel = [...(n.daten.moebel || []), m]; });
    setAktiv(moebel.length);
  };
  return html`
    <div class="karte"><h3 style="margin-top:0">Projekt</h3><div class="raster">
      <${Feld} label="Projektname"><${Text} wert=${p.name} aendern=${(v) => aendern((n) => { n.name = v; })} /><//>
      <${Feld} label="Datum"><input type="date" value=${p.datum || ""} onChange=${(e) => aendern((n) => { n.datum = e.target.value; })} /><//>
      <${Feld} label="Notizen" breit><${Text} mehrzeilig wert=${p.notizen} aendern=${(v) => aendern((n) => { n.notizen = v; })} /><//>
    </div></div>
    <div class="karte"><h3 style="margin-top:0">Kunde</h3><div class="raster">
      ${[["name", "Name"], ["firma", "Firma"], ["strasse", "Straße"], ["plz_ort", "PLZ Ort"], ["telefon", "Telefon"], ["email", "E-Mail"]]
        .map(([f, l]) => html`<${Feld} label=${l}><${Text} wert=${k[f]} aendern=${(v) => setK(f, v)} /><//>`)}
    </div></div>
    <div class="karte"><div class="zeile"><h3 class="abstand" style="margin:0">Möbel im Projekt</h3>
      <button class="knopf" onClick=${neu}>+ Möbel</button>
      <a class="knopf primaer" href=${`#/projekt/${p.id}/skizzen`}>Skizze analysieren</a></div>
      <table style="margin-top:8px"><thead><tr><th>#</th><th>Bezeichnung</th><th class="z">B × H × T</th><th class="z">Stk</th><th class="z">Teile</th><th></th></tr></thead>
      <tbody>${moebel.map((m, i) => html`<tr>
        <td>${i + 1}</td><td><a href=${`#/projekt/${p.id}/modell`} onClick=${() => setAktiv(i)}>${m.bezeichnung}</a></td>
        <td class="z">${m.breite} × ${m.hoehe} × ${m.tiefe}</td><td class="z">${m.anzahl}</td>
        <td class="z">${erg?.moebel?.[i]?.bauteile?.length ?? ""}</td>
        <td class="z"><button class="knopf klein" onClick=${() => aendern((n) => { n.daten.moebel.splice(i + 1, 0, klon(m)); })}>duplizieren</button>
          <button class="knopf klein gefahr" onClick=${() => confirm(`„${m.bezeichnung}“ entfernen?`) && (aendern((n) => { n.daten.moebel.splice(i, 1); }), setAktiv(0))}>✕</button></td></tr>`)}</tbody></table>
      ${!moebel.length && html`<p class="leise">Noch kein Möbel. Skizze hochladen und analysieren oder „+ Möbel“ wählen.</p>`}
    </div>
    ${erg && html`<div class="karte zeile"><div class="abstand"><span class="leise">Angebotssumme</span>
      <div class="gross-zahl">${eur(erg.kalkulation.netto)} <span class="leise klein">netto</span></div></div>
      <div><span class="leise">brutto</span><div class="gross-zahl">${eur(erg.kalkulation.brutto)}</div></div></div>`}
    <${Warnungen} liste=${erg?.warnungen} />
    <div class="zeile"><label class="haken"><input type="checkbox" checked=${p.ist_vorlage} onChange=${(e) => aendern((n) => { n.ist_vorlage = e.target.checked; })} /> Dieses Projekt ist eine Vorlage</label></div>`;
}

export function ProjektSeite({ id, tab }) {
  const [p, setP] = useState(null);
  const [erg, setErg] = useState(null);
  const [vorgaben, setVorgaben] = useState(null);
  const [status, setStatus] = useState("");
  const [aktiv, setAktivRoh] = useState(0);
  const timer = useRef(null);
  const letzter = useRef(null);

  const neuRechnen = (daten) => api.post("/api/berechnen", daten).then(setErg).catch(fehler);
  const laden = async () => {
    try {
      const [pr, vg] = await Promise.all([api.get(`/api/projekte/${id}`), api.get("/api/vorgaben")]);
      setP(pr); setVorgaben(vg); letzter.current = pr;
      neuRechnen(pr.daten);
    } catch (e) { fehler(e); }
  };
  useEffect(() => { laden(); setAktivRoh(0); }, [id]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const speichernJetzt = async () => {
    clearTimeout(timer.current);
    const stand = letzter.current;
    setStatus("speichert …");
    try { await api.put(`/api/projekte/${id}`, stand); setStatus("gespeichert"); } catch (e) { setStatus("Fehler beim Speichern"); fehler(e); }
    neuRechnen(stand.daten);
  };
  const aendern = (fn) => {
    const neu = klon(letzter.current);
    fn(neu);
    letzter.current = neu;
    setP(neu);
    setStatus("ungespeichert");
    clearTimeout(timer.current);
    timer.current = setTimeout(speichernJetzt, 600);
  };
  // Server hat das Projekt geändert (z. B. KI-Übernahme, Skizzen-Upload)
  const ersetzen = (neu) => { letzter.current = neu; setP(neu); neuRechnen(neu.daten); };

  if (!p || !vorgaben) return html`<${Laden} />`;
  const anzahl = (p.daten.moebel || []).length;
  const idx = Math.min(aktiv, Math.max(0, anzahl - 1));
  const setAktiv = (i) => setAktivRoh(i);
  const setTab = (t) => (location.hash = `#/projekt/${id}/${t}`);
  const props = { p, aendern, ersetzen, erg, vorgaben, aktiv: idx, setAktiv, speichernJetzt, neuladen: laden };

  const tabs = { uebersicht: UebersichtTab, skizzen: SkizzenTab, modell: ModellTab, stueckliste: StuecklisteTab,
    zuschnitt: ZuschnittTab, kalkulation: KalkulationTab, angebot: AngebotTab };
  const Inhalt = tabs[tab] || UebersichtTab;
  return html`
    <div class="zeile" style="margin-bottom:4px"><h1 class="abstand" style="margin:0">${p.name}
      ${p.kunde?.name && html`<span class="leise" style="font-weight:400"> · ${p.kunde.name}</span>`}</h1>
      ${erg && html`<span><b>${eur(erg.kalkulation.netto)}</b> <span class="leise">netto</span></span>`}
      <span class="status">${status}</span></div>
    <${Tabs} aktiv=${tab} setAktiv=${setTab} tabs=${[["uebersicht", "Übersicht"], ["skizzen", "Skizzen & KI"], ["modell", "3D-Modell"],
      ["stueckliste", "Stückliste"], ["zuschnitt", "Zuschnitt"], ["kalkulation", "Kalkulation"], ["angebot", "Angebot & Export"]]} />
    <${Inhalt} ...${props} />`;
}
