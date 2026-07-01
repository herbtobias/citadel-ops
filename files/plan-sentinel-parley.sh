#!/bin/sh
# Seed Operations SENTINEL (Archive poisoning defense) and PARLEY (human-in-the-loop
# resumable tool call) into Citadel HQ — over plain REST, no jq.
#
#   CITADEL_LICENSE=lic_008_demo sh plan-sentinel-parley.sh            # both
#   CITADEL_LICENSE=lic_008_demo sh plan-sentinel-parley.sh sentinel   # only SENTINEL
#   CITADEL_LICENSE=lic_008_demo sh plan-sentinel-parley.sh parley     # only PARLEY
#   CITADEL_URL=https://hq.example.com MISSION_STATUS=ready \
#     CITADEL_LICENSE=lic_xxx sh plan-sentinel-parley.sh
#
# Requires a License carrying the `plan` scope (M Desk → "Planner", or the seeded
# demo planner lic_008_demo). REST equivalent of:
#   citadel_plan_operation → citadel_create_mission ×N → citadel_link_missions
# Operations, parents and links are addressed BY KEY (OP-1 / BACKEND-42), not UUID.
#
# Mirrors examples/plan-operation.sh. Missions are created with `status`=$MISSION_STATUS
# (default "backlog" so you can groom / run a design+Cold Read pass first; set to "ready"
# to make them immediately claimable). Dependencies are encoded as `blocked_by` links,
# so the HQ board shows the ordering.
set -e

URL="${CITADEL_URL:-http://localhost:3000}"
LIC="${CITADEL_LICENSE:?set CITADEL_LICENSE to a plan-scoped license key}"
AUTH="Authorization: Bearer $LIC"
JSON="Content-Type: application/json"
MISSION_STATUS="${MISSION_STATUS:-backlog}"
WHICH="${1:-all}"

# Pull the top-level "key" out of a JSON response (tolerates pretty-printed output).
first_key() { grep -oE '"key": *"[^"]+"' | head -1 | sed -E 's/.*"key": *"([^"]+)".*/\1/'; }

# create_operation  <codename> <objective> <sectorsJSON>
create_operation() {
  curl -s -X POST "$URL/api/v1/agent/operations" -H "$AUTH" -H "$JSON" \
    -d "{\"codename\":\"$1\",\"objective\":\"$2\",\"sectorsInScope\":$3,\"activate\":true}" \
    | first_key
}

# create_mission  <title> <sector> <type> <priority> <opKey> <acceptanceJSON> <briefing>
# NOTE: <title>/<briefing> must not contain double quotes. <acceptanceJSON> is a raw
# JSON array literal, e.g. '["a","b"]'.
create_mission() {
  curl -s -X POST "$URL/api/v1/agent/missions" -H "$AUTH" -H "$JSON" \
    -d "{\"title\":\"$1\",\"sector\":\"$2\",\"type\":\"$3\",\"priority\":\"$4\",\"operationKey\":\"$5\",\"status\":\"$MISSION_STATUS\",\"acceptanceCriteria\":$6,\"briefing\":\"$7\"}" \
    | first_key
}

# link  <sourceKey> <targetKey> <linkType>   (e.g. "S2 blocked_by S1")
link() {
  curl -s -X POST "$URL/api/v1/agent/links" -H "$AUTH" -H "$JSON" \
    -d "{\"sourceKey\":\"$1\",\"targetKey\":\"$2\",\"linkType\":\"$3\"}" \
    -o /dev/null -w "  → link $1 -[$3]-> $2 (HTTP %{http_code})\n"
}

echo "▸ check-in"
curl -s -X POST "$URL/api/v1/agent/check-in" -H "$AUTH" -o /dev/null -w "  → HTTP %{http_code}\n"
echo "  (creating missions as status=$MISSION_STATUS)"
echo

