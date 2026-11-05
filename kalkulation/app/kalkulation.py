"""Kalkulation: Material, Kanten, Beschläge, Maschine, Arbeit, Zuschläge → Netto/Brutto.

Jede Position trägt eine Herleitung (Menge × Einzelpreis), damit jede Zahl
nachvollziehbar bleibt.
"""
from __future__ import annotations

from collections import defaultdict

GRUPPEN_REIHENFOLGE = ["Material", "Kanten", "Beschläge", "Zusatzpositionen", "Maschine", "Arbeit",
                       "Oberfläche & Montage", "Sonstiges"]
MATERIAL_GRUPPEN = {"Material", "Kanten", "Beschläge", "Zusatzpositionen"}


def _pos(gruppe, bezeichnung, menge, einheit, einzelpreis, herleitung=""):
    menge = round(float(menge), 3)
    einzelpreis = round(float(einzelpreis), 4)
    return {
        "gruppe": gruppe, "bezeichnung": bezeichnung, "menge": menge, "einheit": einheit,
        "einzelpreis": einzelpreis, "gesamt": round(menge * einzelpreis, 2),
        "herleitung": herleitung or f"{_fmt(menge)} {einheit} × {_fmt(einzelpreis)} €",
    }


def _fmt(v: float) -> str:
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s[:-3] if s.endswith(",00") else s


def einstellungen(vorgaben: dict, projekt_einstellungen: dict | None) -> dict:
    e = {
        **vorgaben.get("zuschlaege", {}),
        "zuschnitt_modus": vorgaben.get("zuschnitt", {}).get("modus", "platten"),
        "verschnitt_prozent": vorgaben.get("zuschnitt", {}).get("verschnitt_prozent", 15),
    }
    for k, v in (projekt_einstellungen or {}).items():
        if v is not None and v != "":
            e[k] = v
    return e


