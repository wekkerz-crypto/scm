# Zeichnet tools/pi/anschlag/verdrahtung.svg (Aufruf: python3 tools/make_verdrahtung.py tools/pi/anschlag/verdrahtung.svg); PNG per Browser-Screenshot.
import sys
o = []
A = o.append
W, H = 1200, 800
C = {'step': '#d96c00', 'dir': '#1f63c6', 'ena': '#7b3fc4', 'gnd': '#222', 'lim': '#1e7d3a', 'stop': '#c62828', 'usb': '#666', 'mot': '#555'}
def line(pts, col, w=3, dash=None):
    d = ' '.join(('M' if i == 0 else 'L') + '%g %g' % p for i, p in enumerate(pts))
    A('<path d="%s" fill="none" stroke="%s" stroke-width="%g" stroke-linejoin="round" stroke-linecap="round"%s/>' % (d, col, w, ' stroke-dasharray="%s"' % dash if dash else ''))
def text(x, y, s, size=15, anchor='start', weight='normal', col='#222', style=''):
    A('<text x="%g" y="%g" font-size="%g" text-anchor="%s" font-weight="%s" fill="%s"%s>%s</text>' % (x, y, size, anchor, weight, col, ' font-style="%s"' % style if style else '', s))
def box(x, y, w, h, fill, stroke='#333', r=10):
    A('<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s" stroke="%s" stroke-width="2"/>' % (x, y, w, h, r, fill, stroke))
def pin(x, y, col='#333'):
    A('<circle cx="%g" cy="%g" r="5" fill="#fff" stroke="%s" stroke-width="2"/>' % (x, y, col))
def dot(x, y, col):
    A('<circle cx="%g" cy="%g" r="5" fill="%s"/>' % (x, y, col))
def ground(x, y, col='#222', label='GND ESP32'):
    line([(x, y), (x, y + 14)], col, 3)
    for i, w in enumerate((18, 12, 6)):
        line([(x - w, y + 14 + i * 5), (x + w, y + 14 + i * 5)], col, 2.5)
    text(x, y + 44, label, 12, 'middle', col='#555')
def nc_h(x1, x2, y, col):  # Öffner waagerecht: geschlossen (Hebel liegt am Gegenkontakt)
    pin(x1, y, col); pin(x2, y, col)
    line([(x1 + 5, y), (x2 - 3, y + 7)], col, 3)
    line([(x2, y + 5), (x2, y + 11)], col, 3)
def nc_v(x, y1, y2, col):  # Öffner senkrecht
    pin(x, y1, col); pin(x, y2, col)
    line([(x, y1 + 5), (x - 7, y2 - 3)], col, 3)
    line([(x - 5, y2), (x - 11, y2)], col, 3)

A('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" font-family="DejaVu Sans, Arial, Helvetica, sans-serif">' % (W, H, W, H))
A('<rect width="100%" height="100%" fill="#fff"/>')
text(40, 52, 'Weckwop – Parallelanschlag: Verdrahtung', 26, weight='bold')
text(40, 80, 'ESP32 mit FluidNC · Pins wie in config.yaml · Vorschlag, an die eigene Platine anpassen', 15, col='#555')

# Raspberry Pi
box(40, 330, 160, 100, '#eef3ea')
text(120, 370, 'Raspberry Pi 5', 16, 'middle', 'bold')
text(120, 393, 'Weckwop', 14, 'middle', col='#555')
text(120, 413, '(Sägeplatz)', 13, 'middle', col='#555')
line([(200, 380), (330, 380)], C['usb'], 6)
text(265, 368, 'USB', 14, 'middle', 'bold', C['usb'])
text(265, 402, 'Datenkabel', 12, 'middle', col='#555')
text(265, 417, '≤ 2 m', 12, 'middle', col='#555')

# ESP32
box(330, 100, 230, 500, '#eaf1fb')
text(445, 132, 'ESP32 DevKit', 17, 'middle', 'bold')
text(445, 152, 'FluidNC', 13, 'middle', col='#555')
pins = [(180, 'GPIO 26', 'step'), (255, 'GPIO 27', 'dir'), (330, 'GPIO 14', 'ena'), (400, 'GND', 'gnd'), (450, 'GPIO 32', 'lim'), (530, 'GPIO 33', 'stop')]
for y, lab, k in pins:
    text(548, y + 5, lab, 14, 'end', 'bold', C[k])
pin(330, 380, C['usb'])
text(342, 385, 'USB', 12, col='#555')

# Treiber
box(760, 140, 240, 270, '#fbf3e6')
text(880, 128, 'Schrittmotor-Treiber (TB6600 / DM542)', 14, 'middle', 'bold')
term = [(180, 'PUL+ (STEP)', 'step'), (210, 'PUL−', 'gnd'), (255, 'DIR+', 'dir'), (285, 'DIR−', 'gnd'), (330, 'ENA+', 'ena'), (360, 'ENA−', 'gnd')]
for y, lab, k in term:
    text(772, y + 5, lab, 13)
for y, lab in [(200, 'A+'), (230, 'A−'), (280, 'B+'), (310, 'B−')]:
    text(988, y + 5, lab, 13, 'end')
text(830, 398, 'V+', 13, 'middle')
text(950, 398, 'GND', 13, 'middle')

