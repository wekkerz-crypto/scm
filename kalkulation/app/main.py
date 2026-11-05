"""Tischlerei-Kalkulation – lokale Web-App (FastAPI).

Start:  python -m app            (oder ./start.sh)
Danach im Browser: http://localhost:8000 – im lokalen Netz über die angezeigte IP.
"""
from __future__ import annotations

import base64
import io
import re
import socket
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from . import bilder, cnc_export, db, ki, pdf
from .berechnung import berechne_projekt
from .modell import Moebel, beispiel_unterschrank

STATIC = Path(__file__).resolve().parent.parent / "static"
PORT = 8000

app = FastAPI(title="Tischlerei-Kalkulation")
db.init()


# ---------------------------------------------------------------------------- Hilfen
def _projekt_oder_404(pid: str) -> dict:
    p = db.projekt(pid)
    if not p:
        raise HTTPException(404, "Projekt nicht gefunden")
    return p


def _sicherer_name(name: str) -> str:
    name = Path(name).name
    if not re.fullmatch(r"[A-Za-z0-9_.\-]+", name) or name.startswith("."):
        raise HTTPException(400, "Ungültiger Dateiname")
    return name


def _berechne(p: dict) -> dict:
    try:
        return berechne_projekt(p["daten"], db.lade_einstellung("regeln"), db.lade_einstellung("vorgaben"))
    except ValidationError as e:
        raise HTTPException(422, f"Datenmodell ungültig: {e.errors()[0]['msg']}") from e


def _download(daten: bytes, dateiname: str, typ: str) -> Response:
    from urllib.parse import quote
    return Response(daten, media_type=typ,
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(dateiname)}"})


def lan_adressen() -> list[str]:
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.168.0.1", 1))  # es wird nichts gesendet
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


# ---------------------------------------------------------------------------- Einstellungen
@app.get("/api/regeln")
def get_regeln():
    return db.lade_einstellung("regeln")


@app.put("/api/regeln")
def put_regeln(regeln: dict = Body(...)):
    db.speichere_einstellung("regeln", regeln)
    return db.lade_einstellung("regeln")


@app.post("/api/regeln/zuruecksetzen")
def regeln_zuruecksetzen():
    from .defaults import KONSTRUKTIONSREGELN
    db.speichere_einstellung("regeln", KONSTRUKTIONSREGELN)
    return db.lade_einstellung("regeln")


@app.get("/api/vorgaben")
def get_vorgaben():
    return db.lade_einstellung("vorgaben")


@app.put("/api/vorgaben")
def put_vorgaben(vorgaben: dict = Body(...)):
    for liste in ("platten", "kanten", "artikel"):
        ids = [e.get("id") for e in vorgaben.get(liste, [])]
        if any(not i for i in ids) or len(ids) != len(set(ids)):
            raise HTTPException(400, f"Jede Position in '{liste}' braucht eine eindeutige ID.")
    db.speichere_einstellung("vorgaben", vorgaben)
    return db.lade_einstellung("vorgaben")


@app.get("/api/ki/status")
def ki_status():
    geheim = db.lade_einstellung("geheim")
    key = ki.api_schluessel(geheim)
    return {"konfiguriert": bool(key), "quelle": "einstellungen" if geheim.get("api_key") else ("umgebung" if key else None),
            "maske": (key[:7] + "…" + key[-4:]) if key else None}


@app.put("/api/ki/schluessel")
def ki_schluessel(daten: dict = Body(...)):
    geheim = db.lade_einstellung("geheim")
    geheim["api_key"] = (daten.get("api_key") or "").strip()
    db.speichere_einstellung("geheim", geheim)
    return ki_status()


@app.post("/api/firma/logo")
async def logo_hochladen(datei: UploadFile = File(...)):
    endung = Path(datei.filename or "logo.png").suffix.lower()
    if endung not in (".png", ".jpg", ".jpeg"):
        raise HTTPException(400, "Logo bitte als PNG oder JPG")
    name = f"logo{endung}"
    db.pfad("firma", name).write_bytes(await datei.read())
    v = db.lade_einstellung("vorgaben")
    v["firma"]["logo"] = name
    db.speichere_einstellung("vorgaben", v)
    return {"logo": name}


