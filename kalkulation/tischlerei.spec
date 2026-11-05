# PyInstaller-Konfiguration: baut Tischlerei-Kalkulation(.exe) als Ordner-Paket
#   pyinstaller --noconfirm tischlerei.spec
# Ergebnis: dist/Tischlerei-Kalkulation/Tischlerei-Kalkulation(.exe)
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = [("static", "static")]
binaries = []
hiddenimports = collect_submodules("app") + collect_submodules("uvicorn") + ["multipart", "segno"]

# OpenCascade (STEP-Export), DXF, PDF und KI-Client vollständig einsammeln
for paket in ("OCP", "ezdxf", "reportlab", "anthropic", "pypdf"):
    try:
        d, b, h = collect_all(paket)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception as e:  # Paket fehlt → Funktion in der exe nicht verfügbar
        print(f"Hinweis: {paket} nicht eingesammelt: {e}")

a = Analysis(
    ["start_exe.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "matplotlib", "IPython", "jupyter", "notebook", "PyQt5", "PySide6", "vtk", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Tischlerei-Kalkulation",
    console=True,        # Konsolenfenster zeigt Adresse fürs Handy; Schließen beendet die App
    icon=None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="Tischlerei-Kalkulation")
