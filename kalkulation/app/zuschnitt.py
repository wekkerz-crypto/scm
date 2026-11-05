"""Plattenoptimierung (Guillotine-Verfahren, sägegerecht).

Jedes Teil wird mit Zuschnittmaß + Sägeblattstärke belegt. Teile mit
Faserrichtung (Material.faser) werden nicht gedreht: Teil-Länge liegt immer
in Plattenlänge. Es werden mehrere Sortierungen probiert und das Ergebnis mit
den wenigsten Platten bzw. dem kleinsten Rest auf der letzten Platte gewählt.
"""
from __future__ import annotations

from collections import defaultdict


def _platziere(teile, L, B, kerf, darf_drehen, sort_key):
    """Ein Lauf des Guillotine-Algorithmus (Best Area Fit, Split entlang kürzerer Restseite)."""
    platten = []  # je Platte: {"frei": [[x,y,l,b]], "teile": []}
    for t in sorted(teile, key=sort_key, reverse=True):
        bester = None
        for pi, p in enumerate(platten + [None]):
            frei = p["frei"] if p else [[0.0, 0.0, L, B]]
            for fi, (fx, fy, fl, fb) in enumerate(frei):
                for gedreht in ((False, True) if darf_drehen else (False,)):
                    tl, tb = (t["b"], t["l"]) if gedreht else (t["l"], t["b"])
                    if tl <= fl + 1e-6 and tb <= fb + 1e-6:
                        # bevorzugt vorhandene Platten, dann kleinste Restfläche
                        wert = (0 if p else 1, fl * fb - tl * tb)
                        if bester is None or wert < bester[0]:
                            bester = (wert, pi, fi, gedreht, tl, tb)
            if bester and bester[0][0] == 0:
                # in einer bestehenden Platte gefunden – frühere Platten zuerst füllen
                break
        if bester is None:
            return None  # Teil passt nicht auf die Platte
        _, pi, fi, gedreht, tl, tb = bester
        if pi == len(platten):
            platten.append({"frei": [[0.0, 0.0, L, B]], "teile": []})
        p = platten[pi]
        fx, fy, fl, fb = p["frei"].pop(fi)
        p["teile"].append({**t["ref"], "x": fx, "y": fy, "l": tl, "b": tb, "gedreht": gedreht})
        # Guillotine-Split: Restflächen rechts und oben (inkl. Schnittfuge)
        rl, rb = fl - tl - kerf, fb - tb - kerf
        if rl * fb > fl * rb:  # größere Restfläche ungeteilt lassen
            neu = [[fx + tl + kerf, fy, rl, fb], [fx, fy + tb + kerf, tl, rb]]
        else:
            neu = [[fx + tl + kerf, fy, rl, tb], [fx, fy + tb + kerf, fl, rb]]
        p["frei"].extend(f for f in neu if f[2] > 1 and f[3] > 1)
    return platten


def optimiere_material(teile: list[dict], platte: dict, saegeblatt: float, rand: float) -> dict:
    L = float(platte["laenge"]) - 2 * rand
    B = float(platte["breite"]) - 2 * rand
    darf_drehen = not platte.get("faser")
    gross = []
    zu_gross = []
    for t in teile:
        passt = (t["l"] <= L and t["b"] <= B) or (darf_drehen and t["b"] <= L and t["l"] <= B)
        (gross if passt else zu_gross).append(t)
    sortierungen = [
        lambda t: t["l"] * t["b"],
        lambda t: max(t["l"], t["b"]),
        lambda t: t["l"],
        lambda t: t["b"],
        lambda t: t["l"] + t["b"],
    ]
    bestes = None
    for sk in sortierungen:
        erg = _platziere(gross, L, B, saegeblatt, darf_drehen, sk)
        if erg is None:
            continue
        letzte = sum(t["l"] * t["b"] for t in erg[-1]["teile"]) if erg else 0
        wert = (len(erg), letzte)
        if bestes is None or wert < bestes[0]:
            bestes = (wert, erg)
    platten = bestes[1] if bestes else []
    flaeche_platte = float(platte["laenge"]) * float(platte["breite"])
    plaene = []
    for p in platten:
        belegt = sum(t["l"] * t["b"] for t in p["teile"])
        for t in p["teile"]:
            t["x"] = round(t["x"] + rand, 1)
            t["y"] = round(t["y"] + rand, 1)
        plaene.append({"teile": p["teile"], "ausnutzung": round(100 * belegt / flaeche_platte, 1)})
    return {"plaene": plaene, "zu_gross": [t["ref"] for t in zu_gross]}


def berechne(moebel_ergebnisse: list[dict], vorgaben: dict, einstellungen: dict | None = None) -> dict:
    """Plattenoptimierung über alle Möbel eines Projekts, getrennt je Material."""
    z = {**vorgaben.get("zuschnitt", {}), **(einstellungen or {})}
    saege = float(z.get("saegeblatt", 4.4))
    rand = float(z.get("besaeumrand", 10))
    platten = {p["id"]: p for p in vorgaben.get("platten", [])}

    je_material = defaultdict(list)
    for mi, erg in enumerate(moebel_ergebnisse):
        for t in erg["bauteile"]:
            for stk in range(int(t.get("menge", 1))):
                je_material[t["material"]].append({
                    "l": t["zuschnitt_laenge"], "b": t["zuschnitt_breite"],
                    "ref": {"name": t["name"], "key": t["key"], "moebel": mi, "nr": t["nr"],
                            "moebel_name": erg["bezeichnung"], "stueck": stk + 1,
                            "kaufteil": t.get("kaufteil", False)},
                })

    materialien = []
    for mat_id, teile in je_material.items():
        p = platten.get(mat_id) or {"id": mat_id, "name": mat_id, "laenge": 0, "breite": 0}
        netto_m2 = sum(t["l"] * t["b"] for t in teile) / 1e6
        eintrag = {
            "material": mat_id, "name": p.get("name", mat_id), "staerke": p.get("staerke"),
            "laenge": p.get("laenge"), "breite": p.get("breite"), "faser": bool(p.get("faser")),
            "teile_anzahl": len(teile), "netto_m2": round(netto_m2, 3), "plaene": [], "zu_gross": [],
            "kaufteil": bool(p.get("glas")),
        }
        if not p.get("glas") and p.get("laenge") and p.get("breite"):
            erg = optimiere_material(teile, p, saege, rand)
            eintrag["plaene"] = erg["plaene"]
            eintrag["zu_gross"] = erg["zu_gross"]
        eintrag["platten_anzahl"] = len(eintrag["plaene"])
        eintrag["platten_m2"] = round(len(eintrag["plaene"]) * float(p.get("laenge") or 0) * float(p.get("breite") or 0) / 1e6, 3)
        materialien.append(eintrag)
    materialien.sort(key=lambda e: e["name"])
    return {"saegeblatt": saege, "besaeumrand": rand, "materialien": materialien}
