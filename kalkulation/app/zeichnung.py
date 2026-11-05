"""Zeichnungsmodus: 2D-Ansichten mit Bemaßung aus dem 3D-Modell.

Ansichten (Projektion der Bauteilquader, verdeckte Teile durch Zeichenreihenfolge):
  front  – Frontansicht mit Frontaufteilung, Anschlagsymbolen und Griffen
  innen  – Frontansicht ohne Fronten (Einteilung, lichte Maße)
  seite  – Seitenansicht von rechts (Front links)
  oben   – Draufsicht (Front unten) mit Türaufschlägen

Bemaßung bewusst sparsam: Gesamtmaße außen, Aufteilung Korpus/Sichtseiten/Passblenden,
Frontmaße, Sockel und lichte Maße. Ausgabe als Zeichenbefehle in Papier-mm, die von
SVG (Bildschirm), reportlab (PDF-Übersichtsblätter) und DXF genutzt werden.
"""
from __future__ import annotations

import io
import math
from dataclasses import dataclass, field
from datetime import date

ANSICHTEN = {"front": "Frontansicht", "innen": "Innenansicht (ohne Fronten)", "seite": "Seitenansicht rechts", "oben": "Draufsicht"}
MASSSTAEBE = [2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100]

LINIE = "#2b2723"
MASSFARBE = "#1c3f6e"


@dataclass
class Mass:
    a: float
    b: float
    seite: str          # unten | oben | links | rechts
    ebene: int = 1
    text: str | None = None


@dataclass
class Ansicht:
    name: str
    titel: str
    flaechen: list = field(default_factory=list)   # (u0, v0, u1, v1, fill, stil)
    linien: list = field(default_factory=list)     # ([(u, v), ...], stil)
    masse: list = field(default_factory=list)
    box: tuple = (0, 0, 1, 1)

    def umriss(self):
        us = [f[0] for f in self.flaechen] + [f[2] for f in self.flaechen]
        vs = [f[1] for f in self.flaechen] + [f[3] for f in self.flaechen]
        self.box = (min(us), min(vs), max(us), max(vs)) if us else (0, 0, 1, 1)
        return self.box


def _z(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".").replace(".", ",")


