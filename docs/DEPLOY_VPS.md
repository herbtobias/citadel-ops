# Citadel Ops — günstiges Self-Hosting auf einem EU-VPS (~€5/Monat)

**Ziel:** Alles (App + Postgres + Redis + HTTPS) auf **einem kleinen Server** in der EU, für ~€5/Monat.
**Für wen:** niedrigste Kosten, EU-Datenresidenz, du wartest die Maschine selbst — mit diesem Runbook
auf ein Minimum reduziert. Für die teure Autoscaling-Variante siehe [DEPLOY_GCP.md](./DEPLOY_GCP.md)
(erst nötig, wenn eine Instanz messbar zu eng wird).

Der ganze Stack kommt aus einer Datei ([`docker-compose.selfhost.yml`](../docker-compose.selfhost.yml)
ist die Vorlage; unten steht eine VPS-Variante mit Caddy davor). **Kein Vendor-Lock-in:** derselbe
Compose-Stack läuft auf jedem Docker-Host — du kannst jederzeit umziehen.

---

## 0. Kostenübersicht

| Posten         | Wahl                                                                       | ~€/Monat   |
| -------------- | -------------------------------------------------------------------------- | ---------- |
| Server         | Hetzner **CX22** (2 vCPU, 4 GB, 40 GB), Standort Nürnberg/Falkenstein (EU) | 4,59       |
| Backups        | Hetzner-Backup-Häkchen (+20 %, automatische Snapshots)                     | 0,92       |
| Domain         | z. B. `.de`/`.eu` bei einem EU-Registrar (Jahrespreis /12)                 | ~1         |
| TLS-Zertifikat | Let's Encrypt via Caddy                                                    | 0          |
| **Summe**      |                                                                            | **~€6,50** |

> Noch günstiger: **CAX11** (ARM, 2 vCPU, 4 GB) ~€3,79 — das `node:22-alpine`-Image ist Multi-Arch,
> läuft also auch auf ARM. CX22 (x86) ist der sichere Default.

**Nicht enthalten:** die Anthropic-/Claude-API-Kosten der Agenten (separater LLM-Spend, keine Infra).

---

## 1. Voraussetzungen

- Ein **Hetzner-Cloud-Konto** (console.hetzner.cloud).
- Eine **Domain** (oder Subdomain), auf die du einen DNS-A-Record setzen kannst. Caddy braucht einen
  Namen für das Zertifikat — für eine nackte IP gibt es kein HTTPS.
- Ein **SSH-Key** auf deinem Rechner (`~/.ssh/id_ed25519.pub`; falls nicht: `ssh-keygen -t ed25519`).
- Optional: SMTP-Zugang (Resend/SES/Postmark/Mailbox.org) für Einladungs-Mails.

---

## 2. Server anlegen (Hetzner Console)

1. **Add Server** → Location **Nürnberg** oder **Falkenstein** (beides DE/EU).
2. Image: **Ubuntu 24.04**. (Alternativ die App **„Docker CE"** — dann ist Docker schon installiert,
   Schritt 4 entfällt teilweise.)
3. Typ: **CX22** (oder CAX11 für ARM).
4. **Backups aktivieren** (Häkchen — das ist deine einfachste Sicherung).
5. **SSH-Key** hinzufügen (deinen Public Key einfügen).
6. **Firewall** anlegen und zuweisen: eingehend nur **22 (SSH)**, **80**, **443** erlauben.
7. Erstellen. Notiere die **IPv4-Adresse**.

---

## 3. DNS setzen

Beim Domain-Anbieter einen **A-Record** anlegen:

```
citadel.deine-domain.de   →   <Server-IPv4>
```

Kurz warten (Propagation), dann prüfen: `dig +short citadel.deine-domain.de` muss die IP zeigen,
**bevor** du Caddy startest (sonst schlägt die Zertifikatsausstellung fehl).

---

## 4. Server vorbereiten

Per SSH einloggen:

```bash
ssh root@<Server-IPv4>
```

