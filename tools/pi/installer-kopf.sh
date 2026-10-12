#!/bin/bash
# Weckwop – Installation auf dem Raspberry Pi am Sägeplatz (Pi 5 oder Pi 4, Raspberry Pi OS Bookworm 64 Bit mit Desktop)
# Eine Datei: enthält das Programm, einrichten.sh und die Anleitung. Auf den Pi kopieren (USB-Stick) und im Terminal:
#
#   bash Weckwop-Pi-Installer.sh            fragt Schritt für Schritt (Adresse, Etikett, Sprache) und richtet alles ein
#   bash Weckwop-Pi-Installer.sh --url http://diskstation:8080/ --sprache     ohne Fragen (Angaben wie bei einrichten.sh)
#
# Nochmal starten = aktualisieren (die Antworten vom letzten Mal sind vorbelegt). Protokoll: ~/weckwop-pi/installation.log
set -u
STAND="@STAND@"
PRUEF="@PRUEF@"
ZIEL="$HOME/weckwop-pi"
CONF="$HOME/.config/weckwop/pi-installer.conf"

say() { echo "$*"; }
fail() { echo; echo "FEHLER: $*"; echo "Protokoll: $ZIEL/installation.log"; exit 1; }

if [ "$(id -u)" -eq 0 ]; then echo "Bitte als normaler Benutzer starten (ohne sudo) – das Passwort wird bei Bedarf abgefragt."; exit 1; fi
command -v apt-get >/dev/null || { echo "Das ist kein Raspberry Pi OS / Debian – Abbruch."; exit 1; }
MODELL="$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo unbekannt)"

# ---------------------------------------------------------------- Programm auspacken (an diese Datei angehängt)
echo "Weckwop-Installer (Stand $STAND) – $MODELL"
case "$MODELL" in *"Raspberry Pi 5"*|*"Raspberry Pi 4"*) ;; *) echo "Hinweis: gedacht für Raspberry Pi 5 (oder 4) – es geht trotzdem weiter.";; esac
[ "$(uname -m)" = "aarch64" ] || echo "Hinweis: kein 64-Bit-System ($(uname -m)) – empfohlen ist Raspberry Pi OS 64 Bit."
ZEILE="$(awk '/^__WECKWOP_PAKET__$/ { print NR + 1; exit }' "$0")"
[ -n "$ZEILE" ] || fail "Die Datei ist unvollständig (kein Paket angehängt) – bitte neu kopieren."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tail -n +"$ZEILE" "$0" | base64 -d > "$TMP/paket.tgz" 2>/dev/null || fail "Paket nicht lesbar – Datei beim Kopieren beschädigt? Bitte neu kopieren."
if command -v sha256sum >/dev/null && [ "$(sha256sum "$TMP/paket.tgz" | cut -d' ' -f1)" != "$PRUEF" ]; then
  fail "Prüfsumme stimmt nicht – Datei beim Kopieren beschädigt. Bitte neu kopieren."