def _hell(hexwert: str, anteil: float) -> str:
    h = (hexwert or "#dddddd").lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    r, g, b = (int(c + (255 - c) * anteil) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


# ------------------------------------------------------------------ Ansichten bauen
def _quader(t):
    x, y, z = t["pos"]
    dx, dy, dz = t["dim"]
    return x, y, z, x + dx, y + dy, z + dz


def ansichten(erg: dict, vorgaben: dict) -> dict[str, Ansicht]:
    farbe = {p["id"]: p.get("farbe", "#dddddd") for p in vorgaben.get("platten", [])}
    info = erg.get("info", {})
    teile = erg["bauteile"]
    fuesse = [k for k in erg.get("koerper", []) if k["typ"] == "sockelfuss"]
    griffe = [k for k in erg.get("koerper", []) if k["typ"] == "griff"]
    fronten = [t for t in teile if t["gruppe"] == "Fronten"]
    alle = [_quader(t) for t in teile]
    xg0 = min(q[0] for q in alle)
    xg1 = max(q[3] for q in alle)
    yg0 = min(q[1] for q in alle)
    yg1 = max(q[4] for q in alle)
    H = max(q[5] for q in alle)
    sh = info.get("sockelhoehe", 0)
    xk0, xk1 = info.get("x_korpus", [xg0, xg1])
    zk0, zk1 = info.get("z_korpus", [sh, H])
    out = {}

    def stil(t):
        return {"front": t["gruppe"] == "Fronten", "glas": t.get("kaufteil")}

    # ---------------- Frontansicht / Innenansicht (u = x, v = z), von vorn: hinten zuerst zeichnen
    for name in ("front", "innen"):
        a = Ansicht(name, ANSICHTEN[name])
        auswahl = [t for t in teile if name == "front" or t["gruppe"] != "Fronten"]
        elemente = [(t["pos"][1], (*[_quader(t)[i] for i in (0, 2, 3, 5)], farbe.get(t["material"]), stil(t))) for t in auswahl]
        elemente += [(f["y"] - 16, (f["x"] - 16, 0, f["x"] + 16, f["hoehe"], "#333333", {})) for f in fuesse]
        for _, f in sorted(elemente, key=lambda e: -e[0]):
            a.flaechen.append(f)
        if name == "front":
            for g in griffe:
                if g["richtung"] == "senkrecht":
                    a.flaechen.append((g["x"] - 5, g["z"] - g["laenge"] / 2, g["x"] + 5, g["z"] + g["laenge"] / 2, "#9a9a9a", {"griff": True}))
                else:
                    a.flaechen.append((g["x"] - g["laenge"] / 2, g["z"] - 5, g["x"] + g["laenge"] / 2, g["z"] + 5, "#9a9a9a", {"griff": True}))
            # Anschlagsymbol: Linien von der Griffseite zur Mitte der Bandseite
            for t in fronten:
                x0, _, z0, x1, _, z1 = _quader(t)
                b = t.get("bewegung") or {}
                if b.get("typ") == "tuer":
                    xb, xg = (x0, x1) if b["anschlag"] == "links" else (x1, x0)
                    a.linien.append(([(xg, z1), (xb, (z0 + z1) / 2), (xg, z0)], {"dash": True}))
                elif b.get("typ") == "klappe":
                    a.linien.append(([(x0, z0), ((x0 + x1) / 2, z1), (x1, z0)], {"dash": True}))
        a.umriss()
        out[name] = a

    # Bemaßung Frontansicht
    f = out["front"]
    punkte = sorted({round(v, 1) for v in (xg0, xk0, xk1, xg1)})
    if len(punkte) > 2:
        for p0, p1 in zip(punkte, punkte[1:]):
            f.masse.append(Mass(p0, p1, "unten", 1))
    f.masse.append(Mass(xg0, xg1, "unten", 2 if len(punkte) > 2 else 1))
    # Frontbreiten: oberste Fronten je Spalte
    spalten = {}
    for t in fronten:
        sp = t["key"].split("_")[1] if t["key"].startswith("front_") else "s0"
        spalten.setdefault(sp, []).append(t)
    for sp, ts in spalten.items():
        oben = max(_quader(t)[5] for t in ts)
        for t in ts:
            q = _quader(t)
            if abs(q[5] - oben) < 1:
                f.masse.append(Mass(q[0], q[3], "oben", 1))
    # Fronthöhen: Spalte mit den meisten Fronten links, eine abweichende Spalte rechts
    def hoehen(ts):
        return sorted({(round(_quader(t)[2], 2), round(_quader(t)[5], 2)) for t in ts})
    folge = sorted(spalten.values(), key=lambda ts: -len(hoehen(ts)))
    if folge:
        if sh > 0:
            f.masse.append(Mass(0, sh, "links", 1))
        for z0, z1 in hoehen(folge[0]):
            f.masse.append(Mass(z0, z1, "links", 1))
        rechts_ebene = 1
        anders = [ts for ts in folge[1:] if len(hoehen(ts)) > 1 and hoehen(ts) != hoehen(folge[0])]
        if anders:
            for z0, z1 in hoehen(anders[0]):
                f.masse.append(Mass(z0, z1, "rechts", 1))
            rechts_ebene = 2
        f.masse.append(Mass(0, H, "rechts", rechts_ebene))

    # Bemaßung Innenansicht: lichte Breiten oben, lichte Höhen links/rechts
    i = out["innen"]
    sp_info = info.get("spalten", [])
    for sp in sp_info:
        i.masse.append(Mass(sp["x"][0], sp["x"][1], "oben", 1))
    if sp_info:
        for z0, z1 in sp_info[0]["bereiche"]:
            i.masse.append(Mass(z0, z1, "links", 1))
        if len(sp_info) > 1:
            letzte = sp_info[-1]["bereiche"]
            if letzte != sp_info[0]["bereiche"]:
                for z0, z1 in letzte:
                    i.masse.append(Mass(z0, z1, "rechts", 1))
            mittlere = [sp["bereiche"] for sp in sp_info[1:-1] if sp["bereiche"] not in (sp_info[0]["bereiche"], letzte)]
            for z0, z1 in (mittlere[0] if mittlere else []):
                i.masse.append(Mass(z0, z1, "rechts", 2))
    i.masse.append(Mass(xk0, xk1, "unten", 1, ))

    # ---------------- Seitenansicht von rechts (u = y, Front links), nächstes = größtes x zuletzt
    s = Ansicht("seite", ANSICHTEN["seite"])
    elemente = [(_quader(t)[3], (_quader(t)[1], _quader(t)[2], _quader(t)[4], _quader(t)[5], farbe.get(t["material"]), stil(t))) for t in teile]
    elemente += [(f_["x"] + 16, (f_["y"] - 16, 0, f_["y"] + 16, f_["hoehe"], "#333333", {})) for f_ in fuesse]
    for _, e in sorted(elemente, key=lambda e: e[0]):
        s.flaechen.append(e)
    s.umriss()
    yf = info.get("frontebene", 0)
    if yf < 0:
        s.masse += [Mass(yf, 0, "unten", 1), Mass(0, info.get("tiefe", yg1), "unten", 1)]
    s.masse.append(Mass(yg0, yg1, "unten", 2 if yf < 0 else 1))
    kette = sorted({round(v, 1) for v in (0, sh, zk1, H)})
    for p0, p1 in zip(kette, kette[1:]):
        s.masse.append(Mass(p0, p1, "links", 1))
    s.masse.append(Mass(0, H, "rechts", 1))
    out["seite"] = s

    # ---------------- Draufsicht (u = x, v = y; Front unten), nächstes = größtes z zuletzt
    o = Ansicht("oben", ANSICHTEN["oben"])
    elemente = [(_quader(t)[5], (_quader(t)[0], _quader(t)[1], _quader(t)[3], _quader(t)[4], farbe.get(t["material"]), stil(t))) for t in teile]
    for _, e in sorted(elemente, key=lambda e: e[0]):
        o.flaechen.append(e)
    o.umriss()
    o.masse.append(Mass(xg0, xg1, "unten", 1))
    o.masse.append(Mass(yg0, yg1, "rechts", 1))
    out["oben"] = o
    return out


# ------------------------------------------------------------------ Zeichenbefehle (Papier-mm, y nach oben)
EBENE_ABSTAND = 7.0
ERSTE_EBENE = 8.0
TEXT = 2.5


def raender(a: Ansicht) -> dict:
    """Platzbedarf der Bemaßung je Seite in Papier-mm (unabhängig vom Maßstab)."""
    r = {"unten": 3.0, "oben": 3.0, "links": 3.0, "rechts": 3.0}
    for m in a.masse:
        r[m.seite] = max(r[m.seite], ERSTE_EBENE + (m.ebene - 1) * EBENE_ABSTAND + TEXT + 2)
    return r


def befehle(a: Ansicht, s: float, ox: float, oy: float, koloriert=True, mit_massen=True, k: float = 1.0) -> list:
    """Ansicht im Maßstab s (Papier-mm je Modell-mm) an Position (ox, oy) = linke untere Ecke des Bauteilumrisses.
    k skaliert Bemaßungsabstände und Texte (DXF 1:1)."""
    u0, v0, u1, v1 = a.box
    X = lambda u: ox + (u - u0) * s
    Y = lambda v: oy + (v - v0) * s
    ops = []
    for (fu0, fv0, fu1, fv1, fill, st) in a.flaechen:
        if st.get("glas"):
            fuell = "#e3f1f4" if koloriert else "#ffffff"
        elif koloriert:
            fuell = fill or "#dddddd"
        else:
            fuell = "#ffffff" if not st.get("griff") else "#bbbbbb"
        ops.append(("rect", X(fu0), Y(fv0), (fu1 - fu0) * s, (fv1 - fv0) * s,
                    {"fill": fuell, "stroke": LINIE, "lw": (0.35 if st.get("front") else 0.18) * k}))
    for pts, st in a.linien:
        ops.append(("poly", [(X(u), Y(v)) for u, v in pts],
                    {"stroke": "#555555", "lw": (0.13 if st.get("duenn") else 0.18) * k, "dash": [1.6 * k, 1.0 * k] if st.get("dash") else None}))
    if not mit_massen:
        return ops
    bx0, by0, bx1, by1 = X(u0), Y(v0), X(u1), Y(v1)
    sm = {"stroke": MASSFARBE, "lw": 0.13 * k}
    ts = TEXT * k
    for m in a.masse:
        if abs(m.b - m.a) < 0.5:
            continue
        text = m.text or _z(abs(m.b - m.a))
        off = (ERSTE_EBENE + (m.ebene - 1) * EBENE_ABSTAND) * k
        breit = len(text) * ts * 0.55
        if m.seite in ("unten", "oben"):
            y = by0 - off if m.seite == "unten" else by1 + off
            ya = by0 - 1.5 * k if m.seite == "unten" else by1 + 1.5 * k
            p, q = X(m.a), X(m.b)
            for xx in (p, q):
                ops.append(("line", xx, ya, xx, y + (-1.5 * k if m.seite == "unten" else 1.5 * k), sm))
                ops.append(("line", xx - 1.0 * k, y - 1.0 * k, xx + 1.0 * k, y + 1.0 * k, {"stroke": MASSFARBE, "lw": 0.3 * k}))
            ops.append(("line", p - 1.5 * k, y, q + 1.5 * k, y, sm))
            if breit < abs(q - p) - 1.5 * k:
                ops.append(("text", (p + q) / 2, y + 0.9 * k, text, {"size": ts, "anchor": "middle", "color": MASSFARBE}))
            else:
                ops.append(("text", max(p, q) + 2.2 * k, y + 0.9 * k, text, {"size": ts, "anchor": "start", "color": MASSFARBE}))
        else:
            x = bx0 - off if m.seite == "links" else bx1 + off
            xa = bx0 - 1.5 * k if m.seite == "links" else bx1 + 1.5 * k
            p, q = Y(m.a), Y(m.b)
            for yy in (p, q):
                ops.append(("line", xa, yy, x + (-1.5 * k if m.seite == "links" else 1.5 * k), yy, sm))
                ops.append(("line", x - 1.0 * k, yy - 1.0 * k, x + 1.0 * k, yy + 1.0 * k, {"stroke": MASSFARBE, "lw": 0.3 * k}))
            ops.append(("line", x, p - 1.5 * k, x, q + 1.5 * k, sm))
            if breit < abs(q - p) - 1.5 * k:
                ops.append(("text", x - 0.9 * k, (p + q) / 2, text, {"size": ts, "anchor": "middle", "rot": 90, "color": MASSFARBE}))
            else:
                ops.append(("text", x - 0.9 * k, max(p, q) + 2.2 * k, text, {"size": ts, "anchor": "start", "rot": 90, "color": MASSFARBE}))
    return ops


def massstab_fuer(a: Ansicht, breite_mm: float, hoehe_mm: float) -> int:
    r = raender(a)
    u0, v0, u1, v1 = a.box
    for n in MASSSTAEBE:
        if (u1 - u0) / n + r["links"] + r["rechts"] <= breite_mm and (v1 - v0) / n + r["unten"] + r["oben"] <= hoehe_mm:
            return n
    return MASSSTAEBE[-1]


# ------------------------------------------------------------------ SVG (Bildschirm)
def svg(a: Ansicht, koloriert=True, mit_massen=True, n: int | None = None) -> str:
    r = raender(a) if mit_massen else {"unten": 4, "oben": 4, "links": 4, "rechts": 4}
    u0, v0, u1, v1 = a.box
    n = n or max(1, math.ceil(max(u1 - u0, v1 - v0) / 250))
    s = 1 / n
    W = (u1 - u0) * s + r["links"] + r["rechts"]
    Hh = (v1 - v0) * s + r["unten"] + r["oben"]
    ops = befehle(a, s, r["links"], r["unten"], koloriert, mit_massen)
    teile = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.2f} {Hh:.2f}" width="{W:.1f}mm" height="{Hh:.1f}mm" '
             f'font-family="Helvetica, Arial, sans-serif">']
    fy = lambda y: Hh - y
    for op in ops:
        art = op[0]
        if art == "rect":
            _, x, y, w, h, st = op
            teile.append(f'<rect x="{x:.2f}" y="{fy(y + h):.2f}" width="{w:.2f}" height="{h:.2f}" fill="{st["fill"]}" '
                         f'stroke="{st["stroke"]}" stroke-width="{st["lw"]:.2f}"/>')
        elif art == "line":
            _, x1, y1, x2, y2, st = op
            teile.append(f'<line x1="{x1:.2f}" y1="{fy(y1):.2f}" x2="{x2:.2f}" y2="{fy(y2):.2f}" stroke="{st["stroke"]}" stroke-width="{st["lw"]:.2f}"/>')
        elif art == "poly":
            _, pts, st = op
            d = " ".join(f"{x:.2f},{fy(y):.2f}" for x, y in pts)
            dash = f' stroke-dasharray="{st["dash"][0]:.2f} {st["dash"][1]:.2f}"' if st.get("dash") else ""
            teile.append(f'<polyline points="{d}" fill="none" stroke="{st["stroke"]}" stroke-width="{st["lw"]:.2f}"{dash}/>')
        elif art == "text":
            _, x, y, txt, st = op
            anker = {"middle": "middle", "start": "start", "end": "end"}[st.get("anchor", "start")]
            rot = f' transform="rotate(-90 {x:.2f} {fy(y):.2f})"' if st.get("rot") else ""
            teile.append(f'<text x="{x:.2f}" y="{fy(y):.2f}" font-size="{st["size"]:.2f}" text-anchor="{anker}" '
                         f'fill="{st.get("color", LINIE)}"{rot}>{txt}</text>')
    teile.append("</svg>")
    return "".join(teile)


