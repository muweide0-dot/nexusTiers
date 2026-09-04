# NexusTiers auf Railway 24/7

Dieses Repository läuft als **ein Railway-Service**:

- Express-API unter `/api`
- NexusTiers-Dashboard unter `/`
- Discord-Gateway im selben dauerhaften Node-Prozess
- PostgreSQL für Queues, Verifizierungen und Ergebnisse

Der Bot läuft nur 24/7, wenn der Railway-Service aktiv bleibt. Der Service startet bei Fehlern neu; der Discord-Gateway-Client verbindet sich zusätzlich nach Netzwerkabbrüchen automatisch neu.

## 1. Repository zu GitHub bringen

Lade den **Inhalt dieses Ordners** in ein eigenes GitHub-Repository hoch. Die Datei `package.json`, `pnpm-lock.yaml`, `railway.json` und der Ordner `artifacts/` müssen direkt im Repository-Root liegen.

## 2. Projekt in Railway erstellen

1. Railway öffnen und **New Project → Deploy from GitHub repo** wählen.
2. Das Repository auswählen.
3. Im gleichen Railway-Projekt **Add → Database → PostgreSQL** hinzufügen.
4. Railway verbindet die Datenbank über `DATABASE_URL`.
5. Einen öffentlichen Domain-Namen unter **Settings → Networking → Generate Domain** erzeugen.

`railway.json` setzt Build, Start, Healthcheck und Neustarts automatisch. Railway setzt `PORT` selbst; diesen Wert nicht überschreiben.

## 3. Variablen setzen

Unter **Variables** diese Variablen anlegen:

| Variable | Wert |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Bot-Token aus dem Discord Developer Portal |
| `API_ADMIN_KEY` | langer zufälliger Schlüssel für externe API-Schreibzugriffe |
| `DISCORD_GUILD_ID` | Server-ID deines Discord-Servers |
| `DISCORD_TESTER_ROLE_ID` | optional: Rollen-ID für Verified Tester |

`DATABASE_URL` darf nicht manuell überschrieben werden. Sie kommt von der Railway-PostgreSQL-Instanz.

Nur GET-Routen wie Dashboard, Leaderboard und Fabric-Lookup sind öffentlich. Schreibende `/api`-Routen verlangen den Header `X-API-Key: DEIN_API_ADMIN_KEY`. Discord-Slash-Commands laufen intern und benötigen diesen Header nicht. Wenn du keine externen API-Schreibzugriffe brauchst, kannst du `API_ADMIN_KEY` leer lassen; die Discord-Funktionen bleiben nutzbar.

### Discord-Bot einladen

Der Bot braucht mindestens:

- View Channels
- Send Messages
- Embed Links
- Manage Channels
- Manage Roles
- Use Application Commands

Für die Rollenvergabe muss die höchste Bot-Rolle **über** den NexusTiers-Tierrollen liegen. Aktiviere im Developer Portal außerdem den benötigten Server/Guild-Zugriff und nutze beim Einladen den `applications.commands`-Scope.

## 4. Erster Start

Nach dem Deploy:

1. In Discord `/createchannel` als Administrator ausführen.
2. Alternativ die Server-Einrichtung über die API/Dashboard-Funktion starten.
3. `request-test`, `results`, `tickets`, die Kit-Wartelisten und die Rollen werden angelegt.
4. `/verify` testen, danach `/open <kit>` und `/enter <kit>`.

## 5. Prüfen

- Dashboard: `https://DEINE-RAILWAY-DOMAIN/`
- Healthcheck: `https://DEINE-RAILWAY-DOMAIN/api/healthz`
- Railway → Deployments → Logs: `Server listening`, `Discord gateway started` und `slash commands registered`

Wenn `Discord gateway started` fehlt, ist `DISCORD_BOT_TOKEN` nicht gesetzt oder ungültig. Wenn die Datenbank fehlt, erscheint ein Fehler zu `DATABASE_URL`.

## Wichtige Hinweise

- Das Projekt speichert den gesamten NexusTiers-Zustand in einer PostgreSQL-Zeile (`nexus_state`).
- Die Tabelle wird beim Start automatisch angelegt; ein manueller `drizzle-kit push` ist für diesen Stand nicht nötig.
- Niemals den Discord-Token committen oder in den Chat/README schreiben. Nur als Railway-Variable hinterlegen.
- `mod/` ist der optionale Fabric-Client und muss für den Discord-Bot nicht mitgebaut werden.