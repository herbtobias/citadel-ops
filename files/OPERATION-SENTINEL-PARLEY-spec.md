# INTEL — Operationen SENTINEL & PARLEY

**Zwei Feature-Spezifikationen, plan-bar im Citadel-Missions-Format.**
Companion zu `OPERATION-HORIZON-spec.md` · Version 1.0 · Sprache: DE

Beide entstammen dem Abgleich mit fremden Ansätzen:
- **SENTINEL** ← Context-Engineering (Fehlermodus *Poisoning*): die geteilte Archive
  gegen vergiftetes Wissen absichern.
- **PARLEY** ← 12-Factor-Agents (F6/F7): „einen Menschen kontaktieren" als
  *wiederaufnehmbaren* Tool-Call statt als Sackgasse.

> **Gemeinsame Vorarbeit (einmalig, beide nutzen sie):** ein kleiner Helper
> „Dossier-Addendum" — hängt einen strukturierten Abschnitt (Antwort bzw. Verdikt) an
> `dossiers.sections` an, sodass er im nächsten **Briefing** landet. Beide Operationen
> schreiben ihr Ergebnis über diesen Helper zurück (Resume/Certify über geteilten State,
> nicht über Thread-Replay). Einmal bauen, nicht doppelt. → als Mission **X0** vorziehen.

---

# Operation SENTINEL

**Archive-Poisoning-Abwehr: Validate & Quarantine für Schreibzugriffe auf das Langzeitgedächtnis.**

## Kontext & Ziel

Citadels Differenzierer ist die *geteilte, durable* Archive, die alle Agenten lesen. Das
ist zugleich die größte Poisoning-Fläche: Schreibt ein Scout/Interrogator/Archivist einen
falschen „Fakt" in einen `knowledge_docs`-Eintrag, erbt ihn jeder Downstream-Agent über
Missions und Wochen. Befund aus dem Code: `knowledge_docs` hat **keinen Status** — der
Write-Pfad (`server/api/v1/agent/knowledge/index.post.ts`) upsertet Docs sofort live, und
das **Briefing** liest sie ungefiltert. Der Cold Read validiert heute *Pläne* (Dossiers),
nicht *Fakten* (Knowledge).

**Objective (Planner-Einzeiler):**
> Plane Operation „SENTINEL": Wissen, das in die Archive geschrieben wird, landet zunächst
> in Quarantäne; erst ein Fakten-Cold-Read (zero-context, fremder Actor) oder HQ zertifiziert
> es; das Briefing liest ausschließlich zertifiziertes Wissen. Damit kann kein unbestätigter
> Fakt Downstream-Agenten vergiften.

**Kern-Mechanik:** `quarantined → (verify) → certified | rejected`; Briefing-Select filtert
auf `certified`. Das Cold-Read-Prinzip von der Plan- auf die Wissensebene gehoben.

## Missions

### S1 — Schema: Knowledge-Status + Quarantäne-Default
- **Sector:** BACKEND · **Prio:** P1 · **Depends on:** —  · **Blocks:** S2, S3, S4
- **Dossier**
  - *Problem:* `knowledge_docs` kennt keinen Vertrauenszustand.
  - *Plan:* Neues `pgEnum knowledgeStatus ['quarantined','certified','rejected']`;
    Spalte `status` auf `knowledge_docs` (**default `quarantined`**); Felder
    `verifiedByLicenseId`/`verifiedByUserId`, `verifiedAt`, `rejectionReason`. Migration.
    Bestehende Seed-/Demo-Docs auf `certified` migrieren (sonst ist die Demo-Archive leer).
  - *Affected files:* `server/db/schema.ts` (Enum + `knowledgeDocs`), neue Migration,
    `scripts/seed*`
  - *Acceptance:* Neuer Doc ist ohne weiteres Zutun `quarantined`; Seed-Archive `certified`.
  - *Gates:* build · typecheck · Integrationstest (Default-Status)

### S2 — Write-Pfad quarantänt + benachrichtigt
- **Sector:** BACKEND · **Prio:** P1 · **Depends on:** S1 · **Blocks:** S5, S6
- **Dossier**
  - *Problem:* Agent-Writes werden sofort Ground-Truth.
  - *Plan:* `agent/knowledge/index.post.ts` schreibt explizit `quarantined`; Wire-Event
    `knowledge_quarantined`; via Leiter eine `knowledge_quarantined`-Notification an HQ
    (`notificationType`-Enum erweitern). `finish.post.ts` meldet zusätzlich die Zahl offener
    Quarantäne-Docs.
  - *Affected files:* `server/api/v1/agent/knowledge/index.post.ts`,
    `server/api/v1/agent/knowledge/finish.post.ts`, `server/db/schema.ts`
    (`notificationType`), `server/plugins/leiter.ts` (Mapping)
  - *Acceptance:* Agent-Write erzeugt Quarantäne-Doc + genau eine HQ-Notification.
  - *Gates:* build · lint · typecheck

