import { html, useState, useEffect, useRef, api, fehler, meldung, Laden, Haken, Zahl, SpracheKnopf, materialSuchen } from "../ui.js";

export function musterStil(p) {
  if (p.textur) return `background-image:url(/texturen/${p.textur});background-size:cover`;
  if (p.faser) return `background:repeating-linear-gradient(90deg, ${p.farbe}, ${p.farbe} 6px, color-mix(in srgb, ${p.farbe} 82%, #000) 7px, ${p.farbe} 9px)`;
  return `background:${p.farbe}`;
}

// Foto einer Oberfläche → 4 Ecken anklicken → entzerrte, kachelbare Textur
function TexturDialog({ platte, schliessen, fertig }) {
  const [datei, setDatei] = useState(null);
  const [url, setUrl] = useState(null);
  const [punkte, setPunkte] = useState([]);
  const [kachelbar, setKachelbar] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const bild = useRef();
  const waehlen = (e) => { const f = e.target.files[0]; if (!f) return; setDatei(f); setUrl(URL.createObjectURL(f)); setPunkte([]); };
  const klick = (e) => {
    if (punkte.length >= 4) return;
    const r = bild.current.getBoundingClientRect();
    setPunkte([...punkte, [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]]);
  };
  const hochladen = async () => {
    setLaeuft(true);
    const fd = new FormData();
    fd.append("datei", datei);
    fd.append("punkte", punkte.length === 4 ? JSON.stringify(punkte) : "");
    fd.append("kachelbar", kachelbar);
    try { const r = await api.form("/api/texturen", fd); fertig(r.textur); } catch (e) { fehler(e); }
    setLaeuft(false);
  };
  return html`<div class="overlay" onClick=${(e) => e.target === e.currentTarget && schliessen()}><div class="dialog">
    <h2 style="margin-top:0">Textur für „${platte.name}“</h2>
    <p class="leise">Oberfläche möglichst gerade und gleichmäßig beleuchtet fotografieren. Optional die 4 Ecken eines rechteckigen
      Ausschnitts anklicken (oben links → oben rechts → unten rechts → unten links) zum Entzerren – sonst wird die Bildmitte verwendet.</p>
    <input type="file" accept="image/*" capture="environment" onChange=${waehlen} />
    ${url && html`<div style="margin:10px 0"><div class="zuschneiden" onClick=${klick}>
      <img ref=${bild} src=${url} />
      ${punkte.map(([x, y]) => html`<div class="punkt" style=${`left:${x * 100}%;top:${y * 100}%`}></div>`)}
    </div><div class="zeile"><span class="leise">${punkte.length}/4 Ecken</span><button class="knopf klein" onClick=${() => setPunkte([])}>Ecken zurücksetzen</button></div></div>`}
    <div class="zeile" style="margin-top:10px">
      <${Haken} wert=${kachelbar} aendern=${setKachelbar} label="kachelbar machen (nahtlos)" />
      <span class="abstand"></span>
      <button class="knopf" onClick=${schliessen}>Abbrechen</button>
      <button class="knopf primaer" disabled=${!datei || laeuft} onClick=${hochladen}>${laeuft ? "Verarbeite …" : "Textur erstellen"}</button>
    </div></div></div>`;
}

export function BibliothekSeite() {
  const [v, setV] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [filter, setFilter] = useState("");
  useEffect(() => { api.get("/api/vorgaben").then(setV).catch(fehler); }, []);
  if (!v) return html`<${Laden} />`;
  const speichern = async (neu) => { try { setV(await api.put("/api/vorgaben", neu)); meldung("Gespeichert"); } catch (e) { fehler(e); } };
  const setPlatte = (id, felder) => speichern({ ...v, platten: v.platten.map((p) => (p.id === id ? { ...p, ...felder } : p)) });
  const sichtbar = v.platten.filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));

  return html`
    <h1>Materialbibliothek</h1>
    <p class="leise">Optik und Preis gehören zusammen: Jede Platte der Vorgabenliste hat hier ihre Darstellung (Farbe, Textur, Rauheit).
      Egger-Dekore als Bilddatei hochladen (Nutzungsbedingungen von Egger beachten) oder eigene Oberflächen per Handyfoto aufnehmen.</p>
    <div class="zeile" style="margin-bottom:12px">
      <input type="text" style="max-width:300px" placeholder="Suchen, z. B. Eiche" value=${filter} onInput=${(e) => setFilter(e.target.value)} />
      <${SpracheKnopf} beiText=${(t) => { const p = materialSuchen(t, v.platten); setFilter(p ? p.name : t); }} />
    </div>
    <div class="bibliothek">${sichtbar.map((p) => html`<div class="bib-karte" key=${p.id}>
      <div class="bild" style=${musterStil(p)}></div>
      <div class="inhalt">
        <b>${p.name}</b><div class="leise klein">${p.id} · ${p.staerke} mm${p.faser ? " · mit Faser" : ""}${p.glas ? " · Glas" : ""}</div>
        <div class="zeile" style="margin-top:8px">
          <input type="color" value=${p.farbe} onChange=${(e) => setPlatte(p.id, { farbe: e.target.value })} title="Grundfarbe" />
          <button class="knopf klein" onClick=${() => setDialog(p)}>📷 Textur</button>
          ${p.textur && html`<button class="knopf klein gefahr" onClick=${() => setPlatte(p.id, { textur: null })}>Textur entfernen</button>`}
        </div>
        <div class="raster eng" style="margin-top:8px">
          <label class="feld"><span class="feld-label">Texturgröße</span><${Zahl} wert=${p.textur_mm} einheit="mm" aendern=${(x) => setPlatte(p.id, { textur_mm: x || 1000 })} /></label>
          <label class="feld"><span class="feld-label">Rauheit</span><${Zahl} wert=${p.rauheit} schritt=${0.05} aendern=${(x) => setPlatte(p.id, { rauheit: x ?? 0.6 })} /></label>
        </div>
      </div></div>`)}</div>
    ${dialog && html`<${TexturDialog} platte=${dialog} schliessen=${() => setDialog(null)}
      fertig=${(t) => { setPlatte(dialog.id, { textur: t }); setDialog(null); }} />`}`;
}
