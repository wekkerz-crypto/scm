"""KI-Funktionen über die Anthropic API (Claude): Skizzenanalyse, Rückfragen, Angebotstext.

Die KI erzeugt kein 3D, sondern ausschließlich das Datenmodell (modell.Moebel)
als JSON. Fehlende/unklare Maße kommen als Rückfragen mit Vorschlag zurück.
"""
from __future__ import annotations

import base64
import io
import json
import os
from pathlib import Path

from .modell import Moebel

FALLBACK_BETA = "server-side-fallback-2026-07-01"

_NUM_NULL = {"type": ["number", "null"]}
_STR_NULL = {"type": ["string", "null"]}


def _enum_null(*werte):
    return {"anyOf": [{"type": "string", "enum": list(werte)}, {"type": "null"}]}


def _obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


BEREICH = _obj({
    "hoehe": _NUM_NULL,
    "front": {"type": "string", "enum": ["tuer", "doppeltuer", "schubkasten", "klappe", "offen"]},
    "anschlag": {"type": "string", "enum": ["links", "rechts"]},
    "schubkasten_anzahl": {"type": "integer"},
    "fachboeden": {"type": "integer"},
    "glas": {"type": "boolean"},
    "griff": {"type": "boolean"},
})
MOEBEL = _obj({
    "bezeichnung": {"type": "string"},
    "breite": {"type": "number"},
    "hoehe": {"type": "number"},
    "tiefe": {"type": "number"},
    "anzahl": {"type": "integer"},
    "material_korpus": _STR_NULL,
    "material_rueckwand": _STR_NULL,
    "material_front": _STR_NULL,
    "material_fachboden": _STR_NULL,
    "bauweise": _enum_null("seiten_durchgehend", "boeden_durchgehend", "oberboden_aufliegend"),
    "rueckwand_art": _enum_null("genutet", "gefaelzt", "aufgesetzt", "keine"),
    "sockel_art": _enum_null("blende", "fuesse", "keiner"),
    "sockel_hoehe": _NUM_NULL,
    "front_aufschlag": _enum_null("aufliegend", "eingelegt"),
    "spalten": {"type": "array", "items": _obj({"breite": _NUM_NULL, "bereiche": {"type": "array", "items": BEREICH}})},
    "zusatzpositionen": {"type": "array", "items": _obj({
        "artikel_id": {"type": "string"}, "menge": {"type": "number"}, "hinweis": {"type": "string"}})},
    "besonderheiten": {"type": "string"},
})
ANALYSE_SCHEMA = _obj({
    "erkannt": {"type": "string"},
    "moebel": {"type": "array", "items": MOEBEL},
    "rueckfragen": {"type": "array", "items": _obj({
        "id": {"type": "string"},
        "frage": {"type": "string"},
        "feld": {"type": "string"},
        "vorschlag": {"type": "string"},
        "typ": {"type": "string", "enum": ["zahl", "text", "auswahl"]},
        "optionen": {"type": "array", "items": {"type": "string"}},
    })},
})

MODELL_BESCHREIBUNG = """\
Datenmodell eines Möbels (alle Maße in mm):
- breite, hoehe (Gesamthöhe INKL. Sockel), tiefe (Korpustiefe OHNE Front), anzahl (Stückzahl gleicher Möbel)
- material_* : ID aus der Materialliste oder null (= Standard aus den Konstruktionsregeln)
- bauweise, rueckwand_art, sockel_art, sockel_hoehe, front_aufschlag: null = Konstruktionsregel verwenden.
  Nur setzen, wenn die Skizze ausdrücklich etwas anderes zeigt.
- spalten: von links nach rechts, getrennt durch Mittelwände. breite = lichte Breite oder null (automatisch).
  - bereiche: von UNTEN nach OBEN, getrennt durch konstruktive Zwischenböden. hoehe = lichte Höhe oder null (automatisch).
    front: tuer | doppeltuer | schubkasten | klappe | offen; anschlag: links|rechts (Scharnierseite bei tuer);
    schubkasten_anzahl: Anzahl gleich hoher Schubkästen übereinander im Bereich;
    fachboeden: Anzahl Einlegeböden; glas: Glasfront; griff: Griff vorhanden.
- zusatzpositionen: zusätzliche Artikel aus der Artikelliste (artikel_id, menge, hinweis), z. B. Lichtset.
- besonderheiten: alles, was das Modell nicht abbilden kann (kurz, für Angebot und Werkstatt).
Bauteile (Seiten, Böden, Rückwand, Sockel, Fronten, Beschläge) werden später automatisch nach den
Konstruktionsregeln erzeugt – beschreibe NUR die Struktur, keine Einzelteile."""

