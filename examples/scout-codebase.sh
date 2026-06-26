#!/bin/sh
# Onboard a brownfield codebase into The Archive as the Scout — over plain REST.
#
#   CITADEL_LICENSE=lic_010_demo sh examples/scout-codebase.sh
#
# Requires a License carrying the `recon` scope (issue one from the M Desk, or use
# the seeded demo scout `lic_010_demo`). This is the REST equivalent of what a Scout
# agent does via the citadel_* MCP tools:
#   citadel_read_archive → citadel_write_knowledge ×N
# Docs are addressed BY PATH and upserted (writing the same path updates it). An
# Interrogator (/citadel-debrief) then files INTEL/* the same way; the Planner reads
# it all back before planning. See docs/AGENT_INTEGRATION.md → "Brownfield onboarding".
set -e

URL="${CITADEL_URL:-http://localhost:3000}"
LIC="${CITADEL_LICENSE:?set CITADEL_LICENSE to a recon-scoped license key}"
AUTH="Authorization: Bearer $LIC"
JSON="Content-Type: application/json"

echo "▸ check-in"
curl -s -X POST "$URL/api/v1/agent/check-in" -H "$AUTH" -o /dev/null -w "  → HTTP %{http_code}\n"

echo "▸ read_archive (what's already known)"
curl -s "$URL/api/v1/agent/knowledge" -H "$AUTH" -o /dev/null -w "  → HTTP %{http_code}\n"

# A real Scout would read the repo and derive these. Top-level summary first (level 0),
# then the major areas (level 1) nested under it.
echo "▸ write_knowledge (README — level 0)"
curl -s -X POST "$URL/api/v1/agent/knowledge" -H "$AUTH" -H "$JSON" \
  -d '{"path":"README","level":0,"summary":"Nuxt 4 marketing site — pricing + planned checkout.","bodyMarkdown":"# Project\n\nStack: Nuxt 4, Tailwind v4, Nitro API.\nBuild: npm run build · Test: npm run test."}' \
  -o /dev/null -w "  → HTTP %{http_code}\n"

echo "▸ write_knowledge (server/ — level 1)"
curl -s -X POST "$URL/api/v1/agent/knowledge" -H "$AUTH" -H "$JSON" \
  -d '{"path":"server/","level":1,"parentPath":"README","summary":"Nitro API: pricing live, checkout planned.","bodyMarkdown":"## server/\n\nGET /api/pricing is live. Checkout is planned, not built."}' \
  -o /dev/null -w "  → HTTP %{http_code}\n"

echo "▸ write_knowledge (app/ — level 1)"
curl -s -X POST "$URL/api/v1/agent/knowledge" -H "$AUTH" -H "$JSON" \
  -d '{"path":"app/","level":1,"parentPath":"README","summary":"Vue pages + components; semantic-token theming.","bodyMarkdown":"## app/\n\nSemantic tokens only (no hard-coded colors). i18n EN/DE."}' \
  -o /dev/null -w "  → HTTP %{http_code}\n"

echo "▸ read_archive (verify)"
curl -s "$URL/api/v1/agent/knowledge" -H "$AUTH" | grep -oE '"path": *"[^"]+"' | sed -E 's/.*"path": *"([^"]+)".*/  • \1/'

echo
echo "✓ Archive filed. Run the Interrogator (/citadel-debrief) for the INTEL the code can't"
echo "  reveal, then a Planner (lic_008_demo) to turn it into an Operation + Missions."