# ─────────────────────────────────────────────────────────────────────────────
# Operation SENTINEL — Archive poisoning defense (validate & quarantine writes)
# ─────────────────────────────────────────────────────────────────────────────
plan_sentinel() {
  echo "═══ Operation SENTINEL ═══"
  OPS=$(create_operation "Sentinel" \
    "Knowledge written to the Archive lands quarantined; a facts Cold Read (zero-context) or HQ certifies it; the Briefing reads only certified knowledge, so no unverified fact can poison downstream agents." \
    '["BACKEND","FRONTEND","QA"]')
  echo "  → operation $OPS"

  S1=$(create_mission \
    "Schema: knowledge status + quarantine default" BACKEND chore high "$OPS" \
    '["A new knowledge doc is quarantined without further action","Seed/demo docs migrate to certified"]' \
    "Problem: knowledge_docs has no trust state; agent writes become ground truth immediately. Plan: add pgEnum knowledgeStatus [quarantined,certified,rejected]; status column on knowledge_docs default quarantined; verifiedBy/verifiedAt/rejectionReason fields; migration; migrate seed docs to certified. Affected: server/db/schema.ts, new migration, scripts/seed. Gates: build, typecheck, integration test.")
  echo "  → mission S1 $S1 (schema)"

  S2=$(create_mission \
    "Write path quarantines + notifies HQ" BACKEND feature high "$OPS" \
    '["Agent write yields a quarantined doc plus exactly one HQ notification"]' \
    "Problem: agent writes go live instantly. Plan: agent/knowledge/index.post.ts writes quarantined explicitly; Wire event knowledge_quarantined; Leiter raises a knowledge_quarantined notification; finish.post.ts reports open quarantine count. Affected: server/api/v1/agent/knowledge/index.post.ts, finish.post.ts, schema.ts notificationType, server/plugins/leiter.ts. Gates: build, lint, typecheck.")
  echo "  → mission S2 $S2 (write path)"

  S3=$(create_mission \
    "Facts Cold Read: verify endpoint (certify/reject)" BACKEND feature high "$OPS" \
    '["Author license cannot certify its own doc (403)","certify/reject set status and Wire entry correctly"]' \
    "Problem: no review step releases knowledge. Plan: POST /api/v1/knowledge/:id/verify mirroring dossiers cold-read.post.ts; verdict certify or reject with reason; zero-context rule (verifier must not be the author license; foreign actor or HQ manager); certify to certified, reject to rejected; Wire log. Affected: server/api/v1/knowledge/[id]/verify.post.ts (new), server/utils/validation.ts. Gates: build, lint, typecheck, integration test (self-certification blocked).")
  echo "  → mission S3 $S3 (facts cold read)"

  S4=$(create_mission \
    "Briefing reads only certified (the containment)" BACKEND feature urgent "$OPS" \
    '["A quarantined doc appears in NO briefing","after certify it appears","after reject it never does"]' \
    "Problem: while the Briefing reads unfiltered, quarantine is useless. Plan: in projects/[id]/briefing.get.ts and every path that feeds knowledge into context, restrict the Archive select to status=certified; quarantined/rejected show only in the HQ review view. Affected: server/api/v1/projects/[id]/briefing.get.ts, projects/[id]/knowledge.get.ts (add ?status= for HQ). Gates: build, lint, typecheck, integration test (briefing filter). NOTE: P0 — without this the whole operation is cosmetic.")
  echo "  → mission S4 $S4 (briefing filter, P0)"

  S5=$(create_mission \
    "HQ UI: quarantine queue + MCP" FRONTEND feature medium "$OPS" \
    '["HQ can certify/reject from the queue","the action is reflected in the briefing immediately"]' \
    "Plan: extend the Archive/Q-Branch page with a quarantine queue (open docs, body preview, certify/reject with reason); update citadel_write_knowledge tool description with the quarantine note; optional citadel_verify_knowledge for a dedicated validator agent. Affected: app/pages (Archive/Q-Branch), mcp/citadel.ts. Gates: build, lint, typecheck.")
  echo "  → mission S5 $S5 (HQ UI)"

  S6=$(create_mission \
    "QA gate: poisoning scenario" QA test high "$OPS" \
    '["All assertions green in CI","test report attached as artifact"]' \
    "Plan: E2E — Scout writes a wrong fact (doc quarantined); a downstream agent pulls a briefing (fact NOT included); HQ reject keeps it out; an alternative fact certify makes it appear; zero-context violation (self-certification) returns 403. Gates: build, lint, typecheck, required-artifact: test report.")
  echo "  → mission S6 $S6 (QA gate)"

  echo "  · linking dependencies (blocked_by)"
  link "$S2" "$S1" blocked_by
  link "$S3" "$S1" blocked_by
  link "$S4" "$S1" blocked_by
  link "$S5" "$S2" blocked_by
  link "$S6" "$S2" blocked_by
  link "$S6" "$S3" blocked_by
  link "$S6" "$S4" blocked_by
  echo "  ✓ SENTINEL $OPS seeded (S4 is the P0 containment mission)."
  echo
}

