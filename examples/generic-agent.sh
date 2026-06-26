#!/bin/sh
# Example "brain" for the generic, agent-agnostic driver — deliberately NOT Claude.
#
#   npm run agent -- --license lic_… --driver generic --exec "sh examples/generic-agent.sh"
#
# The driver runs the model-agnostic mission loop (check-in → orders → claim → work →
# complete → next) and spawns this script once per claimed mission, in a fresh process
# (fresh context per mission), with the mission context + License + MCP entrypoint in the environment:
#
#   CITADEL_URL  CITADEL_LICENSE  CITADEL_MCP_STDIO
#   CITADEL_MISSION_ID  CITADEL_MISSION_KEY  CITADEL_MISSION_TITLE
#   CITADEL_MISSION_OBJECTIVE  CITADEL_MISSION_BRIEFING  CITADEL_MISSION_SECTOR  CITADEL_MISSION_TYPE
#
# A real agent would call its model here. This stub just satisfies the harness gate and
# completes the mission over plain REST — proving Citadel doesn't care what the agent is.
# See docs/AGENT_INTEGRATION.md.
set -e

echo "[generic-agent] working $CITADEL_MISSION_KEY ($CITADEL_MISSION_SECTOR/$CITADEL_MISSION_TYPE): $CITADEL_MISSION_TITLE"

# --- your model/agent does the real work for this one mission here ---

# Attach a test_report (satisfies the requireHarnessPass quality gate), then complete.
curl -s -X POST "$CITADEL_URL/api/v1/agent/missions/$CITADEL_MISSION_ID/artifacts" \
  -H "Authorization: Bearer $CITADEL_LICENSE" -H "Content-Type: application/json" \
  -d '{"kind":"test_report","url":"#","label":"generic agent: all green"}' -o /dev/null

code=$(curl -s -X POST "$CITADEL_URL/api/v1/agent/missions/$CITADEL_MISSION_ID/complete" \
  -H "Authorization: Bearer $CITADEL_LICENSE" -H "Content-Type: application/json" \
  -d '{"result":"success","outcome":"Completed by the generic example agent"}' \
  -o /dev/null -w "%{http_code}")

echo "[generic-agent] complete → HTTP $code"
[ "$code" = "200" ] || exit 1
