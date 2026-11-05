"""STEP-AP242-Export direkt über OpenCascade (OCP).

Jedes Bauteil wird als echter B-Rep-Volumenkörper erzeugt (inkl. Nuten/Falze),
mit Bauteilname und Materialfarbe. Struktur: Projekt → Möbel → Baugruppe
(Korpus, Rückwand, Sockel, Einlegeböden, Fronten) → Bauteil.
"""
from __future__ import annotations

import os
import tempfile

from .generator import GRUPPEN


def _farbe(hexwert: str | None):
    from OCP.Quantity import Quantity_Color, Quantity_TypeOfColor
    h = (hexwert or "#cccccc").lstrip("#")
    try:
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except ValueError:
        r = g = b = 0.8
    return Quantity_Color(r, g, b, Quantity_TypeOfColor.Quantity_TOC_sRGB)


def _quader(x0, y0, z0, dx, dy, dz):
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
    from OCP.gp import gp_Pnt
    return BRepPrimAPI_MakeBox(gp_Pnt(x0, y0, z0), dx, dy, dz).Shape()


def koerper(t: dict, versatz_x: float = 0.0):
    """Bauteil als Volumenkörper, Nuten/Falze abgezogen."""
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
    x, y, z = t["pos"]
    form = _quader(x + versatz_x, y, z, *t["dim"])
    for a in t.get("aussparungen", []):
        schnitt = BRepAlgoAPI_Cut(form, _quader(a[0] + versatz_x, a[1], a[2], a[3] - a[0], a[4] - a[1], a[5] - a[2]))
        schnitt.Build()
        if schnitt.IsDone():
            form = schnitt.Shape()
    return form


def export_step(projektname: str, ergebnisse: list[dict], vorgaben: dict) -> bytes:
    from OCP.IFSelect import IFSelect_ReturnStatus
    from OCP.Message import Message, Message_Gravity
    from OCP.Interface import Interface_Static
    from OCP.STEPCAFControl import STEPCAFControl_Controller, STEPCAFControl_Writer
    from OCP.STEPControl import STEPControl_Controller, STEPControl_StepModelType
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.TDataStd import TDataStd_Name
    from OCP.TDocStd import TDocStd_Document
    from OCP.TopLoc import TopLoc_Location
    from OCP.XCAFApp import XCAFApp_Application
    from OCP.XCAFDoc import XCAFDoc_ColorType, XCAFDoc_DocumentTool

    platten = {p["id"]: p for p in vorgaben.get("platten", [])}
    app = XCAFApp_Application.GetApplication_s()
    doc = TDocStd_Document(TCollection_ExtendedString("XmlXCAF"))
    app.InitDocument(doc)
    formen = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    farben = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())

    def name(label, text):
        TDataStd_Name.Set_s(label, TCollection_ExtendedString(text))

    wurzel = formen.NewShape()
    name(wurzel, projektname or "Projekt")
    versatz = 0.0
    for erg in ergebnisse:
        moebel = formen.NewShape()
        name(moebel, erg["bezeichnung"])
        for g in GRUPPEN:
            teile = [t for t in erg["bauteile"] if t["gruppe"] == g]
            if not teile:
                continue
            gruppe = formen.NewShape()
            name(gruppe, g)
            for t in teile:
                teil = formen.AddShape(koerper(t, versatz), False)
                name(teil, t["name"])
                farben.SetColor(teil, _farbe(platten.get(t["material"], {}).get("farbe")), XCAFDoc_ColorType.XCAFDoc_ColorGen)
                formen.AddComponent(gruppe, teil, TopLoc_Location())
            formen.AddComponent(moebel, gruppe, TopLoc_Location())
        formen.AddComponent(wurzel, moebel, TopLoc_Location())
        versatz += erg["masse"]["breite"] + 200
    formen.UpdateAssemblies()

    for ausgabe in Message.DefaultMessenger_s().Printers():  # OCCT-Statistik nicht in die Konsole
        ausgabe.SetTraceLevel(Message_Gravity.Message_Fail)
    # Erst Controller initialisieren (setzt Standardwerte), dann AP242 wählen
    STEPCAFControl_Controller.Init_s()
    STEPControl_Controller.Init_s()
    Interface_Static.SetCVal_s("write.step.schema", "AP242DIS")
    Interface_Static.SetIVal_s("write.surfacecurve.mode", 1)
    Interface_Static.SetCVal_s("write.step.unit", "MM")
    writer = STEPCAFControl_Writer()
    writer.SetColorMode(True)
    writer.SetNameMode(True)
    writer.SetLayerMode(True)
    writer.Transfer(doc, STEPControl_StepModelType.STEPControl_AsIs)
    with tempfile.TemporaryDirectory() as tmp:
        datei = os.path.join(tmp, "modell.step")
        if writer.Write(datei) != IFSelect_ReturnStatus.IFSelect_RetDone:
            raise RuntimeError("STEP-Datei konnte nicht geschrieben werden")
        with open(datei, "rb") as f:
            return _iso10303_21_unicode(f.read())


def _iso10303_21_unicode(daten: bytes) -> bytes:
    """Nicht-ASCII-Zeichen (Umlaute in Bauteilnamen) normgerecht als \\X2\\HHHH\\X0\\ kodieren.

    OpenCascade schreibt Namen als rohes UTF-8 (teils doppelt kodiert); beides wird hier
    korrigiert, sodass die Datei reines ASCII nach ISO 10303-21 ist.
    """
    if daten.isascii():
        return daten
    text = daten.decode("utf-8", errors="replace")
    out = []
    i = 0
    while i < len(text):
        if ord(text[i]) < 128:
            out.append(text[i])
            i += 1
            continue
        j = i
        while j < len(text) and ord(text[j]) >= 128:
            j += 1
        stueck = text[i:j]
        try:  # doppelt kodiertes UTF-8 („Ã¼“ → „ü“) zurückführen
            stueck = stueck.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        out.append("\\X2\\" + "".join(f"{ord(c):04X}" for c in stueck if ord(c) <= 0xFFFF) + "\\X0\\")
        i = j
    return "".join(out).encode("ascii")