# ------------------------------------------------------------------ reportlab (PDF)
def _rl_zeichnen(c, ops):
    from reportlab.lib.colors import HexColor
    from reportlab.lib.units import mm
    for op in ops:
        art = op[0]
        st = op[-1]
        if art in ("rect", "line", "poly"):
            c.setStrokeColor(HexColor(st.get("stroke", LINIE)))
            c.setLineWidth(st.get("lw", 0.2) * mm)
            c.setDash([d * mm for d in st["dash"]] if st.get("dash") else [])
        if art == "rect":
            _, x, y, w, h, _ = op
            c.setFillColor(HexColor(st["fill"]))
            c.rect(x * mm, y * mm, w * mm, h * mm, stroke=1, fill=1)
        elif art == "line":
            _, x1, y1, x2, y2, _ = op
            c.line(x1 * mm, y1 * mm, x2 * mm, y2 * mm)
        elif art == "poly":
            p = c.beginPath()
            pts = op[1]
            p.moveTo(pts[0][0] * mm, pts[0][1] * mm)
            for x, y in pts[1:]:
                p.lineTo(x * mm, y * mm)
            c.drawPath(p, stroke=1, fill=0)
        elif art == "text":
            _, x, y, txt, _ = op
            c.saveState()
            c.setFillColor(HexColor(st.get("color", LINIE)))
            c.setFont("Helvetica", st["size"] * mm * 1.15)
            c.translate(x * mm, y * mm)
            if st.get("rot"):
                c.rotate(90)
            {"middle": c.drawCentredString, "start": c.drawString, "end": c.drawRightString}[st.get("anchor", "start")](0, 0, txt)
            c.restoreState()
    c.setDash([])


