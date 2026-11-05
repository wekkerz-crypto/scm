"""Tests für Generator, Zuschnitt, Kalkulation, Exporte und API."""
import os
import tempfile

os.environ.setdefault("TISCHLEREI_DATEN", tempfile.mkdtemp(prefix="tischlerei_test_"))

import pytest
from fastapi.testclient import TestClient

from app.berechnung import berechne_projekt
from app.defaults import KONSTRUKTIONSREGELN as R, VORGABEN as V
from app.generator import generiere
from app.modell import Bereich, Moebel, Spalte, beispiel_unterschrank
from app import cnc_export, pdf, zuschnitt


def namen(erg):
    return [t["name"] for t in erg["bauteile"]]


def test_unterschrank_bauteile_und_masse():
    erg = generiere(beispiel_unterschrank(), R, V)
    assert namen(erg) == ["Seitenwand links", "Seitenwand rechts", "Unterboden", "Oberboden", "Rückwand",
                          "Sichtseite links", "Sichtseite rechts", "Abdeckplatte", "Sockelblende", "Fachboden", "Tür rechts"]
    t = {x["name"]: x for x in erg["bauteile"]}
    bk = 600 - 2 * 19                                             # Korpus zwischen den Sichtseiten
    assert t["Seitenwand links"]["laenge"] == 820 - 100 - 19     # ohne Sockel und Abdeckplatte
    assert t["Unterboden"]["laenge"] == bk - 2 * 19
    assert t["Rückwand"]["breite"] == bk - 2 * 19 + 2 * (8 - 1)  # in Nut mit Spiel
    assert t["Sichtseite links"]["laenge"] == 820 - 19            # bis zum Boden, unter der Abdeckplatte
    assert t["Sichtseite links"]["breite"] == 560 + 19            # bündig mit der Front
    assert t["Abdeckplatte"]["laenge"] == 600
    assert t["Tür rechts"]["breite"] == bk - 3                    # aufliegend, Fuge 3
    assert t["Tür rechts"]["bewegung"]["drehpunkt"] == [600 - 19 - 1.5, -19.0]   # vordere Bandkante
    assert t["Tür rechts"]["bewegung"]["max_winkel"] == 95
    assert any(b["art"] == "nut" for b in t["Seitenwand links"]["bearbeitungen"])
    rollen = {b["rolle"]: b["menge"] for b in erg["beschlaege"]}
    assert rollen == {"sockelfuss": 4, "fachbodentraeger": 4, "scharnier": 2, "griff": 1}
    fuesse = [k for k in erg["koerper"] if k["typ"] == "sockelfuss"]
    assert {(f["x"], f["y"]) for f in fuesse} == {(69, 80), (69, 500), (531, 80), (531, 500)}
    assert not erg["warnungen"]


def test_universalschubkasten():
    m = beispiel_unterschrank()
    m.spalten = [Spalte(bereiche=[Bereich(front="schubkasten", schubkasten_anzahl=3)])]
    erg = generiere(m, R, V)
    sk = [t for t in erg["bauteile"] if t["gruppe"] == "Schubkästen"]
    assert len(sk) == 15
    s1 = {t["name"]: t for t in sk if t["name"].startswith("SK1 ")}
    assert set(s1) == {"SK1 Seite links", "SK1 Seite rechts", "SK1 Vorderstück", "SK1 Hinterstück", "SK1 Boden"}
    assert s1["SK1 Seite links"]["staerke"] == 16 and s1["SK1 Boden"]["staerke"] == 8
    assert s1["SK1 Seite links"]["laenge"] == 500               # Nennlänge im 50er-Raster (Ti = 542 → 500)
    lichte = 600 - 2 * 19 - 2 * 19
    assert s1["SK1 Boden"]["laenge"] == lichte - 2 * 13 - 2 * 16 + 2 * (8 - 1) or s1["SK1 Boden"]["breite"] == lichte - 2 * 13 - 2 * 16 + 2 * (8 - 1)
    assert any(b["art"] == "nut" for b in s1["SK1 Seite links"]["bearbeitungen"])
    # Vorder-/Hinterstück stehen auf dem Boden
    assert s1["SK1 Vorderstück"]["pos"][2] == s1["SK1 Boden"]["pos"][2] + 8
    fronten = [t for t in erg["bauteile"] if t["rolle"] == "schubkastenfront"]
    assert [f["name"] for f in fronten] == ["Schubkastenfront 1", "Schubkastenfront 2", "Schubkastenfront 3"]
    assert all(f["bewegung"]["typ"] == "schubkasten" and f["bewegung"]["weg"] == 450 for f in fronten)
    rollen = {b["rolle"]: 0 for b in erg["beschlaege"]}
    for b in erg["beschlaege"]:
        rollen[b["rolle"]] += b["menge"]
    assert rollen["schubkastenfuehrung"] == 3 and rollen["griff"] == 3


