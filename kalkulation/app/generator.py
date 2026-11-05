"""Parametrischer Möbelgenerator: Datenmodell (Moebel) → Bauteile.

Deterministisch: gleiche Eingaben ergeben immer dieselben Bauteile mit
denselben Schlüsseln. Die Bauteile sind achsparallele Plattenkörper mit
Metadaten (Name, Material, Stärke, Kanten, Faserrichtung, Bearbeitungen,
Bewegung). Daraus entstehen 3D-Ansicht, Zeichnungen, Stückliste, Zuschnitt,
Kalkulation, STEP und CNC.

Konstruktionsstandard: Innenkorpus, sichtbare Außenseiten mit Sichtseiten
aufgedoppelt, oben Abdeckplatte, in Nischen bündige Passblenden; Sockel auf
Kunststoff-Sockelfüßen (Ecken + unter Mittelwänden) mit Sockelblende;
Universalschubkästen (Zarge 16 mm, Boden 8 mm eingenutet, Nennlänge im 50-mm-Raster).

Koordinaten: x = Breite (0 = linke Außenkante Möbel ohne Passblende),
y = Tiefe (0 = Vorderkante Korpus, Fronten bei y < 0), z = Höhe (0 = Fußboden). mm.
"""
from __future__ import annotations

import math
from collections import Counter

from .modell import Moebel

ACHSE = {"x": 0, "y": 1, "z": 2}

# Baureihenfolge (Fertigung/Montage)
REIHENFOLGE = {
    "seite": 10, "unterboden": 20, "oberboden": 30, "mittelwand": 40, "zwischenboden": 50,
    "rueckwand": 60, "sichtseite": 64, "abdeckplatte": 66, "passblende": 68, "passblendenleiste": 69,
    "sockelblende": 70, "fachboden": 80,
    "sk_seite": 85, "sk_vorderstueck": 86, "sk_hinterstueck": 87, "sk_boden": 88,
    "tuer": 90, "klappe": 92, "schubkastenfront": 94,
}

GRUPPEN = ["Korpus", "Rückwand", "Aufdoppelung", "Sockel", "Einlegeböden", "Schubkästen", "Fronten"]


def _r(v: float) -> float:
    return round(float(v), 2)


