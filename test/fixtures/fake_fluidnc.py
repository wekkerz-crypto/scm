"""Nachgebildeter ESP32 mit FluidNC an einem Pseudo-Terminal (für test/anschlag.test.js).
Aufruf: python3 fake_fluidnc.py <datei-für-port> <protokoll> – antwortet auf ?, !, Strg-X, $H, $X, $/…=, G90, G1 X…"""
import os, pty, re, sys, threading, time, tty

m, sl = pty.openpty()
tty.setraw(m)
tty.setraw(sl)
with open(sys.argv[1], 'w') as f:
    f.write(os.ttyname(sl))
log = open(sys.argv[2], 'w')
st = {'state': 'Alarm', 'mpos': 300.0, 'targets': [], 'home': 1300.0}
lock = threading.Lock()


def send(s):
    with lock:
        os.write(m, s.encode())


def mover():
    while True:
        time.sleep(0.01)
        if st['targets']:
            z = st['targets'][0]
            d = z - st['mpos']
            step = min(abs(d), 25)
            st['mpos'] += step if d > 0 else -step
            if abs(z - st['mpos']) < 1e-6:
                st['targets'].pop(0)
        elif st['state'] in ('Run', 'Home'):
            st['state'] = 'Idle'


threading.Thread(target=mover, daemon=True).start()
send("\r\nGrbl 3.8 [FluidNC v3.8.0 '$' for help]\r\n")
buf = b''
while True:
    d = os.read(m, 1024)
    for ch in d:
        c = bytes([ch])
        if c == b'?':
            # aktive Eingänge (Pn:) aus der Datei <protokoll>.pins, z. B. „XR“
            try:
                pn = open(sys.argv[2] + '.pins').read().strip()
            except OSError:
                pn = ''
            send('<%s|MPos:%.3f,0.000,0.000|FS:0,0%s>\r\n' % (st['state'], st['mpos'], '|Pn:' + pn if pn else ''))
            continue
        if c == b'!':
            st['targets'] = []
            continue
        if c == b'\x18':
            send("Grbl 3.8 [FluidNC v3.8.0 '$' for help]\r\n")
            continue
        buf += c
        if c == b'\n':
            line = buf.decode().strip()
            buf = b''
            if not line:
                continue
            log.write(line + '\n')
            log.flush()
            mm = re.match(r'\$/axes/x/homing/mpos_mm=(.*)', line)
            if mm:
                st['home'] = float(mm.group(1))
            if line == '$H':
                st['state'] = 'Home'
                st['targets'] = [st['home']]
            elif line == '$X':
                st['state'] = 'Idle'
            elif line.startswith('G1') and st['state'] != 'Alarm':
                st['targets'].append(float(re.search(r'X(-?[\d.]+)', line).group(1)))
                st['state'] = 'Run'
            send('ok\r\n')