def test_passblende_in_nische_und_klappe():
    m = beispiel_unterschrank()
    m.abschluss_links, m.abschluss_rechts, m.passblende_links = "passblende", "keine", 45
    m.spalten = [Spalte(bereiche=[Bereich(front="offen", fachboeden=1, hoehe=300), Bereich(front="klappe")])]
    erg = generiere(m, R, V)
    t = {x["name"]: x for x in erg["bauteile"]}
    pb = t["Passblende links"]
    assert pb["pos"][0] == -45 and pb["pos"][1] == -19                 # bündig mit der Frontebene
    assert "Sichtseite links" not in t and "Sichtseite rechts" not in t
    assert t["Klappe"]["bewegung"]["typ"] == "klappe"
    assert erg["info"]["x_gesamt"] == [-45, 600]


def test_teile_ueberlappen_nicht():
    m = Moebel(breite=1800, hoehe=900, tiefe=450, spalten=[
        Spalte(bereiche=[Bereich(front="schubkasten", schubkasten_anzahl=3)]),
        Spalte(bereiche=[Bereich(front="doppeltuer", fachboeden=2)]),
        Spalte(breite=500, bereiche=[Bereich(front="offen", fachboeden=1, hoehe=300), Bereich(front="klappe")])])
    erg = generiere(m, R, V)
    teile = erg["bauteile"]
    def schnitt(a, b):
        lo = [max(a[k], b[k]) for k in range(3)]
        hi = [min(a[k + 3], b[k + 3]) for k in range(3)]
        return lo + hi if all(hi[k] - lo[k] > 0.01 for k in range(3)) else None

    box = lambda t: [*t["pos"], *(t["pos"][k] + t["dim"][k] for k in range(3))]
    for i, a in enumerate(teile):
        for b in teile[i + 1:]:
            s = schnitt(box(a), box(b))
            if s is None:
                continue
            # erlaubt nur, wenn die Überlappung vollständig in einer Nut liegt (Rückwand in Nut)
            in_nut = any(all(n[k] - 0.01 <= s[k] and s[k + 3] <= n[k + 3] + 0.01 for k in range(3))
                         for n in a["aussparungen"] + b["aussparungen"])
            assert in_nut, (a["name"], b["name"])
    assert "Mittelwand 1" in namen(erg) and "Zwischenboden" in namen(erg)
    assert sum(1 for n in namen(erg) if n.startswith("Schubkastenfront")) == 3


@pytest.mark.parametrize("bauweise", ["seiten_durchgehend", "boeden_durchgehend", "oberboden_aufliegend"])
@pytest.mark.parametrize("rw", ["genutet", "gefaelzt", "aufgesetzt", "keine"])
def test_varianten(bauweise, rw):
    m = beispiel_unterschrank()
    m.bauweise, m.rueckwand_art, m.front_aufschlag = bauweise, rw, "eingelegt"
    erg = generiere(m, R, V)
    assert not erg["warnungen"]
    assert ("Rückwand" in namen(erg)) == (rw != "keine")
    assert "Abdeckplatte" in namen(erg)