@app.get("/api/firma/logo")
def logo_holen():
    v = db.lade_einstellung("vorgaben")
    name = v["firma"].get("logo")
    if not name or not (db.DATEN / "firma" / name).exists():
        raise HTTPException(404)
    return FileResponse(db.DATEN / "firma" / name)


# ---------------------------------------------------------------------------- Texturen
@app.post("/api/texturen")
async def textur_hochladen(datei: UploadFile = File(...), punkte: str = Form(""), kachelbar: bool = Form(True)):
    import json
    roh = db.pfad("texturen", "roh", f"{uuid.uuid4().hex[:10]}.jpg")
    bilder.speichere_upload(await datei.read(), roh)
    name = f"tex_{uuid.uuid4().hex[:10]}.jpg"
    try:
        pkt = json.loads(punkte) if punkte else None
    except ValueError:
        pkt = None
    bilder.textur_erstellen(roh, db.pfad("texturen", name), pkt, kachelbar)
    return {"textur": name}


@app.get("/texturen/{name}")
def textur(name: str):
    datei = db.DATEN / "texturen" / _sicherer_name(name)
    if not datei.exists():
        raise HTTPException(404)
    return FileResponse(datei, headers={"Cache-Control": "max-age=86400"})


# ---------------------------------------------------------------------------- Projekte
@app.get("/api/projekte")
def liste():
    return db.projekte()


@app.post("/api/projekte")
def anlegen(daten: dict = Body(...)):
    vorlage = daten.get("vorlage_id")
    if vorlage:
        p = db.dupliziere_projekt(vorlage, daten.get("name") or "Neues Projekt")
        p["ist_vorlage"] = False
        return db.speichere_projekt(p)
    inhalt = {"moebel": [beispiel_unterschrank().model_dump()] if daten.get("beispiel") else []}
    return db.neues_projekt(daten.get("name") or "Neues Projekt", daten.get("kunde"), inhalt)


@app.get("/api/projekte/{pid}")
def holen(pid: str):
    return _projekt_oder_404(pid)


@app.put("/api/projekte/{pid}")
def speichern(pid: str, p: dict = Body(...)):
    alt = _projekt_oder_404(pid)
    p["id"] = pid
    p.setdefault("daten", alt["daten"])
    for m in p["daten"].get("moebel", []):
        try:
            Moebel.model_validate(m)
        except ValidationError as e:
            fehler = e.errors()[0]
            raise HTTPException(422, f"{'.'.join(map(str, fehler['loc']))}: {fehler['msg']}") from e
    try:
        p["daten"]["letzter_netto"] = berechne_projekt(p["daten"], db.lade_einstellung("regeln"),
                                                       db.lade_einstellung("vorgaben"))["kalkulation"]["netto"]
    except Exception:
        pass
    return db.speichere_projekt(p)


@app.delete("/api/projekte/{pid}")
def loeschen(pid: str):
    _projekt_oder_404(pid)
    db.loesche_projekt(pid)
    return {"ok": True}


@app.post("/api/projekte/{pid}/duplizieren")
def duplizieren(pid: str, daten: dict = Body(default={})):
    _projekt_oder_404(pid)
    return db.dupliziere_projekt(pid, daten.get("name"), bool(daten.get("als_vorlage")))


@app.get("/api/projekte/{pid}/berechnung")
def berechnung(pid: str):
    return _berechne(_projekt_oder_404(pid))


@app.post("/api/berechnen")
def berechnen_vorschau(daten: dict = Body(...)):
    """Berechnung für ungespeicherte Änderungen (Live-Vorschau im Editor)."""
    return _berechne({"daten": daten})


@app.get("/api/moebel/neu")
def neues_moebel():
    return Moebel().model_dump()


# ---------------------------------------------------------------------------- Dateien / Skizzen
@app.get("/api/projekte/{pid}/dateien/{unterordner}/{name}")
def datei(pid: str, unterordner: str, name: str):
    if unterordner not in ("skizzen", "renders"):
        raise HTTPException(404)
    pfad = db.projekt_ordner(pid) / unterordner / _sicherer_name(name)
    if not pfad.exists():
        raise HTTPException(404)
    return FileResponse(pfad, headers={"Cache-Control": "no-cache"})


