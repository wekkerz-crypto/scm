"""Bildbearbeitung: Skizzen-Vorverarbeitung und Texturen (entzerren, kachelbar machen)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def speichere_upload(daten: bytes, ziel: Path, max_kante: int = 3000) -> Path:
    """Upload als JPEG speichern (EXIF-Drehung anwenden, sehr große Fotos verkleinern)."""
    from io import BytesIO
    with Image.open(BytesIO(daten)) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((max_kante, max_kante))
        ziel.parent.mkdir(parents=True, exist_ok=True)
        img.save(ziel, "JPEG", quality=90)
    return ziel


def bearbeite_skizze(datei: Path, aktion: str, box: list[float] | None = None):
    with Image.open(datei) as img:
        img = img.convert("RGB")
        if aktion == "links":
            img = img.rotate(90, expand=True)
        elif aktion == "rechts":
            img = img.rotate(-90, expand=True)
        elif aktion == "kontrast":
            grau = ImageOps.grayscale(img)
            grau = ImageOps.autocontrast(grau, cutoff=2)
            grau = ImageEnhance.Contrast(grau).enhance(1.6).filter(ImageFilter.SHARPEN)
            img = grau.convert("RGB")
        elif aktion == "zuschneiden" and box:
            w, h = img.size
            x0, y0, x1, y1 = box
            img = img.crop((int(min(x0, x1) * w), int(min(y0, y1) * h), int(max(x0, x1) * w), int(max(y0, y1) * h)))
        img.save(datei, "JPEG", quality=90)


def _perspektive_koeffizienten(ziel_ecken, quell_ecken):
    """Koeffizienten für Image.transform(PERSPECTIVE): bildet Ziel- auf Quellpunkte ab."""
    a = []
    for (x, y), (u, v) in zip(ziel_ecken, quell_ecken):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    b = np.array([c for p in quell_ecken for c in p], dtype=float)
    return np.linalg.solve(np.array(a, dtype=float), b).tolist()


def textur_erstellen(quelle: Path, ziel: Path, punkte: list[list[float]] | None = None,
                     kachelbar: bool = True, groesse: int = 1024) -> Path:
    """Foto einer Oberfläche → quadratische, optional kachelbare Textur.

    punkte: 4 Ecken (relativ 0..1, Reihenfolge oben-links, oben-rechts, unten-rechts, unten-links)
    für die perspektivische Entzerrung. Ohne Punkte wird ein mittiges Quadrat genommen.
    """
    with Image.open(quelle) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        w, h = img.size
        if punkte and len(punkte) == 4:
            quell = [(p[0] * w, p[1] * h) for p in punkte]
            ziel_ecken = [(0, 0), (groesse, 0), (groesse, groesse), (0, groesse)]
            koeff = _perspektive_koeffizienten(ziel_ecken, quell)
            img = img.transform((groesse, groesse), Image.Transform.PERSPECTIVE, koeff, Image.Resampling.BICUBIC)
        else:
            k = min(w, h)
            img = img.crop(((w - k) // 2, (h - k) // 2, (w + k) // 2, (h + k) // 2)).resize((groesse, groesse), Image.Resampling.LANCZOS)
        if kachelbar:
            img = kachelbar_machen(img)
        ziel.parent.mkdir(parents=True, exist_ok=True)
        img.save(ziel, "JPEG", quality=90)
    return ziel


def kachelbar_machen(img: Image.Image, rand: float = 0.25) -> Image.Image:
    """Nahtlose Kachel: um halbe Größe verschobene Kopie mit weicher Maske über die Nähte blenden."""
    a = np.asarray(img).astype(float)
    h, w = a.shape[:2]
    verschoben = np.roll(np.roll(a, h // 2, axis=0), w // 2, axis=1)

    def rampe(n):
        x = np.abs(np.linspace(-1, 1, n))  # 0 in der Mitte, 1 am Rand
        r = np.clip((x - (1 - 2 * rand)) / (2 * rand), 0, 1)
        return r

    # Maske: am Rand des Originals (wo die Kachelnaht liegt) die verschobene Version verwenden
    m = np.maximum(rampe(h)[:, None], rampe(w)[None, :])[..., None]
    out = a * (1 - m) + verschoben * m
    return Image.fromarray(out.clip(0, 255).astype("uint8"))