def _ansicht_platzieren(c, a: Ansicht, n: int, x: float, y: float, koloriert=True, mit_massen=True, titel=True):
    """Zeichnet die Ansicht so, dass ihre Bemaßungsbox bei (x, y) unten links beginnt. Gibt (B, H) zurück."""
    from reportlab.lib.units import mm
    r = raender(a) if mit_massen else {"unten": 2, "oben": 2, "links": 2, "rechts": 2}
    u0, v0, u1, v1 = a.box
    s = 1 / n
    ops = befehle(a, s, x + r["links"], y + r["unten"], koloriert, mit_massen)
    _rl_zeichnen(c, ops)
    B = (u1 - u0) * s + r["links"] + r["rechts"]
    H = (v1 - v0) * s + r["unten"] + r["oben"]
    if titel:
        c.setFillColorRGB(0.17, 0.15, 0.14)
        c.setFont("Helvetica-Bold", 8)
        c.drawString((x + r["links"]) * mm, (y + H + 2.5) * mm, f"{a.titel}  M 1:{n}")
    return B, H


def _groesse(a: Ansicht, n: int, mit_massen=True):
    r = raender(a) if mit_massen else {"unten": 2, "oben": 2, "links": 2, "rechts": 2}
    u0, v0, u1, v1 = a.box
    return (u1 - u0) / n + r["links"] + r["rechts"], (v1 - v0) / n + r["unten"] + r["oben"]


