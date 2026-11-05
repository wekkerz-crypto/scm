"""Gesamtberechnung eines Projekts: Möbel → Bauteile → Zuschnitt → Kalkulation."""
from __future__ import annotations

from . import kalkulation, zuschnitt
from .generator import generiere
from .modell import Moebel


def moebel_liste(daten: dict) -> list[Moebel]:
    return [Moebel.model_validate(m) for m in daten.get("moebel", [])]


def _bearbeitungen_text(t: dict) -> str:
    teile = []
    nuten = [b for b in t["bearbeitungen"] if b["art"] in ("nut", "falz")]
    for b in nuten:
        teile.append(f"{'Nut' if b['art'] == 'nut' else 'Falz'} {b['breite']:g}×{b['tiefe']:g}")
    loch = sum(1 for b in t["bearbeitungen"] if b["art"] == "lochreihe")
    topf = sum(1 for b in t["bearbeitungen"] if b["art"] == "topfbohrung")
    if loch:
        teile.append(f"{loch} Bohrungen Ø5")
    if topf:
        teile.append(f"{topf} Topfbohrungen")
    return ", ".join(teile)


def stueckliste(ergebnisse: list[dict], vorgaben: dict) -> list[dict]:
    platten = {p["id"]: p for p in vorgaben.get("platten", [])}
    kanten = {k["id"]: k for k in vorgaben.get("kanten", [])}
    zeilen = []
    for mi, erg in enumerate(ergebnisse):
        for t in erg["bauteile"]:
            kt = {s: kanten.get(k, {}).get("name", k) for s, k in t["kanten"].items()}
            zeilen.append({
                "moebel": mi, "moebel_name": erg["bezeichnung"], "nr": t["nr"], "key": t["key"],
                "name": t["name"], "gruppe": t["gruppe"], "menge": t["menge"],
                "material": t["material"], "material_name": platten.get(t["material"], {}).get("name", t["material"]),
                "laenge": t["laenge"], "breite": t["breite"], "staerke": t["staerke"],
                "zuschnitt_laenge": t["zuschnitt_laenge"], "zuschnitt_breite": t["zuschnitt_breite"],
                "faser": t["faser"], "kaufteil": t["kaufteil"],
                "kanten": {s: t["kanten"].get(s) for s in ("L1", "L2", "B1", "B2")},
                "kanten_namen": kt,
                "bearbeitung": _bearbeitungen_text(t),
            })
    return zeilen


def berechne_projekt(daten: dict, regeln: dict, vorgaben: dict) -> dict:
    moebel = moebel_liste(daten)
    ergebnisse = [generiere(m, regeln, vorgaben) for m in moebel]
    zus_einst = {}
    pe = daten.get("kalk_einstellungen") or {}
    z = zuschnitt.berechne(ergebnisse, vorgaben, zus_einst)
    kalk = kalkulation.berechne(ergebnisse, z, vorgaben, regeln, pe, daten.get("freie_positionen"))

    # Preisanteil je Möbel für das Angebot (Verteilung des Gesamtnettos nach
    # Einzel-Herstellkosten auf m²-Basis, damit Plattenreste fair verteilt werden)
    anteile = []
    if len(ergebnisse) > 1:
        basis = []
        for e in ergebnisse:
            ze = zuschnitt.berechne([e], vorgaben, zus_einst)
            ke = kalkulation.berechne([e], ze, vorgaben, regeln, {**pe, "zuschnitt_modus": "m2"}, None)
            basis.append(ke["herstellkosten"])
        summe = sum(basis) or 1
        frei = sum(p["gesamt"] for p in kalk["positionen"] if p["gruppe"] == "Sonstiges")
        faktor = kalk["netto"] - frei * (1 + float(kalk["einstellungen"].get("wagnis_gewinn") or 0) / 100)
        anteile = [round(faktor * b / summe, 2) for b in basis]
    elif ergebnisse:
        frei = sum(p["gesamt"] for p in kalk["positionen"] if p["gruppe"] == "Sonstiges")
        anteile = [round(kalk["netto"] - frei * (1 + float(kalk["einstellungen"].get("wagnis_gewinn") or 0) / 100), 2)]

    return {
        "moebel": ergebnisse,
        "stueckliste": stueckliste(ergebnisse, vorgaben),
        "zuschnitt": z,
        "kalkulation": kalk,
        "anteile_netto": anteile,
        "warnungen": [w for e in ergebnisse for w in e["warnungen"]] + kalk["warnungen"],
    }
