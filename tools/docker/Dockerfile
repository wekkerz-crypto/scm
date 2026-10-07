# Step2Maestro auf der Diskstation (Synology Container Manager) oder jedem Docker-Rechner:
# Programm + Projektablage + Dekor-Bibliothek + KI über den Server (+ Offline-Spracherkennung für den Pi).
# Bauen und starten: docker compose up -d --build   (Daten liegen im Ordner ./daten neben dieser Datei)
FROM php:8.3-apache

RUN apt-get update \
 && apt-get install -y --no-install-recommends libpng-dev libjpeg62-turbo-dev libwebp-dev libfreetype-dev curl unzip ca-certificates \
 && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
 && docker-php-ext-install -j"$(nproc)" gd \
 && rm -rf /var/lib/apt/lists/* \
 && a2enmod headers expires deflate \
 && sed -ri 's/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf \
 && printf '%s\n' 'upload_max_filesize=80M' 'post_max_size=90M' 'memory_limit=512M' 'max_execution_time=330' 'date.timezone=Europe/Berlin' \
      'expose_php=Off' > /usr/local/etc/php/conf.d/step2maestro.ini \
 && printf '%s\n' 'ServerTokens Prod' 'ServerSignature Off' > /etc/apache2/conf-enabled/step2maestro.conf

COPY step2maestro/ /var/www/html/

# Offline-Spracherkennung (Vosk + deutsches Modell, ca. 45 MB) – für den Pi an der Säge; abschalten: SPRACHE=0
ARG SPRACHE=1
RUN if [ "$SPRACHE" = "1" ]; then set -e; d=/var/www/html/js/vendor/vosk; mkdir -p "$d" /tmp/v; cd /tmp/v; \
      curl -fsSL -o vb.tgz https://registry.npmjs.org/vosk-browser/-/vosk-browser-0.0.8.tgz && tar xzf vb.tgz && cp package/dist/vosk.js "$d/"; \
      curl -fsSL -o m.zip https://alphacephei.com/vosk/models/vosk-model-small-de-0.15.zip && unzip -q m.zip && tar czf "$d/model-de.tar.gz" vosk-model-small-de-0.15; \
      printf 'vosk-browser 0.0.8 (Apache-2.0)\nvosk-model-small-de-0.15 (Apache-2.0)\n' > "$d/LIZENZ.txt"; cd /; rm -rf /tmp/v; fi

COPY start.sh /usr/local/bin/s2m-start
RUN chmod +x /usr/local/bin/s2m-start && chown -R www-data:www-data /var/www/html

# Projekte ohne Anmeldung (Server nur im eigenen Netz); auf 0 setzen = Passwort wie Dekor-Verwaltung
ENV S2M_OFFEN=1
VOLUME /daten
EXPOSE 80
HEALTHCHECK --interval=60s --timeout=5s CMD curl -fsS http://localhost/projekte/api.php?a=list >/dev/null || exit 1
CMD ["s2m-start"]
