# INTEL — Operation HORIZON

**Spezifikation: Horizontale Skalierbarkeit für Citadel Ops (Multi-Instanz-Fähigkeit)**
Version 1.0 · Ziel: Cloud Run über eine Instanz hinaus · Sprache: DE

---

## 0. Kontext & Ziel

Citadel Ops läuft heute korrekt als **Einzelinstanz**. Das Datenmodell ist bereits
parallelitätssicher (`claim-next` mit `FOR UPDATE SKIP LOCKED`, Idempotency-Keys,
atomare Transitions). Was an eine Instanz fesselt, ist ausschließlich **prozesslokaler
State**: der In-Process-Event-Bus, In-Memory-Zähler (Rate-Limit/Login-Throttle) und eine
nicht serialisierte Append-Operation auf The Wire.

**Objective (Planner-tauglicher Einzeiler):**
> Plane Operation „HORIZON": Citadel Ops multi-instanz-fähig machen, ohne SSE-Fan-out,
> Wire-Integrität oder Rate-Limit-Korrektheit zu brechen. Backplane, Serialisierung und
> durable Jobs einführen; danach Cloud-Run-Autoscaling öffnen und per Konkurrenztest belegen.

**Wichtige Ehrlichkeit vorweg:** Mission **M3 (Wire-Serialisierung)** ist **kein**
reines Skalierungs-Thema. Weil postgres.js mit einem Pool von 10 Verbindungen arbeitet,
können sich schon **innerhalb einer Instanz** zwei gleichzeitige Requests im
Read-prevHash → Insert-Fenster überholen und die Hash-Chain forken. M3 sollte
unabhängig vom Rest gemacht werden.

---

## 1. Befund aus dem Code (Ist-Zustand)

| Komponente | Datei | Zustand | Multi-Instanz-Problem |
|---|---|---|---|
| Event-Bus | `server/utils/events.ts` | `EventEmitter`, prozesslokal | **Blocker** — SSE-/Webhook-Fan-out nur instanzintern |
| SSE-Stream | `server/api/v1/events.get.ts` | subscribed lokal am Bus | Client sieht nur Events seiner Instanz |
| The Wire | `server/utils/activity.ts` → `logActivity` | Read-prevHash + Insert, **kein Lock** | **Korrektheit** — Chain forkt bei Nebenläufigkeit (auch 1-Instanz!) |
| Rate-Limit | `server/utils/ratelimit.ts` → `enforceRateLimit` | In-Memory `Map`, Fixed-Window | Limit gilt pro Instanz → N× zu großzügig |
| Login-Throttle | `server/utils/ratelimit.ts` → `assertLoginAllowed` | In-Memory `Map` | Brute-Force-Schutz N× schwächer |
| Webhooks | `server/utils/webhooks.ts` → `dispatchWebhooks` | Inline `fetch` + 1 Retry, in-process | Retry stirbt mit dem Prozess; nicht durable |
| Watchdog | `server/utils/license.ts` → `sweepExpiredLeases` | opportunistisch in `claim-next` | Sweep racet → doppeltes Re-Queue/Log (Claim selbst bleibt atomar) |
| DB-Client | `server/db/index.ts` | postgres.js, `max: 10` | N×10 Verbindungen vs. Cloud-SQL-Limit |

---

## 2. Operation-Struktur

**Codename:** HORIZON · **Typ:** Infrastruktur/Hardening · **Sektoren:** BACKEND, QA, INFRA

### Kritischer Pfad

```
        ┌─────────────── M3  (Wire-Lock, unabhängig, HÖCHSTE Prio) ───────────────┐
        │                                                                          ▼
M1 (Redis) ──▶ M2 (Event-Bus)  ─┐                                            M10 (QA-Gate)
        │  ──▶ M4 (Rate-Limit)  ─┼──▶ M9 (Cloud-Run Multi-Instanz) ──────────────▲
        │                        │                                                │
        └──────────────────────  M2+M4 blocken M9 & M10  ──────────────────────  ┘

Parallel & unabhängig: M5 (Webhooks/Cloud Tasks), M6 (Watchdog), M7 (Pooling), M8 (Migrations-Job)
```

**Empfohlene Reihenfolge:** M3 sofort (parallel zu allem) → M1 → {M2, M4} → M9 → M10.
M5–M8 einstreuen, wo Kapazität frei ist.

---

## 3. Missions

Jede Mission ist eine claimbare Einheit mit Dossier. Sektor, Priorität und
`depends_on`-Links sind so gesetzt, dass der Planner die Reihenfolge selbst ableiten kann.

---

