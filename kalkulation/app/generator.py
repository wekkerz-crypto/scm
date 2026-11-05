"""Parametrischer Möbelgenerator: Datenmodell (Moebel) → Bauteile.

Deterministisch: gleiche Eingaben ergeben immer dieselben Bauteile mit
denselben Schlüsseln. Die Bauteile sind achsparallele Plattenkörper mit
Metadaten (Name, Material, Stärke, Kanten, Faserrichtung, Bearbeitungen).
Daraus entstehen 3D-Ansicht, Stückliste, Zuschnitt, Kalkulation, STEP und CNC.

Koordinaten: x = Breite, y = Tiefe (0 = Vorderkante Korpus, Fronten bei y < 0),
z = Höhe (0 = Fußboden). Alle Maße in mm.
"""
from __future__ import annotations

import math
from collections import Counter

from .modell import Moebel

ACHSE = {"x": 0, "y": 1, "z": 2}

# Baureihenfolge (Fertigung/Montage)
REIHENFOLGE = {
    "seite": 10, "unterboden": 20, "oberboden": 30, "mittelwand": 40, "zwischenboden": 50,
    "rueckwand": 60, "sockelblende": 70, "fachboden": 80,
    "tuer": 90, "klappe": 92, "schubkastenfront": 94,
}