SYSTEM = """\
Du bist ein erfahrener Tischlermeister und Konstrukteur. Du liest Handskizzen von Möbeln (meist Front-,
Seiten- und Draufsicht mit Maßen und kurzen Hinweisen) und überträgst sie exakt in ein strukturiertes
Datenmodell. Du arbeitest nach den Konstruktionsregeln der Werkstatt, nicht nach eigenen Annahmen.

Wichtig:
- Rate keine Maße. Wenn ein Maß fehlt, unleserlich oder widersprüchlich ist, setze im Modell den
  plausibelsten Standardwert ein UND stelle eine konkrete Rückfrage dazu, z. B.
  „Tiefe des Korpus nicht erkennbar – 560 mm übernehmen?“. Der Vorschlag steht im Feld „vorschlag“.
- „feld“ einer Rückfrage ist der Punkt-Pfad zum Wert im Ergebnis, z. B. „moebel.0.tiefe“ oder
  „moebel.0.spalten.1.bereiche.0.hoehe“. typ „zahl“ für Maße, „auswahl“ mit „optionen“ für Auswahlfelder.
- Stelle nur Rückfragen, die das Ergebnis wirklich verändern. Keine Rückfrage zu Werten, die eindeutig sind.
- Summen prüfen: Spaltenbreiten + Mittelwände + Seiten müssen zur Gesamtbreite passen, Fachhöhen zur Höhe.
  Bei Widerspruch Rückfrage stellen.
- „erkannt“: 2–4 Sätze, was du in der Skizze erkannt hast (auf Deutsch).
- Antworte ausschließlich mit dem JSON gemäß Schema.
"""


class KIFehler(Exception):
    pass


def api_schluessel(geheim: dict) -> str | None:
    return (geheim or {}).get("api_key") or os.environ.get("ANTHROPIC_API_KEY") or None


def _client(geheim: dict):
    import anthropic
    key = api_schluessel(geheim)
    try:
        return anthropic.Anthropic(api_key=key) if key else anthropic.Anthropic()
    except anthropic.AnthropicError as e:
        raise KIFehler("Kein API-Schlüssel hinterlegt – bitte unter Vorgaben → KI eintragen.") from e


def bild_block(datei: Path, max_kante: int = 1568) -> dict:
    """Bild verkleinern (spart Tokens, max. sinnvolle Auflösung) und als Base64-Block liefern."""
    from PIL import Image, ImageOps
    with Image.open(datei) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((max_kante, max_kante))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=88)
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                        "data": base64.standard_b64encode(buf.getvalue()).decode()}}


def _kontext(regeln: dict, vorgaben: dict) -> str:
    regeln_ohne_text = {k: v for k, v in regeln.items() if k != "weitere_regeln"}
    materialien = [{"id": p["id"], "name": p["name"], "staerke": p["staerke"]} for p in vorgaben.get("platten", [])]
    artikel = [{"id": a["id"], "name": a["name"], "einheit": a["einheit"], "kategorie": a.get("kategorie")}
               for a in vorgaben.get("artikel", []) if not a.get("rolle")]
    teile = [
        "## Konstruktionsregeln der Werkstatt",
        json.dumps(regeln_ohne_text, ensure_ascii=False, indent=1),
    ]
    if regeln.get("weitere_regeln"):
        teile += ["## Weitere Regeln (vom Tischlermeister)", regeln["weitere_regeln"]]
    teile += [
        "## Materialliste (IDs für material_*)", json.dumps(materialien, ensure_ascii=False),
        "## Zusatzartikel (IDs für zusatzpositionen; Standardbeschläge wie Scharniere, Schubkästen, "
        "Griffe, Sockelfüße und Fachbodenträger werden automatisch ergänzt)",
        json.dumps(artikel, ensure_ascii=False),
        "## Datenmodell", MODELL_BESCHREIBUNG,
    ]
    return "\n\n".join(teile)