### S3 — Fakten-Cold-Read: Verify-Endpoint (certify/reject)
- **Sector:** BACKEND · **Prio:** P1 · **Depends on:** S1 · **Blocks:** S6
- **Dossier**
  - *Problem:* Es fehlt der Prüfschritt, der Wissen freigibt.
  - *Plan:* `POST /api/v1/knowledge/:id/verify` — spiegelt das Muster von
    `dossiers/[id]/cold-read.post.ts`: Verdikt `certify|reject`, `notes`, bei reject
    `reason`. **Zero-context-Regel** übernehmen — der Verifizierer darf **nicht** die License
    sein, die den Doc geschrieben hat (fremder Actor **oder** HQ-Session mit Manager-Rechten).
    `certify → certified`, `reject → rejected`. Wire-Log `knowledge_certified` /
    `knowledge_rejected`.
  - *Affected files:* `server/api/v1/knowledge/[id]/verify.post.ts` (neu),
    `server/utils/validation.ts` (Schema), ggf. `knowledgeVerdict`-Enum
  - *Acceptance:* Autor-License kann eigenen Doc nicht zertifizieren (403);
    certify/reject setzen Status + Wire-Eintrag korrekt.
  - *Gates:* build · lint · typecheck · Integrationstest (Selbst-Zertifizierung geblockt)

### S4 — Briefing liest nur `certified` (die eigentliche Eindämmung)
- **Sector:** BACKEND · **Prio:** P0 · **Depends on:** S1 · **Blocks:** S6
- **Dossier**
  - *Problem:* Solange das Briefing ungefiltert liest, nützt Quarantäne nichts.
  - *Plan:* In `server/api/v1/projects/[id]/briefing.get.ts` (und jedem weiteren Pfad, der
    Knowledge in Kontext speist — Archivist/`knowledge.get.ts` prüfen) den Archive-Select auf
    `status = 'certified'` einschränken. Quarantäne-/Rejected-Docs erscheinen nur in der
    HQ-Review-Ansicht, nie im Agenten-Briefing.
  - *Affected files:* `server/api/v1/projects/[id]/briefing.get.ts`,
    `server/api/v1/projects/[id]/knowledge.get.ts` (Query-Param `?status=` für HQ)
  - *Acceptance:* Ein `quarantined` Doc taucht in **keinem** Briefing auf; nach `certify`
    erscheint er; nach `reject` nie.
  - *Gates:* build · lint · typecheck · Integrationstest (Briefing-Filter)

### S5 — HQ-UI: Quarantäne-Queue + MCP
- **Sector:** FRONTEND/BACKEND · **Prio:** P2 · **Depends on:** S2, S3
- **Dossier**
  - *Plan:* Archive-/Q-Branch-Seite um eine **Quarantäne-Queue** erweitern (Liste offener
    Docs, Diff/Body-Vorschau, Certify/Reject-Aktion mit Reason). `citadel_write_knowledge`-
    Tool-Beschreibung um den Quarantäne-Hinweis ergänzen; optional `citadel_verify_knowledge`
    für einen dedizierten Validator-Agenten (fremder Actor).
  - *Affected files:* `app/pages/**` (Archive/Q-Branch), `mcp/citadel.ts`
  - *Acceptance:* HQ kann aus der Queue certify/reject; Aktion spiegelt sich sofort im
    Briefing wider.
  - *Gates:* build · lint · typecheck

### S6 — QA-Gate: Poisoning-Szenario
- **Sector:** QA · **Prio:** P1 · **Depends on:** S4 (·S2·S3)
- **Dossier**
  - *Plan:* E2E: Scout schreibt einen falschen Fakt → Doc `quarantined`; ein Downstream-Agent
    zieht ein Briefing → Fakt **nicht** enthalten; HQ `reject` → bleibt draußen; alternativer
    Fakt `certify` → erscheint. Zero-context-Verletzung (Selbst-Zertifizierung) → 403.
  - *Acceptance:* Alle Assertions grün in CI; Testreport als Artefakt angehängt.
  - *Gates:* build · lint · typecheck · required-artifact: Testreport

## Design-Spannung (ehrlich)
Quarantäne-by-default bremst das **Brownfield-Onboarding**: ein Scout schreibt viele Docs,
die dann alle zertifiziert werden müssten, bevor der Planner sie nutzen kann. Empfehlung:
(a) HQ-**Bulk-Certify** nach einem Recon-Run (eine Aktion für den ganzen Run) und
(b) HQ-*geschriebene* Docs gelten sofort als `certified` — Zertifizierung ist nur für
*Agent*-Writes Pflicht. Damit trifft die Reibung nur dort, wo das Risiko sitzt.

