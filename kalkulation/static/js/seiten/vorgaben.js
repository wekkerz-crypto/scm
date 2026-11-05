import { html, useState, useEffect, api, fehler, meldung, Feld, Zahl, Text, Auswahl, Haken, Tabs, Laden, klon, ROLLEN } from "../ui.js";

function neueId(praefix, liste) {
  let i = liste.length + 1;
  while (liste.some((e) => e.id === `${praefix}_${i}`)) i++;
  return `${praefix}_${i}`;
}

export function ListenTabelle({ zeilen, spalten, aendern, neu, neuText = "+ Position" }) {
  const setze = (i, k, v) => { const z = klon(zeilen); z[i][k] = v; aendern(z); };
  const zelle = (z, i, s) => {
    const v = z[s.k];
    if (s.t === "zahl") return html`<${Zahl} wert=${v} aendern=${(x) => setze(i, s.k, x ?? 0)} schritt=${s.s || 0.01} />`;
    if (s.t === "haken") return html`<input type="checkbox" checked=${!!v} onChange=${(e) => setze(i, s.k, e.target.checked)} />`;
    if (s.t === "auswahl") return html`<${Auswahl} wert=${v} aendern=${(x) => setze(i, s.k, x)} optionen=${s.o} leer=${s.leer} />`;
    if (s.t === "farbe") return html`<input type="color" value=${v || "#cccccc"} onInput=${(e) => setze(i, s.k, e.target.value)} />`;
    return html`<${Text} wert=${v} aendern=${(x) => setze(i, s.k, x)} />`;
  };
  return html`<div class="tabelle-scroll"><table class="tabelle-bearb">
    <thead><tr>${spalten.map((s) => html`<th style=${s.b ? `width:${s.b}` : ""}>${s.l}</th>`)}<th></th></tr></thead>
    <tbody>${zeilen.map((z, i) => html`<tr key=${i}>${spalten.map((s) => html`<td>${zelle(z, i, s)}</td>`)}
      <td><button class="knopf klein gefahr" title="entfernen" onClick=${() => confirm(`„${z.name || z.id}“ entfernen?`) && aendern(zeilen.filter((_, j) => j !== i))}>✕</button></td></tr>`)}</tbody>
  </table></div>
  <button class="knopf" style="margin-top:8px" onClick=${() => aendern([...zeilen, neu()])}>${neuText}</button>`;
}

function Abschnitt({ titel, objekt, felder, aendern }) {
  return html`<div class="karte"><h3 style="margin-top:0">${titel}</h3><div class="raster">
    ${felder.map((f) => html`<${Feld} label=${f.l} hinweis=${f.h}>${
      f.t === "auswahl" ? html`<${Auswahl} wert=${objekt[f.k]} aendern=${(v) => aendern({ ...objekt, [f.k]: v })} optionen=${f.o} />`
      : f.t === "text" ? html`<${Text} wert=${objekt[f.k]} aendern=${(v) => aendern({ ...objekt, [f.k]: v })} />`
      : f.t === "langtext" ? html`<${Text} mehrzeilig zeilen=${3} wert=${objekt[f.k]} aendern=${(v) => aendern({ ...objekt, [f.k]: v })} />`
      : f.t === "haken" ? html`<${Haken} wert=${objekt[f.k]} aendern=${(v) => aendern({ ...objekt, [f.k]: v })} label="ja" />`
      : html`<${Zahl} wert=${objekt[f.k]} schritt=${f.s || 0.01} einheit=${f.e} aendern=${(v) => aendern({ ...objekt, [f.k]: v ?? 0 })} />`
    }<//>`)}</div></div>`;
}

