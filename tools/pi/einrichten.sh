#!/bin/bash
# Step2Maestro am Sägeplatz – Raspberry Pi 5 einrichten (Raspberry Pi OS Bookworm, 64 Bit, mit Desktop)
#
#   bash einrichten.sh                         fragt nach Adresse und Etikettgröße
#   bash einrichten.sh --url https://www.deine-domain.de/step2maestro/
#   bash einrichten.sh --offline               Programm vom Pi selbst (ohne Internet, ohne Dekor-Bibliothek)
#   weitere: --etikett 40x60  --dpi 203|300  --nur-drucker  --test
#
# Macht: CUPS + Zebra (USB, Treiber „Zebra ZPL Label Printer“) als Standarddrucker mit Etikettgröße, Bildschirm-
# abschaltung aus, Chromium beim Anmelden im Vollbild mit --kiosk-printing (Etiketten ohne Druckdialog).
# Rückgängig: ~/.config/autostart/step2maestro.desktop löschen (und die Zeile in ~/.config/labwc/autostart).
set -u

URL=""
OFFLINE=0
ETIKETT="40x60"
DPI="203"
NUR_DRUCKER=0
TEST=0
HIER="$(cd "$(dirname "$0")" && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift ;;
    --offline) OFFLINE=1 ;;
    --etikett) ETIKETT="${2:-40x60}"; shift ;;
    --dpi) DPI="${2:-203}"; shift ;;
    --nur-drucker) NUR_DRUCKER=1 ;;
    --test) TEST=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unbekannte Angabe: $1 (Hilfe: bash einrichten.sh --help)"; exit 1 ;;
  esac
  shift
done

