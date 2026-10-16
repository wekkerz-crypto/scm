#!/usr/bin/env python3
"""Weckwop-Dienst am Sägeplatz (Raspberry Pi): erlaubt der Weckwop-Seite im Vollbild, den Pi auszuschalten oder neu zu starten.

Läuft nur auf 127.0.0.1:8766 (von außen nicht erreichbar), gestartet von step2maestro-kiosk.sh vor Chromium.
  GET  /status      → {"ok": true, "dienst": "weckwop", "version": 1}
  POST /ausschalten → fährt den Pi herunter (systemctl poweroff, sonst sudo -n poweroff)
  POST /neustart    → startet neu
  Parallelanschlag (anschlag.py, ESP32 mit FluidNC über USB): GET /anschlag (Stand), POST /anschlag/fahren {"mm": 523.4},
  /anschlag/stopp, /anschlag/referenz, /anschlag/entsperren, /anschlag/kalibrieren {"ist": 523.1},
  GET/POST /anschlag/einstellungen (Steigung, Schritte, Geschwindigkeit, Beschleunigung, Referenzmaß, Versatz …)
Nur Anfragen mit Kopfzeile „X-Weckwop: 1“ (erzwingt bei fremden Seiten eine CORS-Vorabfrage) und nur von erlaubten Seiten:
Origin der eingerichteten Adresse (1. Argument), „null“ (Datei file://) und http://127.0.0.1:8765 (Offline mit Sprache).
Probe ohne Ausschalten: WECKWOP_TROCKEN=/pfad/datei  → schreibt nur, was es tun würde.
"""
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

PORT = int(os.environ.get('WECKWOP_DIENST_PORT', '8766'))
TROCKEN = os.environ.get('WECKWOP_TROCKEN', '')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import anschlag as _anschlag_mod
except ImportError:
    _anschlag_mod = None
ANSCHLAG = None  # erst beim Start (main), damit ein Test ohne ESP32 nichts öffnet


def origin_of(url):
    p = urlsplit(url or '')
    if p.scheme in ('http', 'https') and p.netloc:
        return p.scheme + '://' + p.netloc
    return 'null' if p.scheme == 'file' else ''


ERLAUBT = {'null', 'http://127.0.0.1:8765', 'http://localhost:8765'}
for a in sys.argv[1:]:
    o = origin_of(a)
    if o:
        ERLAUBT.add(o)


def ausfuehren(was):
    if TROCKEN:
        with open(TROCKEN, 'a', encoding='utf-8') as f:
            f.write(was + '\n')
        return
    cmd = 'poweroff' if was == 'ausschalten' else 'reboot'
    # Benutzer der Sitzung darf über logind ausschalten; sonst sudo ohne Passwort (Raspberry Pi OS Standard)
    if subprocess.call(['systemctl', cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) != 0:
        subprocess.call(['sudo', '-n', '/sbin/' + cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class Dienst(BaseHTTPRequestHandler):
    server_version = 'weckwop-dienst'

    def log_message(self, *a):  # still
        pass

    def kopf(self, code, body=None):
        o = self.headers.get('Origin')
        self.send_response(code)
        if o and o in ERLAUBT:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'X-Weckwop, Content-Type')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            # Chrome „Private Network Access“: Seite im Netz (Diskstation) → 127.0.0.1
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        data = json.dumps(body or {}).encode()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def erlaubt(self):
        o = self.headers.get('Origin')
        return (o is None or o in ERLAUBT) and self.headers.get('X-Weckwop') == '1'

    def do_OPTIONS(self):
        o = self.headers.get('Origin')
        self.kopf(204 if o in ERLAUBT else 403)

    def do_GET(self):
        p = self.path.split('?')[0]
        if not self.erlaubt() or p not in ('/status', '/anschlag', '/anschlag/einstellungen'):
            self.kopf(403, {'ok': False})
            return
        if p == '/anschlag/einstellungen':
            self.kopf(200, ANSCHLAG.einstellungen() if ANSCHLAG else {'da': False})
            return
        if p == '/anschlag':
            self.kopf(200, ANSCHLAG.status() if ANSCHLAG else {'da': False})
            return
        self.kopf(200, {'ok': True, 'dienst': 'weckwop', 'version': 2, 'anschlag': ANSCHLAG is not None})

    def daten(self):
        try:
            n = min(int(self.headers.get('Content-Length') or 0), 16384)
            return json.loads(self.rfile.read(n) or b'{}') if n else {}
        except (ValueError, OSError):
            return {}

    def do_POST(self):
        was = self.path.split('?')[0].strip('/')
        if was.startswith('anschlag/') and self.erlaubt():
            if not ANSCHLAG:
                self.kopf(404, {'ok': False, 'fehler': 'Kein Anschlag eingerichtet.'})
                return
            d = self.daten()
            try:
                a = was.split('/', 1)[1]
                if a == 'fahren':
                    ANSCHLAG.fahren(d.get('mm'))
                elif a == 'stopp':
                    ANSCHLAG.stopp()
                elif a == 'referenz':
                    ANSCHLAG.referenz()
                elif a == 'entsperren':
                    ANSCHLAG.entsperren()
                elif a == 'kalibrieren':
                    ANSCHLAG.kalibrieren(d.get('ist'))
                elif a == 'einstellungen':
                    ANSCHLAG.setze(d)
                else:
                    raise RuntimeError('unbekannt')
                self.kopf(200, dict(ANSCHLAG.status(), ok=True))
            except (RuntimeError, TypeError, ValueError, OSError) as e:
                self.kopf(200, dict(ANSCHLAG.status(), ok=False, fehler=str(e)))
            return
        if was not in ('ausschalten', 'neustart') or not self.erlaubt():
            self.kopf(403, {'ok': False})
            return
        self.kopf(200, {'ok': True, 'aktion': was})
        # erst antworten, dann ausschalten
        threading.Timer(1.5, ausfuehren, [was]).start()


if __name__ == '__main__':
    # Anschlag nur, wenn eingerichtet (Datei anschlag.json da oder Simulator) – sonst bleibt der Dienst wie bisher
    if _anschlag_mod and (os.path.exists(_anschlag_mod.CONF) or os.environ.get('WECKWOP_ANSCHLAG') == 'sim'):
        ANSCHLAG = _anschlag_mod.Anschlag()
    try:
        ThreadingHTTPServer(('127.0.0.1', PORT), Dienst).serve_forever()
    except OSError:
        sys.exit(0)  # läuft schon