---

# Operation PARLEY

**Human-in-the-loop als wiederaufnehmbarer Tool-Call.**

## Kontext & Ziel

Heute: Stößt ein Agent auf eine offene Frage, ruft er `block` oder stallt; die Lease läuft
ab; `sweepExpiredLeases` requeued die Mission nach `ready`; ein **frischer** Agent beginnt
**von vorn**. Es gibt kein durables „diesen Agenten anhalten, bis HQ antwortet, dann weiter".
12-Factor F7 macht „Mensch fragen" zu einem first-class Tool-Call, der den Vorgang durable
suspendiert (F6) und über einen externen Trigger fortsetzt.

**Objective (Planner-Einzeiler):**
> Plane Operation „PARLEY": ein Agent kann per Tool eine menschliche Entscheidung anfordern;
> die Mission geht in einen wartenden, vom Watchdog ausgenommenen Zustand; HQ antwortet; die
> Antwort landet im Dossier und damit im nächsten Briefing; die Mission wird fortgesetzt.

**Kern-Mechanik:** neuer Status `waiting_human` (getrennt von `blocked` = Hindernis);
Watchdog-Ausnahme = durable Suspendierung; Resume über Dossier-Addendum (konsistent mit
Fresh-Context, kein Thread-Replay).

## Missions

### P1 — State-Machine: `waiting_human` einführen
- **Sector:** BACKEND · **Prio:** P1 · **Depends on:** —  · **Blocks:** P2, P3, P4
- **Dossier**
  - *Problem:* Kein Zustand für „wartet auf Mensch".
  - *Plan:* `missionStatus`-Enum um `waiting_human` erweitern; in
    `server/utils/state-machine.ts` Übergänge: `in_progress → waiting_human` und
    `waiting_human → in_progress | ready | cancelled`. Board-`statusColumns` +
    i18n-Label (EN/DE) ergänzen.
  - *Affected files:* `server/db/schema.ts` (Enum, Migration),
    `server/utils/state-machine.ts`, Board-Config, `i18n/locales/*`
  - *Acceptance:* Übergänge legal/illegal wie spezifiziert; Board zeigt die Spalte.
  - *Gates:* build · typecheck · Unit (state-machine)

### P2 — Watchdog-Ausnahme (die durable Suspendierung)
- **Sector:** BACKEND · **Prio:** P0 · **Depends on:** P1 · **Blocks:** P6
- **Dossier**
  - *Problem:* `sweepExpiredLeases` würde eine wartende Mission bei Lease-Ablauf requeuen und
    den Wartezustand vernichten.
  - *Plan:* Sweep-Query in `server/utils/license.ts` nur auf `status='in_progress'`
    beschränken (ist bereits so) — **sicherstellen**, dass `waiting_human` nie erfasst wird;
    beim Übergang `in_progress → waiting_human` `leaseExpiresAt`/`heartbeatAt` nullen (Lease-Uhr
    anhalten), damit auch spätere Watchdog-Varianten sie nicht anfassen.
  - *Affected files:* `server/utils/license.ts` (`sweepExpiredLeases`),
    Transition-Handler
  - *Acceptance:* Eine `waiting_human`-Mission überlebt einen kompletten Lease-Ablauf ohne
    Requeue.
  - *Gates:* build · typecheck · Integrationstest (kein Requeue)

### P3 — `request_human_input`: Endpoint + Agent-Tool
- **Sector:** BACKEND · **Prio:** P1 · **Depends on:** P1 · **Blocks:** P4
- **Dossier**
  - *Plan:* `POST /api/v1/agent/missions/:id/request-human-input` — Body `{ question,
    context, options:{ urgency:'low'|'medium'|'high', format:'free_text'|'yes_no'|
    'multiple_choice', choices?:string[] } }`. Transition `in_progress → waiting_human`;
    Frage per Dossier-Addendum-Helper (**X0**) an `dossiers.sections` hängen; Wire-Event
    `human_input_requested`; `notificationType` erweitern → HQ-Bell. Neues MCP-Tool
    `citadel_request_human_input` in `mcp/citadel.ts`.
  - *Affected files:* `server/api/v1/agent/missions/[id]/request-human-input.post.ts` (neu),
    `server/utils/validation.ts`, `server/db/schema.ts` (`notificationType`),
    `server/plugins/leiter.ts`, `mcp/citadel.ts`, `.claude/skills/citadel-work/SKILL.md`
    (Loop um den Fall erweitern)
  - *Acceptance:* Tool-Call parkt die Mission in `waiting_human`, Frage sichtbar im Dossier,
    genau eine HQ-Notification.
  - *Gates:* build · lint · typecheck · MCP-Tool-Test

