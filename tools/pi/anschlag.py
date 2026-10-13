"""Weckwop – Parallelanschlag mit Schrittmotor: ESP32 mit FluidNC (G-Code über USB), Teil des Weckwop-Dienstes am Pi.

Anschlagmaß (Abstand Sägeblatt → Anschlag, mm) = richtung × MPos + offset. Nach der Referenzfahrt ($H, Endschalter am
fernen Ende, FluidNC setzt MPos = mpos_mm) stimmt das Maß; mit „Kalibrieren“ (gemessenes Ist-Maß) wird offset nachgeführt.
Spiel der Trapezspindel: Ziel immer aus derselben Richtung anfahren (von größeren Maßen her – erst Ziel + spiel, dann Ziel).
Einstellungen: ~/.config/weckwop/anschlag.json (wird beim ersten Start mit Vorgaben angelegt).
Simulator (ohne ESP32): WECKWOP_ANSCHLAG=sim oder "sim": true in der Datei.
"""
import glob
import json
import os
import re
import select
import termios
import threading
import time
import tty

CONF = os.path.expanduser(os.environ.get('WECKWOP_ANSCHLAG_CONF', '~/.config/weckwop/anschlag.json'))
# Einstellungen (in Weckwop unter „⚙ Anschlag“ änderbar): Schlüssel, Bezeichnung, Einheit, min, max, Vorgabe, Gruppe, FluidNC-Pfad
# Mechanik und Referenzfahrt gehen bei jeder Verbindung als $/…=Wert an den ESP32 (FluidNC übernimmt sie zur Laufzeit) –
# die config.yaml auf dem ESP32 braucht nur Pins und Treiber.
PARAMS = [
    ('steigung', 'Spindelsteigung', 'mm/U', 0.5, 50, 4.0, 'Mechanik', None),
    ('schritte_u', 'Motorschritte je Umdrehung', 'Schritte', 1, 100000, 200, 'Mechanik', None),
    ('mikro', 'Mikroschritte (Treiber)', '×', 1, 256, 8, 'Mechanik', None),
    ('vorschub', 'Fahrgeschwindigkeit', 'mm/min', 10, 20000, 2000, 'Fahren', None),
    ('max_rate', 'Höchstgeschwindigkeit', 'mm/min', 10, 20000, 2400, 'Fahren', 'axes/x/max_rate_mm_per_min'),
    ('beschl', 'Beschleunigung', 'mm/s²', 1, 5000, 150, 'Fahren', 'axes/x/acceleration_mm_per_sec2'),
    ('spiel', 'Spielausgleich (Anfahrt von größeren Maßen)', 'mm', 0, 20, 2.0, 'Fahren', None),
    ('toleranz', 'Toleranz „steht“', 'mm', 0.05, 5, 0.3, 'Fahren', None),
    ('min', 'Kleinstes Maß', 'mm', -100, 5000, 0.0, 'Verfahrweg', None),
    ('max', 'Größtes Maß', 'mm', 1, 6000, 1300.0, 'Verfahrweg', None),
    ('endschalter', 'Endschalter am … Ende (1 = großes Maß, 0 = kleines Maß)', '', 0, 1, 1, 'Referenzfahrt', None),
    ('referenz', 'Referenzmaß (Anschlagmaß am Endschalter)', 'mm', -100, 6000, 1300.0, 'Referenzfahrt', 'axes/x/homing/mpos_mm'),
    ('home_suche', 'Suchgeschwindigkeit', 'mm/min', 10, 20000, 1500, 'Referenzfahrt', 'axes/x/homing/seek_mm_per_min'),
    ('home_fein', 'Feingeschwindigkeit', 'mm/min', 5, 5000, 200, 'Referenzfahrt', 'axes/x/homing/feed_mm_per_min'),
    ('freifahren', 'Freifahren vom Endschalter', 'mm', 0, 50, 3.0, 'Referenzfahrt', 'axes/x/motor0/pulloff_mm'),
    ('offset', 'Versatz (Kalibrierung)', 'mm', -200, 200, 0.0, 'Kalibrierung', None),
]
VORGABE = dict({p[0]: p[5] for p in PARAMS}, port='auto', baud=115200, richtung=1, sim=False)
STATUS_RE = re.compile(r'^<([A-Za-z]+)(?::\d+)?\|.*?(?:MPos|WPos):(-?[\d.]+)')
PN_RE = re.compile(r'\|Pn:([A-Za-z]*)')  # aktive Eingänge: X = Endschalter, R = Reset/Not-Aus-Meldekontakt
BAUDS = {9600: termios.B9600, 19200: termios.B19200, 38400: termios.B38400, 57600: termios.B57600, 115200: termios.B115200}


