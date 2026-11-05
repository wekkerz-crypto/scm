"""PDF-Ausgaben: Angebot, Stückliste, Zuschnittpläne, interne Kalkulation (reportlab)."""
from __future__ import annotations

import io
from datetime import date, datetime, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)
from reportlab.graphics.shapes import Drawing, Rect, String

_ST = getSampleStyleSheet()
NORMAL = ParagraphStyle("n", parent=_ST["Normal"], fontName="Helvetica", fontSize=9.5, leading=13)
KLEIN = ParagraphStyle("k", parent=NORMAL, fontSize=8, leading=10)
FETT = ParagraphStyle("f", parent=NORMAL, fontName="Helvetica-Bold")
TITEL = ParagraphStyle("t", parent=NORMAL, fontName="Helvetica-Bold", fontSize=15, leading=19, spaceAfter=4)
H2 = ParagraphStyle("h2", parent=NORMAL, fontName="Helvetica-Bold", fontSize=11, leading=15, spaceBefore=8, spaceAfter=4)
RECHTS = ParagraphStyle("r", parent=NORMAL, alignment=2)

TABELLE = TableStyle([
    ("FONT", (0, 0), (-1, -1), "Helvetica", 8.5),
    ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5),
    ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.black),
    ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#cccccc")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 2.5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
])


def eur(v: float) -> str:
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{s} €"


def zahl(v: float, nachkomma=2) -> str:
    s = f"{v:,.{nachkomma}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if nachkomma and s.endswith("," + "0" * nachkomma):
        s = s[: -(nachkomma + 1)]
    return s


def _p(text, style=NORMAL):
    return Paragraph(escape(str(text or "")).replace("\n", "<br/>"), style)


def _doc(buf, titel, quer=False):
    size = landscape(A4) if quer else A4
    return SimpleDocTemplate(buf, pagesize=size, leftMargin=18 * mm, rightMargin=15 * mm,
                             topMargin=15 * mm, bottomMargin=18 * mm, title=titel)


