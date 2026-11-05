import { html, render, useState, useEffect } from "../vendor/preact-htm.js";
import { Meldungen } from "./ui.js";
import { ProjekteSeite } from "./seiten/projekte.js";
import { ProjektSeite } from "./seiten/projekt.js";
import { RegelnSeite } from "./seiten/regeln.js";
import { VorgabenSeite } from "./seiten/vorgaben.js";
import { BibliothekSeite } from "./seiten/bibliothek.js";

function useRoute() {
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const f = () => setHash(location.hash || "#/");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return hash.slice(1).split("/").filter(Boolean);
}

function App() {
  const teile = useRoute();
  const [seite, id, tab] = teile;
  let inhalt;
  if (seite === "projekt" && id) inhalt = html`<${ProjektSeite} id=${id} tab=${tab || "uebersicht"} />`;
  else if (seite === "regeln") inhalt = html`<${RegelnSeite} />`;
  else if (seite === "vorgaben") inhalt = html`<${VorgabenSeite} tab=${id} />`;
  else if (seite === "bibliothek") inhalt = html`<${BibliothekSeite} />`;
  else inhalt = html`<${ProjekteSeite} />`;
  const link = (h, text, aktiv) => html`<a href=${h} class=${aktiv ? "aktiv" : ""}>${text}</a>`;
  return html`
    <header class="kopf">
      <a class="logo" href="#/">🪚 Tischlerei-Kalkulation</a>
      <nav>
        ${link("#/", "Projekte", !seite || seite === "projekt")}
        ${link("#/regeln", "Konstruktionsregeln", seite === "regeln")}
        ${link("#/vorgaben", "Vorgaben & Preise", seite === "vorgaben")}
        ${link("#/bibliothek", "Materialbibliothek", seite === "bibliothek")}
      </nav>
    </header>
    <main class=${seite === "projekt" ? "voll" : ""}>${inhalt}</main>
    <${Meldungen} />`;
}

render(html`<${App} />`, document.getElementById("app"));
