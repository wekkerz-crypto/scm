"""CNC-Export: je Bauteil eine DXF-Datei (Kontur, Nuten/Falze, Bohrungen) im ZIP.

Koordinaten je Teil: X = Länge (u), Y = Breite (v), Ursprung links unten.
Layernamen kommen aus der Vorgabenliste (Abschnitt „cnc“) und können Platzhalter
enthalten: {tiefe}, {breite}, {d}, {flaeche}. Bearbeitungen auf der Rückseite
(flaeche = minus) erhalten das Suffix „_RS“. So lässt sich die Layerkonvention
z. B. auf den DXF-Import von SCM Maestro abstimmen.
"""
from __future__ import annotations

import io
import re
import zipfile


def _layer(muster: str, **werte) -> str:
    try:
        name = muster.format(**{k: (f"{v:g}" if isinstance(v, float) else v) for k, v in werte.items()})
    except (KeyError, IndexError):
        name = muster
    return re.sub(r"[^A-Za-z0-9_\-.]", "_", name)


def dxf_fuer_teil(t: dict, cnc: dict) -> bytes:
    import ezdxf
    doc = ezdxf.new("R2010")
    doc.units = ezdxf.units.MM
    msp = doc.modelspace()
    L, B = t["laenge"], t["breite"]
    lk = _layer(cnc.get("layer_kontur", "KONTUR"), tiefe=float(t["staerke"]))
    doc.layers.add(lk)
    msp.add_lwpolyline([(0, 0), (L, 0), (L, B), (0, B)], close=True, dxfattribs={"layer": lk})
    for b in t.get("bearbeitungen", []):
        rs = "_RS" if b.get("flaeche") == "minus" else ""
        if b["art"] in ("nut", "falz"):
            ln = _layer(cnc.get("layer_nut", "NUT_T{tiefe}"), tiefe=float(b["tiefe"]), breite=float(b["breite"])) + rs
            if ln not in doc.layers:
                doc.layers.add(ln)
            msp.add_lwpolyline([(b["u0"], b["v0"]), (b["u1"], b["v0"]), (b["u1"], b["v1"]), (b["u0"], b["v1"])],
                               close=True, dxfattribs={"layer": ln})
        elif b["art"] in ("lochreihe", "topfbohrung"):
            if b["art"] == "lochreihe" and not cnc.get("mit_lochreihen", True):
                continue
            if b["art"] == "topfbohrung" and not cnc.get("mit_topfbohrungen", True):
                continue
            ln = _layer(cnc.get("layer_bohrung", "BOHRUNG_D{d}_T{tiefe}"), d=float(b["d"]), tiefe=float(b["tiefe"])) + rs
            if ln not in doc.layers:
                doc.layers.add(ln)
            msp.add_circle((b["u"], b["v"]), b["d"] / 2, dxfattribs={"layer": ln})
    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")


def export_zip(ergebnisse: list[dict], vorgaben: dict) -> bytes:
    cnc = vorgaben.get("cnc", {})
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        liste = ["Datei;Möbel;Nr;Bauteil;Material;Länge;Breite;Stärke;Menge"]
        for mi, erg in enumerate(ergebnisse, 1):
            for t in erg["bauteile"]:
                if t.get("kaufteil"):
                    continue
                roh = f"M{mi}_{t['nr']:02d}_{t['name']}"
                for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("Ä", "Ae"), ("Ö", "Oe"), ("Ü", "Ue"), ("ß", "ss")):
                    roh = roh.replace(a, b)
                name = re.sub(r"[^A-Za-z0-9_\-]+", "_", roh)
                z.writestr(f"{name}.dxf", dxf_fuer_teil(t, cnc))
                liste.append(f"{name}.dxf;{erg['bezeichnung']};{t['nr']};{t['name']};{t['material']};"
                             f"{t['laenge']:g};{t['breite']:g};{t['staerke']:g};{t['menge']}")
        z.writestr("teileliste.csv", "﻿" + "\n".join(liste))
    return buf.getvalue()
