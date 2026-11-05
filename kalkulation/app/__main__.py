"""Startet die App: python -m app  (bzw. Doppelklick auf Tischlerei-Kalkulation.exe)

Optionen: --port 8000  --nur-lokal (nicht im Netz erreichbar)  --kein-browser
"""
import argparse
import socket
import sys
import threading
import webbrowser


def _port_belegt(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def start():
    ap = argparse.ArgumentParser(description="Tischlerei-Kalkulation starten")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--nur-lokal", action="store_true", help="nur an diesem Rechner erreichbar (kein Handy-Upload)")
    ap.add_argument("--kein-browser", action="store_true", help="Browser nicht automatisch öffnen")
    args = ap.parse_args()
    url = f"http://localhost:{args.port}"

    if _port_belegt(args.port):
        print(f"Die App läuft bereits – öffne {url}")
        webbrowser.open(url)
        return

    import uvicorn
    from . import db, main
    main.PORT = args.port
    print("\n  Tischlerei-Kalkulation läuft")
    print(f"    an diesem Rechner:  {url}")
    if not args.nur_lokal:
        for ip in main.lan_adressen():
            print(f"    im lokalen Netz:    http://{ip}:{args.port}   (Handy-Upload)")
    print(f"    Daten:              {db.DATEN}")
    print("  Fenster offen lassen. Beenden mit Strg+C oder Fenster schließen.\n")
    if not args.kein_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    host = "127.0.0.1" if args.nur_lokal else "0.0.0.0"
    # log_config=None: in der .exe ohne Konsole gibt es kein sys.stdout für das Logging
    uvicorn.run(main.app, host=host, port=args.port, log_level="warning",
                log_config=None if sys.stdout is None else uvicorn.config.LOGGING_CONFIG)


if __name__ == "__main__":
    start()