fi
rm -rf "$ZIEL.neu" && mkdir -p "$ZIEL.neu" && tar xzf "$TMP/paket.tgz" -C "$ZIEL.neu" || fail "Auspacken fehlgeschlagen (Speicherplatz?)."
[ -f "$ZIEL/installation.log" ] && cp "$ZIEL/installation.log" "$ZIEL.neu/installation.log.alt" 2>/dev/null
rm -rf "$ZIEL" && mv "$ZIEL.neu" "$ZIEL"
chmod +x "$ZIEL"/*.sh
echo "  ✓ ausgepackt nach $ZIEL"

# Angaben direkt mitgegeben: ohne Fragen weiter an einrichten.sh
if [ $# -gt 0 ]; then
  bash "$ZIEL/einrichten.sh" "$@" 2>&1 | tee "$ZIEL/installation.log"
  exit "${PIPESTATUS[0]}"
fi

# ---------------------------------------------------------------- Fragen (whiptail, sonst Text)
URL=""; OFFLINE=0; ETIKETT="40x60"; DPI="203"; SPRACHE=0; TESTDRUCK=1
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
WT=0; command -v whiptail >/dev/null && [ -t 0 ] && WT=1
T="Weckwop – Sägeplatz einrichten"
frage_text() { # $1 Frage, $2 Vorgabe → Antwort auf stdout
  if [ $WT -eq 1 ]; then whiptail --title "$T" --inputbox "$1" 14 74 "$2" 3>&1 1>&2 2>&3 || echo "__ABBRUCH__"
  else read -r -p "$1 [$2]: " a < /dev/tty; echo "${a:-$2}"; fi
}
frage_ja() { # $1 Frage, $2 Vorgabe 1/0 → Rückgabe 0 = ja
  if [ $WT -eq 1 ]; then if [ "$2" = 1 ]; then whiptail --title "$T" --yesno "$1" 12 74; else whiptail --title "$T" --defaultno --yesno "$1" 12 74; fi
  else local d="j/N"; [ "$2" = 1 ] && d="J/n"; read -r -p "$1 [$d]: " a < /dev/tty; a="${a:-$([ "$2" = 1 ] && echo j || echo n)}"; [[ "$a" =~ ^[jJyY] ]]; fi
}
frage_wahl() { # $1 Frage, $2 Vorgabe, dann Paare Schlüssel Text → Schlüssel
  local q="$1" def="$2" d=""; shift 2
  if [ $WT -eq 1 ]; then whiptail --title "$T" --default-item "$def" --menu "$q" 17 78 5 "$@" 3>&1 1>&2 2>&3 || echo "__ABBRUCH__"
  else
    echo "$q" > /dev/tty
    local i=1 keys=()
    while [ $# -gt 0 ]; do echo "  $i) $2" > /dev/tty; keys+=("$1"); [ "$1" = "$def" ] && d=$i; i=$((i + 1)); shift 2; done
    read -r -p "Nummer [${d:-1}]: " a < /dev/tty; a="${a:-${d:-1}}"; echo "${keys[$((a - 1))]:-$def}"
  fi
}

abbruch() { [ "$1" = "__ABBRUCH__" ] && { echo "Abgebrochen – nichts eingerichtet."; exit 1; }; true; }
if [ -f "$CONF" ] && frage_ja "Weckwop war hier schon eingerichtet:

  Adresse:  $([ "$OFFLINE" = 1 ] && echo 'offline (auf dem Pi)' || echo "$URL")
  Etikett:  ${ETIKETT/x/ × } mm, $DPI dpi
  Sprache:  $([ "$SPRACHE" = 1 ] && echo 'offline' || echo 'aus')

Mit denselben Einstellungen aktualisieren?" 1; then
  :
else
  VOR="$([ "$OFFLINE" = 1 ] && echo offline || { [[ "$URL" =~ ^https:// ]] && echo internet || echo netz; })"
  ART="$(frage_wahl "Woher holt sich der Pi das Programm?" "$VOR" \
    netz "Server im eigenen Netz (Diskstation/Docker) – empfohlen" \
    internet "Webserver im Internet (z. B. Strato)" \
    offline "Vom Pi selbst – ohne Netz (keine Projekte vom Server)")"
  abbruch "$ART"
  OFFLINE=0
  case "$ART" in
    offline) OFFLINE=1; URL="" ;;
    netz) URL="$(frage_text "Adresse der Diskstation mit Weckwop (Docker), z. B.
  http://diskstation:8080/   oder   http://192.168.1.20:8080/" "${URL:-http://diskstation:8080/}")" ;;
    internet) URL="$(frage_text "Adresse des Webservers, z. B.
  https://www.deine-domain.de/step2maestro/" "${URL:-https://}")" ;;
  esac
  abbruch "$URL"
  ETIKETT="$(frage_text "Etikettgröße der Zebra (Breite x Höhe in mm):" "$ETIKETT")"
  abbruch "$ETIKETT"
  [[ "$ETIKETT" =~ ^[0-9]+x[0-9]+$ ]] || fail "Etikettgröße bitte als BREITExHÖHE in mm, z. B. 40x60."
  DPI="$(frage_wahl "Auflösung der Zebra (steht auf dem Typenschild):" "$DPI" 203 "203 dpi (8 Punkte/mm) – die meisten Modelle" 300 "300 dpi (12 Punkte/mm)")"
  abbruch "$DPI"
  if frage_ja "Sprachbefehle im Sägemodus offline (Vosk)?

„weiter“, „zurück“, „drucken“, „Zeichnung“ … über ein USB-Mikrofon oder Headset,
ohne Internet. Lädt einmal ca. 45 MB." "$SPRACHE"; then SPRACHE=1; else SPRACHE=0; fi
  if frage_ja "Zum Schluss ein Testetikett drucken (Zebra eingeschaltet, Etiketten eingelegt)?" "$TESTDRUCK"; then TESTDRUCK=1; else TESTDRUCK=0; fi
fi

# Adresse prüfen (erreichbar?)
URL="${URL%% }"
if [ "$OFFLINE" -eq 0 ]; then
  [[ "$URL" =~ ^https?:// ]] || fail "Adresse muss mit http:// oder https:// beginnen: $URL"
  [[ "$URL" == */ || "$URL" == *.html* || "$URL" == *#* ]] || URL="$URL/"
  if command -v curl >/dev/null; then
    if curl -fs -m 8 -o /dev/null "$URL"; then echo "  ✓ $URL ist erreichbar"
    else echo "  ! $URL antwortet gerade nicht – wird trotzdem eingetragen (Server an? Adresse richtig?)."; fi
  fi