def _anfrage(client, ki: dict, system, messages, max_tokens=16000, schema=None, aufwand=None):
    import anthropic
    params = dict(
        model=ki.get("modell") or "claude-opus-5-5",
        max_tokens=max_tokens,
        system=system,
        messages=messages,
        thinking={"type": "adaptive"},
        output_config={"effort": aufwand or ki.get("aufwand") or "high",
                       **({"format": {"type": "json_schema", "schema": schema}} if schema else {})},
    )
    try:
        # Server-seitiger Fallback auf ein anderes Modell, falls die Anfrage abgelehnt wird
        antwort = client.beta.messages.create(betas=[FALLBACK_BETA], fallbacks="default", **params)
    except anthropic.BadRequestError:
        antwort = client.messages.create(**params)
    except anthropic.AuthenticationError as e:
        raise KIFehler("API-Schlüssel ungültig oder nicht hinterlegt (Vorgaben → KI).") from e
    except anthropic.RateLimitError as e:
        raise KIFehler("Zu viele Anfragen – bitte kurz warten und erneut versuchen.") from e
    except anthropic.APIConnectionError as e:
        raise KIFehler("Keine Verbindung zur Anthropic API (Internet prüfen).") from e
    except anthropic.APIStatusError as e:
        raise KIFehler(f"Fehler der Anthropic API ({e.status_code}): {e.message}") from e
    except TypeError as e:  # keine Zugangsdaten auflösbar
        raise KIFehler("Kein API-Schlüssel hinterlegt – bitte unter Vorgaben → KI eintragen.") from e
    if antwort.stop_reason == "refusal":
        raise KIFehler("Die Anfrage wurde vom Modell abgelehnt.")
    if antwort.stop_reason == "max_tokens":
        raise KIFehler("Antwort wurde abgeschnitten (max_tokens). Bitte weniger Skizzen pro Analyse verwenden.")
    text = "".join(b.text for b in antwort.content if getattr(b, "type", "") == "text")
    return text


def analysiere(bilder: list[Path], regeln: dict, vorgaben: dict, geheim: dict,
               hinweis: str = "", vorheriges: dict | None = None, antworten: list[dict] | None = None) -> dict:
    if not bilder:
        raise KIFehler("Keine Skizze vorhanden.")
    ki = vorgaben.get("ki", {})
    client = _client(geheim)
    system = [{"type": "text", "text": SYSTEM}, {"type": "text", "text": _kontext(regeln, vorgaben),
                                                  "cache_control": {"type": "ephemeral"}}]
    inhalt = [bild_block(b) for b in bilder]
    text = f"Analysiere die {len(bilder)} Skizze(n) und erstelle das Datenmodell."
    if hinweis:
        text += f"\n\nHinweis des Tischlers: {hinweis}"
    if vorheriges:
        text += ("\n\nDein bisheriges Ergebnis:\n" + json.dumps(vorheriges, ensure_ascii=False) +
                 "\n\nAntworten des Tischlers auf deine Rückfragen:\n" +
                 json.dumps(antworten or [], ensure_ascii=False) +
                 "\n\nÜbernimm die Antworten, prüfe das Modell erneut und stelle nur noch offene Rückfragen.")
    inhalt.append({"type": "text", "text": text})
    roh = _anfrage(client, ki, system, [{"role": "user", "content": inhalt}], schema=ANALYSE_SCHEMA)
    try:
        ergebnis = json.loads(roh)
    except json.JSONDecodeError as e:
        raise KIFehler("Antwort der KI war kein gültiges JSON.") from e
    ergebnis["moebel"] = [bereinige_moebel(m) for m in ergebnis.get("moebel", [])]
    return ergebnis


def bereinige_moebel(m: dict) -> dict:
    """Werte in gültige Bereiche bringen und über das Datenmodell validieren."""
    m = {k: v for k, v in m.items() if v is not None}
    for sp in m.get("spalten", []):
        for b in sp.get("bereiche", []):
            b["schubkasten_anzahl"] = min(12, max(1, int(b.get("schubkasten_anzahl") or 1)))
            b["fachboeden"] = min(20, max(0, int(b.get("fachboeden") or 0)))
        if not sp.get("bereiche"):
            sp["bereiche"] = [{}]
    if not m.get("spalten"):
        m["spalten"] = [{}]
    m["anzahl"] = max(1, int(m.get("anzahl") or 1))
    return Moebel.model_validate(m).model_dump()


