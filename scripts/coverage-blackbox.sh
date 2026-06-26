#!/usr/bin/env bash
# Black-box coverage: measure how much of the server (server/** + mcp/**) the
# out-of-process suites actually exercise. The vitest unit coverage can't see this
# — the HTTP scenario and Playwright E2E drive a *separate* server. So we boot the
# built Nitro server under V8 coverage (NODE_V8_COVERAGE), run both suites against
# it, stop it cleanly so the profile flushes, then remap the bundle coverage back
# to source with c8 (the build emits per-chunk sourcemaps).
#
# Output: coverage/blackbox/{lcov.info,index.html} + a text summary on stdout.
# Env: DATABASE_URL, NUXT_SESSION_PASSWORD (defaults below); COV_PORT (3100);
#      COV_SKIP_BUILD=1 to reuse an existing .output/ for fast local iteration.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${COV_PORT:-3100}"
BASE="http://localhost:$PORT"
export DATABASE_URL="${DATABASE_URL:-postgres://citadel:citadel@localhost:5433/citadel}"
export NUXT_SESSION_PASSWORD="${NUXT_SESSION_PASSWORD:-coverage-only-session-password-32chars}"
RAW="$PWD/coverage/raw"

# 1. Build (sourcemaps are emitted by default) unless reusing an existing build.
if [ "${COV_SKIP_BUILD:-}" != "1" ]; then
  npm run build
fi

# 2. Migrate + fresh coverage dir.
npm run db:migrate
rm -rf "$RAW" coverage/blackbox
mkdir -p "$RAW"

# 3. Start the built server under V8 coverage.
NODE_V8_COVERAGE="$RAW" PORT="$PORT" node scripts/serve-coverage.mjs &
SRV=$!
# Make sure the server dies (and flushes coverage) even if a suite fails.
trap 'kill -TERM $SRV 2>/dev/null || true' EXIT

# 4. Wait for readiness.
for _ in $(seq 1 60); do
  if curl -sf -m 3 "$BASE/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf -m 5 "$BASE/health" >/dev/null || { echo "server never became healthy"; exit 1; }

# 5. Drive the server. The HTTP scenario re-seeds in beforeAll; the Playwright
#    globalSetup re-seeds again before the UI specs (clean slate after the
#    scenario's mutations). Coverage accumulates in the server process throughout.
CITADEL_URL="$BASE" npm run test:http
E2E_EXTERNAL=1 E2E_BASE_URL="$BASE" npx playwright test

# 6. Stop the server cleanly and wait for the V8 profile to flush.
trap - EXIT
kill -TERM $SRV
wait $SRV 2>/dev/null || true

# 7. Remap + report (scoped to our source; drop the bundle/deps/migrations).
#    --exclude-after-remap so the filters apply to the remapped .ts paths, not the
#    generated .mjs chunks. Branch/function counts are unreliable through remapped
#    sourcemaps — Lines/Statements is the metric that matters here.
npx c8 report \
  --temp-directory "$RAW" \
  --reporter text-summary --reporter lcovonly --reporter html \
  --report-dir coverage/blackbox \
  --all --src server --src mcp \
  --exclude-after-remap \
  --exclude 'node_modules/**' \
  --exclude '.output/**' \
  --exclude '**/*.mjs' \
  --exclude 'server/db/migrations/**'
