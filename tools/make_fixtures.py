"""Erzeugt Test-STEP-Dateien für test/ mit CadQuery (pip install cadquery).

    python3 tools/make_fixtures.py
"""
import math
import os

import cadquery as cq

OUT = os.path.join(os.path.dirname(__file__), "..", "test", "fixtures")
os.makedirs(OUT, exist_ok=True)


def drill_top(body, x, y, d, depth, T):
    cyl = cq.Workplane("XY").workplane(offset=T - depth).center(x, y).circle(d / 2).extrude(depth + 1)
    return body.cut(cyl)


def seitenwand_32():
    """Nachbau von maestro/beispiele/32_Seitenwand_R.xcs."""
    L, W, T = 2305, 600, 19
    body = cq.Workplane("XY").box(L, W, T, centered=False)
    # Nut 8,8 breit, 5,6 tief von oben, Flanke bei Y=580
    body = body.cut(cq.Workplane("XY").box(L + 20, 8.8, 5.6, centered=False).translate((-10, 580, T - 5.6)))
    # Sockelausschnitt: Bogen durch (1575,0) und (585,0) mit Mittelpunkt (1080,-511), Ecken R200
    R = math.hypot(1575 - 1080, 511)
    arc = cq.Workplane("XY").center(1080, -511).circle(R).extrude(T)
    body = body.cut(arc)
    edges = body.edges("|Z").edges(cq.selectors.BoxSelector((500, -5, -1), (1700, 5, T + 1)))
    body = body.edges(cq.selectors.BoxSelector((500, -5, -1), (1700, 5, T + 1))).edges("|Z").fillet(200)
    holes = [
        (67, 37, 14, 5, (1, 2, 0, 32)),
        (401.6, 37, 14, 5, (1, 2, 0, 32)),
        (9.5, 25, 15, 8, (8, 1, 75.72, 0)),
        (488.1, 25, 15, 8, (8, 1, 75.72, 0)),
        (1677.68, 25, 15, 8, (8, 1, 75.72, 0)),
        (1811.59, 37, 13, 5, (2, 1, 32, 0)),
        (1811.59, 325, 13, 5, (2, 1, 32, 0)),
        (2054.59, 37, 13, 5, (2, 1, 32, 0)),
        (2054.59, 325, 13, 5, (2, 1, 32, 0)),
        (2234, 37, 13, 5, (2, 1, 32, 0)),
        (2234, 325, 13, 5, (2, 1, 32, 0)),
        (2295.5, 25, 15, 8, (8, 1, 75.72, 0)),
    ]
    for x, y, depth, d, (ny, nx, dy, dx) in holes:
        for i in range(ny):
            for j in range(nx):
                body = drill_top(body, x + j * dx, y + i * dy, d, depth, T)
    return body


def oberboden_27():
    """Nachbau von maestro/beispiele/27_Oberboden.xcs (horizontale Bohrungen)."""
    L, W, T = 612, 580, 19
    body = cq.Workplane("XY").box(L, W, T, centered=False)
    for i in range(8):
        y = 25 + i * 75.72
        for x0, sign in ((0, 1), (L, -1)):
            cyl = cq.Workplane("YZ").workplane(offset=x0 - (1 if sign > 0 else 27)).center(y, 9.5).circle(4).extrude(28)
            body = body.cut(cyl)
    return body


def testplatte():
    """Hochkant (B > L), Falz, Querrnut, Tasche, Durchbruch, Durchgangsbohrung, Bohrung von unten."""
    L, W, T = 400, 900, 18
    body = cq.Workplane("XY").box(L, W, T, centered=False)
    # Falz an der rechten Kante (X=L): 10 breit, 8 tief
    body = body.cut(cq.Workplane("XY").box(10, W + 20, 8, centered=False).translate((L - 10, -10, T - 8)))
    # Nut quer (entlang X) bei Y=100..108, 6 tief
    body = body.cut(cq.Workplane("XY").box(L + 20, 8, 6, centered=False).translate((-10, 100, T - 6)))
    # Tasche 80×60, 5 tief
    body = body.cut(cq.Workplane("XY").box(80, 60, 5, centered=False).translate((100, 300, T - 5)))
    # Durchbruch 120×80 mit Radien 10
    cut = cq.Workplane("XY").center(200, 600).rect(120, 80).extrude(T).edges("|Z").fillet(10)
    body = body.cut(cut)
    # Topfband Ø35 13 tief, Durchgang Ø7
    body = drill_top(body, 22.5, 200, 35, 13, T)
    body = body.cut(cq.Workplane("XY").center(300, 800).circle(3.5).extrude(T))
    # Bohrung von unten Ø8 10 tief
    body = body.cut(cq.Workplane("XY").center(50, 850).circle(4).extrude(10))
    return body