class _Bau:
    def __init__(self, m: Moebel, regeln: dict, vorgaben: dict):
        self.m = m
        self.R = regeln
        self.V = vorgaben
        self.platten = {p["id"]: p for p in vorgaben.get("platten", [])}
        self.kanten = {k["id"]: k for k in vorgaben.get("kanten", [])}
        self.teile: list[dict] = []
        self.beschlaege: list[dict] = []
        self.koerper: list[dict] = []     # Kaufteile nur zur Darstellung (Sockelfüße, Griffe)
        self.warnungen: list[str] = []
        self.info: dict = {}
        self._seq = 0
        self._sk_nr = 0

    # ---------------------------------------------------------------- helpers
    def material(self, feld: str, regel_feld: str | None = None) -> str:
        wert = getattr(self.m, feld, None) or self.R.get(regel_feld or feld)
        if wert not in self.platten:
            self.warnungen.append(f"Material '{wert}' ({feld}) ist nicht in der Vorgabenliste.")
        return wert

    def staerke(self, material_id: str, regel_feld: str) -> float:
        p = self.platten.get(material_id)
        if p and p.get("staerke"):
            return float(p["staerke"])
        return float(self.R.get(regel_feld, 19))

    def regel(self, feld: str):
        wert = getattr(self.m, feld, None)
        return wert if wert is not None else self.R.get(feld)

    def kanten_nach_regel(self, regel: str, kante_id: str) -> dict:
        art = self.R.get(regel, "keine")
        if art == "vorne":
            return {"L1": kante_id}
        if art == "rundum":
            return {"L1": kante_id, "L2": kante_id, "B1": kante_id, "B2": kante_id}
        return {}

    def teil(self, key, name, gruppe, rolle, material, box, faser, dicke, kanten=None, **extra):
        x0, y0, z0, x1, y1, z1 = box
        pos = [x0, y0, z0]
        dim = [x1 - x0, y1 - y0, z1 - z0]
        if min(dim) <= 0:
            self.warnungen.append(f"{name}: ungültige Abmessungen {[_r(d) for d in dim]} – Maße prüfen.")
            return None
        breite_achse = ({"x", "y", "z"} - {faser, dicke}).pop()
        self._seq += 1
        t = {
            "key": key, "name": name, "gruppe": gruppe, "rolle": rolle, "material": material,
            "pos": [_r(v) for v in pos], "dim": [_r(v) for v in dim],
            "achsen": {"l": faser, "b": breite_achse, "d": dicke},
            "laenge": _r(dim[ACHSE[faser]]), "breite": _r(dim[ACHSE[breite_achse]]), "staerke": _r(dim[ACHSE[dicke]]),
            "kanten": {s: k for s, k in (kanten or {}).items() if k},
            "bearbeitungen": [],
            "aussparungen": [],  # Weltkoordinaten-Quader, die vom Körper abgezogen werden (STEP)
            "reihenfolge": REIHENFOLGE.get(rolle, 99) * 1000 + self._seq,
            "menge": self.m.anzahl,
        }
        t.update(extra)
        self.teile.append(t)
        return t

    def lokal(self, t: dict, welt: list[float]) -> tuple[float, float]:
        """Weltpunkt → lokale Bauteilkoordinaten (u entlang Länge, v entlang Breite)."""
        a, b = ACHSE[t["achsen"]["l"]], ACHSE[t["achsen"]["b"]]
        return _r(welt[a] - t["pos"][a]), _r(welt[b] - t["pos"][b])

    def flaeche(self, t: dict, welt_wert: float) -> str:
        d = ACHSE[t["achsen"]["d"]]
        mitte = t["pos"][d] + t["dim"][d] / 2
        return "plus" if welt_wert > mitte else "minus"

    def nut(self, t: dict | None, box: list[float], art: str = "nut"):
        """Nut/Falz als Quader in Weltkoordinaten; wird auf das Bauteil begrenzt."""
        if t is None:
            return
        p, d = t["pos"], t["dim"]
        bx = [max(box[i], p[i]) for i in range(3)] + [min(box[i + 3], p[i] + d[i]) for i in range(3)]
        if any(bx[i + 3] - bx[i] <= 0.01 for i in range(3)):
            return
        t["aussparungen"].append([_r(v) for v in bx])
        di = ACHSE[t["achsen"]["d"]]
        u0, v0 = self.lokal(t, bx[:3])
        u1, v1 = self.lokal(t, bx[3:])
        seite = self.flaeche(t, bx[di + 3] if abs(bx[di + 3] - (p[di] + d[di])) < 0.01 else bx[di])
        t["bearbeitungen"].append({"art": art, "u0": u0, "v0": v0, "u1": u1, "v1": v1,
                                   "tiefe": _r(bx[di + 3] - bx[di]), "breite": _r(min(u1 - u0, v1 - v0)), "flaeche": seite})

    def bohrung(self, t: dict | None, welt: list[float], durchmesser: float, tiefe: float, seite: str, art: str):
        if t is None:
            return
        u, v = self.lokal(t, welt)
        if not (0 <= u <= t["laenge"] and 0 <= v <= t["breite"]):
            return
        t["bearbeitungen"].append({"art": art, "u": u, "v": v, "d": durchmesser, "tiefe": tiefe, "flaeche": seite})

    def beschlag(self, rolle: str, menge: float, bezug: str):
        if menge > 0:
            self.beschlaege.append({"rolle": rolle, "menge": menge * self.m.anzahl, "bezug": bezug})

    @staticmethod
    def aufteilen(gesamt: float, vorgaben: list[float | None], trenner: float) -> tuple[list[float], bool]:
        """Teilt ein Lichtmaß auf n Felder auf (mit n-1 Trennern dazwischen)."""
        n = len(vorgaben)
        verfuegbar = gesamt - (n - 1) * trenner
        fest = sum(v for v in vorgaben if v)
        auto = [v for v in vorgaben if not v]
        if auto:
            rest = (verfuegbar - fest) / len(auto)
            return [v if v else rest for v in vorgaben], rest > 0
        if abs(fest - verfuegbar) > 0.5 and fest > 0:
            faktor = verfuegbar / fest
            return [v * faktor for v in vorgaben], False
        return list(vorgaben), True

    # ---------------------------------------------------------------- aufbau
    def bauen(self):
        m, R = self.m, self.R
        lr = R.get
        B, H, T = m.breite, m.hoehe, m.tiefe

        mat_k = self.material("material_korpus")
        mat_rw = self.material("material_rueckwand")
        mat_f = self.material("material_front")
        mat_fb = self.material("material_fachboden")
        mat_s = lr("material_sockel") or mat_k
        mat_sicht = m.material_sichtseite or lr("material_sichtseite") or mat_f
        s = self.staerke(mat_k, "staerke_korpus")
        sf = self.staerke(mat_f, "staerke_front")
        sfb = self.staerke(mat_fb, "staerke_fachboden")
        ss = self.staerke(mat_s, "staerke_sockel")
        s_sicht = self.staerke(mat_sicht, "staerke_front")

        k_korpus, k_front, k_fb, k_sockel = lr("kante_korpus"), lr("kante_front"), lr("kante_fachboden"), lr("kante_sockel")
        k_sicht = lr("kante_sichtseite") or k_front

        sockel_art = self.regel("sockel_art")
        sh = float(self.regel("sockel_hoehe") or 0) if sockel_art != "keiner" else 0.0
        rw_art = self.regel("rueckwand_art")
        sr = self.staerke(mat_rw, "staerke_rueckwand") if rw_art != "keine" else 0.0
        n = float(lr("rueckwand_nuttiefe", 8))
        a = float(lr("rueckwand_abstand_hinten", 10))
        luft = float(lr("rueckwand_luft", 1))
        bauweise = self.regel("bauweise")
        aufschlag = self.regel("front_aufschlag")
        fuge = float(lr("front_fuge", 3))

        # ---- Abschlüsse (Aufdoppelung / Passblende) und Abdeckplatte
        abschluss = {
            "links": m.abschluss_links or lr("abschluss_seiten", "sichtseite"),
            "rechts": m.abschluss_rechts or lr("abschluss_seiten", "sichtseite"),
        }
        abdeck = m.abdeckplatte if m.abdeckplatte is not None else bool(lr("abdeckplatte_oben", True))
        sa = self.staerke(mat_sicht, "staerke_front") if abdeck else 0.0
        xl = s_sicht if abschluss["links"] == "sichtseite" else 0.0
        xr = s_sicht if abschluss["rechts"] == "sichtseite" else 0.0
        Bk = B - xl - xr                      # Korpusbreite
        z_unten, z_oben = sh, H - sa          # Korpus unten/oben
        y_front = -sf if aufschlag == "aufliegend" else 0.0   # Frontebene (vorderste Fläche)
        self.info = {"korpusbreite": _r(Bk), "tiefe": _r(T), "hoehe": _r(H),
                     "z_korpus": [_r(z_unten), _r(z_oben)], "korpushoehe": _r(z_oben - z_unten), "sockelhoehe": _r(sh),
                     "abschluss": abschluss, "abdeckplatte": abdeck, "frontebene": _r(y_front),
                     "x_korpus": [_r(xl), _r(B - xr)], "aufschlag": aufschlag, "fuge": fuge}

        if z_oben - z_unten < 2 * s + 20:
            self.warnungen.append("Höhe zu gering für Korpus mit Sockel und Abdeckplatte.")
        if Bk < 2 * s + 20:
            self.warnungen.append("Breite zu gering für Korpus mit Sichtseiten.")

        # Plattentiefen
        Tk = T - sr if rw_art == "aufgesetzt" else T
        if rw_art == "genutet":
            Ti = T - a - sr
        elif rw_art in ("gefaelzt", "aufgesetzt"):
            Ti = T - sr
        else:
            Ti = T
        yf = sf if aufschlag == "eingelegt" else 0.0
        kk = self.kanten_nach_regel("kanten_korpus", k_korpus)
        X0, X1 = xl, B - xr  # Korpus-Außenkanten

        # ---- Korpus
        if bauweise == "boeden_durchgehend":
            sl = (X0, 0, z_unten + s, X0 + s, Tk, z_oben - s)
            sr_ = (X1 - s, 0, z_unten + s, X1, Tk, z_oben - s)
            ub = (X0, 0, z_unten, X1, Tk, z_unten + s)
            ob = (X0, 0, z_oben - s, X1, Tk, z_oben)
        elif bauweise == "oberboden_aufliegend":
            sl = (X0, 0, z_unten, X0 + s, Tk, z_oben - s)
            sr_ = (X1 - s, 0, z_unten, X1, Tk, z_oben - s)
            ub = (X0 + s, 0, z_unten, X1 - s, Tk, z_unten + s)
            ob = (X0, 0, z_oben - s, X1, Tk, z_oben)
        else:
            sl = (X0, 0, z_unten, X0 + s, Tk, z_oben)
            sr_ = (X1 - s, 0, z_unten, X1, Tk, z_oben)
            ub = (X0 + s, 0, z_unten, X1 - s, Tk, z_unten + s)
            ob = (X0 + s, 0, z_oben - s, X1 - s, Tk, z_oben)

        t_sl = self.teil("seite_links", "Seitenwand links", "Korpus", "seite", mat_k, sl, "z", "x", kk)
        t_sr = self.teil("seite_rechts", "Seitenwand rechts", "Korpus", "seite", mat_k, sr_, "z", "x", kk)
        t_ub = self.teil("unterboden", "Unterboden", "Korpus", "unterboden", mat_k, ub, "x", "z", kk)
        t_ob = self.teil("oberboden", "Oberboden", "Korpus", "oberboden", mat_k, ob, "x", "z", kk)

        xi0, xi1 = X0 + s, X1 - s
        zi0, zi1 = z_unten + s, z_oben - s

        # ---- Rückwand
        if rw_art in ("genutet", "gefaelzt"):
            ry0, ry1 = (T - a - sr, T - a) if rw_art == "genutet" else (T - sr, T)
            rw = (xi0 - n + luft, ry0, zi0 - n + luft, xi1 + n - luft, ry1, zi1 + n - luft)
            self.teil("rueckwand", "Rückwand", "Rückwand", "rueckwand", mat_rw, rw, "z", "y")
            art = "nut" if rw_art == "genutet" else "falz"
            zlim = (zi0 - n, zi1 + n) if rw_art == "genutet" else (-1e6, 1e6)
            xlim = (xi0 - n, xi1 + n) if rw_art == "genutet" else (-1e6, 1e6)
            self.nut(t_sl, [xi0 - n, ry0, zlim[0], xi0, ry1, zlim[1]], art)
            self.nut(t_sr, [xi1, ry0, zlim[0], xi1 + n, ry1, zlim[1]], art)
            self.nut(t_ub, [xlim[0], ry0, zi0 - n, xlim[1], ry1, zi0], art)
            self.nut(t_ob, [xlim[0], ry0, zi1, xlim[1], ry1, zi1 + n], art)
        elif rw_art == "aufgesetzt":
            self.teil("rueckwand", "Rückwand", "Rückwand", "rueckwand", mat_rw, (X0, T - sr, z_unten, X1, T, z_oben), "z", "y")

        # ---- Aufdoppelung: Sichtseiten, Abdeckplatte, Passblenden
        bis_boden = bool(lr("sichtseite_bis_boden", True))
        zs0 = 0.0 if bis_boden else z_unten
        ks = {"L1": k_sicht} if lr("kanten_sichtseite", "vorne") != "keine" else {}
        if abschluss["links"] == "sichtseite":
            self.teil("sichtseite_links", "Sichtseite links", "Aufdoppelung", "sichtseite", mat_sicht,
                      (0, y_front, zs0, xl, T, z_oben), "z", "x", ks)
        if abschluss["rechts"] == "sichtseite":
            self.teil("sichtseite_rechts", "Sichtseite rechts", "Aufdoppelung", "sichtseite", mat_sicht,
                      (B - xr, y_front, zs0, B, T, z_oben), "z", "x", ks)
        if abdeck:
            self.teil("abdeckplatte", "Abdeckplatte", "Aufdoppelung", "abdeckplatte", mat_sicht,
                      (0, y_front, z_oben, B, T, H), "x", "z", {"L1": k_sicht, "B1": k_sicht, "B2": k_sicht})
        leiste_t = float(lr("passblendenleiste_tiefe", 60))
        for seite, breite_pb, x_a, x_b in (("links", m.passblende_links, None, 0.0), ("rechts", m.passblende_rechts, B, None)):
            if abschluss[seite] != "passblende":
                continue
            pb = float(breite_pb or lr("passblende_breite", 30))
            x0, x1 = (-pb, 0.0) if seite == "links" else (B, B + pb)
            pz0 = 0.0 if bis_boden else z_unten
            self.teil(f"passblende_{seite}", f"Passblende {seite}", "Aufdoppelung", "passblende", mat_f,
                      (x0, y_front, pz0, x1, y_front + sf, H), "z", "y", {"L1": k_front, "L2": k_front, "B2": k_front})
            if leiste_t > 0:
                self.teil(f"passblendenleiste_{seite}", f"Passblendenleiste {seite}", "Aufdoppelung", "passblendenleiste",
                          mat_k, (x0, y_front + sf, z_unten, x1, y_front + sf + leiste_t, z_oben), "z", "x")
        self.info["x_gesamt"] = [_r(min([0.0] + [t["pos"][0] for t in self.teile])),
                                 _r(max([B] + [t["pos"][0] + t["dim"][0] for t in self.teile]))]

        # ---- Sockel: Blende + Kunststoff-Sockelfüße an den Ecken und unter Mittelwänden
        if sockel_art == "blende" and sh > 0:
            rv = float(lr("sockelblende_rueckversatz", 40))
            self.teil("sockelblende", "Sockelblende", "Sockel", "sockelblende", mat_s,
                      (X0, rv, 0, X1, rv + ss, sh), "x", "y", self.kanten_nach_regel("kanten_sockel", k_sockel))

        # ---- Spalten / Mittelwände
        spalten = m.spalten or []
        breiten, ok = self.aufteilen(xi1 - xi0, [sp.breite for sp in spalten], s)
        if not ok:
            self.warnungen.append("Spaltenbreiten passen nicht zur Korpusbreite – wurden angepasst.")
        x = xi0
        spalt_x = []
        mittel_x = []
        for i, bw in enumerate(breiten):
            spalt_x.append((x, x + bw))
            x += bw
            if i < len(breiten) - 1:
                self.teil(f"mittelwand_{i + 1}", "Mittelwand", "Korpus", "mittelwand", mat_k,
                          (x, 0, zi0, x + s, Ti, zi1), "z", "x", kk)
                mittel_x.append(x + s / 2)
                x += s
        mittelwaende = {t["key"]: t for t in self.teile if t["rolle"] == "mittelwand"}

        if sockel_art in ("blende", "fuesse") and sh > 0:
            ab_s = float(lr("sockelfuss_abstand_seite", 50))
            ab_v = float(lr("sockelfuss_abstand_vorne", 80))
            ab_h = float(lr("sockelfuss_abstand_hinten", 60))
            xs = [X0 + ab_s] + mittel_x + [X1 - ab_s]
            ys = [ab_v, T - ab_h]
            for fx in xs:
                for fy in ys:
                    self.koerper.append({"typ": "sockelfuss", "x": _r(fx), "y": _r(fy), "z0": 0, "hoehe": _r(sh)})
            self.beschlag("sockelfuss", len(xs) * len(ys), "Sockel")

        def wand_links(ci):
            return t_sl if ci == 0 else mittelwaende.get(f"mittelwand_{ci}")

        def wand_rechts(ci):
            return t_sr if ci == len(spalten) - 1 else mittelwaende.get(f"mittelwand_{ci + 1}")

        glas_mat = next((p["id"] for p in self.platten.values() if p.get("glas")), mat_f)
        sk_universal = lr("schubkasten_bauart", "universal") == "universal"

        for ci, (sp, (cx0, cx1)) in enumerate(zip(spalten, spalt_x)):
            bereiche = sp.bereiche or []
            hoehen, ok = self.aufteilen(zi1 - zi0, [b.hoehe for b in bereiche], s)
            if not ok:
                self.warnungen.append(f"Spalte {ci + 1}: Fachhöhen passen nicht zur Korpushöhe – angepasst.")
            z = zi0
            ber_z = []
            for bi, hh in enumerate(hoehen):
                ber_z.append((z, z + hh))
                z += hh
                if bi < len(hoehen) - 1:
                    self.teil(f"zwischenboden_s{ci + 1}_{bi + 1}", "Zwischenboden", "Korpus", "zwischenboden",
                              mat_k, (cx0, 0, z, cx1, Ti, z + s), "x", "z", kk)
                    z += s

            self.info.setdefault("spalten", []).append(
                {"x": [_r(cx0), _r(cx1)], "bereiche": [[_r(a), _r(b)] for a, b in ber_z]})
            for bi, (ber, (bz0, bz1)) in enumerate(zip(bereiche, ber_z)):
                tag = f"s{ci + 1}_b{bi + 1}"
                # Einlegeböden
                fl = float(lr("fachboden_luft", 1))
                rv = float(lr("fachboden_rueckversatz_vorne", 10))
                ah = float(lr("fachboden_abstand_hinten", 5))
                nfb = ber.fachboeden if ber.front != "schubkasten" else 0
                frei = (bz1 - bz0) - nfb * sfb
                for k in range(nfb):
                    zb = bz0 + (k + 1) * frei / (nfb + 1) + k * sfb
                    self.teil(f"fachboden_{tag}_{k + 1}", "Fachboden", "Einlegeböden", "fachboden", mat_fb,
                              (cx0 + fl, yf + rv, zb, cx1 - fl, Ti - ah, zb + sfb), "x", "z",
                              self.kanten_nach_regel("kanten_fachboden", k_fb))
                    d, tf, ras = float(lr("lochreihe_durchmesser", 5)), float(lr("lochreihe_tiefe", 12)), float(lr("lochreihe_raster", 32))
                    ys = [yf + float(lr("lochreihe_abstand_vorne", 37)), Ti - float(lr("lochreihe_abstand_hinten", 37))]
                    zc = zb - d
                    for wand, xw in ((wand_links(ci), cx0), (wand_rechts(ci), cx1)):
                        if wand is None:
                            continue
                        seite = self.flaeche(wand, xw)
                        for yy in ys:
                            for dz in (-ras, 0, ras):
                                self.bohrung(wand, [xw, yy, zc + dz], d, tf, seite, "lochreihe")
                if nfb:
                    self.beschlag("fachbodentraeger", nfb * int(lr("fachbodentraeger_je_boden", 4)), "Einlegeböden")

                # Fronten
                if ber.front == "offen":
                    continue
                if aufschlag == "eingelegt":
                    fx0, fx1, fz0, fz1 = cx0 + fuge, cx1 - fuge, bz0 + fuge, bz1 - fuge
                    fy0, fy1 = 0.0, sf
                else:
                    fx0 = X0 if ci == 0 else cx0 - s / 2
                    fx1 = X1 if ci == len(spalten) - 1 else cx1 + s / 2
                    fz0 = z_unten if bi == 0 else bz0 - s / 2
                    fz1 = z_oben if bi == len(bereiche) - 1 else bz1 + s / 2
                    fx0, fx1, fz0, fz1 = fx0 + fuge / 2, fx1 - fuge / 2, fz0 + fuge / 2, fz1 - fuge / 2
                    fy0, fy1 = -sf, 0.0
                fmat = glas_mat if ber.glas else mat_f
                fk = {} if ber.glas else self.kanten_nach_regel("kanten_front", k_front)
                innen_y = fy1
                griff = ber.griff and lr("griff_je_front", True)

                def tuer(key, name, bx, anschlag):
                    hoehe = bx[5] - bx[2]
                    xk = bx[0] if anschlag == "links" else bx[3]
                    t = self.teil(key, name, "Fronten", "tuer", fmat, bx, "z", "y", fk, anschlag=anschlag,
                                  kaufteil=bool(ber.glas),
                                  bewegung={"typ": "tuer", "anschlag": anschlag, "drehpunkt": [_r(xk), _r(bx[4])]})
                    if t is None:
                        return
                    anz = next((int(nz) for grenze, nz in lr("scharniere_staffel", [[99999, 2]]) if hoehe <= grenze), 2)
                    self.beschlag("scharnier", anz, name)
                    if griff:
                        self.griff(t, "senkrecht", "rechts" if anschlag == "links" else "links")
                    if not ber.glas and lr("topfbohrung_durchmesser"):
                        ende = float(lr("topfbohrung_abstand_ende", 100))
                        kante = float(lr("topfbohrung_abstand_kante", 22.5))
                        xb = bx[0] + kante if anschlag == "links" else bx[3] - kante
                        for i in range(anz):
                            zz = bx[2] + ende + i * (hoehe - 2 * ende) / max(1, anz - 1)
                            self.bohrung(t, [xb, innen_y, zz], float(lr("topfbohrung_durchmesser")),
                                         float(lr("topfbohrung_tiefe", 13)), self.flaeche(t, innen_y), "topfbohrung")

                if ber.front == "tuer":
                    tuer(f"front_{tag}", f"Tür {ber.anschlag}", (fx0, fy0, fz0, fx1, fy1, fz1), ber.anschlag)
                elif ber.front == "doppeltuer":
                    xm = (fx0 + fx1) / 2
                    tuer(f"front_{tag}_l", "Tür links", (fx0, fy0, fz0, xm - fuge / 2, fy1, fz1), "links")
                    tuer(f"front_{tag}_r", "Tür rechts", (xm + fuge / 2, fy0, fz0, fx1, fy1, fz1), "rechts")
                elif ber.front == "klappe":
                    t = self.teil(f"front_{tag}", "Klappe", "Fronten", "klappe", fmat, (fx0, fy0, fz0, fx1, fy1, fz1),
                                  "x", "y", fk, kaufteil=bool(ber.glas),
                                  bewegung={"typ": "klappe", "drehpunkt": [_r(fy1), _r(fz1)]})
                    self.beschlag("klappenbeschlag", 1, "Klappe")
                    if griff and t:
                        self.griff(t, "waagerecht", "unten")
                elif ber.front == "schubkasten":
                    k = ber.schubkasten_anzahl
                    fh = (fz1 - fz0 - (k - 1) * fuge) / k
                    for j in range(k):
                        z0 = fz0 + j * (fh + fuge)
                        self._sk_nr += 1
                        nr = self._sk_nr
                        sk_id = f"sk{nr}"
                        weg = self.schubkasten(nr, sk_id, cx0, cx1, yf, Ti, max(z0, bz0), min(z0 + fh, bz1), fh) \
                            if sk_universal else 0.8 * (Ti - yf)
                        t = self.teil(f"front_{tag}_{j + 1}", f"Schubkastenfront {nr}" if sk_universal else "Schubkastenfront",
                                      "Fronten", "schubkastenfront", fmat, (fx0, fy0, z0, fx1, fy1, z0 + fh), "x", "y", fk,
                                      kaufteil=bool(ber.glas), name_fest=sk_universal,
                                      bewegung={"typ": "schubkasten", "id": sk_id, "weg": _r(weg)})
                        if t is None:
                            continue
                        if not sk_universal:
                            if fh <= float(lr("schubkasten_klein_bis", 120)):
                                groesse = "klein"
                            elif fh <= float(lr("schubkasten_mittel_bis", 220)):
                                groesse = "mittel"
                            else:
                                groesse = "gross"
                            t["schubkasten"] = groesse
                            self.beschlag(f"schubkasten_{groesse}", 1, "Schubkasten")
                        if griff:
                            self.griff(t, "waagerecht", "mitte")

    def schubkasten(self, nr, sk_id, cx0, cx1, yf, Ti, oz0, oz1, fh) -> float:
        """Universalschubkasten: Seiten durchgehend, Vorder-/Hinterstück zwischen den Seiten
        auf dem Boden, Boden 8 mm in Nut der Seiten. Nennlänge im 50-mm-Raster."""
        lr = self.R.get
        mat = lr("schubkasten_material") or lr("material_korpus")
        mat_b = lr("schubkasten_boden_material") or lr("material_rueckwand")
        z = self.staerke(mat, "schubkasten_staerke") if mat in self.platten else float(lr("schubkasten_staerke", 16))
        zb = self.staerke(mat_b, "schubkasten_boden_staerke") if mat_b in self.platten else 8.0
        luft = float(lr("schubkasten_seitenluft", 13))
        raster = float(lr("schubkasten_nl_raster", 50))
        nl_max = Ti - yf - float(lr("schubkasten_tiefenabzug", 10))
        nl = math.floor(nl_max / raster) * raster
        nl_min = float(lr("schubkasten_nl_min", 250))
        if nl < nl_min:
            self.warnungen.append(f"Schubkasten {nr}: Korpus zu flach für Nennlänge {nl_min:g} mm.")
            nl = max(raster, nl)
        unten = float(lr("schubkasten_luft_unten", 15))
        oben = float(lr("schubkasten_luft_oben", 25))
        hz = min(fh - float(lr("schubkasten_hoehe_abzug", 40)), (oz1 - oz0) - unten - oben)
        hz = max(hz, 50.0)
        na = float(lr("schubkasten_nut_abstand", 10))
        nt = float(lr("schubkasten_nuttiefe", 8))
        x0, x1 = cx0 + luft, cx1 - luft
        y0, y1 = yf + 2, yf + 2 + nl
        z0 = oz0 + unten
        kz = lr("kante_korpus")
        ko = {"L2": kz} if lr("schubkasten_kanten_oben", True) else {}
        bew = {"typ": "schubkasten", "id": sk_id}
        g = "Schubkästen"
        sl = self.teil(f"{sk_id}_seite_l", f"SK{nr} Seite links", g, "sk_seite", mat, (x0, y0, z0, x0 + z, y1, z0 + hz), "y", "x",
                       ko, bewegung=bew, name_fest=True)
        sr = self.teil(f"{sk_id}_seite_r", f"SK{nr} Seite rechts", g, "sk_seite", mat, (x1 - z, y0, z0, x1, y1, z0 + hz), "y", "x",
                       ko, bewegung=bew, name_fest=True)
        zs = z0 + na + zb  # Oberkante Boden: Vorder-/Hinterstück stehen darauf
        self.teil(f"{sk_id}_vorder", f"SK{nr} Vorderstück", g, "sk_vorderstueck", mat, (x0 + z, y0, zs, x1 - z, y0 + z, z0 + hz),
                  "x", "y", ko, bewegung=bew, name_fest=True)
        self.teil(f"{sk_id}_hinter", f"SK{nr} Hinterstück", g, "sk_hinterstueck", mat, (x0 + z, y1 - z, zs, x1 - z, y1, z0 + hz),
                  "x", "y", ko, bewegung=bew, name_fest=True)
        bl = float(lr("schubkasten_boden_luft", 1))
        self.teil(f"{sk_id}_boden", f"SK{nr} Boden", g, "sk_boden", mat_b,
                  (x0 + z - nt + bl, y0, z0 + na, x1 - z + nt - bl, y1, z0 + na + zb), "y", "z", bewegung=bew, name_fest=True)
        # Baureihenfolge: Schubkasten für Schubkasten komplett
        for i, t in enumerate(t for t in self.teile if t.get("bewegung", {}).get("id") == sk_id and t["gruppe"] == g):
            t["reihenfolge"] = REIHENFOLGE["sk_seite"] * 1000 + nr * 10 + i
        for seite, xa, xb in ((sl, x0 + z - nt, x0 + z), (sr, x1 - z, x1 - z + nt)):
            self.nut(seite, [xa, y0, z0 + na, xb, y1, z0 + na + zb])
        self.beschlag("schubkastenfuehrung", 1, f"SK{nr} NL {nl:g}")
        return nl * float(lr("schubkasten_auszug_anteil", 0.9))

    def griff(self, front: dict, richtung: str, lage: str):
        """Bügelgriff als Darstellungskörper (Kaufteil), bewegt sich mit der Front."""
        lr = self.R.get
        L = float(lr("griff_laenge", 160))
        rand = float(lr("griff_abstand_kante", 40))
        x0, y0, z0 = front["pos"]
        dx, dy, dz = front["dim"]
        if richtung == "senkrecht":
            xc = x0 + rand if lage == "links" else x0 + dx - rand
            zc = min(z0 + dz - rand - L / 2, max(z0 + dz / 2, 1000.0)) if z0 + dz > 1200 else z0 + dz - rand - L / 2
            zc = max(z0 + L / 2 + 10, zc)
        else:
            xc = x0 + dx / 2
            zc = z0 + rand if lage == "unten" else (z0 + dz / 2 if dz < 250 else z0 + dz - rand)
        self.koerper.append({"typ": "griff", "richtung": richtung, "x": _r(xc), "y": _r(y0), "z": _r(zc), "laenge": L,
                             "an": front["key"]})
        self.beschlag("griff", 1, front["name"])

    # ---------------------------------------------------------------- abschluss
    def abschliessen(self):
        for t in self.teile:
            ov = self.m.bauteil_overrides.get(t["key"])
            if not ov:
                continue
            if ov.name:
                t["name"] = ov.name
                t["name_fest"] = True
            if ov.material:
                t["material"] = ov.material
            if ov.kanten is not None:
                t["kanten"] = {s: k for s, k in ov.kanten.items() if k}
        self.teile.sort(key=lambda t: t["reihenfolge"])
        anzahl = Counter(t["name"] for t in self.teile if not t.get("name_fest"))
        lfd = Counter()
        for t in self.teile:
            if not t.get("name_fest") and anzahl[t["name"]] > 1:
                lfd[t["name"]] += 1
                t["name"] = f"{t['name']} {lfd[t['name']]}"
        abz = self.R.get("kantenstaerke_abziehen", True)
        for i, t in enumerate(self.teile, 1):
            t["nr"] = i
            mat = self.platten.get(t["material"], {})
            t["kaufteil"] = bool(t.get("kaufteil") or mat.get("glas"))

            def ks(seite):
                k = self.kanten.get(t["kanten"].get(seite) or "")
                return float(k["staerke"]) if (k and abz) else 0.0

            t["zuschnitt_laenge"] = _r(t["laenge"] - ks("B1") - ks("B2"))
            t["zuschnitt_breite"] = _r(t["breite"] - ks("L1") - ks("L2"))
            t["faser"] = bool(mat.get("faser"))


def generiere(m: Moebel, regeln: dict, vorgaben: dict) -> dict:
    bau = _Bau(m, regeln, vorgaben)
    bau.bauen()
    bau.abschliessen()
    return {
        "bezeichnung": m.bezeichnung,
        "anzahl": m.anzahl,
        "masse": {"breite": m.breite, "hoehe": m.hoehe, "tiefe": m.tiefe},
        "info": bau.info,
        "bauteile": bau.teile,
        "koerper": bau.koerper,
        "beschlaege": bau.beschlaege,
        "zusatzpositionen": [z.model_dump() for z in m.zusatzpositionen],
        "warnungen": bau.warnungen,
    }