### P4 — Antwort + Resume-über-Archive
- **Sector:** BACKEND · **Prio:** P1 · **Depends on:** P1, P3 · **Blocks:** P6
- **Dossier**
  - *Plan:* `POST /api/v1/missions/:id/answer-human-input` (HQ-Session) — Antwort per
    Dossier-Addendum (**X0**) anhängen, damit sie im nächsten Briefing steht; Transition
    `waiting_human → ready` (neu claimbar) **oder** `→ in_progress` (falls dieselbe License
    noch lebt — konfigurierbar). Wire-Event `human_input_answered`; Notification an den
    ursprünglichen Agenten/Sektor.
  - *Affected files:* `server/api/v1/missions/[id]/answer-human-input.post.ts` (neu),
    Dossier-Addendum-Helper, `server/plugins/leiter.ts`
  - *Acceptance:* Nach Antwort enthält das Briefing der fortsetzenden Mission die Antwort;
    Mission ist wieder aktiv.
  - *Gates:* build · lint · typecheck · Integrationstest (Antwort → Briefing)

### P5 — HQ-UI: `waiting_human`-Spalte + Antwort-Affordance
- **Sector:** FRONTEND · **Prio:** P2 · **Depends on:** P3, P4
- **Dossier**
  - *Plan:* Board-Spalte/Badge `waiting_human` mit **inline sichtbarer Frage**; Antwort-Dialog
    (respektiert `format`/`choices`); Situation-Room-Panel „Wartet auf HQ"; Bell-Eintrag.
  - *Affected files:* `app/pages/**` (Board, Situation Room), `app/components/**`
  - *Acceptance:* HQ sieht offene Fragen zentral und beantwortet sie in einem Schritt.
  - *Gates:* build · lint · typecheck

### P6 — QA-Gate: Ask → Suspend → Answer → Resume
- **Sector:** QA · **Prio:** P1 · **Depends on:** P2, P4
- **Dossier**
  - *Plan:* E2E: Agent fragt → Mission `waiting_human`; Lease läuft ab → **kein** Requeue
    (P2); HQ antwortet → Antwort im Briefing der fortsetzenden Mission (P4); Ende-zu-Ende
    genau einmal, idempotent.
  - *Acceptance:* Alle Assertions grün; Testreport angehängt.
  - *Gates:* build · lint · typecheck · required-artifact: Testreport

---

# Sequenzierung & Einordnung

**Reihenfolge je Operation:**
- **X0** (Dossier-Addendum-Helper) zuerst — beide brauchen ihn.
- SENTINEL: S1 → {S2, S3, S4} → {S5, S6}. **S4 ist P0** — ohne den Briefing-Filter ist die
  ganze Operation kosmetisch.
- PARLEY: P1 → {P2, P3} → P4 → {P5, P6}. **P2 ist P0** — ohne Watchdog-Ausnahme ist die
  „durable" Suspendierung nicht durable.

**Aufwand:** Beide sind deutlich kleiner als HORIZON (je ~1 Sprint), weil sie auf
vorhandene Muster aufsetzen — SENTINEL spiegelt den Cold Read, PARLEY erweitert die
State-Machine + den Notification-Fan-out, den es schon gibt.

**Priorisierung (ehrlich):**
- **SENTINEL** ist *Risiko-Reduktion*: Es schließt die Kante, die durch die geteilte durable
  Memory am gefährlichsten ist (ein falscher Fakt, der still alle Agenten vergiftet). Der
  Blast-Radius rechtfertigt es unabhängig von Skalierung.
- **PARLEY** ist *Fähigkeits-Gewinn*: Agenten, die an Mehrdeutigkeit sauber anhalten statt
  Arbeit wegzuwerfen. Höherer UX-Wert, geringeres Risiko.

Beide sind unabhängig von HORIZON planbar. Berührungspunkt: alle drei erweitern
`notificationType` und schreiben ins Briefing/Dossier — den **X0-Helper** einmal bauen und
von beiden nutzen lassen.

# Einspeisung in Citadel
Wie bei HORIZON: entweder per Planner-Agent (`plan`-Scope, Objective-Einzeiler oben →
`plan_operation → create_mission → link_missions`) oder manuell über **New Mission** mit den
Dossiers aus dieser Datei. `depends_on`-Kanten als bidirektionale Referenzen setzen; die
P0-Missions (S4, P2) und X0 zuerst auf `ready` groomen.
