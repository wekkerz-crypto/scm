"""Kollisionserkennung für Türen und Klappen.

Jede bewegliche Front wird in Winkelschritten bis zum Öffnungswinkel geschwenkt
(Drehpunkt an der vorderen Bandkante, vereinfachte Topfscharnier-Kinematik).
Türen werden in der Draufsicht (x/y), Klappen in der Seitenansicht (y/z)
geprüft gegen:
  * feste Teile (Korpus, Sichtseiten, Abdeckplatte, Passblenden, Sockel)
  * die Wand einer Nische (hinter einer Passblende)
  * geschlossene Fronten ohne Drehbewegung und alle Griffe
  * andere Türen, die gleichzeitig öffnen (z. B. zwei Türen an einer Mittelwand)
Ergebnis: bewegung.max_winkel und bewegung.kollision je Front + Warnungen.
"""
from __future__ import annotations

import math

SCHRITT = 2.0           # Grad
TOLERANZ = 0.3          # mm Eindringtiefe, ab der eine Kollision zählt
GRIFF_ABSTAND, GRIFF_Q = 28.0, 11.0


def _sat(p: list, q: list) -> float:
    """Eindringtiefe zweier konvexer Polygone (0 = keine Überlappung)."""
    tiefe = math.inf
    for poly in (p, q):
        for i in range(len(poly)):
            x1, y1 = poly[i]
            x2, y2 = poly[(i + 1) % len(poly)]
            nx, ny = y2 - y1, x1 - x2
            n = math.hypot(nx, ny) or 1
            nx, ny = nx / n, ny / n
            a = [x * nx + y * ny for x, y in p]
            b = [x * nx + y * ny for x, y in q]
            ueber = min(max(a), max(b)) - max(min(a), min(b))
            if ueber <= 0:
                return 0.0
            tiefe = min(tiefe, ueber)
    return tiefe