def _schriftfeld(c, x, y, w, h, zeilen: list[tuple[str, str]], firma: dict, blatt: str):
    from reportlab.lib.units import mm
    c.setStrokeColorRGB(0.17, 0.15, 0.14)
    c.setLineWidth(0.5)
    c.rect(x * mm, y * mm, w * mm, h * mm)
    c.setFillColorRGB(0.17, 0.15, 0.14)
    c.setFont("Helvetica-Bold", 10)
    c.drawString((x + 3) * mm, (y + h - 6) * mm, firma.get("name") or "")
    c.setFont("Helvetica", 7)
    c.drawString((x + 3) * mm, (y + h - 10) * mm, " · ".join(v for v in (firma.get("strasse"), firma.get("plz_ort"), firma.get("telefon")) if v))
    zy = y + h - 15
    for label, wert in [z for z in zeilen if z[1]]:
        c.setFont("Helvetica", 6.5)
        c.setFillColorRGB(0.43, 0.4, 0.37)
        c.drawString((x + 3) * mm, zy * mm, label)
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColorRGB(0.17, 0.15, 0.14)
        c.drawString((x + 26) * mm, zy * mm, str(wert)[:85])
        zy -= 3.4
    c.setFont("Helvetica", 7)
    c.drawRightString((x + w - 3) * mm, (y + 3) * mm, blatt)


