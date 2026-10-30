# Bambu Dashboard

Ein selbst gehostetes Web-Dashboard für Bambu-Lab-3D-Drucker im LAN, mit Live-Status, Kamerabild und Schnellsteuerung.

- Status: Fortschritt, Schicht, Restzeit, Temperaturen, Lüfter, WLAN, HMS-Meldungen
- Kamera als MJPEG: interne Druckerkamera (A1/P1 über Port 6000, X1/H2D/P2S über RTSPS) oder beliebige RTSP-Kamera
- Steuerung: Licht, Düsen- und Bett-Temperatur, Lüfter, Geschwindigkeitsstufe, Pause/Fortsetzen/Stopp
- Filament: externe Spule(n) sowie AMS, AMS lite, AMS HT und AMS 2 Pro anzeigen; Material, Farbe und Temperaturbereich ändern
- Mehrere Drucker, Login per Passwort, Oberfläche auf Deutsch und Englisch, Hell/Dunkel

## Voraussetzungen am Drucker

- Drucker und Dashboard-Server befinden sich im selben Netz.
- **IP-Adresse**, **Seriennummer** und **Access Code** findest du am Drucker unter Einstellungen → WLAN/Netzwerk.
- Je nach Firmware nimmt der Drucker Steuerbefehle von Drittanbieter-Software nur im **LAN-only-Modus mit aktiviertem Entwicklermodus** an. Statusanzeige und Kamera funktionieren meist auch ohne.
- X1, H2D und P2S: **LAN Only Liveview** aktivieren, damit die Kamera per RTSPS erreichbar ist.

## Deployment (Docker)

```bash
git clone <repo-url> bambu-dashboard && cd bambu-dashboard
cp .env.example .env    # ADMIN_PASSWORD und SESSION_SECRET setzen
docker compose up -d --build
```

Danach ist das Dashboard unter `http://<vm-ip>:3000` erreichbar. Die Druckerkonfiguration liegt im Docker-Volume `bambu-data` (`/data/config.json`).

Update:

```bash
git pull && docker compose up -d --build
```

Wenn das Dashboard per HTTPS hinter einem Reverse Proxy läuft, setze `COOKIE_SECURE=true`. Der Proxy muss WebSockets für `/api/ws` durchreichen.

### Umgebungsvariablen

| Variable         | Bedeutung                                                    |
| ---------------- | ------------------------------------------------------------ |
| `ADMIN_PASSWORD` | Passwort für den Login (Pflicht)                             |
| `SESSION_SECRET` | Schlüssel für Session-Cookies (`openssl rand -hex 32`)       |
| `PORT`           | HTTP-Port (Standard `3000`)                                  |
| `COOKIE_SECURE`  | `true` bei HTTPS                                             |
| `MOCK_PRINTERS`  | `1` legt simulierte Drucker an, wenn keine konfiguriert sind |
| `LOG_LEVEL`      | `info` (Standard), `debug`, `warn` …                         |

## Entwicklung

Voraussetzungen: Node.js 22 und, für die Kamera, `ffmpeg`.

```bash
npm install
ADMIN_PASSWORD=dev npm run dev:mock   # Backend :3000 + Vite :5173 mit simulierten Druckern
npm test                              # Unit-Tests
npm run typecheck
npm run lint
```

Im Mock-Modus liefert die Kamera ein ffmpeg-Testbild. Ein Drucker mit der Host-Adresse `mock` ist immer simuliert.

### Aufbau

```
shared/   Gemeinsame Typen, Modellprofile, Filament-Presets
server/   Fastify-Backend: MQTT-Anbindung, Statusmodell, Befehle, Kamera-Proxy, Auth
web/      React-Frontend (Vite), i18n in web/src/i18n
```

- `server/src/printer/state.ts`: führt die (teils nur inkrementellen) MQTT-Reports zusammen und leitet daraus den Status ab
- `server/src/printer/commands.ts`: übersetzt Dashboard-Befehle in MQTT-Payloads
- `server/src/camera/`: Kameraquellen (Bambu-JPEG-Protokoll, ffmpeg/RTSP), gemeinsam genutzt von allen Zuschauern
- `shared/src/models.ts`: Fähigkeiten je Druckermodell (Kameratyp, Lüfter, Maximaltemperaturen)

## Bekannte Einschränkungen

- H2D: Die zweite Düse wird noch nicht separat angezeigt oder gesteuert.
- Funktionen für Modelle und AMS-Varianten ohne Testhardware sind nur mit simulierten Daten geprüft.