def _fusszeile(firma: dict):
    def zeichnen(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#555555"))
        teile1 = [firma.get("name"), firma.get("strasse"), firma.get("plz_ort"), firma.get("telefon"), firma.get("email"), firma.get("web")]
        teile2 = [firma.get("bank"), f"IBAN {firma['iban']}" if firma.get("iban") else "", f"BIC {firma['bic']}" if firma.get("bic") else "",
                  f"USt-IdNr. {firma['ust_id']}" if firma.get("ust_id") else "", f"St.-Nr. {firma['steuernummer']}" if firma.get("steuernummer") else ""]
        w = doc.pagesize[0]
        canvas.drawCentredString(w / 2, 10 * mm, " · ".join(t for t in teile1 if t))
        canvas.drawCentredString(w / 2, 6.5 * mm, " · ".join(t for t in teile2 if t))
        canvas.drawRightString(w - 15 * mm, 14 * mm, f"Seite {doc.page}")
        canvas.restoreState()
    return zeichnen


def _kopf(firma: dict, logo_pfad: Path | None, titel: str, projekt: dict) -> list:
    links = [_p(firma.get("name"), FETT), _p(firma.get("inhaber"), KLEIN),
             _p(f"{firma.get('strasse', '')}\n{firma.get('plz_ort', '')}", KLEIN)]
    rechts = []
    if logo_pfad and logo_pfad.exists():
        try:
            img = Image(str(logo_pfad))
            faktor = min(45 * mm / img.drawWidth, 22 * mm / img.drawHeight)
            img.drawWidth *= faktor
            img.drawHeight *= faktor
            rechts = [img]
        except Exception:
            rechts = []
    t = Table([[links, rechts]], colWidths=[110 * mm, 67 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    return [t, Spacer(1, 6 * mm)]


def _kunde_block(kunde: dict) -> list:
    zeilen = [kunde.get("name"), kunde.get("firma"), kunde.get("strasse"), kunde.get("plz_ort")]
    return [_p("\n".join(z for z in zeilen if z)), Spacer(1, 8 * mm)]


def angebot(projekt: dict, ergebnis: dict, vorgaben: dict, logo: Path | None, render: Path | None) -> bytes:
    firma = vorgaben.get("firma", {})
    ang = projekt["daten"].get("angebot", {})
    kalk = ergebnis["kalkulation"]
    buf = io.BytesIO()
    doc = _doc(buf, f"Angebot {projekt['name']}")
    st = _kopf(firma, logo, "Angebot", projekt) + _kunde_block(projekt.get("kunde", {}))
    datum = ang.get("datum") or date.today().isoformat()
    try:
        d = datetime.fromisoformat(datum).date()
    except ValueError:
        d = date.today()
    gueltig = d + timedelta(days=int(firma.get("angebot_gueltig_tage") or 30))
    info = Table([
        ["Angebot Nr.", ang.get("nummer") or projekt["id"][:6].upper()],
        ["Datum", d.strftime("%d.%m.%Y")],
        ["Gültig bis", gueltig.strftime("%d.%m.%Y")],
    ], colWidths=[28 * mm, 50 * mm], hAlign="RIGHT")
    info.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 9), ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 9)]))
    st += [info, Spacer(1, 4 * mm), _p(f"Angebot: {ang.get('betreff') or projekt['name']}", TITEL)]
    if ang.get("einleitung"):
        st += [_p(ang["einleitung"]), Spacer(1, 3 * mm)]
    if render and render.exists() and ang.get("mit_bild", True):
        try:
            img = Image(str(render))
            faktor = min(170 * mm / img.drawWidth, 85 * mm / img.drawHeight)
            img.drawWidth *= faktor
            img.drawHeight *= faktor
            st += [img, Spacer(1, 4 * mm)]
        except Exception:
            pass

    # Positionen
    zeilen = [["Pos.", "Beschreibung", "Menge", "Einzelpreis", "Gesamt"]]
    pos = 1
    texte = ang.get("positionstexte") or []
    moebel = projekt["daten"].get("moebel", [])
    wug = float(kalk["einstellungen"].get("wagnis_gewinn") or 0)
    for i, (m, anteil) in enumerate(zip(moebel, ergebnis["anteile_netto"])):
        anz = int(m.get("anzahl", 1))
        text = texte[i] if i < len(texte) and texte[i] else (ang.get("text") if len(moebel) == 1 else "")
        beschr = [_p(m.get("bezeichnung"), FETT),
                  _p(f"Maße B × H × T: {zahl(m['breite'], 0)} × {zahl(m['hoehe'], 0)} × {zahl(m['tiefe'], 0)} mm", KLEIN)]
        if text:
            beschr.append(_p(text, KLEIN))
        zeilen.append([str(pos), beschr, f"{anz} Stk", eur(anteil / anz), eur(anteil)])
        pos += 1
    for fp in projekt["daten"].get("freie_positionen") or []:
        if not fp.get("bezeichnung"):
            continue
        menge = float(fp.get("menge") or 0)
        ep = float(fp.get("preis") or 0) * (1 + wug / 100)
        zeilen.append([str(pos), _p(fp["bezeichnung"]), f"{zahl(menge)} {fp.get('einheit') or 'Stk'}", eur(ep), eur(ep * menge)])
        pos += 1
    t = Table(zeilen, colWidths=[11 * mm, 96 * mm, 18 * mm, 26 * mm, 26 * mm], repeatRows=1)
    t.setStyle(TABELLE)
    t.setStyle(TableStyle([("ALIGN", (2, 0), (-1, -1), "RIGHT")]))
    st.append(t)
    summen = Table([
        ["Summe netto", eur(kalk["netto"])],
        [f"zzgl. {zahl(kalk['mwst_prozent'])} % MwSt.", eur(kalk["mwst"])],
        ["Gesamtbetrag brutto", eur(kalk["brutto"])],
    ], colWidths=[50 * mm, 30 * mm], hAlign="RIGHT")
    summen.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9.5), ("FONT", (0, 2), (-1, 2), "Helvetica-Bold", 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"), ("LINEABOVE", (0, 2), (-1, 2), 0.8, colors.black),
    ]))
    st += [Spacer(1, 3 * mm), KeepTogether(summen), Spacer(1, 6 * mm)]
    if len(moebel) != 1 and ang.get("text"):
        st += [_p(ang["text"]), Spacer(1, 4 * mm)]
    if firma.get("zahlungsbedingungen"):
        st += [_p("Zahlungsbedingungen: " + firma["zahlungsbedingungen"], KLEIN)]
    if ang.get("schluss") or firma.get("fusstext"):
        st += [Spacer(1, 3 * mm), _p(ang.get("schluss") or firma.get("fusstext"))]
    st += [Spacer(1, 8 * mm), _p("Mit freundlichen Grüßen"), _p(firma.get("inhaber") or firma.get("name"))]
    doc.build(st, onFirstPage=_fusszeile(firma), onLaterPages=_fusszeile(firma))
    return buf.getvalue()


