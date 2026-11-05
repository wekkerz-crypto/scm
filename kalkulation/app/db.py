"""Lokale Datenhaltung: SQLite (Projekte, Einstellungen) + Dateiablage."""
from __future__ import annotations

import copy
import json
import os
import shutil
import sqlite3
import sys
import threading
import uuid
from datetime import date, datetime
from pathlib import Path

from . import defaults

def _standard_datenordner() -> Path:
    """Als .exe: Dokumente\\Tischlerei-Kalkulation, sonst kalkulation/daten im Projektordner."""
    if getattr(sys, "frozen", False):
        return Path.home() / "Documents" / "Tischlerei-Kalkulation"
    return Path(__file__).resolve().parent.parent / "daten"


DATEN = Path(os.environ.get("TISCHLEREI_DATEN") or _standard_datenordner())
_lock = threading.Lock()


def pfad(*teile) -> Path:
    p = DATEN.joinpath(*teile)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def projekt_ordner(pid: str) -> Path:
    p = DATEN / "projekte" / pid
    p.mkdir(parents=True, exist_ok=True)
    return p


def _verbindung() -> sqlite3.Connection:
    DATEN.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DATEN / "tischlerei.sqlite3")
    con.row_factory = sqlite3.Row
    return con


def init():
    with _lock, _verbindung() as con:
        con.executescript("""
            CREATE TABLE IF NOT EXISTS einstellungen (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS projekte (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, kunde TEXT NOT NULL DEFAULT '{}',
                datum TEXT, notizen TEXT DEFAULT '', ist_vorlage INTEGER DEFAULT 0,
                daten TEXT NOT NULL DEFAULT '{}', erstellt TEXT, geaendert TEXT);
        """)


def _ergaenzen(gespeichert, standard):
    """Neue Schlüssel aus den Startwerten ergänzen, ohne Nutzerwerte zu überschreiben."""
    if isinstance(gespeichert, dict) and isinstance(standard, dict):
        for k, v in standard.items():
            if k not in gespeichert:
                gespeichert[k] = copy.deepcopy(v)
            else:
                gespeichert[k] = _ergaenzen(gespeichert[k], v)
    return gespeichert


STANDARD = {"regeln": defaults.KONSTRUKTIONSREGELN, "vorgaben": defaults.VORGABEN, "geheim": {}}


def lade_einstellung(schluessel: str) -> dict:
    with _lock, _verbindung() as con:
        row = con.execute("SELECT wert FROM einstellungen WHERE schluessel=?", (schluessel,)).fetchone()
    standard = STANDARD.get(schluessel, {})
    if row is None:
        return copy.deepcopy(standard)
    return _ergaenzen(json.loads(row["wert"]), standard)


def speichere_einstellung(schluessel: str, wert: dict):
    with _lock, _verbindung() as con:
        con.execute("INSERT INTO einstellungen VALUES(?,?) ON CONFLICT(schluessel) DO UPDATE SET wert=excluded.wert",
                    (schluessel, json.dumps(wert, ensure_ascii=False)))


def _projekt(row) -> dict:
    return {
        "id": row["id"], "name": row["name"], "kunde": json.loads(row["kunde"] or "{}"),
        "datum": row["datum"], "notizen": row["notizen"] or "", "ist_vorlage": bool(row["ist_vorlage"]),
        "daten": json.loads(row["daten"] or "{}"), "erstellt": row["erstellt"], "geaendert": row["geaendert"],
    }


def projekte() -> list[dict]:
    with _lock, _verbindung() as con:
        rows = con.execute("SELECT * FROM projekte ORDER BY geaendert DESC").fetchall()
    out = []
    for r in rows:
        p = _projekt(r)
        p["moebel_anzahl"] = len(p["daten"].get("moebel", []))
        p["netto"] = p["daten"].get("letzter_netto")
        del p["daten"]
        out.append(p)
    return out


def projekt(pid: str) -> dict | None:
    with _lock, _verbindung() as con:
        row = con.execute("SELECT * FROM projekte WHERE id=?", (pid,)).fetchone()
    return _projekt(row) if row else None


def neues_projekt(name: str, kunde: dict | None = None, daten: dict | None = None, ist_vorlage=False) -> dict:
    pid = uuid.uuid4().hex[:12]
    jetzt = datetime.now().isoformat(timespec="seconds")
    with _lock, _verbindung() as con:
        con.execute("INSERT INTO projekte VALUES(?,?,?,?,?,?,?,?,?)",
                    (pid, name, json.dumps(kunde or {}, ensure_ascii=False), date.today().isoformat(), "",
                     int(ist_vorlage), json.dumps(daten or {}, ensure_ascii=False), jetzt, jetzt))
    projekt_ordner(pid)
    return projekt(pid)


def speichere_projekt(p: dict) -> dict:
    jetzt = datetime.now().isoformat(timespec="seconds")
    with _lock, _verbindung() as con:
        con.execute("""UPDATE projekte SET name=?, kunde=?, datum=?, notizen=?, ist_vorlage=?, daten=?, geaendert=?
                       WHERE id=?""",
                    (p["name"], json.dumps(p.get("kunde") or {}, ensure_ascii=False), p.get("datum"),
                     p.get("notizen", ""), int(bool(p.get("ist_vorlage"))),
                     json.dumps(p.get("daten") or {}, ensure_ascii=False), jetzt, p["id"]))
    return projekt(p["id"])


def loesche_projekt(pid: str):
    with _lock, _verbindung() as con:
        con.execute("DELETE FROM projekte WHERE id=?", (pid,))
    shutil.rmtree(DATEN / "projekte" / pid, ignore_errors=True)


def dupliziere_projekt(pid: str, name: str | None = None, ist_vorlage: bool = False) -> dict:
    alt = projekt(pid)
    daten = copy.deepcopy(alt["daten"])
    daten.pop("angebot", None) if ist_vorlage else None
    neu = neues_projekt(name or f"{alt['name']} (Kopie)", {} if ist_vorlage else alt["kunde"], daten, ist_vorlage)
    neu["notizen"] = alt["notizen"]
    speichere_projekt(neu)
    quelle = DATEN / "projekte" / pid
    if quelle.exists():
        shutil.copytree(quelle, DATEN / "projekte" / neu["id"], dirs_exist_ok=True)
    return projekt(neu["id"])
