import { html, useState, useEffect, api, fehler, meldung, eur, datum, Laden } from "../ui.js";

export function ProjekteSeite() {
  const [liste, setListe] = useState(null);
  const [name, setName] = useState("");
  const [vorlage, setVorlage] = useState("");
  const laden = () => api.get("/api/projekte").then(setListe).catch(fehler);
  useEffect(laden, []);

  const anlegen = async (beispiel = false) => {
    try {
      const p = await api.post("/api/projekte", { name: name || (beispiel ? "Testprojekt Unterschrank" : "Neues Projekt"), vorlage_id: vorlage || null, beispiel });
      location.hash = `#/projekt/${p.id}/${beispiel || vorlage ? "modell" : "uebersicht"}`;
    } catch (e) { fehler(e); }
  };
  const dupl = async (p, als_vorlage) => {
    await api.post(`/api/projekte/${p.id}/duplizieren`, { als_vorlage, name: als_vorlage ? `Vorlage: ${p.name}` : undefined }).catch(fehler);
    meldung(als_vorlage ? "Als Vorlage gespeichert" : "Projekt dupliziert");
    laden();
  };
  const loeschen = async (p) => {
    if (!confirm(`Projekt „${p.name}“ mit allen Dateien löschen?`)) return;
    await api.del(`/api/projekte/${p.id}`).catch(fehler);
    laden();
  };
  if (!liste) return html`<${Laden} />`;
  const vorlagen = liste.filter((p) => p.ist_vorlage);
  const projekte = liste.filter((p) => !p.ist_vorlage);

  const karte = (p) => html`<div class="projekt-karte" key=${p.id}>
    <div class="abstand">
      <div class="titel"><a href=${`#/projekt/${p.id}`}>${p.name}</a> ${p.ist_vorlage && html`<span class="marke">Vorlage</span>`}</div>
      <div class="leise klein">${p.kunde?.name || "ohne Kunde"} · ${datum(p.datum)} · ${p.moebel_anzahl} Möbel · geändert ${datum(p.geaendert)}</div>
    </div>
    ${p.netto != null && html`<div class="z"><b>${eur(p.netto)}</b> <span class="leise klein">netto</span></div>`}
    <a class="knopf" href=${`#/projekt/${p.id}`}>Öffnen</a>
    <button class="knopf" onClick=${() => dupl(p, false)}>Duplizieren</button>
    ${!p.ist_vorlage && html`<button class="knopf" onClick=${() => dupl(p, true)}>Als Vorlage</button>`}
    <button class="knopf gefahr" onClick=${() => loeschen(p)}>Löschen</button>
  </div>`;

  return html`
    <h1>Projekte</h1>
    <div class="karte">
      <div class="zeile">
        <input type="text" style="max-width:320px" placeholder="Projektname, z. B. Küche Müller" value=${name} onInput=${(e) => setName(e.target.value)} />
        <select style="max-width:260px" value=${vorlage} onChange=${(e) => setVorlage(e.target.value)}>
          <option value="">ohne Vorlage</option>
          ${vorlagen.map((v) => html`<option value=${v.id}>${v.name}</option>`)}
        </select>
        <button class="knopf primaer" onClick=${() => anlegen(false)}>Projekt anlegen</button>
        <span class="abstand"></span>
        <button class="knopf" onClick=${() => anlegen(true)}>Testprojekt: Unterschrank mit Tür + Fachboden</button>
      </div>
    </div>
    <div class="karte" style="padding:0">
      ${projekte.length ? projekte.map(karte) : html`<div class="laden">Noch keine Projekte – oben anlegen.</div>`}
    </div>
    ${vorlagen.length > 0 && html`<h2>Vorlagen</h2><div class="karte" style="padding:0">${vorlagen.map(karte)}</div>`}
    <p class="leise klein">Datensicherung: <a href="/api/sicherung">alle Daten als ZIP herunterladen</a></p>`;
}
