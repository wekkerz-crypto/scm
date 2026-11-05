"""Startwerte für Konstruktionsregeln und Vorgabenliste.

Alle Werte sind Beispielwerte und werden vom Nutzer in der App gepflegt.
Beim ersten Start werden sie in die Datenbank geschrieben; neue Schlüssel
aus späteren Versionen werden automatisch ergänzt (siehe db.lade_einstellung).
"""

KONSTRUKTIONSREGELN = {
    # Plattenstärken
    "staerke_korpus": 19,
    "staerke_rueckwand": 8,
    "staerke_front": 19,
    "staerke_fachboden": 19,
    "staerke_sockel": 19,
    # Standardmaterialien (IDs aus der Vorgabenliste)
    "material_korpus": "spa_weiss_19",
    "material_rueckwand": "spa_weiss_8",
    "material_front": "spa_weiss_19",
    "material_fachboden": "spa_weiss_19",
    "material_sockel": "spa_weiss_19",
    "kante_korpus": "abs_weiss_1",
    "kante_front": "abs_weiss_2",
    "kante_fachboden": "abs_weiss_1",
    "kante_sockel": "abs_weiss_1",
    # Konstruktionsart
    # seiten_durchgehend | boeden_durchgehend | oberboden_aufliegend
    "bauweise": "seiten_durchgehend",
    # Rückwand: genutet | gefaelzt | aufgesetzt
    "rueckwand_art": "genutet",
    "rueckwand_nuttiefe": 8,         # Nut- bzw. Falztiefe in mm
    "rueckwand_abstand_hinten": 10,  # Abstand Hinterkante Korpus bis Nut
    "rueckwand_luft": 1,             # Spiel je Seite in der Nut
    # Sockel: blende | fuesse | keiner
    "sockel_art": "blende",
    "sockel_hoehe": 100,
    "sockelblende_rueckversatz": 40,
    # Kunststoff-Sockelfüße: an den Ecken und unter jeder Mittelwand, vorne und hinten
    "sockelfuss_abstand_seite": 50,
    "sockelfuss_abstand_vorne": 80,
    "sockelfuss_abstand_hinten": 60,
    # Aufdoppelung (Konstruktionsstandard: Innenkorpus + Sichtseiten / Abdeckplatte / Passblenden)
    "abschluss_seiten": "sichtseite",   # sichtseite | passblende | keine
    "abdeckplatte_oben": True,
    "material_sichtseite": None,        # None = wie Fronten
    "kante_sichtseite": None,           # None = wie Fronten
    "kanten_sichtseite": "vorne",
    "sichtseite_bis_boden": True,       # Sichtseiten und Passblenden verdecken den Sockel seitlich
    "passblende_breite": 30,
    "passblendenleiste_tiefe": 60,
    # Fronten
    "front_aufschlag": "aufliegend",  # aufliegend | eingelegt
    "front_fuge": 3,
    "tuer_doppel_ab_breite": 600,      # Hinweis für die KI
    "scharniere_staffel": [[900, 2], [1600, 3], [2000, 4], [99999, 5]],
    "griff_je_front": True,
    "griff_laenge": 160,
    "griff_abstand_kante": 40,
    # Kanten: vorne | rundum | keine
    "kanten_korpus": "vorne",
    "kanten_fachboden": "vorne",
    "kanten_front": "rundum",
    "kanten_sockel": "keine",
    "kantenstaerke_abziehen": True,    # Zuschnittmaß = Fertigmaß - Kantenstärke
    "kanten_zugabe_mm": 30,           # Überstand je Kante für den Verbrauch
    # Fachböden
    "fachboden_luft": 1,              # Spiel je Seite
    "fachboden_rueckversatz_vorne": 10,
    "fachboden_abstand_hinten": 5,
    "fachbodentraeger_je_boden": 4,
    "lochreihe_abstand_vorne": 37,
    "lochreihe_abstand_hinten": 37,
    "lochreihe_raster": 32,
    "lochreihe_durchmesser": 5,
    "lochreihe_tiefe": 12,
    # Schubkästen: universal = selbst gebaut (Zarge 16 mm, Boden 8 mm eingenutet), system = Kaufteil klein/mittel/groß
    "schubkasten_bauart": "universal",
    "schubkasten_material": "spa_weiss_16",
    "schubkasten_boden_material": "spa_weiss_8",
    "schubkasten_staerke": 16,
    "schubkasten_seitenluft": 13,       # je Seite für die Führung
    "schubkasten_nl_raster": 50,
    "schubkasten_nl_min": 250,
    "schubkasten_tiefenabzug": 10,
    "schubkasten_hoehe_abzug": 40,      # Zargenhöhe = Fronthöhe - Abzug
    "schubkasten_luft_unten": 15,
    "schubkasten_luft_oben": 25,
    "schubkasten_nut_abstand": 10,      # Unterkante Seite bis Nut
    "schubkasten_nuttiefe": 8,
    "schubkasten_boden_luft": 1,
    "schubkasten_kanten_oben": True,
    "schubkasten_auszug_anteil": 0.9,   # Vollauszug: Auszugsweg = Anteil × Nennlänge (Animation)
    "schubkasten_system": "Standard-Zargensystem",
    "schubkasten_klein_bis": 120,
    "schubkasten_mittel_bis": 220,
    # Scharnierbohrung (Topf)
    "topfbohrung_durchmesser": 35,
    "topfbohrung_tiefe": 13,
    "topfbohrung_abstand_kante": 22.5,
    "topfbohrung_abstand_ende": 100,
    # Freitext für die KI
    "weitere_regeln": "",
}