### M1 — Redis-Backplane einführen (Memorystore)
- **Sector:** BACKEND · **Priorität:** P1 · **Depends on:** —
- **Blocks:** M2, M4
- **Dossier**
  - *Problem:* Es existiert kein geteilter Zustand zwischen Instanzen. Event-Fan-out und
    verteilte Zähler brauchen einen gemeinsamen Backplane.
  - *Plan:* `ioredis` als Dependency; neue Util `server/utils/redis.ts` mit lazy
    Singleton-Client (Pub- und Sub-Connection getrennt halten). Env `REDIS_URL`
    (+ `00.env-check.ts` erweitern). Health-Check in `/health` bzw. Echelon ergänzen.
    Lokal via docker-compose-Service, in Prod Memorystore for Redis (`europe-west3`).
  - *Affected files:* `server/utils/redis.ts` (neu), `package.json`,
    `server/plugins/00.env-check.ts`, `docker-compose.yml`, `.env.example`
  - *Acceptance:* App startet mit erreichbarem Redis; Health meldet Redis-Ready;
    ohne `REDIS_URL` sauberer Fehler beim Boot (kein stiller Fallback in Prod).
  - *Gates:* build · lint · typecheck

---

### M2 — Event-Bus auf Redis Pub/Sub umstellen
- **Sector:** BACKEND · **Priorität:** P1 · **Depends on:** M1
- **Blocks:** M9, M10
- **Dossier**
  - *Problem:* `server/utils/events.ts` nutzt einen prozesslokalen `EventEmitter`.
    SSE-Clients auf Instanz A sehen keine Events von Instanz B.
  - *Plan:* `publishEvent` publisht zusätzlich nach Redis (Channel z. B. `citadel:events`);
    ein prozessweiter Subscriber empfängt und speist den **lokalen** EventEmitter, an dem
    die SSE-Streams weiter hängen. **Öffentliche Signatur von `publishEvent`/`subscribeEvents`
    unverändert lassen** — dann bleiben `activity.ts`, `plugins/leiter.ts` und
    `events.get.ts` unberührt. Loop vermeiden: eigene Events nicht doppelt zustellen.
  - *Affected files:* `server/utils/events.ts` (nur intern), Konsument bleibt
    `server/api/v1/events.get.ts`, `server/plugins/leiter.ts` (keine Änderung nötig)
  - *Acceptance:* Zwei Instanzen; ein auf Instanz A emittiertes Event erreicht einen
    SSE-Client auf Instanz B < 500 ms; keine Doppelzustellung; Instanz-Absturz beeinträchtigt
    andere Instanzen nicht.
  - *Gates:* build · lint · typecheck · **QA-Hand-off an M10**

---

### M3 — The Wire: Append serialisieren (Advisory Lock)
- **Sector:** BACKEND · **Priorität:** P0 (höchste — unabhängig von Skalierung) · **Depends on:** —
- **Blocks:** M10
- **Dossier**
  - *Problem:* `logActivity` liest den letzten Hash (`ORDER BY createdAt DESC LIMIT 1`) und
    fügt danach ein — ohne Lock. Zwei nebenläufige Appends chainen auf denselben `prevHash`
    → Chain forkt, `verifyProjectChain` bricht. Tritt **schon bei einer Instanz** auf
    (postgres.js-Pool = 10 parallele Verbindungen).
  - *Plan:* Read-prevHash + Insert in **eine** Transaktion; davor
    `pg_advisory_xact_lock(hashtext($projectId))` (auto-release am Tx-Ende), Lock-Domäne
    pro Projekt. Alternativ Chain-Tail per `SELECT … FOR UPDATE`. Reihenfolge über einen
    monoton steigenden Wert (Sequence/`createdAt` mit Tiebreaker) absichern, nicht nur
    Timestamp-Auflösung.
  - *Affected files:* `server/utils/activity.ts` (`logActivity`), ggf.
    `server/db/schema.ts` (Sequence/Index)
  - *Acceptance:* 100 nebenläufige Appends auf dasselbe Projekt → `verifyProjectChain`
    grün, lückenlose Kette, keine zwei Einträge mit gleichem `prevHash`.
  - *Gates:* build · lint · typecheck · Integrationstest (Chain-Integrität unter Last)

---

