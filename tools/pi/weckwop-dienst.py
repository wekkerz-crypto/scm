#!/usr/bin/env python3
"""Weckwop-Dienst am Sägeplatz (Raspberry Pi): erlaubt der Weckwop-Seite im Vollbild, den Pi auszuschalten oder neu zu starten.

Läuft nur auf 127.0.0.1:8766 (von außen nicht erreichbar), gestartet von step2maestro-kiosk.sh vor Chromium.
  GET  /status      → {"ok": true, "dienst": "weckwop", "version": 1}
  POST /ausschalten → fährt den Pi herunter (systemctl poweroff, sonst sudo -n poweroff)
  POST /neustart    → startet neu
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
        if self.path.split('?')[0] != '/status' or not self.erlaubt():
            self.kopf(403, {'ok': False})
            return
        self.kopf(200, {'ok': True, 'dienst': 'weckwop', 'version': 1})

    def do_POST(self):
        was = self.path.split('?')[0].strip('/')
        if was not in ('ausschalten', 'neustart') or not self.erlaubt():
            self.kopf(403, {'ok': False})
            return
        self.kopf(200, {'ok': True, 'aktion': was})
        # erst antworten, dann ausschalten
        threading.Timer(1.5, ausfuehren, [was]).start()


if __name__ == '__main__':
    try:
        ThreadingHTTPServer(('127.0.0.1', PORT), Dienst).serve_forever()
    except OSError:
        sys.exit(0)  # läuft schon