def fuenfachs():
    """5-Achs-Merkmale: Fase oben/unten, Gehrung, Tasche mit Insel und Bohrung, schräge Bohrung."""
    L, W, T = 600, 400, 19
    body = cq.Workplane("XY").box(L, W, T, centered=False)
    # Fase 3×3 oben an der Vorderkante (Y=0)
    body = body.edges(cq.selectors.BoxSelector((-1, -1, T - 1), (L + 1, 1, T + 1))).chamfer(3)
    # Fase 2×2 unten an der Hinterkante (Y=W)
    body = body.edges(cq.selectors.BoxSelector((-1, W - 1, -1), (L + 1, W + 1, 1))).chamfer(2)
    # Gehrung an der rechten Kante: oben 30° nach innen (unten bleibt X=L)
    off = T * math.tan(math.radians(30))
    wedge = (cq.Workplane("XZ").polyline([(L - off, T), (L + 1, T), (L + 1, -1), (L, -1), (L, 0)]).close()
             .extrude(-(W + 2)).translate((0, -1, 0)))
    body = body.cut(wedge)
    # Tasche 120×80, 8 tief, Ecken R10, mit runder Insel Ø30 und Bohrung Ø8 (5 tief ab Taschenboden)
    pocket = cq.Workplane("XY").workplane(offset=T - 8).center(150, 200).rect(120, 80).extrude(9).edges("|Z").fillet(10)
    island = cq.Workplane("XY").workplane(offset=T - 8).center(130, 200).circle(15).extrude(9)
    body = body.cut(pocket.cut(island))
    body = body.cut(cq.Workplane("XY").workplane(offset=T - 13).center(185, 200).circle(4).extrude(6))
    # Schräge Bohrung Ø8, 30° aus der Senkrechten in Richtung +X geneigt, Eintritt (350, 250, T), Tiefe 15
    ang = math.radians(30)
    d = cq.Vector(math.sin(ang), 0, -math.cos(ang))
    pl = cq.Plane(origin=(350, 250, T), xDir=(0, 1, 0), normal=(d.x, d.y, d.z))
    body = body.cut(cq.Workplane(pl).circle(4).extrude(15).union(cq.Workplane(pl).circle(4).extrude(-5)))
    return body


def sonderkontur():
    """Sonderkontur: runder Ausschnitt an der Vorderkante, Eckradien, umlaufende Fase 3×3 oben, Bohrungen."""
    L, W, T = 800, 450, 19
    body = cq.Workplane("XY").box(L, W, T, centered=False)
    body = body.cut(cq.Workplane("XY").center(400, -40).circle(140).extrude(T))   # runder Ausschnitt vorne
    body = body.edges("|Z").edges(cq.selectors.BoxSelector((-1, -1, -1), (L + 1, W + 1, T + 1))).edges(
        cq.selectors.BoxSelector((L - 1, -1, -1), (L + 1, W + 1, T + 1))).fillet(40)  # rechte Ecken R40
    body = body.faces(">Z").edges().chamfer(3)                                     # Fase oben rundum
    for x in (60, 740):
        body = drill_top(body, x, 380, 8, 12, T)
    return body


def seite4():
    """Nachbau des Teils aus dem Screenshot: runder Ausschnitt an der Hinterkante, Fase 10×10 nur entlang der
    Hinterkante (gerade – Bogen – gerade), zwei Rundtaschen 5 tief, ein Rundloch."""
    L, W, T = 800, 400, 19
    body = cq.Workplane("XY").box(L, W, T, centered=False)
    body = body.cut(cq.Workplane("XY").center(350, 470).circle(220).extrude(T))
    back = cq.selectors.BoxSelector((-1, 200, T - 1), (L + 1, W + 1, T + 1))
    body = body.edges(back).chamfer(10)
    body = body.cut(cq.Workplane("XY").workplane(offset=T - 5).center(530, 160).circle(131.71 / 2).extrude(6))
    body = body.cut(cq.Workplane("XY").workplane(offset=T - 5).center(165, 115).circle(60.827 / 2).extrude(6))
    body = body.cut(cq.Workplane("XY").center(325, 165).circle(112.841 / 2).extrude(T))
    return body


if __name__ == "__main__":
    for name, fn in [("seitenwand_32", seitenwand_32), ("oberboden_27", oberboden_27), ("testplatte", testplatte),
                     ("fuenfachs", fuenfachs), ("sonderkontur", sonderkontur), ("seite4", seite4)]:
        path = os.path.join(OUT, name + ".step")
        cq.exporters.export(fn(), path)
        print("geschrieben:", path)