### M4 — Rate-Limiter & Login-Throttle auf Redis
- **Sector:** BACKEND · **Priorität:** P2 · **Depends on:** M1
- **Blocks:** M9, M10
- **Dossier**
  - *Problem:* `enforceRateLimit`, `assertLoginAllowed`/`recordLoginFailure` zählen in
    In-Memory-`Map`s → pro Instanz. Bei N Instanzen ist das effektive Limit N× zu hoch und
    der Login-Brute-Force-Schutz N× schwächer.
  - *Plan:* Fixed-Window auf Redis `INCR` + `EXPIRE` (bzw. Sliding-Window-Skript). Key-Schema
    `rl:<license>:<minute>` bzw. `login:<ip+email>`. `limitCache` (Settings-Cache, 30 s) darf
    lokal bleiben — reiner Cache, nicht korrektheitskritisch.
  - *Affected files:* `server/utils/ratelimit.ts`
  - *Acceptance:* Aggregiertes Limit über alle Instanzen hinweg korrekt (Test feuert von 2
    Instanzen, Summe > Limit → 429); Login-Throttle greift instanzübergreifend.
  - *Gates:* build · lint · typecheck · QA-Hand-off an M10

---

### M5 — Webhook-Dispatch durable machen (Cloud Tasks)
- **Sector:** BACKEND/INFRA · **Priorität:** P3 · **Depends on:** —
- **Dossier**
  - *Problem:* `dispatchWebhooks` macht `fetch` + einen Retry inline im Leiter-Subscriber.
    Prozess-Neustart mitten im Retry = verlorene Zustellung; Last liegt auf der emittierenden
    Instanz.
  - *Plan:* Leiter enqueued nur noch (Cloud Tasks Queue) statt selbst zu senden; ein interner
    Endpoint `POST /api/internal/webhook-deliver` wird von Cloud Tasks mit Backoff/Retry
    aufgerufen und schreibt weiterhin in `webhookDeliveries`. HMAC-Signatur bleibt.
  - *Affected files:* `server/utils/webhooks.ts`, `server/plugins/leiter.ts`, neuer
    interner Deliver-Endpoint
  - *Acceptance:* Zustellung überlebt Instanz-Neustart; Retries mit Backoff im Delivery-Log
    sichtbar; keine Doppelzustellung über Idempotency-Header.
  - *Gates:* build · lint · typecheck

---

### M6 — Watchdog-Sweep härten
- **Sector:** BACKEND · **Priorität:** P3 · **Depends on:** —
- **Dossier**
  - *Problem:* `sweepExpiredLeases` selektiert abgelaufene Leases und updated in einer Schleife
    ohne Row-Lock. Zwei Instanzen, die gleichzeitig in `claim-next` sweepen, requeuen dieselbe
    Mission doppelt und loggen `lease_expired` doppelt. (Der eigentliche Claim bleibt via
    SKIP LOCKED atomar — nur der Sweep ist unsauber.)
  - *Plan:* Sweep auf ein einziges `UPDATE … WHERE status='in_progress' AND lease_expires_at < now()
    … RETURNING` umstellen (atomar), oder Selektion mit `FOR UPDATE SKIP LOCKED`. Log-Eintrag
    nur für tatsächlich veränderte Zeilen.
  - *Affected files:* `server/utils/license.ts` (`sweepExpiredLeases`)
  - *Acceptance:* Bei parallelem Sweep genau ein `lease_expired`-Eintrag pro abgelaufener
    Mission.
  - *Gates:* build · lint · typecheck · Integrationstest

---

### M7 — Connection-Pooling für Multi-Instanz tunen
- **Sector:** BACKEND/INFRA · **Priorität:** P2 · **Depends on:** —
- **Dossier**
  - *Problem:* `postgres(connectionString, { max: 10 })` fix. Bei N Instanzen = N×10
    Verbindungen; kleine Cloud-SQL-Tiers haben enge `max_connections`.
  - *Plan:* `max` via Env (`DB_POOL_MAX`, Default konservativ). Formel dokumentieren
    (`max_instances × DB_POOL_MAX ≤ Cloud-SQL-Limit − Reserve`). Option PgBouncer bzw.
    Cloud-SQL-Connector im Pooling-Modus für höhere Instanzzahlen vermerken.
  - *Affected files:* `server/db/index.ts`, `RUNNER.md`/Deploy-Doku
  - *Acceptance:* Pool-Größe konfigurierbar; unter Ziel-Instanzzahl keine
    „too many connections"-Fehler im Lasttest.
  - *Gates:* build · lint · typecheck

---

### M8 — Migrations aus dem Container-Start lösen (Cloud Run Job)
- **Sector:** INFRA · **Priorität:** P2 · **Depends on:** —
- **Dossier**
  - *Problem:* Migration im Entrypoint racet bei mehreren Instanzen und verzögert den
    Healthy-Zustand.
  - *Plan:* Migration aus `docker-entrypoint.sh` herauslösen; als **Cloud Run Job** mit
    demselben Image, Command auf `db:migrate` überschrieben, als Pre-Deploy-Schritt (CI oder
    manuell). App-Container startet ohne Schema-Arbeit.
  - *Affected files:* `docker-entrypoint.sh`, `drizzle.config.ts` (Migrate- statt Push-Pfad
    für Prod), CI-Workflow
  - *Acceptance:* Frischer Deploy migriert genau einmal; App-Instanzen starten ohne
    Migrationslogik; Rollback-Pfad dokumentiert.
  - *Gates:* build · lint