# ─────────────────────────────────────────────────────────────────────────────
# Operation PARLEY — human-in-the-loop as a resumable tool call
# ─────────────────────────────────────────────────────────────────────────────
plan_parley() {
  echo "═══ Operation PARLEY ═══"
  OPP=$(create_operation "Parley" \
    "An agent can request a human decision via a tool; the mission enters a waiting state exempt from the watchdog; HQ answers; the answer lands in the dossier and thus the next briefing; the mission resumes." \
    '["BACKEND","FRONTEND","QA"]')
  echo "  → operation $OPP"

  X0=$(create_mission \
    "Shared: dossier-addendum helper" BACKEND chore high "$OPP" \
    '["A structured section can be appended to dossiers.sections and shows up in the next briefing"]' \
    "Shared prerequisite (also reusable by SENTINEL). Plan: a small helper that appends a structured section (answer/verdict) to dossiers.sections so it surfaces in the next Briefing — resume/certify over shared state, not thread replay. Build once, reuse. Affected: server/utils (new helper), dossier write paths. Gates: build, typecheck.")
  echo "  → mission X0 $X0 (shared helper)"

  P1=$(create_mission \
    "State machine: introduce waiting_human" BACKEND feature high "$OPP" \
    '["Transitions legal/illegal as specified","board shows the column"]' \
    "Problem: no state for waiting-on-human. Plan: extend missionStatus enum with waiting_human; in server/utils/state-machine.ts add transitions in_progress->waiting_human and waiting_human->in_progress|ready|cancelled; add board statusColumns + EN/DE labels. Affected: server/db/schema.ts (enum, migration), server/utils/state-machine.ts, board config, i18n/locales. Gates: build, typecheck, unit (state-machine).")
  echo "  → mission P1 $P1 (state machine)"

  P2=$(create_mission \
    "Watchdog exemption (durable suspend)" BACKEND bugfix urgent "$OPP" \
    '["A waiting_human mission survives a full lease expiry without requeue"]' \
    "Problem: sweepExpiredLeases would requeue a waiting mission on lease expiry and destroy the wait. Plan: keep the sweep query restricted to status=in_progress and ensure waiting_human is never caught; on in_progress->waiting_human null leaseExpiresAt/heartbeatAt (pause the lease clock). Affected: server/utils/license.ts (sweepExpiredLeases), transition handler. Gates: build, typecheck, integration test (no requeue). NOTE: P0 — without this the suspend is not durable.")
  echo "  → mission P2 $P2 (watchdog exemption, P0)"

  P3=$(create_mission \
    "request_human_input: endpoint + agent tool" BACKEND feature high "$OPP" \
    '["Tool call parks the mission in waiting_human","question visible in the dossier","exactly one HQ notification"]' \
    "Plan: POST /api/v1/agent/missions/:id/request-human-input with question, context, options{urgency,format,choices}; transition in_progress->waiting_human; append the question via the X0 dossier-addendum helper; Wire event human_input_requested; extend notificationType for HQ bell; new MCP tool citadel_request_human_input. Affected: server/api/v1/agent/missions/[id]/request-human-input.post.ts (new), server/utils/validation.ts, schema.ts (notificationType), server/plugins/leiter.ts, mcp/citadel.ts, .claude/skills/citadel-work/SKILL.md. Gates: build, lint, typecheck, MCP tool test.")
  echo "  → mission P3 $P3 (request tool)"

  P4=$(create_mission \
    "Answer + resume-over-Archive" BACKEND feature high "$OPP" \
    '["After answer the resuming mission briefing contains the answer","mission is active again"]' \
    "Plan: POST /api/v1/missions/:id/answer-human-input (HQ session) — append the answer via the X0 helper so it is in the next briefing; transition waiting_human->ready (re-claimable) or ->in_progress (if the same license still lives, configurable); Wire event human_input_answered; notify the original agent/sector. Affected: server/api/v1/missions/[id]/answer-human-input.post.ts (new), dossier-addendum helper, server/plugins/leiter.ts. Gates: build, lint, typecheck, integration test (answer to briefing).")
  echo "  → mission P4 $P4 (answer + resume)"

  P5=$(create_mission \
    "HQ UI: waiting_human column + answer affordance" FRONTEND feature medium "$OPP" \
    '["HQ sees open questions centrally and answers them in one step"]' \
    "Plan: board column/badge waiting_human with the question shown inline; answer dialog respecting format/choices; Situation Room panel Waiting on HQ; bell entry. Affected: app/pages (Board, Situation Room), app/components. Gates: build, lint, typecheck.")
  echo "  → mission P5 $P5 (HQ UI)"

  P6=$(create_mission \
    "QA gate: ask -> suspend -> answer -> resume" QA test high "$OPP" \
    '["All assertions green","test report attached"]' \
    "Plan: E2E — agent asks (mission waiting_human); lease expires with NO requeue (P2); HQ answers (answer in the resuming mission briefing, P4); end-to-end exactly once, idempotent. Gates: build, lint, typecheck, required-artifact: test report.")
  echo "  → mission P6 $P6 (QA gate)"

  echo "  · linking dependencies (blocked_by)"
  link "$P3" "$X0" blocked_by
  link "$P4" "$X0" blocked_by
  link "$P2" "$P1" blocked_by
  link "$P3" "$P1" blocked_by
  link "$P4" "$P1" blocked_by
  link "$P4" "$P3" blocked_by
  link "$P6" "$P2" blocked_by
  link "$P6" "$P4" blocked_by
  link "$P5" "$P3" blocked_by
  link "$P5" "$P4" blocked_by
  echo "  ✓ PARLEY $OPP seeded (P2 is the P0 durable-suspend mission)."
  echo
}

case "$WHICH" in
  sentinel) plan_sentinel ;;
  parley)   plan_parley ;;
  all)      plan_sentinel; plan_parley ;;
  *) echo "usage: $0 [sentinel|parley|all]"; exit 2 ;;
esac

echo "Done. Watch the operations on the HQ board."
echo "Tip: run with MISSION_STATUS=ready to make missions immediately claimable,"
echo "     but groom the P0 missions (SENTINEL S4, PARLEY P2) and the X0 helper first."