@app.post("/api/projekte/{pid}/skizzen")
async def skizzen_hochladen(pid: str, dateien: list[UploadFile] = File(...)):
    p = _projekt_oder_404(pid)
    skizzen = p["daten"].setdefault("skizzen", [])
    for d in dateien:
        name = f"skizze_{datetime.now():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:4]}.jpg"
        try:
            bilder.speichere_upload(await d.read(), db.projekt_ordner(pid) / "skizzen" / name)
        except Exception as e:
            raise HTTPException(400, f"Bild konnte nicht gelesen werden: {d.filename}") from e
        skizzen.append({"datei": name, "original": d.filename, "zeit": datetime.now().isoformat(timespec="seconds"), "aktiv": True})
    db.speichere_projekt(p)
    return skizzen


@app.post("/api/projekte/{pid}/skizzen/{name}/bearbeiten")
def skizze_bearbeiten(pid: str, name: str, daten: dict = Body(...)):
    _projekt_oder_404(pid)
    pfad = db.projekt_ordner(pid) / "skizzen" / _sicherer_name(name)
    if not pfad.exists():
        raise HTTPException(404)
    bilder.bearbeite_skizze(pfad, daten.get("aktion", ""), daten.get("box"))
    return {"ok": True}


@app.delete("/api/projekte/{pid}/skizzen/{name}")
def skizze_loeschen(pid: str, name: str):
    p = _projekt_oder_404(pid)
    name = _sicherer_name(name)
    p["daten"]["skizzen"] = [s for s in p["daten"].get("skizzen", []) if s["datei"] != name]
    (db.projekt_ordner(pid) / "skizzen" / name).unlink(missing_ok=True)
    db.speichere_projekt(p)
    return p["daten"]["skizzen"]


# ---------------------------------------------------------------------------- KI
@app.post("/api/projekte/{pid}/analyse")
def analyse(pid: str, daten: dict = Body(default={})):
    p = _projekt_oder_404(pid)
    skizzen = [s for s in p["daten"].get("skizzen", []) if s.get("aktiv", True)]
    pfade = [db.projekt_ordner(pid) / "skizzen" / s["datei"] for s in skizzen]
    vorher = p["daten"].get("ki_analyse") if daten.get("antworten") else None
    try:
        erg = ki.analysiere(pfade, db.lade_einstellung("regeln"), db.lade_einstellung("vorgaben"),
                            db.lade_einstellung("geheim"), daten.get("hinweis", ""), vorher, daten.get("antworten"))
    except ki.KIFehler as e:
        raise HTTPException(502, str(e)) from e
    erg["zeit"] = datetime.now().isoformat(timespec="seconds")
    p["daten"]["ki_analyse"] = erg
    db.speichere_projekt(p)
    return erg


@app.post("/api/projekte/{pid}/analyse/uebernehmen")
def analyse_uebernehmen(pid: str, daten: dict = Body(default={})):
    """Antworten auf Rückfragen in das KI-Ergebnis eintragen und als Möbel übernehmen."""
    p = _projekt_oder_404(pid)
    erg = p["daten"].get("ki_analyse")
    if not erg:
        raise HTTPException(400, "Keine Analyse vorhanden")
    for feld, wert in (daten.get("antworten") or {}).items():
        try:
            ki.setze_pfad(erg, feld, wert)
        except (KeyError, IndexError, ValueError, TypeError):
            raise HTTPException(400, f"Feld '{feld}' konnte nicht gesetzt werden")
    try:
        neue = [ki.bereinige_moebel(m) for m in erg.get("moebel", [])]
    except ValidationError as e:
        fehler = e.errors()[0]
        raise HTTPException(422, f"{'.'.join(map(str, fehler['loc']))}: {fehler['msg']}") from e
    if daten.get("modus") == "anhaengen":
        p["daten"]["moebel"] = p["daten"].get("moebel", []) + neue
    else:
        p["daten"]["moebel"] = neue
    erg["uebernommen"] = datetime.now().isoformat(timespec="seconds")
    return speichern(pid, p)


@app.post("/api/projekte/{pid}/angebotstext")
def angebotstext(pid: str, daten: dict = Body(default={})):
    p = _projekt_oder_404(pid)
    erg = _berechne(p)
    vorgaben = db.lade_einstellung("vorgaben")
    geheim = db.lade_einstellung("geheim")
    if daten.get("ohne_ki") or not ki.api_schluessel(geheim):
        return {"text": ki.angebotstext_vorlage(p, erg, vorgaben), "quelle": "vorlage"}
    try:
        return {"text": ki.angebotstext(p, erg, vorgaben, geheim), "quelle": "ki"}
    except ki.KIFehler as e:
        raise HTTPException(502, str(e)) from e