fi
mkdir -p "$(dirname "$CONF")"
printf 'URL=%q\nOFFLINE=%q\nETIKETT=%q\nDPI=%q\nSPRACHE=%q\nTESTDRUCK=%q\n' "$URL" "$OFFLINE" "$ETIKETT" "$DPI" "$SPRACHE" "$TESTDRUCK" > "$CONF"

# ---------------------------------------------------------------- einrichten.sh mit den Antworten
ARGS=(--etikett "$ETIKETT" --dpi "$DPI")
if [ "$OFFLINE" -eq 1 ]; then ARGS+=(--offline); else ARGS+=(--url "$URL"); fi
[ "$SPRACHE" -eq 1 ] && ARGS+=(--sprache)
[ "$TESTDRUCK" -eq 1 ] && ARGS+=(--test)
echo
echo "Richte ein … (dauert einige Minuten, das Passwort des Pi wird ggf. abgefragt)"
bash "$ZIEL/einrichten.sh" "${ARGS[@]}" 2>&1 | tee "$ZIEL/installation.log"
RC="${PIPESTATUS[0]}"
[ "$RC" -eq 0 ] || fail "einrichten.sh ist mit Fehler $RC beendet – Meldungen oben."

# Verknüpfung auf dem Schreibtisch: Weckwop von Hand starten (falls das Vollbild geschlossen wurde)
DESK="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESK" ]; then
  cat > "$DESK/weckwop.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Weckwop
Comment=Weckwop im Vollbild starten (Sägeplatz)
Exec=$HOME/.local/bin/step2maestro-kiosk.sh
Icon=applications-engineering
Terminal=false
EOF
  chmod +x "$DESK/weckwop.desktop"
  echo "  ✓ Verknüpfung „Weckwop“ auf dem Schreibtisch"
fi

echo
echo "Fertig – Weckwop startet nach dem Neustart von selbst im Vollbild."
if frage_ja "Fertig eingerichtet.

Jetzt neu starten? Danach startet Weckwop von selbst im Vollbild.
(Vollbild beenden: Alt+F4)" 1; then sudo reboot; fi
exit 0
__WECKWOP_PAKET__