def uebersichtsblaetter(projekt: dict, ergebnis: dict, vorgaben: dict, bilder: dict) -> bytes:
    """Je Möbel zwei A3-Blätter: 1) bemaßte Ansichten, 2) Präsentation (3D-Bilder + kolorierte Ansichten).
    bilder: {möbel_index: [png-Pfade]}"""
    from reportlab.lib.pagesizes import A3, landscape
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    firma = vorgaben.get("firma", {})
    platten = {p["id"]: p["name"] for p in vorgaben.get("platten", [])}
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A3))
    c.setTitle(f"Zeichnungen {projekt['name']}")
    BW, BH = 420, 297
    RAND = 10
    SF_W, SF_H = 175, 42
    seiten_gesamt = 2 * len(ergebnis["moebel"])
    seite_nr = 0
    for mi, erg in enumerate(ergebnis["moebel"]):
        if not erg["bauteile"]:
            continue
        av = ansichten(erg, vorgaben)
        mats = sorted({platten.get(t["material"], t["material"]) for t in erg["bauteile"] if t["gruppe"] in ("Fronten", "Aufdoppelung")})
        mats_k = sorted({platten.get(t["material"], t["material"]) for t in erg["bauteile"] if t["gruppe"] == "Korpus"})
        m = erg["masse"]
        info = erg.get("info", {})
        breite_ges = info.get("x_gesamt", [0, m["breite"]])
        sf_zeilen = [("Projekt", projekt["name"]), ("Kunde", (projekt.get("kunde") or {}).get("name", "")),
                     ("Möbel", f"{erg['bezeichnung']} ({erg['anzahl']} Stk)"),
                     ("Außenmaße", f"{_z(breite_ges[1] - breite_ges[0])} × {_z(m['hoehe'])} × {_z(m['tiefe'] - info.get('frontebene', 0))} mm (B × H × T)"),
                     ("Front/Sicht", ", ".join(mats)), ("Korpus", ", ".join(mats_k)), ("Datum", date.today().strftime("%d.%m.%Y"))]
        bild_liste = [b for b in bilder.get(mi, []) if b and b.exists()]

        # ---------- Blatt 1: bemaßte Ansichten
        seite_nr += 1
        c.setLineWidth(0.6)
        c.rect(RAND * mm, RAND * mm, (BW - 2 * RAND) * mm, (BH - 2 * RAND) * mm)
        nutz_w, nutz_h = BW - 2 * RAND - 8, BH - 2 * RAND - SF_H - 10
        f, s_, i_, o = av["front"], av["seite"], av["innen"], av["oben"]
        n = MASSSTAEBE[-1]
        for kand in MASSSTAEBE:
            fw, fh = _groesse(f, kand)
            sw, _ = _groesse(s_, kand)
            iw, _ = _groesse(i_, kand)
            _, oh = _groesse(o, kand)
            if fw + sw + iw + 16 <= nutz_w and fh + oh + 14 <= nutz_h:
                n = kand
                break
        fw, fh = _groesse(f, n)
        sw, sh_ = _groesse(s_, n)
        iw, _ = _groesse(i_, n)
        _, oh = _groesse(o, n)
        x0 = RAND + 4
        # Ansichtsblock vertikal zwischen Schriftfeld und oberem Rand zentrieren
        block_h = fh + 10 + oh
        y_front = RAND + SF_H + 6 + max(0, (BH - 2 * RAND - SF_H - 12 - block_h) / 2)
        # Front-, Seiten- und Innenansicht nebeneinander, gleiche Grundlinie
        r_f, r_s, r_i = raender(f), raender(s_), raender(i_)
        basis = y_front + max(r_f["unten"], r_s["unten"], r_i["unten"])
        _ansicht_platzieren(c, f, n, x0, basis - r_f["unten"])
        _ansicht_platzieren(c, s_, n, x0 + fw + 8, basis - r_s["unten"])
        _ansicht_platzieren(c, i_, n, x0 + fw + sw + 16, basis - r_i["unten"])
        # Draufsicht über der Frontansicht, gleiche x-Ausrichtung des Möbels
        r_o = raender(o)
        _ansicht_platzieren(c, o, n, x0 + r_f["links"] - r_o["links"] + (o.box[0] - f.box[0]) / n, basis + (f.box[3] - f.box[1]) / n + r_f["oben"] + 10)
        # 3D-Bild oben rechts, wenn Platz
        if bild_liste:
            bx = x0 + fw + 8
            by = basis + max((a_.box[3] - a_.box[1]) / n + raender(a_)["oben"] for a_ in (s_, i_)) + 9
            bw, bh = BW - RAND - 4 - bx, BH - RAND - 4 - by
            if bw > 60 and bh > 45:
                c.drawImage(str(bild_liste[0]), bx * mm, by * mm, bw * mm, bh * mm, preserveAspectRatio=True, anchor="ne", mask="auto")
        _schriftfeld(c, BW - RAND - SF_W, RAND, SF_W, SF_H, sf_zeilen + [("Maßstab", f"1:{n}")], firma,
                     f"Blatt {seite_nr}/{seiten_gesamt} · Ansichten")
        c.setFont("Helvetica", 6.5)
        c.drawString((RAND + 3) * mm, (RAND + 2.5) * mm, "Maße in mm · Anschlagsymbol: Spitze zeigt zur Bandseite · Alle Maße am Bau prüfen")
        c.showPage()

        # ---------- Blatt 2: Präsentation
        seite_nr += 1
        c.setLineWidth(0.6)
        c.rect(RAND * mm, RAND * mm, (BW - 2 * RAND) * mm, (BH - 2 * RAND) * mm)
        c.setFont("Helvetica-Bold", 16)
        c.setFillColorRGB(0.17, 0.15, 0.14)
        c.drawString((RAND + 6) * mm, (BH - RAND - 12) * mm, erg["bezeichnung"])
        c.setFont("Helvetica", 9)
        c.drawString((RAND + 6) * mm, (BH - RAND - 18) * mm, f"{projekt['name']} · {', '.join(mats)}")
        oben_y = BH - RAND - 22
        if bild_liste:
            bh = 145
            bw = (BW - 2 * RAND - 18) / max(1, min(2, len(bild_liste)))
            for k, b in enumerate(bild_liste[:2]):
                c.drawImage(str(b), (RAND + 6 + k * (bw + 6)) * mm, (oben_y - bh) * mm, bw * mm, bh * mm,
                            preserveAspectRatio=True, anchor="c", mask="auto")
            unten_h = oben_y - bh - 8 - RAND
        else:
            unten_h = oben_y - RAND - 8
        # kolorierte Front- und Seitenansicht (ohne Maße)
        verf_w = BW - 2 * RAND - SF_W - 24
        n2 = MASSSTAEBE[-1]
        for kand in MASSSTAEBE:
            fw2, fh2 = _groesse(f, kand, False)
            sw2, _ = _groesse(s_, kand, False)
            if fw2 + sw2 + 10 <= verf_w and fh2 + 8 <= unten_h:
                n2 = kand
                break
        fw2, _ = _groesse(f, n2, False)
        _ansicht_platzieren(c, f, n2, RAND + 6, RAND + 6, True, False)
        _ansicht_platzieren(c, s_, n2, RAND + 6 + fw2 + 10, RAND + 6, True, False)
        _schriftfeld(c, BW - RAND - SF_W, RAND, SF_W, SF_H, sf_zeilen, firma, f"Blatt {seite_nr}/{seiten_gesamt} · Präsentation")
        c.showPage()
    c.save()
    return buf.getvalue()