# Signalleitungen ESP → Treiber
line([(560, 180), (760, 180)], C['step'])
line([(560, 255), (760, 255)], C['dir'])
line([(560, 330), (760, 330)], C['ena'])
line([(560, 400), (700, 400), (700, 210), (760, 210)], C['gnd'])
line([(700, 285), (760, 285)], C['gnd'])
line([(700, 360), (760, 360)], C['gnd'])
dot(700, 285, C['gnd']); dot(700, 360, C['gnd'])
text(640, 172, 'STEP', 12, 'middle', col=C['step'])
text(640, 247, 'DIR', 12, 'middle', col=C['dir'])
text(640, 322, 'ENA (optional)', 12, 'middle', col=C['ena'])
text(625, 392, 'GND', 12, 'middle', col=C['gnd'])
for y, _, k in pins[:4]:
    pin(560, y, C[k])
for y, lab, k in term:
    pin(760, y, C[k])

# Endschalter
line([(560, 450), (600, 450)], C['lim'])
nc_h(600, 660, 450, C['lim'])
line([(665, 450), (680, 450)], C['lim'])
ground(680, 450, C['lim'])
text(630, 432, 'Endschalter (Öffner)', 12, 'middle', 'bold', C['lim'])
pin(560, 450, C['lim'])

# Not-Aus Kontakt 2 (Meldung)
line([(560, 530), (600, 530)], C['stop'])
nc_h(600, 660, 530, C['stop'])
line([(665, 530), (680, 530)], C['stop'])
ground(680, 530, C['stop'])
pin(560, 530, C['stop'])
text(630, 518, 'Not-Aus Kontakt 2', 12, 'middle', 'bold', C['stop'])

# Netzteil + Not-Aus Kontakt 1 (trennt Motorstrom)
box(790, 640, 220, 70, '#f3f3f3')
text(900, 672, 'Netzteil 24–48 V DC', 15, 'middle', 'bold')
text(900, 694, 'für den Treiber', 12, 'middle', col='#555')
text(830, 632, '+', 18, 'middle', 'bold', C['stop'])
text(950, 632, '−', 18, 'middle', 'bold')
line([(830, 640), (830, 590)], C['stop'], 4)
nc_v(830, 530, 585, C['stop'])
line([(830, 525), (830, 410)], C['stop'], 4)
line([(950, 640), (950, 410)], C['gnd'], 4)
pin(830, 410, C['stop']); pin(950, 410, C['gnd'])
text(843, 562, 'Kontakt 1:', 12, col=C['stop'], weight='bold')
text(843, 577, 'trennt den', 12, col=C['stop'])
text(843, 592, 'Motorstrom', 12, col=C['stop'])
# Mechanik Not-Aus
line([(632, 539), (632, 590), (818, 590)], C['stop'], 2, '6 5')
line([(745, 590), (745, 604)], C['stop'], 4)
A('<path d="M725 622 A20 20 0 0 1 765 622 Z" fill="%s"/>' % C['stop'])
text(745, 642, 'NOT-AUS', 14, 'middle', 'bold', C['stop'])
text(745, 657, '2 Öffner', 12, 'middle', col='#555')

# Motor + Spindel
for y, ty in [(200, 232), (230, 244), (280, 266), (310, 278)]:
    line([(1000, y), (1040, y), (1063, ty)], C['mot'], 2.5)
for y in (200, 230, 280, 310):
    pin(1000, y, C['mot'])
A('<circle cx="1110" cy="255" r="48" fill="#eee" stroke="#333" stroke-width="2.5"/>')
text(1110, 266, 'M', 30, 'middle', 'bold')
text(1110, 180, 'Schrittmotor', 14, 'middle', 'bold')
text(1110, 197, 'NEMA 23', 12, 'middle', col='#555')
A('<rect x="1102" y="303" width="16" height="170" fill="#ddd" stroke="#555" stroke-width="1.5"/>')
for yy in range(310, 470, 10):
    line([(1102, yy + 8), (1118, yy)], '#888', 1.5)
A('<rect x="1070" y="420" width="80" height="34" rx="5" fill="#cfe3cf" stroke="#2f6b2f" stroke-width="2"/>')
text(1110, 442, 'Anschlag', 13, 'middle', 'bold', '#2f6b2f')
text(1110, 494, 'Trapezspindel', 13, 'middle', 'bold')
text(1110, 511, 'z. B. Tr16×4', 12, 'middle', col='#555')
text(1110, 527, '0 – 1300 mm', 12, 'middle', col='#555')

# Hinweise
box(40, 650, 640, 125, '#fafafa', '#bbb', 8)
notes = ['Signal-Minus (PUL−, DIR−, ENA−) an GND des ESP32. Braucht der Treiber 5-V-Signale',
         '(manche TB6600): Pegelwandler 3,3 → 5 V dazwischen.',
         'Endschalter und Not-Aus als Öffner gegen GND: Kabel ab = ausgelöst (sicher).',
         'Not-Aus Kontakt 1 trennt den Motorstrom hart – unabhängig von Pi und ESP32.',
         'Nicht benutzen: GPIO 0, 2, 12, 15 und 6–11. Mikroschritte/Strom am Treiber (DIP-Schalter).']
text(56, 674, 'Hinweise', 14, weight='bold')
for i, n in enumerate(notes):
    text(56, 696 + i * 17, n, 12.5, col='#333')
A('</svg>')
open(sys.argv[1], 'w', encoding='utf-8').write('\n'.join(o) + '\n')