def setze_pfad(daten: dict, pfad: str, wert):
    teile = pfad.split(".")
    ziel = daten
    for t in teile[:-1]:
        ziel = ziel[int(t)] if isinstance(ziel, list) else ziel.setdefault(t, {})
    letzter = teile[-1]
    if isinstance(ziel, list):
        ziel[int(letzter)] = wert
    else:
        ziel[letzter] = wert


def angebotstext(projekt: dict, ergebnis: dict, vorgaben: dict, geheim: dict) -> str:
    ki = vorgaben.get("ki", {})
    platten = {p["id"]: p["name"] for p in vorgaben.get("platten", [])}
    beschreibung = []
    for m, e in zip(projekt["daten"].get("moebel", []), ergebnis["moebel"]):
        materialien = sorted({platten.get(t["material"], t["material"]) for t in e["bauteile"]})
        fronten = [t["name"] for t in e["bauteile"] if t["gruppe"] == "Fronten"]
        beschreibung.append({
            "bezeichnung": m.get("bezeichnung"), "anzahl": m.get("anzahl", 1),
            "masse_mm": f"{m.get('breite'):g} × {m.get('hoehe'):g} × {m.get('tiefe'):g} (B × H × T)",
            "materialien": materialien, "fronten": fronten,
            "einlegeboeden": sum(1 for t in e["bauteile"] if t["rolle"] == "fachboden"),
            "beschlaege": e["beschlaege"], "zusatz": e.get("zusatzpositionen"),
            "besonderheiten": m.get("besonderheiten"),
        })
    prompt = (
        "Schreibe einen Angebotstext für eine Tischlerei (Deutsch, Sie-Form, sachlich-freundlich, "
        "ohne Preise, ohne Anrede und ohne Grußformel – nur die Leistungsbeschreibung). Beschreibe je Möbel "
        "kurz Aufbau, Maße, Materialien, Fronten, Ausstattung und Besonderheiten verständlich für Endkunden. "
        "Nutze kurze Absätze bzw. Aufzählungen mit „–“, kein Markdown.\n\n"
        f"Projekt: {projekt['name']}\nNotizen: {projekt.get('notizen', '')}\n\n"
        + json.dumps(beschreibung, ensure_ascii=False, indent=1)
    )
    client = _client(geheim)
    return _anfrage(client, ki, "Du bist ein Tischlermeister und schreibst Angebote.",
                    [{"role": "user", "content": prompt}], max_tokens=8000, aufwand="medium").strip()


def angebotstext_vorlage(projekt: dict, ergebnis: dict, vorgaben: dict) -> str:
    """Einfacher Angebotstext ohne KI (Fallback, wenn kein API-Schlüssel hinterlegt ist)."""
    platten = {p["id"]: p["name"] for p in vorgaben.get("platten", [])}
    zeilen = []
    for m, e in zip(projekt["daten"].get("moebel", []), ergebnis["moebel"]):
        anz = m.get("anzahl", 1)
        zeilen.append(f"{anz} × {m.get('bezeichnung')} – Außenmaße ca. {m.get('breite'):g} × {m.get('hoehe'):g} × "
                      f"{m.get('tiefe'):g} mm (B × H × T)")
        mats = sorted({platten.get(t["material"], t["material"]) for t in e["bauteile"]})
        zeilen.append("– Material: " + ", ".join(mats))
        fronten = [t["name"] for t in e["bauteile"] if t["gruppe"] == "Fronten"]
        if fronten:
            zeilen.append("– Fronten: " + ", ".join(fronten))
        fb = sum(1 for t in e["bauteile"] if t["rolle"] == "fachboden")
        if fb:
            zeilen.append(f"– {fb} Einlegeböden, höhenverstellbar")
        if m.get("besonderheiten"):
            zeilen.append("– " + m["besonderheiten"])
        zeilen.append("")
    return "\n".join(zeilen).strip()