def lade():
    c = dict(VORGABE)
    try:
        with open(CONF, encoding='utf-8') as f:
            c.update({k: v for k, v in json.load(f).items() if k in VORGABE})
    except (OSError, ValueError):
        speichere(c)
    if os.environ.get('WECKWOP_ANSCHLAG') == 'sim':
        c['sim'] = True
    return c


def speichere(c):
    try:
        os.makedirs(os.path.dirname(CONF), exist_ok=True)
        tmp = CONF + '.neu'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump({k: c[k] for k in VORGABE}, f, indent=1)
        os.replace(tmp, CONF)
    except OSError:
        pass


def steps_per_mm(c):
    return float(c['schritte_u']) * float(c['mikro']) / float(c['steigung'])


def fluidnc_saetze(c):
    """$/…=Wert-Zeilen für den ESP32 aus den Einstellungen."""
    out = ['$/axes/x/steps_per_mm=%.4f' % steps_per_mm(c), '$/axes/x/max_travel_mm=%.3f' % (float(c['max']) - float(c['min'])),
           '$/axes/x/homing/positive_direction=%s' % ('true' if int(c['endschalter']) else 'false')]
    for k, _l, _u, _lo, _hi, _d, _g, path in PARAMS:
        if path:
            out.append('$/%s=%s' % (path, ('%.4f' % float(c[k])).rstrip('0').rstrip('.')))
    return out


def pruefe(neu, alt):
    """Neue Einstellungen prüfen → (dict, Fehlertext)."""
    c = dict(alt)
    for k, label, unit, lo, hi, _d, _g, _p in PARAMS:
        if k not in neu:
            continue
        try:
            v = float(str(neu[k]).replace(',', '.'))
        except ValueError:
            return None, '%s: keine Zahl' % label
        if not (lo <= v <= hi):
            return None, '%s: %g … %g %s' % (label, lo, hi, unit)
        c[k] = int(v) if k in ('schritte_u', 'mikro', 'endschalter') else v
    if 'port' in neu:
        c['port'] = str(neu['port']).strip() or 'auto'
    if 'sim' in neu:
        c['sim'] = bool(neu['sim'])
    if c['max'] <= c['min']:
        return None, 'Größtes Maß muss über dem kleinsten liegen.'
    if not (c['min'] <= c['referenz'] <= c['max']):
        return None, 'Referenzmaß muss im Verfahrweg liegen.'
    if c['vorschub'] > c['max_rate']:
        return None, 'Fahrgeschwindigkeit höher als die Höchstgeschwindigkeit.'
    if steps_per_mm(c) > 20000:
        return None, 'Über 20 000 Schritte/mm – Steigung/Mikroschritte prüfen.'
    return c, ''


def finde_port(c):
    if c['port'] and c['port'] != 'auto':
        return c['port'] if os.path.exists(c['port']) else None
    # ESP32-Platinen: USB-Seriell-Wandler (CP210x, CH340) oder eingebautes USB (Espressif)
    ids = sorted(glob.glob('/dev/serial/by-id/*'))
    for p in ids:
        if re.search(r'CP210|CH34|1a86|Silicon_Labs|Espressif|USB_JTAG|FluidNC|wch', p, re.I):
            return p
    if ids:
        return ids[0]
    for p in ('/dev/ttyUSB0', '/dev/ttyACM0', '/dev/ttyUSB1', '/dev/ttyACM1'):
        if os.path.exists(p):
            return p
    return None


