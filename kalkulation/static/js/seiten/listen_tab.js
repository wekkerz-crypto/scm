import { html, useState, Feld, Zahl, Auswahl, Text, Laden, eur, zahl, klon } from "../ui.js";

const kantenKurz = (z) => ["L1", "L2", "B1", "B2"].filter((s) => z.kanten[s]).join(" ") || "–";

export function StuecklisteTab({ p, erg }) {
  if (!erg) return html`<${Laden} />`;
  return html`
    <div class="zeile ende" style="margin-bottom:8px">
      <a class="knopf" href=${`/api/projekte/${p.id}/export/stueckliste.csv`}>CSV</a>
      <a class="knopf" href=${`/api/projekte/${p.id}/export/stueckliste.pdf`}>PDF</a></div>
    ${erg.moebel.map((m, mi) => html`<div class="karte tabelle-scroll">
      <h3 style="margin-top:0">${m.bezeichnung} <span class="leise klein">${m.anzahl} Stk · ${m.masse.breite} × ${m.masse.hoehe} × ${m.masse.tiefe} mm</span></h3>
      <table><thead><tr><th>Nr</th><th>Bauteil</th><th class="z">Stk</th><th>Material</th><th class="z">Länge</th><th class="z">Breite</th><th class="z">Stärke</th>
        <th class="z">Zuschnitt</th><th>Faser</th><th>Kanten</th><th>Bearbeitung</th></tr></thead>
      <tbody>${erg.stueckliste.filter((z) => z.moebel === mi).map((z) => html`<tr>
        <td>${z.nr}</td><td>${z.name}</td><td class="z">${z.menge}</td><td>${z.material_name}</td>
        <td class="z">${zahl(z.laenge)}</td><td class="z">${zahl(z.breite)}</td><td class="z">${zahl(z.staerke)}</td>
        <td class="z">${z.kaufteil ? "Kaufteil" : `${zahl(z.zuschnitt_laenge)} × ${zahl(z.zuschnitt_breite)}`}</td>
        <td>${z.faser ? "ja" : "–"}</td><td title=${Object.entries(z.kanten_namen).map(([s, n]) => `${s}: ${n}`).join("\n")}>${kantenKurz(z)}</td>
        <td class="klein">${z.bearbeitung}</td></tr>`)}</tbody></table>
      <h3>Beschläge</h3>
      <div class="leise">${Object.entries(m.beschlaege.reduce((a, b) => ({ ...a, [b.rolle]: (a[b.rolle] || 0) + b.menge }), {}))
        .map(([r, n]) => `${n}× ${r}`).join(" · ") || "keine"}</div>
    </div>`)}
    <p class="leise klein">L1/L2 = Kanten entlang der Länge (L1 = vorne bei Korpusteilen), B1/B2 = Kanten an den Stirnseiten.
      Zuschnittmaß = Fertigmaß abzüglich Kantenstärke (einstellbar in den Konstruktionsregeln).</p>`;
}

function Plan({ mat, plan, nr }) {
  const L = mat.laenge, B = mat.breite;
  return html`<div class="plan">
    <div class="zeile"><b>Platte ${nr}/${mat.plaene.length}</b><span class="leise">${L} × ${B} mm · Ausnutzung ${zahl(plan.ausnutzung)} %</span></div>
    <svg viewBox=${`0 0 ${L} ${B}`}>
      ${plan.teile.map((t) => html`<g><title>${t.moebel_name}: ${t.nr}. ${t.name} – ${zahl(t.l)} × ${zahl(t.b)}${t.gedreht ? " (gedreht)" : ""}</title>
        <rect class="teil" x=${t.x} y=${t.y} width=${t.l} height=${t.b} />
        ${t.l > 180 && t.b > 70 && html`<text x=${t.x + t.l / 2} y=${t.y + t.b / 2} text-anchor="middle" dominant-baseline="middle">${t.nr} ${t.name.slice(0, Math.floor(t.l / 22))}</text>
          <text x=${t.x + t.l / 2} y=${t.y + t.b / 2 + 38} text-anchor="middle" dominant-baseline="middle" style="font-size:28px;fill:#666">${zahl(t.l)} × ${zahl(t.b)}</text>`}
      </g>`)}
    </svg></div>`;
}