# ------------------------------------------------------------------ DXF
def dxf(erg: dict, vorgaben: dict) -> bytes:
    """Alle Ansichten eines Möbels 1:1 in einer DXF (Layer KONTUR, FRONT, HILFSLINIEN, BEMASSUNG, TEXT)."""
    import ezdxf
    doc = ezdxf.new("R2010")
    doc.units = ezdxf.units.MM
    for name, farbe in (("KONTUR", 7), ("FRONT", 1), ("HILFSLINIEN", 8), ("BEMASSUNG", 5), ("TEXT", 7)):
        doc.layers.add(name, color=farbe)
    msp = doc.modelspace()
    av = ansichten(erg, vorgaben)
    k = 10.0  # Bemaßung wie im Maßstab 1:10 gedruckt
    x = 0.0
    for name in ("front", "seite", "innen", "oben"):
        a = av[name]
        r = raender(a)
        oy = 0.0 if name != "oben" else (av["front"].box[3] - av["front"].box[1]) + (raender(av["front"])["oben"] + r["unten"] + 20) * k
        ox = x + r["links"] * k if name != "oben" else r["links"] * k
        for op in befehle(a, 1.0, ox, oy, koloriert=False, mit_massen=True, k=k):
            art, st = op[0], op[-1]
            if art == "rect":
                _, x0, y0, w, h, _ = op
                layer = "FRONT" if st["lw"] > 0.3 * k else "KONTUR"
                msp.add_lwpolyline([(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)], close=True, dxfattribs={"layer": layer})
            elif art == "line":
                _, x1, y1, x2, y2, _ = op
                msp.add_line((x1, y1), (x2, y2), dxfattribs={"layer": "BEMASSUNG"})
            elif art == "poly":
                msp.add_lwpolyline(op[1], dxfattribs={"layer": "HILFSLINIEN"})
            elif art == "text":
                _, tx, ty, txt, _ = op
                t = msp.add_text(txt, height=st["size"], dxfattribs={"layer": "BEMASSUNG", "rotation": 90 if st.get("rot") else 0})
                align = {"middle": "BOTTOM_CENTER", "start": "BOTTOM_LEFT", "end": "BOTTOM_RIGHT"}[st.get("anchor", "start")]
                t.set_placement((tx, ty), align=ezdxf.enums.TextEntityAlignment[align])
        msp.add_text(a.titel, height=4 * k, dxfattribs={"layer": "TEXT"}).set_placement(
            (ox, oy + (a.box[3] - a.box[1]) + (r["oben"] + 4) * k))
        if name != "oben":
            x += (a.box[2] - a.box[0]) + (r["links"] + r["rechts"] + 15) * k
    s = io.StringIO()
    doc.write(s)
    return s.getvalue().encode("utf-8")