class Seriell:
    """USB-Seriell ohne Zusatzpakete (termios, 8N1, roh)."""

    def __init__(self, port, baud):
        self.fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        tty.setraw(self.fd)
        a = termios.tcgetattr(self.fd)
        b = BAUDS.get(int(baud), termios.B115200)
        a[4] = a[5] = b
        a[2] |= termios.CLOCAL | termios.CREAD
        termios.tcsetattr(self.fd, termios.TCSANOW, a)
        self.buf = b''

    def schreibe(self, data):
        if isinstance(data, str):
            data = data.encode()
        os.write(self.fd, data)

    def zeilen(self, warte=0.1):
        r, _, _ = select.select([self.fd], [], [], warte)
        if r:
            try:
                chunk = os.read(self.fd, 4096)
            except BlockingIOError:
                chunk = b''
            if not chunk:
                raise OSError('getrennt')
            self.buf += chunk
        out = []
        while b'\n' in self.buf:
            line, self.buf = self.buf.split(b'\n', 1)
            out.append(line.decode('utf-8', 'replace').strip())
        return out

    def zu(self):
        try:
            os.close(self.fd)
        except OSError:
            pass


class Sim:
    """Anschlag ohne Hardware: fährt mit vorschub, Referenzfahrt zum Endschalter (max)."""

    def __init__(self, c):
        self.c = c
        self.mpos = 600.0
        self.ziele = []
        self.state = 'Alarm'
        self.out = ['Grbl 3.8 [FluidNC Simulator \'$\' for help]', "[MSG:INFO: Weckwop-Simulator]"]
        self.t = time.time()
        self.hold = False

    def schreibe(self, data):
        if isinstance(data, bytes):
            data = data.decode()
        for ch in data:
            if ch == '?':
                self.out.append('<%s|MPos:%.3f,0.000,0.000|FS:0,0>' % (self.state, self.mpos))
            elif ch == '!':
                self.hold = True
                self.ziele = []
                if self.state in ('Run', 'Home'):
                    self.state = 'Idle'
            elif ch == '\x18':
                self.ziele = []
                self.hold = False
                self.out.append("Grbl 3.8 [FluidNC Simulator '$' for help]")
        for line in data.replace('?', '').replace('!', '').replace('\x18', '').split('\n'):
            line = line.strip()
            if not line:
                continue
            if line == '$H':
                self.state = 'Home'
                self.ziele = [('home', float(self.c['referenz']))]
                self.out.append('ok')
            elif line == '$X':
                self.state = 'Idle'
                self.out.append('ok')
            else:
                m = re.search(r'X(-?[\d.]+)', line)
                if m and self.state not in ('Alarm',):
                    self.ziele.append(('move', float(m.group(1))))
                    self.state = 'Run'
                    self.out.append('ok')
                elif m:
                    self.out.append('error:9')
                else:
                    self.out.append('ok')

    def zeilen(self, warte=0.1):
        time.sleep(min(warte, 0.05))
        now = time.time()
        dt = now - self.t
        self.t = now
        tempo = float(os.environ.get('WECKWOP_SIM_TEMPO', '1') or 1)  # Tests: schneller
        while self.ziele and dt > 0:
            art, z = self.ziele[0]
            v = self.c['vorschub'] / 60.0 * tempo * (3 if art == 'home' else 1)
            d = z - self.mpos
            step = min(abs(d), v * dt)
            self.mpos += step if d > 0 else -step
            dt -= step / v if v else dt
            if abs(z - self.mpos) < 1e-6:
                self.ziele.pop(0)
        if not self.ziele and self.state in ('Run', 'Home'):
            self.state = 'Idle'
        out, self.out = self.out, []
        return out

    def zu(self):
        pass


