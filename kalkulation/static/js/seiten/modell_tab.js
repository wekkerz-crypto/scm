import { html, useState, useEffect, useRef, api, fehler, meldung, Feld, Zahl, Text, Auswahl, Haken, klon, zahl,
  GRUPPEN, SpracheKnopf, materialSuchen } from "../ui.js";
import { Viewer } from "../viewer.js";
import { Warnungen } from "./projekt.js";

const FRONTEN = [["tuer", "Tür"], ["doppeltuer", "Doppeltür"], ["schubkasten", "Schubkästen"], ["klappe", "Klappe"], ["offen", "offen"]];

function MaterialWahl({ wert, aendern, platten, standard }) {
  return html`<span class="zeile" style="flex-wrap:nowrap;gap:4px">
    <${Auswahl} wert=${wert} aendern=${aendern} leer=${`Standard (${platten.find((p) => p.id === standard)?.name || standard})`}
      optionen=${platten.map((p) => [p.id, p.name])} />
    <${SpracheKnopf} titel="Material ansagen, z. B. „Eiche“" beiText=${(t) => {
      const p = materialSuchen(t, platten);
      if (p) { aendern(p.id); meldung(`Material: ${p.name}`); } else meldung(`Kein Material zu „${t}“ gefunden`, "fehler");
    }} /></span>`;
}