export function VorgabenSeite({ tab = "platten" }) {
  const [v, setV] = useState(null);
  const [geaendert, setGeaendert] = useState(false);
  const [ki, setKi] = useState(null);
  const [schluessel, setSchluessel] = useState("");
  const laden = () => {
    api.get("/api/vorgaben").then(setV).catch(fehler);
    api.get("/api/ki/status").then(setKi).catch(fehler);
  };
  useEffect(laden, []);
  if (!v) return html`<${Laden} />`;
  const setze = (k, wert) => { setV({ ...v, [k]: wert }); setGeaendert(true); };
  const speichern = async () => {
    try { setV(await api.put("/api/vorgaben", v)); setGeaendert(false); meldung("Vorgaben gespeichert"); } catch (e) { fehler(e); }
  };
  const setTab = (t) => (location.hash = `#/vorgaben/${t}`);
  const logo = async (e) => {
    const fd = new FormData(); fd.append("datei", e.target.files[0]);
    try { const r = await api.form("/api/firma/logo", fd); setze("firma", { ...v.firma, logo: r.logo }); meldung("Logo hochgeladen"); } catch (er) { fehler(er); }
  };
  const keySpeichern = async () => {
    try { setKi(await api.put("/api/ki/schluessel", { api_key: schluessel })); setSchluessel(""); meldung("API-Schlüssel gespeichert"); } catch (e) { fehler(e); }
  };

  let inhalt;
  if (tab === "platten") inhalt = html`<div class="karte">
      <p class="leise klein" style="margin-top:0">Preis je Platte <b>oder</b> je m² angeben (der jeweils andere Wert wird umgerechnet).
        „Faser“ = Teile werden beim Zuschnitt nicht gedreht. Texturen in der <a href="#/bibliothek">Materialbibliothek</a>.</p>
      <${ListenTabelle} zeilen=${v.platten} aendern=${(z) => setze("platten", z)}
        neu=${() => ({ id: neueId("platte", v.platten), name: "Neue Platte", staerke: 19, laenge: 2800, breite: 2070, preis_platte: 0, preis_m2: 0, faser: false, farbe: "#dddddd", rauheit: 0.6, textur: null, textur_mm: 1000, glas: false })}
        spalten=${[{ k: "id", l: "ID", b: "120px" }, { k: "name", l: "Bezeichnung" }, { k: "staerke", l: "Stärke", t: "zahl", b: "80px" },
          { k: "laenge", l: "Länge", t: "zahl", b: "90px" }, { k: "breite", l: "Breite", t: "zahl", b: "90px" },
          { k: "preis_platte", l: "€/Platte", t: "zahl", b: "95px" }, { k: "preis_m2", l: "€/m²", t: "zahl", b: "90px" },
          { k: "faser", l: "Faser", t: "haken" }, { k: "glas", l: "Glas", t: "haken" }, { k: "farbe", l: "Farbe", t: "farbe" }]} /></div>`;
  else if (tab === "kanten") inhalt = html`<div class="karte"><${ListenTabelle} zeilen=${v.kanten} aendern=${(z) => setze("kanten", z)}
      neu=${() => ({ id: neueId("kante", v.kanten), name: "Neue Kante", staerke: 1, preis_lfm: 0 })}
      spalten=${[{ k: "id", l: "ID", b: "140px" }, { k: "name", l: "Bezeichnung" }, { k: "staerke", l: "Stärke mm", t: "zahl", b: "100px" }, { k: "preis_lfm", l: "€/lfm", t: "zahl", b: "100px" }]} /></div>`;
  else if (tab === "artikel") inhalt = html`<div class="karte">
      <p class="leise klein" style="margin-top:0">Artikel mit „Rolle“ werden vom Generator automatisch gezählt (z. B. Scharniere je Tür).
        Eigene Positionen ohne Rolle (Lichtset, Glastür, Mülleimerauszug …) werden pro Möbel als Zusatzposition gewählt und sind der KI bekannt.</p>
      <${ListenTabelle} zeilen=${v.artikel} aendern=${(z) => setze("artikel", z)} neuText="+ eigene Position"
        neu=${() => ({ id: neueId("artikel", v.artikel), name: "Neue Position", kategorie: "Sonstiges", einheit: "Stk", preis: 0, rolle: null })}
        spalten=${[{ k: "id", l: "ID", b: "130px" }, { k: "name", l: "Bezeichnung" }, { k: "kategorie", l: "Kategorie", b: "130px" },
          { k: "einheit", l: "Einheit", t: "auswahl", o: [["Stk", "Stück"], ["lfm", "lfm"], ["m2", "m²"], ["pauschal", "pauschal"]], b: "110px" },
          { k: "preis", l: "Preis €", t: "zahl", b: "100px" }, { k: "rolle", l: "Rolle (automatisch)", t: "auswahl", o: ROLLEN, leer: "– eigene Position –", b: "200px" }]} /></div>`;
  else if (tab === "kosten") inhalt = html`
      <${Abschnitt} titel="Zuschnitt & Material" objekt=${v.zuschnitt} aendern=${(o) => setze("zuschnitt", o)} felder=${[
        { k: "modus", l: "Berechnung", t: "auswahl", o: [["platten", "auf ganze Platten"], ["m2", "auf m²-Basis"]] },
        { k: "verschnitt_prozent", l: "Verschnittzuschlag (m²-Basis)", e: "%" },
        { k: "saegeblatt", l: "Sägeblattstärke", e: "mm", s: 0.1 }, { k: "besaeumrand", l: "Besäumrand je Seite", e: "mm" }]} />
      <${Abschnitt} titel="Maschine (CNC-Formatierung über Fräsweg)" objekt=${v.maschine} aendern=${(o) => setze("maschine", o)} felder=${[
        { k: "modus", l: "Berechnung", t: "auswahl", o: [["vorschub", "über Vorschub und Stundensatz"], ["lfm", "Preis je lfm Fräsweg"]] },
        { k: "stundensatz", l: "Maschinenstundensatz", e: "€/h" }, { k: "vorschub_m_min", l: "mittlerer Vorschub", e: "m/min", s: 0.1 },
        { k: "ruestzeit_min_je_teil", l: "Rüst-/Handlingzeit je Teil", e: "min", s: 0.1 },
        { k: "wegfaktor", l: "Wegfaktor (An-/Abfahren)", s: 0.01, h: "Fräsweg = Umfang aller Teile + Nuten × Faktor" },
        { k: "preis_je_lfm", l: "Preis je lfm (Modus lfm)", e: "€/lfm" }]} />
      <${Abschnitt} titel="Arbeit (Pauschalen)" objekt=${v.arbeit} aendern=${(o) => setze("arbeit", o)} felder=${[
        { k: "teilehandling_je_teil", l: "Teilehandling je Bauteil", e: "€" }, { k: "kanten_je_lfm", l: "Kanten anleimen je lfm", e: "€" },
        { k: "zusammenbau_je_moebel", l: "Zusammenbau je Möbel", e: "€" }, { k: "zusammenbau_je_teil", l: "Zusammenbau je Bauteil", e: "€" }]} />
      <${Abschnitt} titel="Zuschläge (Standardwerte, je Projekt änderbar)" objekt=${v.zuschlaege} aendern=${(o) => setze("zuschlaege", o)} felder=${[
        { k: "materialgemeinkosten", l: "Materialgemeinkosten", e: "%" }, { k: "materialaufschlag", l: "Materialaufschlag", e: "%" },
        { k: "wagnis_gewinn", l: "Wagnis und Gewinn", e: "%" }, { k: "mwst", l: "Mehrwertsteuer", e: "%" }]} />
      <${Abschnitt} titel="Erweiterungen (0 = nicht berechnen)" objekt=${v.erweiterungen} aendern=${(o) => setze("erweiterungen", o)} felder=${[
        { k: "oberflaeche_je_m2", l: "Oberfläche (Lack/Öl) je m²", e: "€", h: "Fronten beidseitig + Sichtseiten" },
        { k: "montage_pauschal", l: "Montage pauschal", e: "€" }, { k: "lieferung_pauschal", l: "Lieferung pauschal", e: "€" }]} />`;
  else if (tab === "firma") inhalt = html`
      <${Abschnitt} titel="Briefkopf" objekt=${v.firma} aendern=${(o) => setze("firma", o)} felder=${[
        { k: "name", l: "Firmenname", t: "text" }, { k: "inhaber", l: "Inhaber", t: "text" }, { k: "strasse", l: "Straße", t: "text" },
        { k: "plz_ort", l: "PLZ Ort", t: "text" }, { k: "telefon", l: "Telefon", t: "text" }, { k: "email", l: "E-Mail", t: "text" },
        { k: "web", l: "Web", t: "text" }, { k: "ust_id", l: "USt-IdNr.", t: "text" }, { k: "steuernummer", l: "Steuernummer", t: "text" },
        { k: "bank", l: "Bank", t: "text" }, { k: "iban", l: "IBAN", t: "text" }, { k: "bic", l: "BIC", t: "text" },
        { k: "angebot_gueltig_tage", l: "Angebot gültig", e: "Tage", s: 1 },
        { k: "zahlungsbedingungen", l: "Zahlungsbedingungen", t: "langtext" }, { k: "fusstext", l: "Schlusstext", t: "langtext" }]} />
      <div class="karte"><h3 style="margin-top:0">Logo</h3><div class="zeile">
        ${v.firma.logo && html`<img src=${"/api/firma/logo?" + Date.now()} style="max-height:60px" />`}
        <input type="file" accept="image/png,image/jpeg" onChange=${logo} /></div></div>`;
  else if (tab === "ki") inhalt = html`<div class="karte"><h3 style="margin-top:0">Claude (Anthropic API)</h3>
      <p>Status: ${ki?.konfiguriert ? html`<b style="color:var(--gut)">API-Schlüssel hinterlegt</b> (${ki.maske}, Quelle: ${ki.quelle})` : html`<b style="color:var(--schlecht)">kein API-Schlüssel</b>`}</p>
      <div class="zeile"><input type="password" style="max-width:420px" placeholder="sk-ant-…" value=${schluessel} onInput=${(e) => setSchluessel(e.target.value)} />
        <button class="knopf primaer" onClick=${keySpeichern}>Schlüssel speichern</button>
        ${ki?.quelle === "einstellungen" && html`<button class="knopf gefahr" onClick=${() => { setSchluessel(""); api.put("/api/ki/schluessel", { api_key: "" }).then(setKi); }}>entfernen</button>`}</div>
      <p class="leise klein">Der Schlüssel wird nur lokal in der Datenbank gespeichert. Alternativ Umgebungsvariable ANTHROPIC_API_KEY setzen.
        Schlüssel erstellen unter console.anthropic.com → API Keys.</p>
      <div class="raster" style="margin-top:12px">
        <${Feld} label="Modell"><${Text} wert=${v.ki.modell} aendern=${(x) => setze("ki", { ...v.ki, modell: x })} /><//>
        <${Feld} label="Aufwand (effort)" hinweis="high = gründlich, low = schnell/günstig"><${Auswahl} wert=${v.ki.aufwand} aendern=${(x) => setze("ki", { ...v.ki, aufwand: x })}
          optionen=${[["low", "low"], ["medium", "medium"], ["high", "high"], ["xhigh", "xhigh"], ["max", "max"]]} /><//>
      </div></div>`;
  else if (tab === "cnc") inhalt = html`<${Abschnitt} titel="CNC-Export (DXF je Bauteil)" objekt=${v.cnc} aendern=${(o) => setze("cnc", o)} felder=${[
        { k: "layer_kontur", l: "Layer Kontur", t: "text", h: "Platzhalter: {tiefe} = Plattenstärke" },
        { k: "layer_nut", l: "Layer Nut/Falz", t: "text", h: "{breite}, {tiefe}" },
        { k: "layer_bohrung", l: "Layer Bohrung", t: "text", h: "{d}, {tiefe}" },
        { k: "mit_lochreihen", l: "Lochreihen exportieren", t: "haken" }, { k: "mit_topfbohrungen", l: "Topfbohrungen exportieren", t: "haken" }]} />
      <p class="leise klein">Rückseiten-Bearbeitungen erhalten das Suffix „_RS“. Layernamen an die Importregeln von Maestro anpassen.</p>`;

  return html`
    <div class="zeile"><h1 class="abstand">Vorgaben & Preise</h1>
      ${geaendert && html`<span class="status">ungespeicherte Änderungen</span>`}
      <button class="knopf primaer" disabled=${!geaendert} onClick=${speichern}>Speichern</button></div>
    <${Tabs} aktiv=${tab} setAktiv=${setTab} tabs=${[["platten", "Plattenmaterial"], ["kanten", "Kanten"], ["artikel", "Beschläge & eigene Positionen"],
      ["kosten", "Maschine, Arbeit, Zuschläge"], ["firma", "Firma & Briefkopf"], ["ki", "KI"], ["cnc", "CNC"]]} />
    ${inhalt}`;
}