def _kante_kurz(z: dict) -> str:
    return " ".join(s for s in ("L1", "L2", "B1", "B2") if z["kanten"].get(s))


def stueckliste(projekt: dict, ergebnis: dict, vorgaben: dict) -> bytes:
    firma = vorgaben.get("firma", {})
    buf = io.BytesIO()
    doc = _doc(buf, f"Stückliste {projekt['name']}", quer=True)
    st = [_p(f"Stückliste – {projekt['name']}", TITEL),
          _p(f"Stand {date.today().strftime('%d.%m.%Y')} · Maße in mm · Kanten: L = Längskante, B = Querkante", KLEIN),
          Spacer(1, 3 * mm)]
    kanten = {k["id"]: k["name"] for k in vorgaben.get("kanten", [])}
    for mi, erg in enumerate(ergebnis["moebel"]):
        zeilen = [["Nr", "Bauteil", "Stk", "Material", "Länge", "Breite", "Stärke", "Zuschnitt L × B", "Faser", "Kanten", "Bearbeitung"]]
        for z in [z for z in ergebnis["stueckliste"] if z["moebel"] == mi]:
            zeilen.append([z["nr"], _p(z["name"], KLEIN), z["menge"], _p(z["material_name"], KLEIN), zahl(z["laenge"], 1),
                           zahl(z["breite"], 1), zahl(z["staerke"], 1),
                           "Kaufteil" if z["kaufteil"] else f"{zahl(z['zuschnitt_laenge'], 1)} × {zahl(z['zuschnitt_breite'], 1)}",
                           "ja" if z["faser"] else "–", _kante_kurz(z), _p(z["bearbeitung"], KLEIN)])
        t = Table(zeilen, colWidths=[9 * mm, 42 * mm, 10 * mm, 58 * mm, 17 * mm, 17 * mm, 14 * mm, 32 * mm, 12 * mm, 22 * mm, 40 * mm], repeatRows=1)
        t.setStyle(TABELLE)
        st += [_p(f"{erg['bezeichnung']} ({erg['anzahl']} Stk) – {zahl(erg['masse']['breite'], 0)} × "
                  f"{zahl(erg['masse']['hoehe'], 0)} × {zahl(erg['masse']['tiefe'], 0)} mm", H2), t]
        if erg["beschlaege"]:
            st.append(_p("Beschläge: " + ", ".join(f"{b['menge']:g}× {b['rolle']}" for b in erg["beschlaege"]), KLEIN))
    benutzt = sorted({k for z in ergebnis["stueckliste"] for k in z["kanten"].values() if k})
    if benutzt:
        st += [Spacer(1, 3 * mm), _p("Kanten: " + "; ".join(f"{k} = {kanten.get(k, k)}" for k in benutzt), KLEIN)]
    doc.build(st, onFirstPage=_fusszeile(firma), onLaterPages=_fusszeile(firma))
    return buf.getvalue()