ok() { echo "  ✓ $*"; }
warn() { echo "  ! $*"; }
step() { echo; echo "== $*"; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Bitte als normaler Benutzer starten (nicht mit sudo) – das Skript fragt selbst nach dem Passwort, wo nötig."
  exit 1
fi
if ! command -v apt-get >/dev/null; then echo "Das ist kein Raspberry Pi OS / Debian."; exit 1; fi
if ! [[ "$ETIKETT" =~ ^[0-9]+x[0-9]+$ ]]; then echo "Etikettgröße bitte als BREITExHÖHE in mm, z. B. 40x60."; exit 1; fi
if [ "$DPI" != "203" ] && [ "$DPI" != "300" ]; then echo "--dpi bitte 203 oder 300 (steht auf dem Typenschild der Zebra)."; exit 1; fi

# ---------------------------------------------------------------- Adresse
if [ "$NUR_DRUCKER" -eq 0 ] && [ -z "$URL" ] && [ "$OFFLINE" -eq 0 ]; then
  echo "Welche Adresse soll am Sägeplatz geöffnet werden?"
  echo "  Webserver, z. B. https://www.deine-domain.de/step2maestro/   (mit Dekor-Bibliothek)"
  echo "  oder leer lassen = Programm vom Pi selbst (offline)"
  read -r -p "Adresse: " URL
  [ -z "$URL" ] && OFFLINE=1
fi
if [ "$OFFLINE" -eq 1 ]; then
  if [ ! -f "$HIER/step2maestro/index.html" ]; then
    echo "Für --offline muss der Ordner step2maestro neben diesem Skript liegen (aus der ZIP)."; exit 1
  fi
  step "Programm nach /opt/step2maestro kopieren"
  sudo mkdir -p /opt/step2maestro && sudo cp -r "$HIER/step2maestro/." /opt/step2maestro/ && ok "kopiert"
  URL="file:///opt/step2maestro/index.html"
fi

# ---------------------------------------------------------------- Pakete
step "Pakete installieren (CUPS, Chromium)"
sudo apt-get update -qq
BROWSER_PKG=""
command -v chromium-browser >/dev/null || command -v chromium >/dev/null || BROWSER_PKG="chromium-browser"
sudo apt-get install -y -qq cups cups-client $BROWSER_PKG >/dev/null && ok "installiert" || warn "apt-get meldet einen Fehler – Internetverbindung prüfen"
sudo usermod -aG lpadmin "$USER"
sudo systemctl enable --now cups >/dev/null 2>&1 && ok "CUPS läuft"

# ---------------------------------------------------------------- Zebra an USB
step "Zebra-Etikettendrucker (USB) einrichten"
URI="$(sudo lpinfo -v 2>/dev/null | grep -io 'usb://zebra[^ ]*' | head -n 1)"
if [ -z "$URI" ]; then
  warn "Keine Zebra an USB gefunden. Drucker einschalten, USB einstecken und dann:"
  warn "  bash einrichten.sh --nur-drucker"
else
  ok "gefunden: $URI"
  MODEL="drv:///sample.drv/zebra.ppd"
  if ! sudo lpinfo -m 2>/dev/null | grep -q "sample.drv/zebra.ppd"; then
    warn "Treiber „Zebra ZPL Label Printer“ fehlt in CUPS – Drucker wird roh angelegt (dann nur ZPL)."
    MODEL="raw"
  fi
  W="${ETIKETT%x*}"
  H="${ETIKETT#*x}"
  sudo lpadmin -p Zebra -E -v "$URI" -m "$MODEL" -D "Zebra Etiketten" -L "Sägeplatz"
  if [ "$MODEL" != "raw" ]; then
    # Etikettgröße, Auflösung, Etiketten mit Lücke (Web = Gap), etwas dunkler für gut lesbare Schrift
    sudo lpadmin -p Zebra -o PageSize="Custom.${W}x${H}mm" -o Resolution="${DPI}dpi" -o zeMediaTracking=Web -o Darkness=20 2>/dev/null
  fi
  sudo lpadmin -d Zebra
  sudo cupsenable Zebra 2>/dev/null; sudo cupsaccept Zebra 2>/dev/null
  ok "Zebra ist Standarddrucker – Etikett ${W} × ${H} mm, ${DPI} dpi"
  if [ "$TEST" -eq 1 ]; then
    printf 'Step2Maestro\nTestetikett\n%s\n' "$(date '+%d.%m.%Y %H:%M')" | lp -d Zebra -o media="Custom.${W}x${H}mm" >/dev/null && ok "Testetikett gedruckt"
  fi
fi
[ "$NUR_DRUCKER" -eq 1 ] && { echo; echo "Fertig (nur Drucker)."; exit 0; }

# ---------------------------------------------------------------- Bildschirm an lassen
step "Bildschirmabschaltung aus"
if command -v raspi-config >/dev/null; then sudo raspi-config nonint do_blanking 1 && ok "aus"; else warn "raspi-config fehlt – Bildschirmschoner von Hand ausschalten"; fi

# ---------------------------------------------------------------- Kiosk-Start
step "Step2Maestro beim Anmelden im Vollbild starten"
mkdir -p "$HOME/.local/bin" "$HOME/.config/autostart"
START="$HOME/.local/bin/step2maestro-kiosk.sh"
cat > "$START" <<EOF
#!/bin/bash
# Startet Step2Maestro im Vollbild (Kiosk), Etiketten ohne Druckdialog auf den Standarddrucker (Zebra).
# Beenden: Alt+F4 (Tastatur). Adresse ändern: unten URL anpassen.
URL="$URL"
exec 9>/tmp/step2maestro-kiosk.lock
flock -n 9 || exit 0   # nur einmal starten (Autostart kann doppelt auslösen)
sleep 4                # Netzwerk und Oberfläche abwarten
B="\$(command -v chromium-browser || command -v chromium)"
# nach Stromausfall keine „Wiederherstellen?“-Meldung
P="\$HOME/.config/chromium/Default/Preferences"
[ -f "\$P" ] && sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "\$P"
exec "\$B" --kiosk --kiosk-printing --noerrdialogs --disable-infobars --disable-session-crashed-bubble \\
  --no-first-run --password-store=basic --check-for-update-interval=31536000 --ozone-platform-hint=auto "\$URL"
EOF
chmod +x "$START"
cat > "$HOME/.config/autostart/step2maestro.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Step2Maestro Sägeplatz
Exec=$START
X-GNOME-Autostart-enabled=true
EOF
# neue Oberfläche (labwc, Wayland) – zusätzlich, die Sperre verhindert Doppelstart
if [ -d /etc/xdg/labwc ] || [ -d "$HOME/.config/labwc" ]; then
  mkdir -p "$HOME/.config/labwc"
  grep -qs "step2maestro-kiosk.sh" "$HOME/.config/labwc/autostart" || echo "$START &" >> "$HOME/.config/labwc/autostart"
fi
ok "Autostart eingerichtet: $URL"

echo
echo "Fertig. Jetzt neu starten:  sudo reboot"
echo "Danach startet Step2Maestro von selbst. In Step2Maestro unter „Werkzeuge & Regeln → Etiketten“ dieselbe"
echo "Etikettgröße einstellen (${ETIKETT/x/ × } mm). Beenden des Vollbilds: Alt+F4."