def berechne(moebel_ergebnisse: list[dict], zuschnitt: dict, vorgaben: dict, regeln: dict,
             projekt_einstellungen: dict | None = None, freie_positionen: list[dict] | None = None) -> dict:
    E = einstellungen(vorgaben, projekt_einstellungen)
    platten = {p["id"]: p for p in vorgaben.get("platten", [])}
    kanten = {k["id"]: k for k in vorgaben.get("kanten", [])}
    artikel = {a["id"]: a for a in vorgaben.get("artikel", [])}
    artikel_rolle = {a["rolle"]: a for a in vorgaben.get("artikel", []) if a.get("rolle")}
    masch = vorgaben.get("maschine", {})
    arbeit = vorgaben.get("arbeit", {})
    erw = vorgaben.get("erweiterungen", {})
    zugabe = float(regeln.get("kanten_zugabe_mm", 0))
    positionen: list[dict] = []
    warnungen: list[str] = []

    # ---------------------------------------------------------------- Material
    modus = E.get("zuschnitt_modus", "platten")
    verschnitt = float(E.get("verschnitt_prozent", 15))
    for mat in zuschnitt.get("materialien", []):
        p = platten.get(mat["material"], {})
        fl_platte = float(p.get("laenge") or 0) * float(p.get("breite") or 0) / 1e6
        preis_m2 = float(p.get("preis_m2") or 0) or (float(p.get("preis_platte") or 0) / fl_platte if fl_platte else 0)
        preis_platte = float(p.get("preis_platte") or 0) or preis_m2 * fl_platte
        name = mat["name"]
        if mat.get("kaufteil"):
            positionen.append(_pos("Material", f"{name} (nach Maß)", mat["netto_m2"], "m²", preis_m2,
                                   f"{_fmt(mat['netto_m2'])} m² Nettofläche × {_fmt(preis_m2)} €/m²"))
        elif modus == "m2":
            menge = mat["netto_m2"] * (1 + verschnitt / 100)
            positionen.append(_pos("Material", name, menge, "m²", preis_m2,
                                   f"{_fmt(mat['netto_m2'])} m² netto + {_fmt(verschnitt)} % Verschnitt = "
                                   f"{_fmt(menge)} m² × {_fmt(preis_m2)} €/m²"))
        else:
            positionen.append(_pos("Material", name, mat["platten_anzahl"], "Platten", preis_platte,
                                   f"{mat['platten_anzahl']} Platten à {p.get('laenge')} × {p.get('breite')} mm "
                                   f"× {_fmt(preis_platte)} €/Platte (Nettofläche {_fmt(mat['netto_m2'])} m²)"))
        if mat.get("zu_gross"):
            warnungen.append(f"{name}: {len(mat['zu_gross'])} Teil(e) größer als das Plattenformat.")
        if not p:
            warnungen.append(f"Material '{mat['material']}' fehlt in der Vorgabenliste (Preis 0).")

    # ---------------------------------------------------------------- Kanten, Fräsweg, Kennzahlen
    kanten_mm = defaultdict(float)
    kanten_anzahl = 0
    fraesweg_mm = 0.0
    teile_anzahl = 0
    flaeche_oberflaeche = 0.0
    for erg in moebel_ergebnisse:
        for t in erg["bauteile"]:
            menge = int(t.get("menge", 1))
            if t.get("kaufteil"):
                continue
            teile_anzahl += menge
            for seite, kid in t.get("kanten", {}).items():
                laenge = t["laenge"] if seite.startswith("L") else t["breite"]
                kanten_mm[kid] += (laenge + zugabe) * menge
                kanten_anzahl += menge
            fraesweg_mm += 2 * (t["zuschnitt_laenge"] + t["zuschnitt_breite"]) * menge
            for b in t.get("bearbeitungen", []):
                if b["art"] in ("nut", "falz"):
                    fraesweg_mm += max(b["u1"] - b["u0"], b["v1"] - b["v0"]) * menge
            f = t["laenge"] * t["breite"] / 1e6
            if t["gruppe"] == "Fronten":
                flaeche_oberflaeche += 2 * f * menge
            elif t["rolle"] in ("seite", "oberboden"):
                flaeche_oberflaeche += f * menge

    kanten_lfm_gesamt = 0.0
    for kid, mm in sorted(kanten_mm.items()):
        k = kanten.get(kid, {})
        lfm = mm / 1000
        kanten_lfm_gesamt += lfm
        positionen.append(_pos("Kanten", k.get("name", kid), lfm, "lfm", float(k.get("preis_lfm") or 0),
                               f"{_fmt(lfm)} lfm (inkl. {_fmt(zugabe)} mm Zugabe je Kante) × "
                               f"{_fmt(float(k.get('preis_lfm') or 0))} €/lfm"))
        if not k:
            warnungen.append(f"Kante '{kid}' fehlt in der Vorgabenliste (Preis 0).")

    # ---------------------------------------------------------------- Beschläge
    besch = defaultdict(float)
    for erg in moebel_ergebnisse:
        for b in erg["beschlaege"]:
            besch[b["rolle"]] += b["menge"]
    for rolle, menge in besch.items():
        a = artikel_rolle.get(rolle)
        if not a:
            warnungen.append(f"Kein Artikel mit Rolle '{rolle}' in der Vorgabenliste – Menge {menge:g} ohne Preis.")
            positionen.append(_pos("Beschläge", f"[{rolle}] – Artikel fehlt", menge, "Stk", 0))
            continue
        positionen.append(_pos("Beschläge", a["name"], menge, a.get("einheit", "Stk"), float(a.get("preis") or 0)))

    # ---------------------------------------------------------------- Zusatzpositionen (eigene Felder)
    for erg in moebel_ergebnisse:
        for z in erg.get("zusatzpositionen", []):
            a = artikel.get(z["artikel_id"])
            if not a:
                warnungen.append(f"Zusatzposition '{z['artikel_id']}' nicht in der Vorgabenliste.")
                continue
            menge = float(z.get("menge", 1)) * int(erg.get("anzahl", 1))
            bez = a["name"] + (f" ({z['hinweis']})" if z.get("hinweis") else "")
            positionen.append(_pos("Zusatzpositionen", bez, menge, a.get("einheit", "Stk"), float(a.get("preis") or 0)))

    # ---------------------------------------------------------------- Maschine (CNC-Formatierung)
    weg_m = fraesweg_mm / 1000 * float(masch.get("wegfaktor", 1.0))
    if masch.get("modus") == "lfm":
        positionen.append(_pos("Maschine", "CNC-Formatieren (Fräsweg)", weg_m, "lfm", float(masch.get("preis_je_lfm", 0)),
                               f"Umfang aller Teile + Nuten = {_fmt(fraesweg_mm / 1000)} m × Wegfaktor "
                               f"{_fmt(float(masch.get('wegfaktor', 1)))} = {_fmt(weg_m)} m × "
                               f"{_fmt(float(masch.get('preis_je_lfm', 0)))} €/lfm"))
    else:
        vorschub = float(masch.get("vorschub_m_min", 8)) or 1
        ruest = float(masch.get("ruestzeit_min_je_teil", 0))
        minuten = weg_m / vorschub + ruest * teile_anzahl
        stunden = minuten / 60
        positionen.append(_pos("Maschine", "CNC-Formatieren", stunden, "h", float(masch.get("stundensatz", 0)),
                               f"({_fmt(weg_m)} m Fräsweg ÷ {_fmt(vorschub)} m/min + {teile_anzahl} Teile × "
                               f"{_fmt(ruest)} min) = {_fmt(minuten)} min = {_fmt(stunden)} h × "
                               f"{_fmt(float(masch.get('stundensatz', 0)))} €/h"))

    # ---------------------------------------------------------------- Arbeit (Pauschalen)
    positionen.append(_pos("Arbeit", "Teilehandling", teile_anzahl, "Teile", float(arbeit.get("teilehandling_je_teil", 0))))
    positionen.append(_pos("Arbeit", "Kanten anleimen", kanten_lfm_gesamt, "lfm", float(arbeit.get("kanten_je_lfm", 0))))
    anz_moebel = sum(int(e.get("anzahl", 1)) for e in moebel_ergebnisse)
    positionen.append(_pos("Arbeit", "Zusammenbau je Möbel", anz_moebel, "Möbel", float(arbeit.get("zusammenbau_je_moebel", 0))))
    positionen.append(_pos("Arbeit", "Zusammenbau je Teil", teile_anzahl, "Teile", float(arbeit.get("zusammenbau_je_teil", 0))))

    # ---------------------------------------------------------------- vorbereitete Erweiterungen
    if float(erw.get("oberflaeche_je_m2") or 0):
        positionen.append(_pos("Oberfläche & Montage", "Oberflächenbehandlung (Fronten beidseitig, Sichtseiten)",
                               flaeche_oberflaeche, "m²", float(erw["oberflaeche_je_m2"])))
    if float(erw.get("montage_pauschal") or 0):
        positionen.append(_pos("Oberfläche & Montage", "Montage", 1, "pauschal", float(erw["montage_pauschal"])))
    if float(erw.get("lieferung_pauschal") or 0):
        positionen.append(_pos("Oberfläche & Montage", "Lieferung", 1, "pauschal", float(erw["lieferung_pauschal"])))

    for fp in freie_positionen or []:
        if not fp.get("bezeichnung"):
            continue
        positionen.append(_pos(fp.get("gruppe") or "Sonstiges", fp["bezeichnung"], float(fp.get("menge") or 0),
                               fp.get("einheit") or "Stk", float(fp.get("preis") or 0)))

    # ---------------------------------------------------------------- Summen & Zuschläge
    summen = defaultdict(float)
    for p in positionen:
        summen[p["gruppe"]] += p["gesamt"]
    gruppen = [g for g in GRUPPEN_REIHENFOLGE if g in summen] + [g for g in summen if g not in GRUPPEN_REIHENFOLGE]
    materialkosten = sum(v for g, v in summen.items() if g in MATERIAL_GRUPPEN)
    herstellkosten = sum(summen.values())

    zuschlaege = []
    mgk = float(E.get("materialgemeinkosten") or 0)
    maufschlag = float(E.get("materialaufschlag") or 0)
    wug = float(E.get("wagnis_gewinn") or 0)
    mwst = float(E.get("mwst") or 0)
    if mgk:
        zuschlaege.append({"bezeichnung": "Materialgemeinkosten", "prozent": mgk, "basis": round(materialkosten, 2),
                           "betrag": round(materialkosten * mgk / 100, 2)})
    zuschlaege.append({"bezeichnung": "Materialaufschlag", "prozent": maufschlag, "basis": round(materialkosten, 2),
                       "betrag": round(materialkosten * maufschlag / 100, 2)})
    selbstkosten = herstellkosten + sum(z["betrag"] for z in zuschlaege)
    wug_betrag = round(selbstkosten * wug / 100, 2)
    zuschlaege.append({"bezeichnung": "Wagnis und Gewinn", "prozent": wug, "basis": round(selbstkosten, 2),
                       "betrag": wug_betrag})
    netto = round(selbstkosten + wug_betrag, 2)
    mwst_betrag = round(netto * mwst / 100, 2)

    return {
        "positionen": sorted(positionen, key=lambda p: gruppen.index(p["gruppe"])),
        "gruppen": [{"gruppe": g, "summe": round(summen[g], 2)} for g in gruppen],
        "materialkosten": round(materialkosten, 2),
        "herstellkosten": round(herstellkosten, 2),
        "zuschlaege": zuschlaege,
        "selbstkosten": round(selbstkosten, 2),
        "netto": netto,
        "mwst_prozent": mwst,
        "mwst": mwst_betrag,
        "brutto": round(netto + mwst_betrag, 2),
        "einstellungen": E,
        "kennzahlen": {
            "teile": teile_anzahl,
            "kanten_lfm": round(kanten_lfm_gesamt, 2),
            "kanten_anzahl": kanten_anzahl,
            "fraesweg_m": round(fraesweg_mm / 1000, 2),
            "oberflaeche_m2": round(flaeche_oberflaeche, 2),
            "platten": sum(m["platten_anzahl"] for m in zuschnitt.get("materialien", [])),
        },
        "warnungen": warnungen,
    }