def zuschnitt(projekt: dict, ergebnis: dict, vorgaben: dict) -> bytes:
    firma = vorgaben.get("firma", {})
    buf = io.BytesIO()
    doc = _doc(buf, f"Zuschnitt {projekt['name']}", quer=True)
    z = ergebnis["zuschnitt"]
    st = [_p(f"Zuschnittpläne – {projekt['name']}", TITEL),
          _p(f"Sägeblatt {zahl(z['saegeblatt'], 1)} mm · Besäumrand {zahl(z['besaeumrand'], 0)} mm", KLEIN)]
    for mat in z["materialien"]:
        if mat.get("kaufteil"):
            continue
        for i, plan in enumerate(mat["plaene"], 1):
            L, B = float(mat["laenge"]), float(mat["breite"])
            f = min(245 * mm / L, 150 * mm / B)
            d = Drawing(L * f, B * f + 4)
            d.add(Rect(0, 0, L * f, B * f, fillColor=colors.HexColor("#efe7da"), strokeColor=colors.black, strokeWidth=0.6))
            for t in plan["teile"]:
                d.add(Rect(t["x"] * f, (B - t["y"] - t["b"]) * f, t["l"] * f, t["b"] * f,
                           fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#333333"), strokeWidth=0.4))
                if t["l"] * f > 30 and t["b"] * f > 14:
                    cx, cy = (t["x"] + t["l"] / 2) * f, (B - t["y"] - t["b"] / 2) * f
                    d.add(String(cx, cy + 1, f"{t['nr']} {t['name']}"[:28], fontName="Helvetica", fontSize=6.5, textAnchor="middle"))
                    d.add(String(cx, cy - 7, f"{zahl(t['l'], 1)} × {zahl(t['b'], 1)}", fontName="Helvetica", fontSize=6, textAnchor="middle"))
            st.append(KeepTogether([_p(f"{mat['name']} – Platte {i}/{len(mat['plaene'])} ({zahl(L, 0)} × {zahl(B, 0)} mm, "
                                       f"Ausnutzung {zahl(plan['ausnutzung'], 1)} %)", H2), d]))
    # Zuschnittliste
    zeilen = [["Material", "Nr", "Bauteil", "Möbel", "Länge", "Breite", "Stk"]]
    for zl in ergebnis["stueckliste"]:
        if zl["kaufteil"]:
            continue
        zeilen.append([_p(zl["material_name"], KLEIN), zl["nr"], zl["name"], zl["moebel_name"],
                       zahl(zl["zuschnitt_laenge"], 1), zahl(zl["zuschnitt_breite"], 1), zl["menge"]])
    zeilen[1:] = sorted(zeilen[1:], key=lambda r: (str(r[0].text), r[3], r[1]))
    t = Table(zeilen, colWidths=[70 * mm, 10 * mm, 50 * mm, 50 * mm, 20 * mm, 20 * mm, 12 * mm], repeatRows=1)
    t.setStyle(TABELLE)
    st += [_p("Zuschnittliste (Zuschnittmaße)", H2), t]
    doc.build(st, onFirstPage=_fusszeile(firma), onLaterPages=_fusszeile(firma))
    return buf.getvalue()


def kalkulation(projekt: dict, ergebnis: dict, vorgaben: dict) -> bytes:
    firma = vorgaben.get("firma", {})
    k = ergebnis["kalkulation"]
    buf = io.BytesIO()
    doc = _doc(buf, f"Kalkulation {projekt['name']}")
    st = [_p(f"Interne Kalkulation – {projekt['name']}", TITEL), _p(f"Stand {date.today().strftime('%d.%m.%Y')}", KLEIN)]
    zeilen = [["Gruppe", "Position", "Menge", "EP", "Gesamt"]]
    for p in k["positionen"]:
        zeilen.append([p["gruppe"], [_p(p["bezeichnung"], KLEIN), _p(p["herleitung"], KLEIN)],
                       f"{zahl(p['menge'])} {p['einheit']}", eur(p["einzelpreis"]), eur(p["gesamt"])])
    t = Table(zeilen, colWidths=[26 * mm, 90 * mm, 22 * mm, 20 * mm, 22 * mm], repeatRows=1)
    t.setStyle(TABELLE)
    t.setStyle(TableStyle([("ALIGN", (2, 0), (-1, -1), "RIGHT")]))
    st += [Spacer(1, 3 * mm), t, Spacer(1, 4 * mm)]
    s = [[g["gruppe"], eur(g["summe"])] for g in k["gruppen"]]
    s += [["Herstellkosten", eur(k["herstellkosten"])]]
    s += [[f"{z['bezeichnung']} {zahl(z['prozent'])} % auf {eur(z['basis'])}", eur(z["betrag"])] for z in k["zuschlaege"]]
    s += [["Netto", eur(k["netto"])], [f"MwSt. {zahl(k['mwst_prozent'])} %", eur(k["mwst"])], ["Brutto", eur(k["brutto"])]]
    ts = Table(s, colWidths=[100 * mm, 35 * mm], hAlign="RIGHT")
    ts.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 9), ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                            ("FONT", (0, -3), (-1, -3), "Helvetica-Bold", 9), ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 10),
                            ("LINEABOVE", (0, -3), (-1, -3), 0.6, colors.black)]))
    st.append(KeepTogether(ts))
    doc.build(st, onFirstPage=_fusszeile(firma), onLaterPages=_fusszeile(firma))
    return buf.getvalue()