def test_zuschnitt_ohne_ueberlappung():
    m = beispiel_unterschrank()
    m.anzahl = 6
    erg = generiere(m, R, V)
    z = zuschnitt.berechne([erg], V)
    for mat in z["materialien"]:
        teile_soll = sum(t["menge"] for t in erg["bauteile"] if t["material"] == mat["material"])
        assert sum(len(p["teile"]) for p in mat["plaene"]) == teile_soll
        for p in mat["plaene"]:
            for i, a in enumerate(p["teile"]):
                assert a["x"] + a["l"] <= mat["laenge"] - 10 + 0.01
                assert a["y"] + a["b"] <= mat["breite"] - 10 + 0.01
                for b in p["teile"][i + 1:]:
                    assert (a["x"] + a["l"] + 4.3 <= b["x"] or b["x"] + b["l"] + 4.3 <= a["x"] or
                            a["y"] + a["b"] + 4.3 <= b["y"] or b["y"] + b["b"] + 4.3 <= a["y"])


def test_faser_wird_nicht_gedreht():
    m = beispiel_unterschrank()
    m.material_front = "egger_h1180_19"
    erg = generiere(m, R, V)
    z = zuschnitt.berechne([erg], V)
    eiche = next(x for x in z["materialien"] if x["material"] == "egger_h1180_19")
    assert all(not t["gedreht"] for p in eiche["plaene"] for t in p["teile"])


def test_kalkulation_summen():
    erg = berechne_projekt({"moebel": [beispiel_unterschrank().model_dump()]}, R, V)
    k = erg["kalkulation"]
    assert abs(sum(p["gesamt"] for p in k["positionen"]) - k["herstellkosten"]) < 0.05
    assert abs(k["netto"] * 1.19 - k["brutto"]) < 0.02
    assert erg["anteile_netto"] == [k["netto"]]
    m2 = berechne_projekt({"moebel": [beispiel_unterschrank().model_dump()],
                           "kalk_einstellungen": {"zuschnitt_modus": "m2", "wagnis_gewinn": 0}}, R, V)["kalkulation"]
    assert m2["netto"] < k["netto"]  # m²-Basis günstiger als ganze Platten bei Einzelmöbel


def test_exporte():
    daten = {"moebel": [beispiel_unterschrank().model_dump()]}
    erg = berechne_projekt(daten, R, V)
    projekt = {"id": "abc123", "name": "Test Küche", "kunde": {"name": "Müller"}, "daten": daten}
    for f in (pdf.angebot(projekt, erg, V, None, None), pdf.stueckliste(projekt, erg, V),
              pdf.zuschnitt(projekt, erg, V), pdf.kalkulation(projekt, erg, V)):
        assert f.startswith(b"%PDF")
    assert b"Seitenwand links" in pdf.csv_stueckliste(erg).replace(b"\xc3\xa4", b"a")
    assert cnc_export.export_zip(erg["moebel"], V)[:2] == b"PK"


def test_step_ap242():
    pytest.importorskip("OCP")
    from app.step_export import export_step
    erg = berechne_projekt({"moebel": [beispiel_unterschrank().model_dump()]}, R, V)
    step = export_step("Küche Müller", erg["moebel"], V)
    assert b"AP242_MANAGED_MODEL_BASED_3D_ENGINEERING" in step
    assert b"PRODUCT('Seitenwand links'" in step
    assert b"R\\X2\\00FC\\X0\\ckwand" in step  # Rückwand, Umlaut normgerecht kodiert
    assert step.isascii()


def test_api_ablauf():
    from app.main import app
    c = TestClient(app)
    p = c.post("/api/projekte", json={"name": "API-Test", "beispiel": True}).json()
    assert c.get(f"/api/projekte/{p['id']}/berechnung").json()["kalkulation"]["netto"] > 0
    p["daten"]["moebel"][0]["breite"] = 800
    assert c.put(f"/api/projekte/{p['id']}", json=p).status_code == 200
    p["daten"]["moebel"][0]["breite"] = -5
    assert c.put(f"/api/projekte/{p['id']}", json=p).status_code == 422
    kopie = c.post(f"/api/projekte/{p['id']}/duplizieren", json={"als_vorlage": True}).json()
    assert kopie["ist_vorlage"]
    assert c.get(f"/api/projekte/{p['id']}/export/angebot.pdf").content.startswith(b"%PDF")
    assert c.post(f"/api/projekte/{p['id']}/angebotstext", json={"ohne_ki": True}).json()["quelle"] == "vorlage"
    assert c.get("/").status_code == 200 and c.get(f"/upload/{p['id']}").status_code == 200
    assert c.delete(f"/api/projekte/{p['id']}").status_code == 200


