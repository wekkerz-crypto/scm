// Gemeinsame UI-Bausteine, API-Zugriff und Formatierung
import { html, useState, useEffect, useRef } from "../vendor/preact-htm.js";

export { html, useState, useEffect, useRef };

// ------------------------------------------------------------------ API
async function anfrage(methode, url, body, istForm) {
  const opt = { method: methode, headers: {} };
  if (body !== undefined) {
    if (istForm) opt.body = body;
    else { opt.body = JSON.stringify(body); opt.headers["Content-Type"] = "application/json"; }
  }
  const r = await fetch(url, opt);
  if (!r.ok) {
    let text = r.statusText;
    try { text = (await r.json()).detail || text; } catch (e) { /* kein JSON */ }
    throw new Error(text);
  }
  const typ = r.headers.get("content-type") || "";
  return typ.includes("json") ? r.json() : r.text();
}
export const api = {
  get: (u) => anfrage("GET", u),
  put: (u, b) => anfrage("PUT", u, b),
  post: (u, b) => anfrage("POST", u, b ?? {}),
  del: (u) => anfrage("DELETE", u),
  form: (u, fd) => anfrage("POST", u, fd, true),
};

// ------------------------------------------------------------------ Format
export const eur = (v) => (v ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
export const zahl = (v, n = 1) => (v ?? 0).toLocaleString("de-DE", { maximumFractionDigits: n });
export const datum = (iso) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "");
export const klon = (o) => JSON.parse(JSON.stringify(o));

// ------------------------------------------------------------------ Meldungen
let toastSetzer = null;
export function Meldungen() {
  const [liste, setListe] = useState([]);
  toastSetzer = setListe;
  return html`<div class="toasts">${liste.map((t) => html`<div class=${"toast " + t.typ} key=${t.id}>${t.text}</div>`)}</div>`;
}
export function meldung(text, typ = "ok") {
  if (!toastSetzer) return;
  const id = Math.random();
  toastSetzer((l) => [...l, { id, text, typ }]);
  setTimeout(() => toastSetzer((l) => l.filter((t) => t.id !== id)), typ === "fehler" ? 7000 : 3000);
}
export const fehler = (e) => meldung(e.message || String(e), "fehler");

// ------------------------------------------------------------------ Formularfelder
export function Feld({ label, hinweis, children, breit }) {
  return html`<label class=${"feld" + (breit ? " breit" : "")}>
    <span class="feld-label">${label}</span>${children}
    ${hinweis && html`<small class="hinweis">${hinweis}</small>`}
  </label>`;
}

export function Zahl({ wert, aendern, schritt = 1, platzhalter = "", min, einheit }) {
  const [lokal, setLokal] = useState(wert ?? "");
  useEffect(() => setLokal(wert ?? ""), [wert]);
  return html`<span class="mit-einheit">
    <input type="number" inputmode="decimal" step=${schritt} min=${min} placeholder=${platzhalter} value=${lokal}
      onInput=${(e) => setLokal(e.target.value)}
      onChange=${(e) => aendern(e.target.value === "" ? null : Number(e.target.value))} />
    ${einheit && html`<em>${einheit}</em>`}
  </span>`;
}

export function Text({ wert, aendern, platzhalter = "", mehrzeilig = false, zeilen = 4 }) {
  if (mehrzeilig)
    return html`<textarea rows=${zeilen} placeholder=${platzhalter} value=${wert ?? ""} onChange=${(e) => aendern(e.target.value)} />`;
  return html`<input type="text" placeholder=${platzhalter} value=${wert ?? ""} onChange=${(e) => aendern(e.target.value)} />`;
}

export function Auswahl({ wert, aendern, optionen, leer }) {
  return html`<select value=${wert ?? ""} onChange=${(e) => aendern(e.target.value === "" ? null : e.target.value)}>
    ${leer !== undefined && html`<option value="">${leer}</option>`}
    ${optionen.map(([w, l]) => html`<option value=${w} selected=${String(w) === String(wert ?? "")}>${l}</option>`)}
  </select>`;
}

export function Haken({ wert, aendern, label }) {
  return html`<label class="haken"><input type="checkbox" checked=${!!wert} onChange=${(e) => aendern(e.target.checked)} /> ${label}</label>`;
}

export function Tabs({ tabs, aktiv, setAktiv }) {
  return html`<nav class="tabs">${tabs.map(([k, l]) =>
    html`<button class=${k === aktiv ? "aktiv" : ""} onClick=${() => setAktiv(k)}>${l}</button>`)}</nav>`;
}

// ------------------------------------------------------------------ Spracheingabe (Web Speech API)
export function spracheVerfuegbar() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
export function SpracheKnopf({ beiText, titel = "Spracheingabe" }) {
  const [aktiv, setAktiv] = useState(false);
  if (!spracheVerfuegbar()) return null;
  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = "de-DE";
    r.interimResults = false;
    r.onresult = (e) => beiText(e.results[0][0].transcript);
    r.onerror = (e) => meldung("Spracheingabe: " + e.error, "fehler");
    r.onend = () => setAktiv(false);
    setAktiv(true);
    r.start();
  };
  return html`<button type="button" class=${"knopf klein mic" + (aktiv ? " aktiv" : "")} title=${titel} onClick=${start}>🎤</button>`;
}

// Gesprochene Zahl („fünfhundertsechzig“ wird von Browsern meist schon als 560 geliefert)
export function zahlAusText(t) {
  const m = String(t).replace(/\./g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Bestes Material zu einem gesprochenen Begriff („Eiche“, „weiß“)
export function materialSuchen(text, platten) {
  const w = text.toLowerCase().split(/\s+/).filter(Boolean);
  let best = null, bestWert = 0;
  for (const p of platten) {
    const n = p.name.toLowerCase();
    const wert = w.reduce((s, x) => s + (n.includes(x) ? x.length : 0), 0);
    if (wert > bestWert) { best = p; bestWert = wert; }
  }
  return best;
}

export function Laden({ text = "Lädt …" }) {
  return html`<div class="laden"><span class="spinner"></span> ${text}</div>`;
}

export const GRUPPEN = ["Korpus", "Rückwand", "Sockel", "Einlegeböden", "Fronten"];
export const ROLLEN = [
  ["scharnier", "Scharnier (je Tür nach Staffel)"],
  ["schubkasten_klein", "Schubkasten klein"],
  ["schubkasten_mittel", "Schubkasten mittel"],
  ["schubkasten_gross", "Schubkasten groß"],
  ["sockelfuss", "Sockelfuß"],
  ["griff", "Griff"],
  ["fachbodentraeger", "Fachbodenträger"],
  ["klappenbeschlag", "Klappenbeschlag"],
];