---

### M9 — Cloud Run für Multi-Instanz konfigurieren
- **Sector:** INFRA · **Priorität:** P2 · **Depends on:** M2, M3, M4
- **Dossier**
  - *Problem:* Autoscaling erst sicher, wenn Fan-out (M2), Wire (M3) und Rate-Limit (M4)
    verteilt-korrekt sind.
  - *Plan:* `min-instances=1` (warme SSE), `max-instances` > 1. **SSE-Besonderheit:** jeder
    SSE-Client belegt einen Request-Slot über seine ganze Lebensdauer — bei `concurrency=80`
    also max. 80 Dauerverbindungen/Instanz, danach skaliert Cloud Run trotz geringer CPU-Last
    hoch. Bei vielen Dauerverbindungen SSE-Route (`/api/v1/events`) als eigenen Service mit
    hoher Concurrency abspalten. `--timeout=3600`. Secrets via Secret Manager.
  - *Affected files:* Deploy-Skripte/`RUNNER.md`, ggf. `nuxt.config.ts` (Route-Rules für
    SSE-Split)
  - *Acceptance:* Unter Autoscaling bleiben SSE-Fan-out, Wire-Integrität und Rate-Limit
    korrekt (belegt durch M10); kein Verbindungsabriss bei Scale-Events auf min=1.
  - *Gates:* build
- *Hinweis:* Sobald `claim-next`-Contention oder Wire-Appends zum DB-Flaschenhals werden,
  ist das der Punkt für AlloyDB statt Cloud SQL — **nicht vorher**.

---

### M10 — Multi-Instanz-Konkurrenztest (QA-Gate der Operation)
- **Sector:** QA · **Priorität:** P1 · **Depends on:** M2, M3, M4
- **Dossier**
  - *Problem:* Verteilte Korrektheit muss belegt sein, bevor die Operation als „done" gilt.
  - *Plan:* Integrations-/E2E-Harness gegen ≥ 2 Instanzen (lokal via compose-Scale oder
    zwei Nitro-Prozesse + gemeinsamer Redis/Postgres). Assertions:
    (a) SSE-Fan-out über Instanzgrenze; (b) Wire-Chain grün bei nebenläufigen Appends;
    (c) Rate-Limit/Login-Throttle instanzübergreifend korrekt; (d) kein doppeltes
    `lease_expired` (falls M6 gezogen).
  - *Affected files:* `test/integration/*` (neu), CI-Matrix
  - *Acceptance:* Alle vier Assertions grün in CI; Suite reproduzierbar.
  - *Gates:* build · lint · typecheck · **required-artifact:** Testreport angehängt

---

## 4. Einspeisung in Citadel

**Variante A — per Planner-Agent (empfohlen):** Eine License mit `plan`-Scope ausstellen
(M Desk → Planner) und den Objective-Einzeiler aus §0 geben. Der Planner ruft
`plan_operation` → `create_mission` (je Mission oben) → `link_missions`. Missions per Key
adressieren; `depends_on`-Kanten aus §2/§3 als bidirektionale Referenzen setzen.

**Variante B — manuell in HQ:** Operation „HORIZON" auf der Operations-Seite anlegen, je
Mission via **New Mission** (landet in `backlog`), Dossier aus §3 eintragen, auf `ready`
groomen, Referenzen im Dossier-Drawer verlinken.

**Reihenfolge nicht vergessen:** M3 sofort freigeben (unabhängig, P0). M1 vor M2/M4.
M9/M10 erst freigeben, wenn M2+M3+M4 auf `done`.

---

## 5. Strategische Einordnung (ehrlich)

Für ein selbstgehostetes Agent-Orchestrierungstool trägt dich **eine fette Einzelinstanz +
robuste DB** vermutlich sehr weit. Der Umbau hier ist der Preis für die *erste* zweite
Instanz — mit einer Ausnahme: **M3** behebt einen Bug, der dir auch heute schon unter
paralleler Last still die Tamper-Evidence korrumpieren kann. M3 würde ich unabhängig von der
Skalierungsentscheidung einplanen. Den Rest erst ziehen, wenn Echelon dir zeigt, dass eine
Instanz messbar zu eng wird.