GRUPPEN = ["Korpus", "Rückwand", "Sockel", "Einlegeböden", "Fronten"]


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
        self.warnungen: list[str] = []
        self._seq = 0

    # ---------------------------------------------------------------- helpers
    def material(self, feld: str) -> str:
        wert = getattr(self.m, feld, None) or self.R.get(feld)
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
            "key": key,
            "name": name,
            "gruppe": gruppe,
            "rolle": rolle,
            "material": material,
            "pos": [_r(v) for v in pos],
            "dim": [_r(v) for v in dim],
            "achsen": {"l": faser, "b": breite_achse, "d": dicke},
            "laenge": _r(dim[ACHSE[faser]]),
            "breite": _r(dim[ACHSE[breite_achse]]),
            "staerke": _r(dim[ACHSE[dicke]]),
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
        """Welche Plattenseite liegt an der Koordinate (entlang der Dickenachse)?"""
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
        tiefe = bx[di + 3] - bx[di]
        u0, v0 = self.lokal(t, bx[:3])
        u1, v1 = self.lokal(t, bx[3:])
        seite = self.flaeche(t, bx[di + 3] if abs(bx[di + 3] - (p[di] + d[di])) < 0.01 else bx[di])
        t["bearbeitungen"].append({
            "art": art, "u0": u0, "v0": v0, "u1": u1, "v1": v1,
            "tiefe": _r(tiefe), "breite": _r(min(u1 - u0, v1 - v0)), "flaeche": seite,
        })

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
        B, H, T = m.breite, m.hoehe, m.tiefe

        mat_k = self.material("material_korpus")
        mat_rw = self.material("material_rueckwand")
        mat_f = self.material("material_front")
        mat_fb = self.material("material_fachboden")
        mat_s = R.get("material_sockel") or mat_k
        s = self.staerke(mat_k, "staerke_korpus")
        sf = self.staerke(mat_f, "staerke_front")
        sfb = self.staerke(mat_fb, "staerke_fachboden")
        ss = self.staerke(mat_s, "staerke_sockel")

        k_korpus = R.get("kante_korpus")
        k_front = R.get("kante_front")
        k_fb = R.get("kante_fachboden")
        k_sockel = R.get("kante_sockel")

        sockel_art = self.regel("sockel_art")
        sh = float(self.regel("sockel_hoehe") or 0) if sockel_art != "keiner" else 0.0
        rw_art = self.regel("rueckwand_art")
        sr = self.staerke(mat_rw, "staerke_rueckwand") if rw_art != "keine" else 0.0
        n = float(R.get("rueckwand_nuttiefe", 8))
        a = float(R.get("rueckwand_abstand_hinten", 10))
        luft = float(R.get("rueckwand_luft", 1))
        bauweise = self.regel("bauweise")
        aufschlag = self.regel("front_aufschlag")
        fuge = float(R.get("front_fuge", 3))

        if H - sh < 2 * s + 20:
            self.warnungen.append("Höhe zu gering für Korpus mit Sockel.")

        # Plattentiefen
        Tk = T - sr if rw_art == "aufgesetzt" else T              # Seiten / Böden
        if rw_art == "genutet":
            Ti = T - a - sr                                      # Innenteile vor der Rückwand
        elif rw_art in ("gefaelzt", "aufgesetzt"):
            Ti = T - sr
        else:
            Ti = T
        yf = sf if aufschlag == "eingelegt" else 0.0              # eingelegte Fronten liegen im Korpus
        z_unten, z_oben = sh, H
        kk = self.kanten_nach_regel("kanten_korpus", k_korpus)

        # ---- Korpus
        if bauweise == "boeden_durchgehend":
            sl = (0, 0, z_unten + s, s, Tk, z_oben - s)
            sr_ = (B - s, 0, z_unten + s, B, Tk, z_oben - s)
            ub = (0, 0, z_unten, B, Tk, z_unten + s)
            ob = (0, 0, z_oben - s, B, Tk, z_oben)
        elif bauweise == "oberboden_aufliegend":
            sl = (0, 0, z_unten, s, Tk, z_oben - s)
            sr_ = (B - s, 0, z_unten, B, Tk, z_oben - s)
            ub = (s, 0, z_unten, B - s, Tk, z_unten + s)
            ob = (0, 0, z_oben - s, B, Tk, z_oben)
        else:  # seiten_durchgehend
            sl = (0, 0, z_unten, s, Tk, z_oben)
            sr_ = (B - s, 0, z_unten, B, Tk, z_oben)
            ub = (s, 0, z_unten, B - s, Tk, z_unten + s)
            ob = (s, 0, z_oben - s, B - s, Tk, z_oben)

        t_sl = self.teil("seite_links", "Seitenwand links", "Korpus", "seite", mat_k, sl, "z", "x", kk)
        t_sr = self.teil("seite_rechts", "Seitenwand rechts", "Korpus", "seite", mat_k, sr_, "z", "x", kk)
        t_ub = self.teil("unterboden", "Unterboden", "Korpus", "unterboden", mat_k, ub, "x", "z", kk)
        t_ob = self.teil("oberboden", "Oberboden", "Korpus", "oberboden", mat_k, ob, "x", "z", kk)

        xi0, xi1 = s, B - s
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
            self.teil("rueckwand", "Rückwand", "Rückwand", "rueckwand", mat_rw,
                      (0, T - sr, z_unten, B, T, z_oben), "z", "y")

        # ---- Sockel
        if sockel_art == "blende" and sh > 0:
            rv = float(R.get("sockelblende_rueckversatz", 40))
            self.teil("sockelblende", "Sockelblende", "Sockel", "sockelblende", mat_s,
                      (0, rv, 0, B, rv + ss, sh), "x", "y", self.kanten_nach_regel("kanten_sockel", k_sockel))
        if sockel_art in ("blende", "fuesse") and sh > 0:
            je = int(R.get("sockelfuesse_je_600mm", 2))
            self.beschlag("sockelfuss", max(4, math.ceil(B / 600) * je), "Sockel")

        # ---- Spalten / Mittelwände
        spalten = m.spalten or []
        breiten, ok = self.aufteilen(xi1 - xi0, [sp.breite for sp in spalten], s)
        if not ok:
            self.warnungen.append("Spaltenbreiten passen nicht zur Korpusbreite – wurden angepasst.")
        x = xi0
        spalt_x = []
        for i, bw in enumerate(breiten):
            spalt_x.append((x, x + bw))
            x += bw
            if i < len(breiten) - 1:
                self.teil(f"mittelwand_{i + 1}", "Mittelwand", "Korpus", "mittelwand", mat_k,
                          (x, 0, zi0, x + s, Ti, zi1), "z", "x", kk)
                x += s
        mittelwaende = {t["key"]: t for t in self.teile if t["rolle"] == "mittelwand"}

        def wand_links(ci):
            return t_sl if ci == 0 else mittelwaende.get(f"mittelwand_{ci}")

        def wand_rechts(ci):
            return t_sr if ci == len(spalten) - 1 else mittelwaende.get(f"mittelwand_{ci + 1}")

        lr = R.get
        glas_mat = next((p["id"] for p in self.platten.values() if p.get("glas")), mat_f)

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

            for bi, (ber, (bz0, bz1)) in enumerate(zip(bereiche, ber_z)):
                tag = f"s{ci + 1}_b{bi + 1}"
                # Einlegeböden
                fl = float(lr("fachboden_luft", 1))
                rv = float(lr("fachboden_rueckversatz_vorne", 10))
                ah = float(lr("fachboden_abstand_hinten", 5))
                nfb = ber.fachboeden
                frei = (bz1 - bz0) - nfb * sfb
                for k in range(nfb):
                    zb = bz0 + (k + 1) * frei / (nfb + 1) + k * sfb
                    self.teil(f"fachboden_{tag}_{k + 1}", "Fachboden", "Einlegeböden", "fachboden", mat_fb,
                              (cx0 + fl, yf + rv, zb, cx1 - fl, Ti - ah, zb + sfb), "x", "z",
                              self.kanten_nach_regel("kanten_fachboden", k_fb))
                    # Lochreihen-Bohrungen für Fachbodenträger in den angrenzenden Wänden
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
                    fx0 = 0.0 if ci == 0 else cx0 - s / 2
                    fx1 = B if ci == len(spalten) - 1 else cx1 + s / 2
                    fz0 = z_unten if bi == 0 else bz0 - s / 2
                    fz1 = z_oben if bi == len(bereiche) - 1 else bz1 + s / 2
                    fx0, fx1, fz0, fz1 = fx0 + fuge / 2, fx1 - fuge / 2, fz0 + fuge / 2, fz1 - fuge / 2
                    fy0, fy1 = -sf, 0.0
                fmat = glas_mat if ber.glas else mat_f
                fk = {} if ber.glas else self.kanten_nach_regel("kanten_front", k_front)
                innen_y = fy1  # Innenseite der Front (Topfbohrungen)
                griff = ber.griff and lr("griff_je_front", True)

                def tuer(key, name, bx, anschlag):
                    t = self.teil(key, name, "Fronten", "tuer", fmat, bx, "z", "y", fk,
                                  anschlag=anschlag, kaufteil=bool(ber.glas))
                    if t is None:
                        return
                    hoehe = bx[5] - bx[2]
                    anz = next((int(nz) for grenze, nz in lr("scharniere_staffel", [[99999, 2]]) if hoehe <= grenze), 2)
                    self.beschlag("scharnier", anz, name)
                    if griff:
                        self.beschlag("griff", 1, name)
                    if not ber.glas and lr("topfbohrung_durchmesser"):
                        ende = float(lr("topfbohrung_abstand_ende", 100))
                        kante = float(lr("topfbohrung_abstand_kante", 22.5))
                        xk = bx[0] + kante if anschlag == "links" else bx[3] - kante
                        zs = [bx[2] + ende + i * (hoehe - 2 * ende) / max(1, anz - 1) for i in range(anz)]
                        for zz in zs:
                            self.bohrung(t, [xk, innen_y, zz], float(lr("topfbohrung_durchmesser")),
                                         float(lr("topfbohrung_tiefe", 13)), self.flaeche(t, innen_y), "topfbohrung")

                if ber.front == "tuer":
                    tuer(f"front_{tag}", f"Tür {ber.anschlag}", (fx0, fy0, fz0, fx1, fy1, fz1), ber.anschlag)
                elif ber.front == "doppeltuer":
                    xm = (fx0 + fx1) / 2
                    tuer(f"front_{tag}_l", "Tür links", (fx0, fy0, fz0, xm - fuge / 2, fy1, fz1), "links")
                    tuer(f"front_{tag}_r", "Tür rechts", (xm + fuge / 2, fy0, fz0, fx1, fy1, fz1), "rechts")
                elif ber.front == "klappe":
                    self.teil(f"front_{tag}", "Klappe", "Fronten", "klappe", fmat, (fx0, fy0, fz0, fx1, fy1, fz1),
                              "x", "y", fk, kaufteil=bool(ber.glas))
                    self.beschlag("klappenbeschlag", 1, "Klappe")
                    if griff:
                        self.beschlag("griff", 1, "Klappe")
                elif ber.front == "schubkasten":
                    k = ber.schubkasten_anzahl
                    fh = (fz1 - fz0 - (k - 1) * fuge) / k
                    for j in range(k):
                        z0 = fz0 + j * (fh + fuge)
                        t = self.teil(f"front_{tag}_{j + 1}", "Schubkastenfront", "Fronten", "schubkastenfront", fmat,
                                      (fx0, fy0, z0, fx1, fy1, z0 + fh), "x", "y", fk, kaufteil=bool(ber.glas))
                        if t is None:
                            continue
                        if fh <= float(lr("schubkasten_klein_bis", 120)):
                            groesse = "klein"
                        elif fh <= float(lr("schubkasten_mittel_bis", 220)):
                            groesse = "mittel"
                        else:
                            groesse = "gross"
                        t["schubkasten"] = groesse
                        self.beschlag(f"schubkasten_{groesse}", 1, "Schubkasten")
                        if griff:
                            self.beschlag("griff", 1, "Schubkasten")

    # ---------------------------------------------------------------- abschluss
    def abschliessen(self):
        # Overrides anwenden
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
        # Nummerierung gleichnamiger Teile
        anzahl = Counter(t["name"] for t in self.teile if not t.get("name_fest"))
        lfd = Counter()
        for t in self.teile:
            if not t.get("name_fest") and anzahl[t["name"]] > 1:
                lfd[t["name"]] += 1
                t["name"] = f"{t['name']} {lfd[t['name']]}"
        for i, t in enumerate(self.teile, 1):
            t["nr"] = i
            mat = self.platten.get(t["material"], {})
            t["kaufteil"] = bool(t.get("kaufteil") or mat.get("glas"))
            # Zuschnittmaß (Fertigmaß abzüglich Kantenstärken)
            abz = self.R.get("kantenstaerke_abziehen", True)

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
        "bauteile": bau.teile,
        "beschlaege": bau.beschlaege,
        "zusatzpositionen": [z.model_dump() for z in m.zusatzpositionen],
        "warnungen": bau.warnungen,
    }