def csv_stueckliste(ergebnis: dict) -> bytes:
    kopf = ["Möbel", "Nr", "Bauteil", "Gruppe", "Menge", "Material", "Länge", "Breite", "Stärke",
            "Zuschnitt Länge", "Zuschnitt Breite", "Faser", "Kante L1", "Kante L2", "Kante B1", "Kante B2", "Bearbeitung", "Kaufteil"]
    zeilen = [";".join(kopf)]
    for z in ergebnis["stueckliste"]:
        werte = [z["moebel_name"], z["nr"], z["name"], z["gruppe"], z["menge"], z["material_name"],
                 zahl(z["laenge"], 1), zahl(z["breite"], 1), zahl(z["staerke"], 1),
                 zahl(z["zuschnitt_laenge"], 1), zahl(z["zuschnitt_breite"], 1), "ja" if z["faser"] else "nein",
                 *[z["kanten_namen"].get(s, "") for s in ("L1", "L2", "B1", "B2")], z["bearbeitung"],
                 "ja" if z["kaufteil"] else "nein"]
        zeilen.append(";".join(str(w).replace(";", ",") for w in werte))
    return ("﻿" + "\r\n".join(zeilen)).encode("utf-8")


def csv_zuschnitt(ergebnis: dict) -> bytes:
    zeilen = ["Material;Platte;Nr;Bauteil;Möbel;Länge;Breite;X;Y;gedreht"]
    for mat in ergebnis["zuschnitt"]["materialien"]:
        for i, plan in enumerate(mat["plaene"], 1):
            for t in plan["teile"]:
                zeilen.append(";".join(str(v) for v in [mat["name"], i, t["nr"], t["name"], t["moebel_name"],
                                                       zahl(t["l"], 1), zahl(t["b"], 1), zahl(t["x"], 1), zahl(t["y"], 1),
                                                       "ja" if t["gedreht"] else "nein"]))
    return ("﻿" + "\r\n".join(zeilen)).encode("utf-8")


def zusammenfuegen(dateien: list[bytes]) -> bytes:
    """Mehrere PDFs (z. B. Angebot A4 + Zeichnungen A3) zu einer Datei verbinden."""
    from pypdf import PdfWriter, PdfReader
    w = PdfWriter()
    for d in dateien:
        for seite in PdfReader(io.BytesIO(d)).pages:
            w.add_page(seite)
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()
