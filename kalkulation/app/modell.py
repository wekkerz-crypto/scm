"""Datenmodell eines Möbels.

Die KI erzeugt (und der Nutzer bearbeitet) ausschließlich diese Beschreibung.
Daraus baut generator.py deterministisch die Bauteile auf.

Koordinaten (mm): x = Breite (links → rechts), y = Tiefe (vorne → hinten,
0 = Vorderkante Korpus), z = Höhe (0 = Fußboden).
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

FrontArt = Literal["tuer", "doppeltuer", "schubkasten", "klappe", "offen"]


class Bereich(BaseModel):
    """Ein Fach innerhalb einer Spalte (von unten nach oben gezählt).

    Bereiche einer Spalte werden durch konstruktive Zwischenböden getrennt.
    """
    hoehe: Optional[float] = Field(None, description="Lichte Höhe in mm, leer = automatisch aufteilen")
    front: FrontArt = "tuer"
    anschlag: Literal["links", "rechts"] = "links"
    schubkasten_anzahl: int = Field(1, ge=1, le=12)
    fachboeden: int = Field(0, ge=0, le=20, description="Anzahl Einlegeböden")
    glas: bool = False
    griff: bool = True


class Spalte(BaseModel):
    breite: Optional[float] = Field(None, description="Lichte Breite in mm, leer = automatisch")
    bereiche: list[Bereich] = Field(default_factory=lambda: [Bereich()])


class Zusatzposition(BaseModel):
    artikel_id: str
    menge: float = 1
    hinweis: str = ""


class BauteilOverride(BaseModel):
    name: Optional[str] = None
    material: Optional[str] = None
    kanten: Optional[dict[str, Optional[str]]] = None  # L1/L2/B1/B2 → Kanten-ID oder None


class Moebel(BaseModel):
    bezeichnung: str = "Unterschrank"
    breite: float = Field(600, gt=50, le=6000, description="Außenbreite inkl. Sichtseiten, ohne Passblenden")
    hoehe: float = Field(800, gt=50, le=3500, description="Gesamthöhe inkl. Sockel und Abdeckplatte")
    tiefe: float = Field(560, gt=50, le=1500, description="Korpustiefe ohne Front")
    anzahl: int = Field(1, ge=1, le=100)
    # Materialien (None = Standard aus den Konstruktionsregeln)
    material_korpus: Optional[str] = None
    material_rueckwand: Optional[str] = None
    material_front: Optional[str] = None
    material_fachboden: Optional[str] = None
    material_sichtseite: Optional[str] = None
    # Abweichungen von den Konstruktionsregeln (None = Regel)
    bauweise: Optional[Literal["seiten_durchgehend", "boeden_durchgehend", "oberboden_aufliegend"]] = None
    rueckwand_art: Optional[Literal["genutet", "gefaelzt", "aufgesetzt", "keine"]] = None
    sockel_art: Optional[Literal["blende", "fuesse", "keiner"]] = None
    sockel_hoehe: Optional[float] = None
    front_aufschlag: Optional[Literal["aufliegend", "eingelegt"]] = None
    # Seitliche Abschlüsse: Sichtseite (aufgedoppelt), Passblende (Nische, bündig) oder keine (z. B. Nachbarschrank)
    abschluss_links: Optional[Literal["sichtseite", "passblende", "keine"]] = None
    abschluss_rechts: Optional[Literal["sichtseite", "passblende", "keine"]] = None
    passblende_links: Optional[float] = Field(None, ge=0, le=300, description="Breite Passblende links in mm")
    passblende_rechts: Optional[float] = Field(None, ge=0, le=300, description="Breite Passblende rechts in mm")
    abdeckplatte: Optional[bool] = None
    spalten: list[Spalte] = Field(default_factory=lambda: [Spalte()])
    zusatzpositionen: list[Zusatzposition] = Field(default_factory=list)
    besonderheiten: str = ""
    bauteil_overrides: dict[str, BauteilOverride] = Field(default_factory=dict)


def beispiel_unterschrank() -> Moebel:
    """Testmöbel aus dem Konzept: Unterschrank mit Tür und Fachboden."""
    return Moebel(
        bezeichnung="Unterschrank mit Tür",
        breite=600, hoehe=820, tiefe=560,
        spalten=[Spalte(bereiche=[Bereich(front="tuer", anschlag="rechts", fachboeden=1)])],
    )