# ---------------------------------------------------------------------------- Rendering
@app.post("/api/projekte/{pid}/render")
def render_speichern(pid: str, daten: dict = Body(...)):
    p = _projekt_oder_404(pid)
    url = daten.get("bild", "")
    if not url.startswith("data:image/png;base64,"):
        raise HTTPException(400, "PNG als Data-URL erwartet")
    name = "angebot.png"
    (db.projekt_ordner(pid) / "renders").mkdir(exist_ok=True)
    (db.projekt_ordner(pid) / "renders" / name).write_bytes(base64.b64decode(url.split(",", 1)[1]))
    p["daten"].setdefault("angebot", {})["render"] = name
    db.speichere_projekt(p)
    return {"render": name}


# ---------------------------------------------------------------------------- Exporte
@app.get("/api/projekte/{pid}/export/{art}")
def export(pid: str, art: str):
    p = _projekt_oder_404(pid)
    erg = _berechne(p)
    vorgaben = db.lade_einstellung("vorgaben")
    basis = re.sub(r"[^\wÄÖÜäöüß\- ]+", "", p["name"]).strip().replace(" ", "_") or "Projekt"
    if art == "angebot.pdf":
        logo = db.DATEN / "firma" / vorgaben["firma"]["logo"] if vorgaben["firma"].get("logo") else None
        render = p["daten"].get("angebot", {}).get("render")
        rpfad = db.projekt_ordner(pid) / "renders" / render if render else None
        return _download(pdf.angebot(p, erg, vorgaben, logo, rpfad), f"Angebot_{basis}.pdf", "application/pdf")
    if art == "stueckliste.pdf":
        return _download(pdf.stueckliste(p, erg, vorgaben), f"Stueckliste_{basis}.pdf", "application/pdf")
    if art == "zuschnitt.pdf":
        return _download(pdf.zuschnitt(p, erg, vorgaben), f"Zuschnitt_{basis}.pdf", "application/pdf")
    if art == "kalkulation.pdf":
        return _download(pdf.kalkulation(p, erg, vorgaben), f"Kalkulation_{basis}.pdf", "application/pdf")
    if art == "stueckliste.csv":
        return _download(pdf.csv_stueckliste(erg), f"Stueckliste_{basis}.csv", "text/csv; charset=utf-8")
    if art == "zuschnitt.csv":
        return _download(pdf.csv_zuschnitt(erg), f"Zuschnitt_{basis}.csv", "text/csv; charset=utf-8")
    if art == "modell.step":
        from .step_export import export_step
        return _download(export_step(p["name"], erg["moebel"], vorgaben), f"{basis}.step", "application/step")
    if art == "cnc.zip":
        return _download(cnc_export.export_zip(erg["moebel"], vorgaben), f"CNC_{basis}.zip", "application/zip")
    raise HTTPException(404, "Unbekannter Export")


@app.get("/api/sicherung")
def sicherung():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in db.DATEN.rglob("*"):
            if f.is_file():
                z.write(f, f.relative_to(db.DATEN))
    return _download(buf.getvalue(), f"Sicherung_Tischlerei_{datetime.now():%Y-%m-%d_%H%M}.zip", "application/zip")


# ---------------------------------------------------------------------------- Netzwerk / QR
@app.get("/api/netz")
def netz():
    return {"adressen": [f"http://{ip}:{PORT}" for ip in lan_adressen()], "port": PORT}


@app.get("/api/qr.svg")
def qr(text: str):
    import segno
    buf = io.BytesIO()
    segno.make(text, error="m").save(buf, kind="svg", scale=6, border=2)
    return Response(buf.getvalue(), media_type="image/svg+xml")


# ---------------------------------------------------------------------------- Frontend
@app.get("/upload/{pid}", response_class=HTMLResponse)
def upload_seite(pid: str):
    return (STATIC / "upload.html").read_text(encoding="utf-8")


@app.get("/", response_class=HTMLResponse)
def index():
    return (STATIC / "index.html").read_text(encoding="utf-8")


app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.exception_handler(Exception)
async def fehler(request, exc):
    return JSONResponse({"detail": f"Interner Fehler: {exc}"}, status_code=500)