function BereichEditor({ b, setze, entfernen, hoch, runter, nr }) {
  return html`<div class="unterblock">
    <div class="unterblock-kopf"><span class="abstand">Fach ${nr} <span class="leise klein">(von unten)</span></span>
      <button class="knopf klein" title="nach oben" onClick=${hoch}>▲</button><button class="knopf klein" title="nach unten" onClick=${runter}>▼</button>
      <button class="knopf klein gefahr" onClick=${entfernen}>✕</button></div>
    <div class="raster eng">
      <${Feld} label="Front"><${Auswahl} wert=${b.front} aendern=${(v) => setze({ front: v })} optionen=${FRONTEN} /><//>
      <${Feld} label="Lichte Höhe"><${Zahl} wert=${b.hoehe} platzhalter="auto" einheit="mm" aendern=${(v) => setze({ hoehe: v })} /><//>
      ${b.front === "tuer" && html`<${Feld} label="Anschlag"><${Auswahl} wert=${b.anschlag} aendern=${(v) => setze({ anschlag: v })} optionen=${[["links", "links"], ["rechts", "rechts"]]} /><//>`}
      ${b.front === "schubkasten" && html`<${Feld} label="Anzahl Schubkästen"><${Zahl} wert=${b.schubkasten_anzahl} min="1" aendern=${(v) => setze({ schubkasten_anzahl: Math.max(1, v || 1) })} /><//>`}
      <${Feld} label="Einlegeböden"><${Zahl} wert=${b.fachboeden} min="0" aendern=${(v) => setze({ fachboeden: Math.max(0, v || 0) })} /><//>
    </div>
    ${b.front !== "offen" && html`<div class="zeile" style="margin-top:6px">
      <${Haken} wert=${b.glas} aendern=${(v) => setze({ glas: v })} label="Glasfront" />
      <${Haken} wert=${b.griff} aendern=${(v) => setze({ griff: v })} label="Griff" /></div>`}
  </div>`;
}

function MoebelEditor({ m, setzeM, vorgaben, regeln }) {
  const pl = vorgaben.platten;
  const setze = (felder) => setzeM((x) => Object.assign(x, felder));
  const spalte = (si, fn) => setzeM((x) => fn(x.spalten[si], x));
  const verschiebe = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const zusatzArtikel = vorgaben.artikel.filter((a) => !a.rolle);
  const R = regeln || {};
  return html`
    <div class="raster eng">
      <${Feld} label="Bezeichnung" breit><${Text} wert=${m.bezeichnung} aendern=${(v) => setze({ bezeichnung: v })} /><//>
      <${Feld} label="Breite"><${Zahl} wert=${m.breite} einheit="mm" aendern=${(v) => v && setze({ breite: v })} /><//>
      <${Feld} label="Höhe (inkl. Sockel)"><${Zahl} wert=${m.hoehe} einheit="mm" aendern=${(v) => v && setze({ hoehe: v })} /><//>
      <${Feld} label="Tiefe (Korpus)"><${Zahl} wert=${m.tiefe} einheit="mm" aendern=${(v) => v && setze({ tiefe: v })} /><//>
      <${Feld} label="Stückzahl"><${Zahl} wert=${m.anzahl} min="1" aendern=${(v) => setze({ anzahl: Math.max(1, v || 1) })} /><//>
    </div>
    <h3>Material</h3>
    <div class="raster" style="grid-template-columns:1fr">
      <${Feld} label="Korpus"><${MaterialWahl} wert=${m.material_korpus} aendern=${(v) => setze({ material_korpus: v })} platten=${pl} standard=${R.material_korpus} /><//>
      <${Feld} label="Fronten"><${MaterialWahl} wert=${m.material_front} aendern=${(v) => setze({ material_front: v })} platten=${pl} standard=${R.material_front} /><//>
      <${Feld} label="Rückwand"><${MaterialWahl} wert=${m.material_rueckwand} aendern=${(v) => setze({ material_rueckwand: v })} platten=${pl} standard=${R.material_rueckwand} /><//>
      <${Feld} label="Fachböden"><${MaterialWahl} wert=${m.material_fachboden} aendern=${(v) => setze({ material_fachboden: v })} platten=${pl} standard=${R.material_fachboden} /><//>
    </div>
    <details><summary class="leise" style="cursor:pointer;margin:10px 0">Abweichend von den Konstruktionsregeln …</summary>
      <div class="raster eng">
        <${Feld} label="Bauweise"><${Auswahl} wert=${m.bauweise} aendern=${(v) => setze({ bauweise: v })} leer="Regel"
          optionen=${[["seiten_durchgehend", "Seiten durchgehend"], ["boeden_durchgehend", "Böden durchgehend"], ["oberboden_aufliegend", "Oberboden aufliegend"]]} /><//>
        <${Feld} label="Rückwand"><${Auswahl} wert=${m.rueckwand_art} aendern=${(v) => setze({ rueckwand_art: v })} leer="Regel"
          optionen=${[["genutet", "genutet"], ["gefaelzt", "gefälzt"], ["aufgesetzt", "aufgesetzt"], ["keine", "keine"]]} /><//>
        <${Feld} label="Sockel"><${Auswahl} wert=${m.sockel_art} aendern=${(v) => setze({ sockel_art: v })} leer="Regel"
          optionen=${[["blende", "Füße + Blende"], ["fuesse", "nur Füße"], ["keiner", "kein Sockel"]]} /><//>
        <${Feld} label="Sockelhöhe"><${Zahl} wert=${m.sockel_hoehe} platzhalter=${R.sockel_hoehe} einheit="mm" aendern=${(v) => setze({ sockel_hoehe: v })} /><//>
        <${Feld} label="Frontaufschlag"><${Auswahl} wert=${m.front_aufschlag} aendern=${(v) => setze({ front_aufschlag: v })} leer="Regel"
          optionen=${[["aufliegend", "aufliegend"], ["eingelegt", "eingelegt"]]} /><//>
      </div></details>
    <h3>Einteilung <span class="leise klein">(Spalten von links, Fächer von unten)</span></h3>
    ${m.spalten.map((sp, si) => html`<div class="unterblock" key=${si}>
      <div class="unterblock-kopf"><span class="abstand">Spalte ${si + 1}</span>
        <span style="width:120px"><${Zahl} wert=${sp.breite} platzhalter="Breite auto" einheit="mm" aendern=${(v) => spalte(si, (s) => { s.breite = v; })} /></span>
        <button class="knopf klein" title="nach links" onClick=${() => setzeM((x) => verschiebe(x.spalten, si, -1))}>◀</button>
        <button class="knopf klein" title="nach rechts" onClick=${() => setzeM((x) => verschiebe(x.spalten, si, 1))}>▶</button>
        <button class="knopf klein gefahr" disabled=${m.spalten.length < 2} onClick=${() => setzeM((x) => x.spalten.splice(si, 1))}>✕</button></div>
      ${[...sp.bereiche.keys()].reverse().map((bi) => html`<${BereichEditor} key=${bi} nr=${bi + 1} b=${sp.bereiche[bi]}
        setze=${(f) => spalte(si, (s) => Object.assign(s.bereiche[bi], f))}
        entfernen=${() => sp.bereiche.length > 1 && spalte(si, (s) => s.bereiche.splice(bi, 1))}
        hoch=${() => spalte(si, (s) => verschiebe(s.bereiche, bi, 1))} runter=${() => spalte(si, (s) => verschiebe(s.bereiche, bi, -1))} />`)}
      <button class="knopf klein" onClick=${() => spalte(si, (s) => s.bereiche.push({ hoehe: null, front: "schubkasten", anschlag: "links", schubkasten_anzahl: 1, fachboeden: 0, glas: false, griff: true }))}>+ Fach oben (mit Zwischenboden)</button>
    </div>`)}
    <button class="knopf" onClick=${() => setzeM((x) => x.spalten.push({ breite: null, bereiche: [{ hoehe: null, front: "tuer", anschlag: "rechts", schubkasten_anzahl: 1, fachboeden: 1, glas: false, griff: true }] }))}>+ Spalte (mit Mittelwand)</button>
    <h3>Zusatzpositionen</h3>
    ${m.zusatzpositionen.map((z, i) => html`<div class="zeile" style="margin-bottom:6px;flex-wrap:nowrap">
      <${Auswahl} wert=${z.artikel_id} aendern=${(v) => setzeM((x) => { x.zusatzpositionen[i].artikel_id = v; })} optionen=${vorgaben.artikel.map((a) => [a.id, a.name])} />
      <span style="width:80px"><${Zahl} wert=${z.menge} aendern=${(v) => setzeM((x) => { x.zusatzpositionen[i].menge = v ?? 1; })} /></span>
      <button class="knopf klein gefahr" onClick=${() => setzeM((x) => x.zusatzpositionen.splice(i, 1))}>✕</button></div>`)}
    <button class="knopf klein" disabled=${!zusatzArtikel.length} onClick=${() => setzeM((x) => x.zusatzpositionen.push({ artikel_id: zusatzArtikel[0].id, menge: 1, hinweis: "" }))}>+ Zusatzposition</button>
    <h3>Besonderheiten</h3>
    <${Text} mehrzeilig zeilen=${3} wert=${m.besonderheiten} aendern=${(v) => setze({ besonderheiten: v })} platzhalter="z. B. Push-to-open, Front grifflos, Wandmontage …" />`;
}

function TeilEigenschaften({ teil, m, setzeM, vorgaben }) {
  if (!teil) return html`<p class="leise klein">Bauteil im Modell anklicken, um Eigenschaften zu sehen und zu ändern.</p>`;
  const ov = m.bauteil_overrides?.[teil.key] || {};
  const setOv = (f) => setzeM((x) => {
    x.bauteil_overrides = x.bauteil_overrides || {};
    const neu = { ...(x.bauteil_overrides[teil.key] || {}), ...f };
    x.bauteil_overrides[teil.key] = neu;
  });
  const kanten = ov.kanten || teil.kanten;
  const pl = Object.fromEntries(vorgaben.platten.map((p) => [p.id, p]));
  return html`<div>
    <h3 style="margin-top:0">${teil.nr}. ${teil.name}</h3>
    <table class="klein"><tbody>
      <tr><td class="leise">Fertigmaß</td><td>${zahl(teil.laenge)} × ${zahl(teil.breite)} × ${zahl(teil.staerke)} mm</td></tr>
      <tr><td class="leise">Zuschnitt</td><td>${zahl(teil.zuschnitt_laenge)} × ${zahl(teil.zuschnitt_breite)} mm</td></tr>
      <tr><td class="leise">Gruppe</td><td>${teil.gruppe}</td></tr>
      <tr><td class="leise">Faser</td><td>${teil.faser ? "in Länge" : "ohne"}</td></tr>
      <tr><td class="leise">Bearbeitung</td><td>${teil.bearbeitungen.length ? teil.bearbeitungen.map((b) => b.art).filter((v, i, a) => a.indexOf(v) === i).join(", ") : "–"}</td></tr>
    </tbody></table>
    <${Feld} label="Name"><${Text} wert=${ov.name || ""} platzhalter=${teil.name} aendern=${(v) => setOv({ name: v || null })} /><//>
    <${Feld} label="Material"><${Auswahl} wert=${ov.material} leer=${"wie Möbel (" + (pl[teil.material]?.name || teil.material) + ")"}
      aendern=${(v) => setOv({ material: v })} optionen=${vorgaben.platten.map((p) => [p.id, p.name])} /><//>
    <div class="feld-label" style="margin-top:8px">Kanten (L = längs, B = quer)</div>
    ${["L1", "L2", "B1", "B2"].map((s) => html`<div class="zeile" style="margin:3px 0;flex-wrap:nowrap"><span style="width:26px">${s}</span>
      <${Auswahl} wert=${kanten[s]} leer="keine" optionen=${vorgaben.kanten.map((k) => [k.id, k.name])}
        aendern=${(v) => setOv({ kanten: { ...kanten, [s]: v } })} /></div>`)}
    ${m.bauteil_overrides?.[teil.key] && html`<button class="knopf klein" style="margin-top:8px"
      onClick=${() => setzeM((x) => { delete x.bauteil_overrides[teil.key]; })}>Änderungen am Bauteil zurücksetzen</button>`}
  </div>`;
}

export function ModellTab(props) {
  const { p, aendern, setAktiv } = props;
  const moebel = p.daten.moebel || [];
  if (moebel[props.aktiv]) return html`<${ModellArbeit} ...${props} />`;
  const neu = async () => {
    const m = await api.get("/api/moebel/neu");
    aendern((n) => { n.daten.moebel = [...(n.daten.moebel || []), m]; });
    setAktiv(moebel.length);
  };
  return html`<div class="karte"><p>Dieses Projekt hat noch kein Möbel.</p><div class="zeile">
    <button class="knopf primaer" onClick=${neu}>Möbel anlegen</button>
    <a class="knopf" href=${`#/projekt/${p.id}/skizzen`}>aus Skizze erkennen</a></div></div>`;
}

function ModellArbeit({ p, aendern, erg, vorgaben, aktiv, setAktiv }) {
  const box = useRef();
  const viewer = useRef();
  const [auswahl, setAuswahl] = useState(null);
  const [aus, setAus] = useState([]);
  const [schnitt, setSchnitt] = useState({ x: null, y: null, z: null });
  const [ortho, setOrtho] = useState(false);
  const [regeln, setRegeln] = useState(null);
  const [bildOpt, setBildOpt] = useState({ breite: 2400, hoehe: 1600, transparent: false });
  const moebel = p.daten.moebel || [];
  const m = moebel[aktiv];
  const e = erg?.moebel?.[aktiv];

  useEffect(() => { api.get("/api/regeln").then(setRegeln).catch(fehler); }, []);
  useEffect(() => {
    viewer.current = new Viewer(box.current, { beiAuswahl: setAuswahl });
    return () => viewer.current.zerstoeren();
  }, []);
  useEffect(() => { if (e && viewer.current) viewer.current.setTeile(e.bauteile, vorgaben.platten); }, [e, vorgaben]);
  useEffect(() => { viewer.current?.setTeile(e?.bauteile || [], vorgaben.platten, { ansichtBehalten: false }); setAus([]); setAuswahl(null); }, [aktiv]);
  useEffect(() => viewer.current?.setAusgeblendet(aus), [aus]);

  const neuesMoebel = async () => {
    const neu = await api.get("/api/moebel/neu");
    aendern((n) => { n.daten.moebel = [...(n.daten.moebel || []), neu]; });
    setAktiv(moebel.length);
  };
  const setzeM = (fn) => aendern((n) => { fn(n.daten.moebel[aktiv], n); });
  const teile = e?.bauteile || [];
  const gewaehlt = teile.find((t) => t.key === auswahl);
  const gruppeUmschalten = (g) => {
    const keys = teile.filter((t) => t.gruppe === g).map((t) => t.key);
    const alleAus = keys.every((k) => aus.includes(k));
    setAus(alleAus ? aus.filter((k) => !keys.includes(k)) : [...new Set([...aus, ...keys])]);
  };
  const setS = (a, v) => { const n = { ...schnitt, [a]: v }; setSchnitt(n); viewer.current.setSchnitt(a, v); };
  const grenzen = { x: [0, m.breite], y: [-30, m.tiefe], z: [0, m.hoehe] };
  const bild = async (speichern) => {
    const url = viewer.current.bild(bildOpt);
    if (speichern) {
      await api.post(`/api/projekte/${p.id}/render`, { bild: url }).then(() => meldung("Als Angebotsbild gespeichert")).catch(fehler);
    } else {
      const a = document.createElement("a"); a.href = url; a.download = `${m.bezeichnung}.png`; a.click();
    }
  };

  return html`
    <div class="zeile" style="margin-bottom:8px">
      <select style="max-width:320px" value=${aktiv} onChange=${(ev) => setAktiv(Number(ev.target.value))}>
        ${moebel.map((x, i) => html`<option value=${i}>${i + 1}. ${x.bezeichnung}</option>`)}</select>
      <button class="knopf klein" onClick=${neuesMoebel}>+ Möbel</button>
      <${Warnungen} liste=${e?.warnungen} />
    </div>
    <div class="arbeitsbereich">
      <div class="spalte-scroll"><${MoebelEditor} m=${m} setzeM=${setzeM} vorgaben=${vorgaben} regeln=${regeln} /></div>
      <div class="ansicht" ref=${box}>
        <div class="ansicht-werkzeuge">
          ${[["front", "Front"], ["seite", "Seite"], ["oben", "Draufsicht"], ["iso", "Isometrie"]].map(([k, l]) =>
            html`<button class="knopf klein" onClick=${() => viewer.current.ansicht(k)}>${l}</button>`)}
          <button class=${"knopf klein" + (ortho ? " aktiv" : "")} onClick=${() => { setOrtho(!ortho); viewer.current.setOrtho(!ortho); }}>Parallelprojektion</button>
          <button class="knopf klein" onClick=${() => gruppeUmschalten("Fronten")}>Fronten ${teile.filter((t) => t.gruppe === "Fronten").every((t) => aus.includes(t.key)) ? "ein" : "aus"}</button>
        </div>
      </div>
      <div class="spalte-scroll">
        <${TeilEigenschaften} teil=${gewaehlt} m=${m} setzeM=${setzeM} vorgaben=${vorgaben} />
        <h3>Schnitt</h3>
        ${[["x", "Breite"], ["z", "Höhe"], ["y", "Tiefe"]].map(([a, l]) => html`<div class="schieber">
          <label class="haken"><input type="checkbox" checked=${schnitt[a] !== null} onChange=${(ev) => setS(a, ev.target.checked ? (grenzen[a][0] + grenzen[a][1]) / 2 : null)} />${l}</label>
          <input type="range" min=${grenzen[a][0]} max=${grenzen[a][1]} disabled=${schnitt[a] === null} value=${schnitt[a] ?? 0} onInput=${(ev) => setS(a, Number(ev.target.value))} />
          <span class="klein">${schnitt[a] ?? ""}</span></div>`)}
        <h3>Bauteile</h3>
        <div class="teil-liste">${GRUPPEN.filter((g) => teile.some((t) => t.gruppe === g)).map((g) => html`
          <div class="gruppe-kopf"><input type="checkbox" checked=${!teile.filter((t) => t.gruppe === g).every((t) => aus.includes(t.key))} onChange=${() => gruppeUmschalten(g)} />${g}</div>
          ${teile.filter((t) => t.gruppe === g).map((t) => html`<label class=${t.key === auswahl ? "gewaehlt" : ""}>
            <input type="checkbox" checked=${!aus.includes(t.key)} onChange=${() => setAus(aus.includes(t.key) ? aus.filter((k) => k !== t.key) : [...aus, t.key])} />
            <span onClick=${(ev) => { ev.preventDefault(); viewer.current.waehle(t.key); }}>${t.nr}. ${t.name}</span></label>`)}`)}
        </div>
        <h3>Bild exportieren</h3>
        <div class="raster eng">
          <${Feld} label="Breite px"><${Zahl} wert=${bildOpt.breite} aendern=${(v) => setBildOpt({ ...bildOpt, breite: v || 2400 })} /><//>
          <${Feld} label="Höhe px"><${Zahl} wert=${bildOpt.hoehe} aendern=${(v) => setBildOpt({ ...bildOpt, hoehe: v || 1600 })} /><//>
        </div>
        <${Haken} wert=${bildOpt.transparent} aendern=${(v) => setBildOpt({ ...bildOpt, transparent: v })} label="transparenter Hintergrund" />
        <div class="zeile" style="margin-top:6px">
          <button class="knopf klein" onClick=${() => bild(false)}>PNG herunterladen</button>
          <button class="knopf klein primaer" onClick=${() => bild(true)}>Als Angebotsbild</button></div>
      </div>
    </div>`;
}