VORGABEN = {
    "platten": [
        {"id": "spa_weiss_19", "name": "Spanplatte melaminbeschichtet weiß 19 mm", "staerke": 19,
         "laenge": 2800, "breite": 2070, "preis_platte": 62.0, "preis_m2": 0, "faser": False,
         "farbe": "#f2f1ec", "rauheit": 0.55, "textur": None, "textur_mm": 1000, "glas": False},
        {"id": "spa_weiss_16", "name": "Spanplatte melaminbeschichtet weiß 16 mm", "staerke": 16,
         "laenge": 2800, "breite": 2070, "preis_platte": 55.0, "preis_m2": 0, "faser": False,
         "farbe": "#f2f1ec", "rauheit": 0.55, "textur": None, "textur_mm": 1000, "glas": False},
        {"id": "spa_weiss_8", "name": "Spanplatte melaminbeschichtet weiß 8 mm", "staerke": 8,
         "laenge": 2800, "breite": 2070, "preis_platte": 38.0, "preis_m2": 0, "faser": False,
         "farbe": "#f2f1ec", "rauheit": 0.6, "textur": None, "textur_mm": 1000, "glas": False},
        {"id": "egger_h1180_19", "name": "Egger H1180 ST37 Eiche Halifax natur 19 mm", "staerke": 19,
         "laenge": 2800, "breite": 2070, "preis_platte": 0, "preis_m2": 24.5, "faser": True,
         "farbe": "#b98b5b", "rauheit": 0.6, "textur": None, "textur_mm": 1200, "glas": False},
        {"id": "mdf_19", "name": "MDF roh 19 mm (lackierfähig)", "staerke": 19,
         "laenge": 2800, "breite": 2070, "preis_platte": 48.0, "preis_m2": 0, "faser": False,
         "farbe": "#c8b79a", "rauheit": 0.8, "textur": None, "textur_mm": 1000, "glas": False},
        {"id": "mpx_birke_18", "name": "Multiplex Birke 18 mm", "staerke": 18,
         "laenge": 2500, "breite": 1250, "preis_platte": 0, "preis_m2": 38.0, "faser": True,
         "farbe": "#e0c9a0", "rauheit": 0.6, "textur": None, "textur_mm": 1000, "glas": False},
        {"id": "eiche_20", "name": "Eiche Massivholzplatte (Leimholz) 20 mm", "staerke": 20,
         "laenge": 3000, "breite": 1220, "preis_platte": 0, "preis_m2": 95.0, "faser": True,
         "farbe": "#a77a4a", "rauheit": 0.55, "textur": None, "textur_mm": 1000, "glas": False},
        {"id": "nussbaum_20", "name": "Nussbaum Massivholzplatte 20 mm", "staerke": 20,
         "laenge": 3000, "breite": 1220, "preis_platte": 0, "preis_m2": 160.0, "faser": True,
         "farbe": "#5d4030", "rauheit": 0.5, "textur": None, "textur_mm": 1000, "glas": False},
        {"id": "buche_20", "name": "Buche Massivholzplatte 20 mm", "staerke": 20,
         "laenge": 3000, "breite": 1220, "preis_platte": 0, "preis_m2": 70.0, "faser": True,
         "farbe": "#d8a878", "rauheit": 0.55, "textur": None, "textur_mm": 1000, "glas": False},
        {"id": "esche_20", "name": "Esche Massivholzplatte 20 mm", "staerke": 20,
         "laenge": 3000, "breite": 1220, "preis_platte": 0, "preis_m2": 85.0, "faser": True,
         "farbe": "#d9c39a", "rauheit": 0.55, "textur": None, "textur_mm": 1000, "glas": False},
        {"id": "ahorn_20", "name": "Ahorn Massivholzplatte 20 mm", "staerke": 20,
         "laenge": 3000, "breite": 1220, "preis_platte": 0, "preis_m2": 90.0, "faser": True,
         "farbe": "#ecd9b5", "rauheit": 0.5, "textur": None, "textur_mm": 1000, "glas": False},
        {"id": "glas_esg_4", "name": "Glas ESG 4 mm klar (Kaufteil nach Maß)", "staerke": 4,
         "laenge": 0, "breite": 0, "preis_platte": 0, "preis_m2": 120.0, "faser": False,
         "farbe": "#cfe6ea", "rauheit": 0.05, "textur": None, "textur_mm": 1000, "glas": True},
    ],
    "kanten": [
        {"id": "abs_weiss_1", "name": "ABS weiß 23 × 1 mm", "staerke": 1, "preis_lfm": 0.45},
        {"id": "abs_weiss_2", "name": "ABS weiß 23 × 2 mm", "staerke": 2, "preis_lfm": 0.85},
        {"id": "abs_h1180_1", "name": "ABS Eiche Halifax H1180 23 × 1 mm", "staerke": 1, "preis_lfm": 0.95},
        {"id": "echtholz_eiche_06", "name": "Echtholzkante Eiche 24 × 0,6 mm", "staerke": 0.6, "preis_lfm": 1.40},
    ],
    "artikel": [
        {"id": "scharnier", "name": "Topfscharnier 110° mit Dämpfung inkl. Montageplatte", "kategorie": "Beschläge",
         "einheit": "Stk", "preis": 6.50, "rolle": "scharnier"},
        {"id": "sk_fuehrung", "name": "Schubkastenführung Vollauszug mit Dämpfung (Paar)", "kategorie": "Beschläge",
         "einheit": "Stk", "preis": 24.0, "rolle": "schubkastenfuehrung"},
        {"id": "sk_klein", "name": "Schubkasten klein (Zargensystem, Vollauszug)", "kategorie": "Beschläge",
         "einheit": "Stk", "preis": 48.0, "rolle": "schubkasten_klein"},
        {"id": "sk_mittel", "name": "Schubkasten mittel (Zargensystem, Vollauszug)", "kategorie": "Beschläge",
         "einheit": "Stk", "preis": 58.0, "rolle": "schubkasten_mittel"},
        {"id": "sk_gross", "name": "Schubkasten groß (Zargensystem, Vollauszug)", "kategorie": "Beschläge",
         "einheit": "Stk", "preis": 72.0, "rolle": "schubkasten_gross"},
        {"id": "sockelfuss", "name": "Kunststoff-Sockelfuß verstellbar", "kategorie": "Beschläge",
         "einheit": "Stk", "preis": 1.80, "rolle": "sockelfuss"},
        {"id": "griff", "name": "Griff Bügel 160 mm", "kategorie": "Beschläge",
         "einheit": "Stk", "preis": 8.50, "rolle": "griff"},
        {"id": "fbt", "name": "Fachbodenträger 5 mm", "kategorie": "Beschläge",
         "einheit": "Stk", "preis": 0.25, "rolle": "fachbodentraeger"},
        {"id": "klappenbeschlag", "name": "Klappenbeschlag (Paar)", "kategorie": "Beschläge",
         "einheit": "Stk", "preis": 38.0, "rolle": "klappenbeschlag"},
        {"id": "lichtset", "name": "LED-Lichtset", "kategorie": "Elektro",
         "einheit": "Stk", "preis": 85.0, "rolle": None},
        {"id": "muelleimer", "name": "Mülleimerauszug", "kategorie": "Einbauteile",
         "einheit": "Stk", "preis": 140.0, "rolle": None},
    ],
    "zuschnitt": {
        "modus": "platten",          # platten | m2
        "verschnitt_prozent": 15,
        "saegeblatt": 4.4,
        "besaeumrand": 10,
    },
    "maschine": {
        "modus": "vorschub",         # vorschub | lfm
        "stundensatz": 95.0,         # €/h CNC
        "vorschub_m_min": 8.0,       # mittlerer Vorschub beim Formatieren
        "ruestzeit_min_je_teil": 0.5,
        "preis_je_lfm": 1.20,        # nur bei Modus lfm
        "wegfaktor": 1.15,           # Zuschlag für An-/Abfahrwege
    },
    "arbeit": {
        "teilehandling_je_teil": 2.00,
        "kanten_je_lfm": 1.50,
        "zusammenbau_je_moebel": 45.0,
        "zusammenbau_je_teil": 3.00,
    },
    "zuschlaege": {
        "materialgemeinkosten": 0.0,
        "materialaufschlag": 15.0,
        "wagnis_gewinn": 12.0,
        "mwst": 19.0,
    },
    "erweiterungen": {
        "oberflaeche_je_m2": 0.0,
        "montage_pauschal": 0.0,
        "lieferung_pauschal": 0.0,
    },
    "cnc": {
        "layer_kontur": "KONTUR",
        "layer_nut": "NUT_B{breite}_T{tiefe}",
        "layer_bohrung": "BOHRUNG_D{d}_T{tiefe}",
        "mit_lochreihen": True,
        "mit_topfbohrungen": True,
    },
    "firma": {
        "name": "Tischlerei Mustermann",
        "inhaber": "Tischlermeister Max Mustermann",
        "strasse": "Werkstattweg 1",
        "plz_ort": "12345 Holzhausen",
        "telefon": "",
        "email": "",
        "web": "",
        "ust_id": "",
        "steuernummer": "",
        "bank": "",
        "iban": "",
        "bic": "",
        "logo": None,
        "angebot_gueltig_tage": 30,
        "zahlungsbedingungen": "50 % Anzahlung bei Auftragserteilung, Rest nach Lieferung ohne Abzug.",
        "fusstext": "Wir freuen uns auf Ihren Auftrag.",
    },
    "ki": {
        "modell": "claude-opus-5-5",
        "aufwand": "high",
    },
}