Docker + Compose-Plugin installieren (überspringen, wenn du das „Docker CE"-Image gewählt hast):

```bash
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh
```

Automatische Sicherheits-Updates des Betriebssystems (einmalig, dann selbstständig):

```bash
apt -y install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades   # "Yes" bestätigen
```

Das nimmt dir das lästigste Ops-Thema (OS-Patches) ab.

---

## 5. Code holen

```bash
mkdir -p /opt && cd /opt
git clone <URL-deines-citadel-ops-Repos> citadel-ops
cd citadel-ops
```

> Wenn das Repo privat ist: einen Deploy-Key/Token verwenden, oder das Verzeichnis per `scp`/`rsync`
> hochladen.

---

## 6. Konfiguration (`.env`)

Zufällige Secrets erzeugen und eine `.env` im Projektordner anlegen:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"     >  .env
echo "NUXT_SESSION_PASSWORD=$(openssl rand -hex 32)" >> .env
echo "DOMAIN=citadel.deine-domain.de"                >> .env
echo "ACME_EMAIL=du@deine-domain.de"                 >> .env   # für Let's-Encrypt-Ablaufwarnungen
# Optional SMTP für Einladungs-Mails:
# echo "SMTP_HOST=smtp.eu.mailbox.org" >> .env
# echo "SMTP_PORT=587"                 >> .env
# echo "SMTP_USER=..."                 >> .env
# echo "SMTP_PASS=..."                 >> .env
# echo 'MAIL_FROM=Citadel Ops <no-reply@deine-domain.de>' >> .env
chmod 600 .env
```

`.env` ist in `.gitignore` — Secrets landen nie im Repo.

---

## 7. Prod-Stack (`docker-compose.prod.yml` + `Caddyfile`)

**Diese beiden Dateien liegen bereits im Repo** — nach `git clone` (Schritt 5) sind sie da, du musst
nichts abtippen. Sie sind hier zur Referenz abgedruckt.

**`docker-compose.prod.yml`** — App + Postgres + Redis + Caddy, nur Caddy ist von außen erreichbar:

```yaml
name: citadel

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: citadel
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in .env}
      POSTGRES_DB: citadel
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U citadel -d citadel']
      interval: 10s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 10

  app:
    build: .
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://citadel:${POSTGRES_PASSWORD}@postgres:5432/citadel
      REDIS_URL: redis://redis:6379
      NUXT_SESSION_PASSWORD: ${NUXT_SESSION_PASSWORD:?set in .env}
      NUXT_PUBLIC_APP_URL: https://${DOMAIN:?set in .env}
      RUN_MIGRATIONS: '1' # Einzelinstanz: Migration beim Start ist ok
      SEED_ON_START: ${SEED_ON_START:-0}
      CITADEL_ALLOW_SEED: ${CITADEL_ALLOW_SEED:-}
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASS: ${SMTP_PASS:-}
      MAIL_FROM: ${MAIL_FROM:-}
    expose:
      - '3000' # nur intern für Caddy, nicht am Host

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on: [app]
    ports:
      - '80:80'
      - '443:443'
    environment:
      DOMAIN: ${DOMAIN:?set in .env}
      ACME_EMAIL: ${ACME_EMAIL:-}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

**`Caddyfile`** — automatisches HTTPS, Reverse-Proxy auf die App:

```
{
    email {$ACME_EMAIL}
}

{$DOMAIN} {
    reverse_proxy app:3000
}
```

Caddy besorgt und erneuert das Let's-Encrypt-Zertifikat vollautomatisch — hier ist nichts weiter zu tun.

---

## 8. Erststart (mit einmaligem Seed)

Beim allerersten Start die Demo-Super-Admin + Org anlegen lassen, dann die Seed-Flags wieder entfernen
(erneutes Seeden **löscht** die Demo-Org):

```bash
SEED_ON_START=1 CITADEL_ALLOW_SEED=true \
  docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Logs beobachten, bis „Starting Citadel Ops" erscheint:

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

Dann im Browser `https://citadel.deine-domain.de` öffnen, als `hq@citadel.test` / `citadel123`
einloggen und **sofort das Passwort ändern**.

Danach ohne Seed-Flags neu starten (Normalbetrieb):

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Gesundheitscheck:

```bash
curl -fsS https://citadel.deine-domain.de/health
# {"status":"ok","checks":{"db":"ok","redis":"ok"},...}
```

---

## 9. Backups (zweigleisig, minimal)

1. **Hetzner-Backups** (das Häkchen aus Schritt 2) — tägliche Snapshots der ganzen VM, Ein-Klick-Restore.
   Das ist deine Grund­absicherung ohne Aufwand.
2. **Datenbank-Dump** zusätzlich (granular, schnell wiederherstellbar). Das Skript
   [`deploy/backup.sh`](../deploy/backup.sh) liegt im Repo (dumpt + gzippt, behält die letzten 7).
   Ausführbar machen und per Cron täglich laufen lassen:

```bash
chmod +x /opt/citadel-ops/deploy/backup.sh
( crontab -l 2>/dev/null; echo "30 3 * * * /opt/citadel-ops/deploy/backup.sh" ) | crontab -
```

Die Dumps landen in `/opt/citadel-ops/backups/`. Offsite-Kopie via `rclone` ist im Skript als
Kommentar vorbereitet.

> **Restore-Test einmal machen** (ungetestetes Backup = kein Backup):
> `gunzip -c /opt/backups/citadel-YYYY-MM-DD.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U citadel citadel`

**Offsite (optional, empfohlen):** die Dumps zusätzlich auf eine **Hetzner Storage Box** (EU, ~€3,20/Mon
für 1 TB) schieben — via `rclone`/`scp` im selben Cron. Schützt gegen Totalausfall der VM.

---

## 10. Laufender Betrieb (das war's an Ops)

```bash
# Update auf neue Version
cd /opt/citadel-ops && git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
# (Migrationen laufen automatisch beim App-Start)

# Status / Logs
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app

# Neustart nach Server-Reboot: passiert automatisch (restart: unless-stopped)

# Alte Images aufräumen (gelegentlich)
docker image prune -f
```

Damit hast du: automatische HTTPS-Erneuerung (Caddy), automatische OS-Sicherheits-Updates
(unattended-upgrades), automatische Container-Neustarts (`restart: unless-stopped`), tägliche VM- und
DB-Backups. Der verbleibende Aufwand ist ein `git pull && up -d --build` pro Update.

---

## 11. Wann dieser Weg _nicht_ mehr reicht

Erst wenn du (a) echtes Autoscaling / mehrere Instanzen brauchst, (b) HA ohne Single-Point-of-Failure,
oder (c) den Ops-Aufwand ganz abgeben willst — dann lohnt der Umstieg auf die managed GCP-Variante
([DEPLOY_GCP.md](./DEPLOY_GCP.md)). Für ein selbstgehostetes Agenten-Tool mit überschaubarer Nutzung
trägt dich diese eine VM sehr weit (vgl. HORIZON-Spec §5).

```

```
