import { html, useState, useEffect, useRef, api, fehler, meldung, Feld, Text, Laden, SpracheKnopf, zahlAusText } from "../ui.js";

function ZuschneidenDialog({ url, schliessen, fertig }) {
  const [box, setBox] = useState(null);
  const start = useRef(null);
  const bild = useRef();
  const pos = (e) => {
    const r = bild.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const runter = (e) => { e.preventDefault(); start.current = pos(e); setBox([...start.current, ...start.current]); };
  const bewegen = (e) => { if (start.current) setBox([...start.current, ...pos(e)]); };
  const hoch = () => (start.current = null);
  const stil = box && `left:${Math.min(box[0], box[2]) * 100}%;top:${Math.min(box[1], box[3]) * 100}%;width:${Math.abs(box[2] - box[0]) * 100}%;height:${Math.abs(box[3] - box[1]) * 100}%`;
  return html`<div class="overlay"><div class="dialog">
    <p class="leise" style="margin-top:0">Rahmen um den relevanten Bereich ziehen.</p>
    <div class="zuschneiden" onPointerDown=${runter} onPointerMove=${bewegen} onPointerUp=${hoch}>
      <img ref=${bild} src=${url} draggable="false" />${box && html`<div class="rahmen" style=${stil}></div>`}</div>
    <div class="zeile ende" style="margin-top:10px"><button class="knopf" onClick=${schliessen}>Abbrechen</button>
      <button class="knopf primaer" disabled=${!box || Math.abs(box[2] - box[0]) < 0.03} onClick=${() => fertig(box)}>Zuschneiden</button></div>
  </div></div>`;
}

function Rueckfragen({ analyse, pid, ersetzen, nochmal }) {
  const [antworten, setAntworten] = useState({});
  useEffect(() => setAntworten(Object.fromEntries((analyse.rueckfragen || []).map((r) => [r.id, r.vorschlag]))), [analyse]);
  const werte = () => Object.fromEntries((analyse.rueckfragen || []).map((r) => {
    let v = antworten[r.id];
    if (r.typ === "zahl") v = zahlAusText(v);
    return [r.feld, v];
  }).filter(([f, v]) => f && v !== null && v !== undefined && v !== ""));
  const uebernehmen = async (modus) => {
    try {
      const p = await api.post(`/api/projekte/${pid}/analyse/uebernehmen`, { antworten: werte(), modus });
      ersetzen(p);
      meldung("Möbel übernommen – bitte im 3D-Modell prüfen");
      location.hash = `#/projekt/${pid}/modell`;
    } catch (e) { fehler(e); }
  };
  const fragen = analyse.rueckfragen || [];
  return html`<div class="karte">
    <h3 style="margin-top:0">Ergebnis der Analyse</h3>
    <p>${analyse.erkannt}</p>
    <ul>${(analyse.moebel || []).map((m) => html`<li><b>${m.bezeichnung}</b> – ${m.breite} × ${m.hoehe} × ${m.tiefe} mm,
      ${m.spalten.length} Spalte(n), ${m.spalten.reduce((s, sp) => s + sp.bereiche.length, 0)} Fächer${m.besonderheiten ? " · " + m.besonderheiten : ""}</li>`)}</ul>
    ${fragen.length ? html`<h3>Rückfragen (${fragen.length})</h3>` : html`<p class="leise">Keine Rückfragen – alle Maße waren eindeutig.</p>`}
    ${fragen.map((r) => html`<div class="rueckfrage" key=${r.id}>
      <div style="margin-bottom:6px">${r.frage}</div>
      <div class="zeile" style="flex-wrap:nowrap">
        ${r.typ === "auswahl" && r.optionen?.length
          ? html`<select value=${antworten[r.id]} onChange=${(e) => setAntworten({ ...antworten, [r.id]: e.target.value })}>
              ${r.optionen.map((o) => html`<option value=${o} selected=${o === antworten[r.id]}>${o}</option>`)}</select>`
          : html`<input type="text" value=${antworten[r.id] ?? ""} onInput=${(e) => setAntworten({ ...antworten, [r.id]: e.target.value })} />`}
        <${SpracheKnopf} beiText=${(t) => setAntworten({ ...antworten, [r.id]: t })} />
      </div>
      <small class="leise">Feld: ${r.feld}</small></div>`)}
    <div class="zeile" style="margin-top:10px">
      <button class="knopf primaer" onClick=${() => uebernehmen("ersetzen")}>Übernehmen (ersetzt Möbel im Projekt)</button>
      <button class="knopf" onClick=${() => uebernehmen("anhaengen")}>Als weiteres Möbel anhängen</button>
      ${fragen.length > 0 && html`<button class="knopf" onClick=${() => nochmal(fragen.map((r) => ({ frage: r.frage, feld: r.feld, antwort: antworten[r.id] })))}>Antworten an KI senden & neu prüfen</button>`}
    </div></div>`;
}

export function SkizzenTab({ p, ersetzen, neuladen }) {
  const [netz, setNetz] = useState(null);
  const [kiStatus, setKiStatus] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const [hinweis, setHinweis] = useState("");
  const [crop, setCrop] = useState(null);
  const [version, setVersion] = useState(Date.now());
  useEffect(() => {
    api.get("/api/netz").then(setNetz).catch(() => {});
    api.get("/api/ki/status").then(setKiStatus).catch(() => {});
  }, []);
  // Neue Skizzen vom Handy automatisch anzeigen
  useEffect(() => {
    const t = setInterval(async () => {
      const neu = await api.get(`/api/projekte/${p.id}`).catch(() => null);
      if (neu && (neu.daten.skizzen || []).length !== (p.daten.skizzen || []).length) ersetzen(neu);
    }, 4000);
    return () => clearInterval(t);
  }, [p]);

  const skizzen = p.daten.skizzen || [];
  const neuHolen = async () => { ersetzen(await api.get(`/api/projekte/${p.id}`)); setVersion(Date.now()); };
  const hochladen = async (e) => {
    const fd = new FormData();
    for (const f of e.target.files) fd.append("dateien", f);
    e.target.value = "";
    try { await api.form(`/api/projekte/${p.id}/skizzen`, fd); await neuHolen(); meldung("Skizze hochgeladen"); } catch (er) { fehler(er); }
  };
  const bearbeiten = async (s, aktion, box) => {
    try { await api.post(`/api/projekte/${p.id}/skizzen/${s.datei}/bearbeiten`, { aktion, box }); setVersion(Date.now()); } catch (e) { fehler(e); }
  };
  const loeschen = async (s) => {
    if (!confirm("Skizze löschen?")) return;
    await api.del(`/api/projekte/${p.id}/skizzen/${s.datei}`).catch(fehler);
    neuHolen();
  };
  const aktivUmschalten = async (s) => {
    const neu = { ...p, daten: { ...p.daten, skizzen: skizzen.map((x) => (x.datei === s.datei ? { ...x, aktiv: !x.aktiv } : x)) } };
    ersetzen(await api.put(`/api/projekte/${p.id}`, neu));
  };
  const analysieren = async (antworten) => {
    setLaeuft(true);
    try {
      await api.post(`/api/projekte/${p.id}/analyse`, { hinweis, antworten });
      await neuHolen();
      meldung("Analyse fertig");
    } catch (e) { fehler(e); }
    setLaeuft(false);
  };
  const url = (s) => `/api/projekte/${p.id}/dateien/skizzen/${s.datei}?v=${version}`;
  const uploadUrl = netz?.adressen?.[0] ? `${netz.adressen[0]}/upload/${p.id}` : `${location.origin}/upload/${p.id}`;

  return html`
    <div class="karte"><div class="zeile" style="align-items:flex-start">
      <div class="abstand">
        <h3 style="margin-top:0">Skizzen hochladen</h3>
        <p class="leise">Foto der Handskizze (Front-, Seiten-, Draufsicht) – mehrere Fotos möglich.</p>
        <input type="file" accept="image/*" multiple onChange=${hochladen} />
      </div>
      <div class="qr"><img src=${"/api/qr.svg?text=" + encodeURIComponent(uploadUrl)} alt="QR-Code" />
        <div><b>Vom Handy hochladen</b><br /><span class="leise klein">QR-Code scannen (Handy im selben WLAN)</span><br />
          <a class="klein" href=${uploadUrl} target="_blank">${uploadUrl}</a></div></div>
    </div></div>
    ${skizzen.length > 0 && html`<div class="skizzen">${skizzen.map((s) => html`<div class=${"skizze" + (s.aktiv === false ? " inaktiv" : "")} key=${s.datei}>
      <img src=${url(s)} onClick=${() => window.open(url(s), "_blank")} />
      <div class="zeile">
        <button class="knopf klein" title="links drehen" onClick=${() => bearbeiten(s, "links")}>⟲</button>
        <button class="knopf klein" title="rechts drehen" onClick=${() => bearbeiten(s, "rechts")}>⟳</button>
        <button class="knopf klein" title="Kontrast verbessern" onClick=${() => bearbeiten(s, "kontrast")}>◐</button>
        <button class="knopf klein" title="zuschneiden" onClick=${() => setCrop(s)}>✂</button>
        <span class="abstand"></span>
        <label class="haken klein" title="bei der Analyse verwenden"><input type="checkbox" checked=${s.aktiv !== false} onChange=${() => aktivUmschalten(s)} />KI</label>
        <button class="knopf klein gefahr" onClick=${() => loeschen(s)}>✕</button>
      </div></div>`)}</div>`}
    <div class="karte" style="margin-top:14px">
      <h3 style="margin-top:0">KI-Analyse</h3>
      ${kiStatus && !kiStatus.konfiguriert && html`<div class="warnungen">Kein API-Schlüssel hinterlegt – unter <a href="#/vorgaben/ki">Vorgaben → KI</a> eintragen.</div>`}
      <${Feld} label="Zusätzlicher Hinweis an die KI (optional)">
        <div class="zeile" style="flex-wrap:nowrap"><${Text} wert=${hinweis} aendern=${setHinweis} platzhalter="z. B. Fronten in Eiche, Korpus weiß, 2 Stück" />
          <${SpracheKnopf} beiText=${(t) => setHinweis((hinweis ? hinweis + " " : "") + t)} /></div><//>
      <div class="zeile" style="margin-top:10px">
        <button class="knopf primaer" disabled=${laeuft || !skizzen.some((s) => s.aktiv !== false)} onClick=${() => analysieren(null)}>
          ${laeuft ? "Claude analysiert die Skizze …" : "Skizze analysieren"}</button>
        ${laeuft && html`<${Laden} text="kann 1–2 Minuten dauern" />`}
      </div>
    </div>
    ${p.daten.ki_analyse && html`<${Rueckfragen} analyse=${p.daten.ki_analyse} pid=${p.id} ersetzen=${ersetzen} nochmal=${analysieren} />`}
    ${crop && html`<${ZuschneidenDialog} url=${url(crop)} schliessen=${() => setCrop(null)}
      fertig=${async (box) => { await bearbeiten(crop, "zuschneiden", box); setCrop(null); }} />`}`;
}