class Anschlag:
    def __init__(self):
        self.c = lade()
        self.lock = threading.Lock()
        self.dev = None
        self.port = None
        self.zustand = '—'
        self.mpos = None
        self.pins = ''
        self.referenziert = False
        self.ziel = None
        self.meldung = ''
        self.zuletzt = 0.0
        self.home_lauf = False
        self.reset_erwartet = 0.0  # eigenes Zurücksetzen nach Stopp: Position bleibt gültig
        threading.Thread(target=self._lauf, daemon=True).start()

    # --- Umrechnung Maschine ↔ Anschlagmaß
    def mass(self, mpos):
        return None if mpos is None else self.c['richtung'] * mpos + self.c['offset']

    def maschine(self, mass):
        return (mass - self.c['offset']) / (self.c['richtung'] or 1)

    def status(self):
        verb = self.dev is not None and time.time() - self.zuletzt < 2.5
        pos = self.mass(self.mpos) if verb else None
        return {'da': True, 'sim': bool(self.c['sim']), 'verbunden': verb, 'port': self.port, 'zustand': self.zustand if verb else '—',
                'pos': None if pos is None else round(pos, 2), 'ziel': self.ziel, 'referenziert': self.referenziert and verb,
                'min': self.c['min'], 'max': self.c['max'], 'toleranz': self.c['toleranz'], 'offset': round(self.c['offset'], 2),
                'meldung': self.meldung, 'pins': self.pins if verb else '', 'steps_per_mm': round(steps_per_mm(self.c), 3)}

    def einstellungen(self):
        return {'werte': {k: self.c[k] for k in VORGABE}, 'felder': [{'key': p[0], 'label': p[1], 'einheit': p[2], 'min': p[3], 'max': p[4],
                'vorgabe': p[5], 'gruppe': p[6]} for p in PARAMS], 'steps_per_mm': round(steps_per_mm(self.c), 3), 'datei': CONF}

    def setze(self, neu):
        c, fehler = pruefe(neu, self.c)
        if fehler:
            raise RuntimeError(fehler)
        neu_verbinden = c['port'] != self.c['port'] or c['sim'] != self.c['sim']
        self.c = c
        speichere(c)
        if isinstance(self.dev, Sim):
            self.dev.c = c
        self.referenziert = False  # Mechanik/Referenz geändert: neu referenzieren
        self.ziel = None
        if neu_verbinden:
            with self.lock:
                if self.dev:
                    self.dev.zu()
                self.dev = None
        elif self.dev:
            self._sende_einstellungen()
        self.meldung = 'Einstellungen übernommen – Referenzfahrt nötig'

    def _sende_einstellungen(self):
        if isinstance(self.dev, Sim):
            return
        self._send('\n'.join(fluidnc_saetze(self.c)) + '\n')

    def _send(self, data):
        with self.lock:
            if not self.dev:
                raise RuntimeError('Anschlag nicht verbunden (USB-Kabel zum ESP32?)')
            self.dev.schreibe(data)

    # --- Befehle
    def referenz(self):
        self.ziel = None
        self.referenziert = False
        self.home_lauf = True
        self.meldung = 'Referenzfahrt …'
        self._send('$H\n')
        self.zustand = 'Home'  # sofort melden (der nächste Statusbericht bestätigt)

    def entsperren(self):
        self._send('$X\n')

    def stopp(self):
        self.ziel = None
        self.meldung = 'Gestoppt'
        # Vorschub anhalten (bremst sauber, Position bleibt gültig), dann Warteschlange leeren
        self._send('!')
        time.sleep(0.3)
        self.reset_erwartet = time.time()
        self._send('\x18')

    def fahren(self, mass):
        mass = float(mass)
        if not self.referenziert:
            raise RuntimeError('Erst Referenzfahrt machen.')
        if self.zustand not in ('Idle',):
            raise RuntimeError('Anschlag ist nicht bereit (%s).' % self.zustand)
        lo, hi = float(self.c['min']), float(self.c['max'])
        if not (lo <= mass <= hi):
            raise RuntimeError('Maß %.1f mm liegt außerhalb des Verfahrwegs (%.0f – %.0f mm).' % (mass, lo, hi))
        cur = self.mass(self.mpos)
        f = int(min(self.c['vorschub'], self.c['max_rate']))
        cmds = ['G90']
        # Spiel: immer von größeren Maßen her an das Ziel (Anschlag drückt Richtung Blatt)
        sp = float(self.c['spiel'])
        if sp > 0 and cur is not None and mass > cur - 0.01 and mass + sp <= hi:
            cmds.append('G1 X%.3f F%d' % (self.maschine(mass + sp), f))
        cmds.append('G1 X%.3f F%d' % (self.maschine(mass), f))
        self.ziel = round(mass, 2)
        self.meldung = ''
        self._send('\n'.join(cmds) + '\n')
        self.zustand = 'Run'

    def kalibrieren(self, ist):
        ist = float(ist)
        cur = self.mass(self.mpos)
        if cur is None or not self.referenziert:
            raise RuntimeError('Erst Referenzfahrt machen, dann an einer Stelle messen.')
        if abs(ist - cur) > 50:
            raise RuntimeError('Unterschied über 50 mm – Maß richtig gemessen?')
        self.c['offset'] = float(self.c['offset']) + (ist - cur)
        speichere(self.c)
        self.ziel = None
        self.meldung = 'Kalibriert: %.1f mm' % ist

    # --- Verbindung halten, Status lesen
    def _verbinde(self):
        if self.c['sim']:
            self.port = 'Simulator'
            return Sim(self.c)
        p = finde_port(self.c)
        if not p:
            return None
        self.port = p
        return Seriell(p, self.c['baud'])

    def _lauf(self):
        while True:
            try:
                if not self.dev:
                    d = self._verbinde()
                    if not d:
                        time.sleep(3)
                        continue
                    with self.lock:
                        self.dev = d
                    self.referenziert = False
                    self.meldung = 'Verbunden – Referenzfahrt nötig'
                    time.sleep(1.5)  # ESP32 startet nach dem Öffnen neu
                    for line in self.dev.zeilen(0.3):
                        self._zeile(line)
                    self._sende_einstellungen()
                with self.lock:
                    self.dev.schreibe('?')
                for line in self.dev.zeilen(0.2):
                    self._zeile(line)
            except (OSError, RuntimeError) as e:
                with self.lock:
                    if self.dev:
                        self.dev.zu()
                    self.dev = None
                self.zustand = '—'
                self.referenziert = False
                self.meldung = 'Verbindung verloren: %s' % e
                time.sleep(2)

    def _zeile(self, line):
        m = STATUS_RE.match(line)
        if m:
            self.zuletzt = time.time()
            st = m.group(1)
            if st == 'Idle' and self.home_lauf and self.zustand == 'Home':
                self.home_lauf = False
                self.referenziert = True
                self.meldung = 'Referenziert'
            if st == 'Alarm':
                self.referenziert = False
            self.zustand = st
            self.mpos = float(m.group(2))
            p = PN_RE.search(line)
            self.pins = p.group(1) if p else ''
            if self.ziel is not None and st == 'Idle' and abs(self.mass(self.mpos) - self.ziel) <= self.c['toleranz']:
                self.meldung = ''
            return
        if line.startswith('ALARM:'):
            self.referenziert = False
            self.home_lauf = False
            self.ziel = None
            self.meldung = {'ALARM:1': 'Endschalter ausgelöst – Referenzfahrt neu', 'ALARM:2': 'Ziel außerhalb des Verfahrwegs',
                            'ALARM:3': 'Zurückgesetzt während der Fahrt – Referenzfahrt neu',
                            'ALARM:6': 'Referenzfahrt abgebrochen', 'ALARM:8': 'Referenzfahrt: Endschalter nicht frei',
                            'ALARM:9': 'Referenzfahrt: Endschalter nicht gefunden',
                            'ALARM:10': 'Not-Aus ausgelöst – Referenzfahrt neu',
                            'ALARM:11': 'Eingang beim Einschalten aktiv – Endschalter offen oder Not-Aus gedrückt?',
                            'ALARM:14': 'Nicht referenziert – Referenzfahrt'}.get(line.split()[0], 'Alarm: ' + line)
        elif line.startswith('error:'):
            self.meldung = 'Fehler vom ESP32: ' + line
        elif line.startswith('Grbl') or 'FluidNC' in line:
            # Neustart des ESP32 (Strom, Kabel) – Position unbekannt; nach eigenem Stopp bleibt sie gültig
            if time.time() - self.reset_erwartet > 3:
                self.referenziert = False