export function ZuschnittTab({ p, erg, aendern }) {
  if (!erg) return html`<${Laden} />`;
  const z = erg.zuschnitt;
  const ke = p.daten.kalk_einstellungen || {};
  const setKe = (f, v) => aendern((n) => { n.daten.kalk_einstellungen = { ...(n.daten.kalk_einstellungen || {}), [f]: v }; });
  const kanten = erg.kalkulation.positionen.filter((x) => x.gruppe === "Kanten");
  return html`
    <div class="karte"><div class="zeile">
      <${Feld} label="Materialberechnung"><${Auswahl} wert=${ke.zuschnitt_modus} leer=${"Standard (" + (erg.kalkulation.einstellungen.zuschnitt_modus === "m2" ? "m²" : "Platten") + ")"}
        aendern=${(v) => setKe("zuschnitt_modus", v)} optionen=${[["platten", "auf ganze Platten"], ["m2", "auf m²-Basis"]]} /><//>
      <${Feld} label="Verschnitt bei m²"><${Zahl} wert=${ke.verschnitt_prozent} platzhalter=${erg.kalkulation.einstellungen.verschnitt_prozent} einheit="%" aendern=${(v) => setKe("verschnitt_prozent", v)} /><//>
      <span class="abstand"></span>
      <span class="leise klein">Sägeblatt ${z.saegeblatt} mm · Besäumrand ${z.besaeumrand} mm (Vorgaben)</span>
      <a class="knopf" href=${`/api/projekte/${p.id}/export/zuschnitt.csv`}>CSV</a>
      <a class="knopf" href=${`/api/projekte/${p.id}/export/zuschnitt.pdf`}>PDF</a>
    </div></div>
    <div class="karte"><h3 style="margin-top:0">Gesamtmengen</h3>
      <table><thead><tr><th>Material</th><th class="z">Teile</th><th class="z">Nettofläche</th><th class="z">Platten</th><th class="z">Plattenfläche</th><th class="z">Ausnutzung</th></tr></thead>
      <tbody>${z.materialien.map((m) => html`<tr><td>${m.name}${m.faser ? " (Faser)" : ""}</td><td class="z">${m.teile_anzahl}</td>
        <td class="z">${zahl(m.netto_m2, 2)} m²</td><td class="z">${m.kaufteil ? "Kaufteil" : m.platten_anzahl}</td>
        <td class="z">${m.kaufteil ? "" : zahl(m.platten_m2, 2) + " m²"}</td>
        <td class="z">${m.platten_m2 ? zahl((100 * m.netto_m2) / m.platten_m2) + " %" : ""}</td></tr>`)}
        ${kanten.map((k) => html`<tr><td>${k.bezeichnung}</td><td></td><td class="z">${zahl(k.menge, 2)} lfm</td><td colspan="3"></td></tr>`)}</tbody></table>
      ${z.materialien.some((m) => m.zu_gross.length) && html`<div class="warnungen">Teile größer als das Plattenformat: ${z.materialien.flatMap((m) => m.zu_gross.map((t) => t.name)).join(", ")}</div>`}
    </div>
    ${z.materialien.filter((m) => m.plaene.length).map((m) => html`<div class="karte"><h3 style="margin-top:0">${m.name}</h3>
      ${m.plaene.map((pl, i) => html`<${Plan} mat=${m} plan=${pl} nr=${i + 1} />`)}</div>`)}`;
}