def test_zeichnungen():
    from app import zeichnung
    m = beispiel_unterschrank()
    m.spalten = [Spalte(bereiche=[Bereich(front="schubkasten", schubkasten_anzahl=2)]),
                 Spalte(bereiche=[Bereich(front="doppeltuer", fachboeden=1)])]
    m.breite = 1200
    daten = {"moebel": [m.model_dump()]}
    erg = berechne_projekt(daten, R, V)
    av = zeichnung.ansichten(erg["moebel"][0], V)
    assert set(av) == {"front", "innen", "seite", "oben"}
    gesamt = [x for x in av["front"].masse if x.seite == "unten" and abs(x.b - x.a - 1200) < 0.01]
    assert gesamt, "Gesamtbreite fehlt in der Frontansicht"
    assert any(abs(x.b - x.a - 820) < 0.01 for x in av["front"].masse if x.seite == "rechts")
    assert len(av["front"].linien) == 2  # Anschlagsymbole der Doppeltür
    svg = zeichnung.svg(av["front"])
    assert svg.startswith("<svg") and ">1200<" in svg
    projekt = {"id": "x1", "name": "Test", "kunde": {}, "daten": daten}
    blaetter = zeichnung.uebersichtsblaetter(projekt, erg, V, {})
    assert blaetter.startswith(b"%PDF") and blaetter.count(b"/Type /Page") >= 2
    assert b"BEMASSUNG" in zeichnung.dxf(erg["moebel"][0], V)
    zusammen = pdf.zusammenfuegen([pdf.angebot(projekt, erg, V, None, None), blaetter])
    assert zusammen.startswith(b"%PDF")


def test_anschlagsymbol_spitze_zur_oeffnungsseite():
    from app import zeichnung
    m = beispiel_unterschrank()  # eine Tür, Anschlag rechts
    erg = berechne_projekt({"moebel": [m.model_dump()]}, R, V)
    tuer = next(t for t in erg["moebel"][0]["bauteile"] if t["rolle"] == "tuer")
    x0, x1 = tuer["pos"][0], tuer["pos"][0] + tuer["dim"][0]
    (pkt, _), = zeichnung.ansichten(erg["moebel"][0], V)["front"].linien
    assert pkt[0][0] == x1 and pkt[2][0] == x1   # Linien beginnen an der Bandseite (rechts)
    assert pkt[1][0] == x0                       # Spitze links = Griff-/Öffnungsseite



def test_kollision_nischenwand_und_mittelwand():
    m = beispiel_unterschrank()
    m.abschluss_links, m.passblende_links = "passblende", 20
    m.spalten = [Spalte(bereiche=[Bereich(front="tuer", anschlag="links")])]
    tuer = next(t for t in generiere(m, R, V)["bauteile"] if t["rolle"] == "tuer")
    assert tuer["bewegung"]["kollision"]["mit"] == "Nischenwand links"
    assert tuer["bewegung"]["max_winkel"] < 95
    m.passblende_links = 80
    tuer = next(t for t in generiere(m, R, V)["bauteile"] if t["rolle"] == "tuer")
    assert "kollision" not in tuer["bewegung"]
    m2 = beispiel_unterschrank()
    m2.breite = 1000
    m2.spalten = [Spalte(bereiche=[Bereich(front="tuer", anschlag="rechts")]), Spalte(bereiche=[Bereich(front="tuer", anschlag="links")])]
    erg = generiere(m2, R, V)
    assert sum("Kollision" in w for w in erg["warnungen"]) == 2
    m2.spalten = [Spalte(bereiche=[Bereich(front="doppeltuer")])]
    assert not generiere(m2, R, V)["warnungen"]
