#!/bin/sh
# Kick off a new Operation (sprint) with a Planner agent — over plain REST.
#
#   CITADEL_LICENSE=lic_008_demo sh examples/plan-operation.sh
#
# Requires a License carrying the `plan` scope (issue one from the M Desk with the
# "Planner" checkbox, or use the seeded demo planner `lic_008_demo`). This is the
# REST equivalent of what a Planner agent does via the citadel_* MCP tools:
#   citadel_plan_operation → citadel_create_mission ×N → citadel_link_missions
# Operations, parents and links are addressed BY KEY (OP-1 / WEB-42), not UUID.
# See docs/AGENT_INTEGRATION.md → "Kick off an Operation".
set -e

URL="${CITADEL_URL:-http://localhost:3000}"
LIC="${CITADEL_LICENSE:?set CITADEL_LICENSE to a plan-scoped license key}"
AUTH="Authorization: Bearer $LIC"
JSON="Content-Type: application/json"

# Pull the top-level "key" out of a JSON response (no jq dependency; tolerates the
# dev server's pretty-printed output).
first_key() { grep -oE '"key": *"[^"]+"' | head -1 | sed -E 's/.*"key": *"([^"]+)".*/\1/'; }

echo "▸ check-in"
curl -s -X POST "$URL/api/v1/agent/check-in" -H "$AUTH" -o /dev/null -w "  → HTTP %{http_code}\n"

echo "▸ plan_operation"
OP=$(curl -s -X POST "$URL/api/v1/agent/operations" -H "$AUTH" -H "$JSON" \
  -d '{"codename":"Daybreak","objective":"Add OAuth login","sectorsInScope":["BACKEND","FRONTEND"],"activate":true}' \
  | first_key)
echo "  → operation $OP"

# status:"ready" makes the mission immediately claimable. Omit it (defaults to
# "backlog") if you'd rather groom — or run a design+Cold Read pass — first.
echo "▸ create_mission (backend)"
M1=$(curl -s -X POST "$URL/api/v1/agent/missions" -H "$AUTH" -H "$JSON" \
  -d "{\"title\":\"OAuth backend + token endpoint\",\"sector\":\"BACKEND\",\"type\":\"feature\",\"operationKey\":\"$OP\",\"priority\":\"high\",\"status\":\"ready\",\"acceptanceCriteria\":[\"/oauth/token issues a JWT\",\"refresh works\"]}" \
  | first_key)
echo "  → mission $M1"

echo "▸ create_mission (frontend)"
M2=$(curl -s -X POST "$URL/api/v1/agent/missions" -H "$AUTH" -H "$JSON" \
  -d "{\"title\":\"Login UI\",\"sector\":\"FRONTEND\",\"type\":\"feature\",\"operationKey\":\"$OP\",\"priority\":\"medium\",\"status\":\"ready\"}" \
  | first_key)
echo "  → mission $M2"

echo "▸ link_missions ($M2 relates_to $M1)"
curl -s -X POST "$URL/api/v1/agent/links" -H "$AUTH" -H "$JSON" \
  -d "{\"sourceKey\":\"$M2\",\"targetKey\":\"$M1\",\"linkType\":\"relates_to\"}" -o /dev/null \
  -w "  → HTTP %{http_code}\n"

echo
echo "✓ Operation $OP planned with missions $M1, $M2."
echo "  Field agents in BACKEND/FRONTEND can now claim the ready missions and run the loop."
echo "  Watch it on the HQ board."