export function KalkulationTab({ p, erg, aendern }) {
  if (!erg) return html`<${Laden} />`;
  const k = erg.kalkulation;
  const ke = p.daten.kalk_einstellungen || {};
  const setKe = (f, v) => aendern((n) => { n.daten.kalk_einstellungen = { ...(n.daten.kalk_einstellungen || {}), [f]: v }; });
  const fp = p.daten.freie_positionen || [];
  const setFp = (fn) => aendern((n) => { n.daten.freie_positionen = n.daten.freie_positionen || []; fn(n.daten.freie_positionen); });
  return html`
    <div class="karte"><h3 style="margin-top:0">Zuschläge für dieses Projekt <span class="leise klein">(leer = Standard aus den Vorgaben)</span></h3>
      <div class="raster">
        ${[["materialgemeinkosten", "Materialgemeinkosten"], ["materialaufschlag", "Materialaufschlag"], ["wagnis_gewinn", "Wagnis und Gewinn"], ["mwst", "MwSt."]]
          .map(([f, l]) => html`<${Feld} label=${l}><${Zahl} wert=${ke[f]} platzhalter=${k.einstellungen[f]} einheit="%" schritt=${0.5} aendern=${(v) => setKe(f, v)} /><//>`)}
      </div></div>
    <div class="karte tabelle-scroll">
      <div class="zeile"><h3 class="abstand" style="margin-top:0">Positionen</h3><a class="knopf" href=${`/api/projekte/${p.id}/export/kalkulation.pdf`}>Kalkulation als PDF</a></div>
      <table><thead><tr><th>Gruppe</th><th>Position</th><th>Herleitung</th><th class="z">Menge</th><th class="z">EP</th><th class="z">Gesamt</th></tr></thead>
      <tbody>${k.positionen.map((x) => html`<tr><td class="leise">${x.gruppe}</td><td>${x.bezeichnung}</td><td class="klein leise">${x.herleitung}</td>
        <td class="z">${zahl(x.menge, 2)} ${x.einheit}</td><td class="z">${eur(x.einzelpreis)}</td><td class="z">${eur(x.gesamt)}</td></tr>`)}</tbody></table>
    </div>
    <div class="karte"><h3 style="margin-top:0">Freie Positionen <span class="leise klein">(nur dieses Projekt, z. B. Aufmaß, Sonderteile)</span></h3>
      ${fp.map((x, i) => html`<div class="zeile" style="margin-bottom:6px;flex-wrap:nowrap">
        <${Text} wert=${x.bezeichnung} platzhalter="Bezeichnung" aendern=${(v) => setFp((l) => { l[i].bezeichnung = v; })} />
        <span style="width:90px"><${Zahl} wert=${x.menge} aendern=${(v) => setFp((l) => { l[i].menge = v ?? 0; })} /></span>
        <span style="width:90px"><${Text} wert=${x.einheit} aendern=${(v) => setFp((l) => { l[i].einheit = v; })} /></span>
        <span style="width:120px"><${Zahl} wert=${x.preis} schritt=${0.01} einheit="€" aendern=${(v) => setFp((l) => { l[i].preis = v ?? 0; })} /></span>
        <button class="knopf klein gefahr" onClick=${() => setFp((l) => l.splice(i, 1))}>✕</button></div>`)}
      <button class="knopf klein" onClick=${() => setFp((l) => l.push({ bezeichnung: "", menge: 1, einheit: "Stk", preis: 0, gruppe: "Sonstiges" }))}>+ Position</button>
    </div>
    <div class="karte"><table class="summen-tabelle" style="max-width:560px;margin-left:auto"><tbody>
      ${k.gruppen.map((g) => html`<tr><td>${g.gruppe}</td><td class="z">${eur(g.summe)}</td></tr>`)}
      <tr class="summe"><td>Herstellkosten</td><td class="z">${eur(k.herstellkosten)}</td></tr>
      ${k.zuschlaege.map((z) => html`<tr><td>${z.bezeichnung} ${zahl(z.prozent)} % <span class="leise klein">auf ${eur(z.basis)}</span></td><td class="z">${eur(z.betrag)}</td></tr>`)}
      <tr class="summe"><td>Netto</td><td class="z">${eur(k.netto)}</td></tr>
      <tr><td>MwSt. ${zahl(k.mwst_prozent)} %</td><td class="z">${eur(k.mwst)}</td></tr>
      <tr class="summe"><td>Brutto</td><td class="z">${eur(k.brutto)}</td></tr>
    </tbody></table>
    <p class="leise klein">Kennzahlen: ${k.kennzahlen.teile} Teile · ${zahl(k.kennzahlen.kanten_lfm, 2)} lfm Kante · ${zahl(k.kennzahlen.fraesweg_m, 1)} m Fräsweg · ${k.kennzahlen.platten} Platten</p></div>`;
}