def _rechteck(a0, b0, a1, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def _ueberlappt(r1, r2) -> bool:
    return min(r1[1], r2[1]) - max(r1[0], r2[0]) > TOLERANZ


def _griff_box(g: dict) -> tuple:
    """Griff als Quader (x0, y0, z0, x1, y1, z1)."""
    L = g["laenge"]
    y0, y1 = g["y"] - GRIFF_ABSTAND - GRIFF_Q, g["y"]
    if g["richtung"] == "senkrecht":
        return g["x"] - 6, y0, g["z"] - L / 2, g["x"] + 6, y1, g["z"] + L / 2
    return g["x"] - L / 2, y0, g["z"] - 6, g["x"] + L / 2, y1, g["z"] + 6


def _box(t: dict) -> tuple:
    x, y, z = t["pos"]
    dx, dy, dz = t["dim"]
    return x, y, z, x + dx, y + dy, z + dz


def pruefe(erg: dict, regeln: dict) -> None:
    teile = erg["bauteile"]
    info = erg.get("info", {})
    griffe = [k for k in erg.get("koerper", []) if k["typ"] == "griff"]
    griff_an = {}
    for g in griffe:
        griff_an.setdefault(g["an"], []).append(_griff_box(g))
    w_tuer = float(regeln.get("tuer_oeffnungswinkel", 95))
    w_klappe = float(regeln.get("klappe_oeffnungswinkel", 100))

    beweglich = [t for t in teile if (t.get("bewegung") or {}).get("typ") in ("tuer", "klappe")]
    fest = [(t["name"], _box(t)) for t in teile if not t.get("bewegung")]
    # geschlossene Fronten ohne Drehbewegung (Schubkästen) und ihre Griffe
    for t in teile:
        if (t.get("bewegung") or {}).get("typ") == "schubkasten" and t["gruppe"] == "Fronten":
            fest.append((t["name"], _box(t)))
            fest += [(f"Griff {t['name']}", g) for g in griff_an.get(t["key"], [])]
    # Nischenwände hinter Passblenden
    hoehe = info.get("hoehe", max(_box(t)[5] for t in teile))
    xg0, xg1 = info.get("x_gesamt", [0, erg["masse"]["breite"]])
    abschluss = info.get("abschluss", {})
    if abschluss.get("links") == "passblende":
        fest.append(("Nischenwand links", (xg0 - 1000, -3000, 0, xg0, 3000, hoehe + 500)))
    if abschluss.get("rechts") == "passblende":
        fest.append(("Nischenwand rechts", (xg1, -3000, 0, xg1 + 1000, 3000, hoehe + 500)))

    def elemente(t: dict) -> list:
        """Front + eigene Griffe als (Quader, Name)."""
        return [(_box(t), t["name"])] + [(g, f"Griff {t['name']}") for g in griff_an.get(t["key"], [])]

    def tuer_polys(t: dict, phi: float) -> list:
        b = t["bewegung"]
        x0, y0, _, x1, _, _ = _box(t)
        px, py = (x0, y0) if b["anschlag"] == "links" else (x1, y0)   # vordere Bandkante
        c, s = math.cos(math.radians(phi)), math.sin(math.radians(phi))
        out = []
        for q, name in elemente(t):
            pts = []
            for (u, v) in _rechteck(q[0], q[1], q[3], q[4]):
                dx, dy = u - px, v - py
                if b["anschlag"] == "links":
                    pts.append((px + dx * c + dy * s, py - dx * s + dy * c))
                else:
                    pts.append((px + dx * c - dy * s, py + dx * s + dy * c))
            out.append((pts, (q[2], q[5]), name))
        return out

    def klappe_polys(t: dict, phi: float) -> list:
        _, y0, _, _, _, z1 = _box(t)
        py, pz = y0, z1                                              # vordere Oberkante
        c, s = math.cos(math.radians(phi)), math.sin(math.radians(phi))
        out = []
        for q, name in elemente(t):
            pts = []
            for (u, v) in _rechteck(q[1], q[2], q[4], q[5]):
                dy, dz = u - py, v - pz
                pts.append((py + dy * c + dz * s, pz - dy * s + dz * c))
            out.append((pts, (q[0], q[3]), name))
        return out

    ergebnis = {}
    tueren = [t for t in beweglich if t["bewegung"]["typ"] == "tuer"]
    for t in beweglich:
        typ = t["bewegung"]["typ"]
        ziel = w_tuer if typ == "tuer" else w_klappe
        max_w, mit = ziel, None
        phi = SCHRITT
        while phi <= ziel + 1e-6 and mit is None:
            polys = tuer_polys(t, phi) if typ == "tuer" else klappe_polys(t, phi)
            for pts, bereich, eigen in polys:
                for name, q in fest:
                    if typ == "tuer":
                        if _ueberlappt(bereich, (q[2], q[5])) and _sat(pts, _rechteck(q[0], q[1], q[3], q[4])) > TOLERANZ:
                            mit = (name, eigen)
                    elif _ueberlappt(bereich, (q[0], q[3])) and _sat(pts, _rechteck(q[1], q[2], q[4], q[5])) > TOLERANZ:
                        mit = (name, eigen)
                    if mit:
                        break
                if mit is None and typ == "tuer":
                    for andere in tueren:
                        if andere is t:
                            continue
                        for pts2, bereich2, name2 in tuer_polys(andere, phi):
                            if _ueberlappt(bereich, bereich2) and _sat(pts, pts2) > TOLERANZ:
                                mit = (name2, eigen)
                                break
                        if mit:
                            break
                if mit:
                    break
            if mit:
                max_w = phi - SCHRITT
            phi += SCHRITT
        t["bewegung"]["winkel"] = ziel
        t["bewegung"]["max_winkel"] = round(max_w, 1)
        if mit:
            t["bewegung"]["kollision"] = {"mit": mit[0], "teil": mit[1], "winkel": round(max_w, 1)}
            ergebnis[t["key"]] = mit
            wer = t["name"] if mit[1] == t["name"] else f"{t['name']} ({mit[1]})"
            tipp = " – Passblende verbreitern oder Griff versetzen" if "Nischenwand" in mit[0] else ""
            erg["warnungen"].append(f"Kollision: {wer} stößt bei ca. {max_w:g}° an {mit[0]} (Soll {ziel:g}°){tipp}.")
