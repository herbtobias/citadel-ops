#!/bin/sh
# Citadel Ops container entrypoint: (optionally migrate) (+ optionally seed), then serve.
set -e

# §HORIZON M8 — with multiple instances, running migrations from every app container start
# races and delays readiness. Set RUN_MIGRATIONS=0 and migrate once out-of-band instead
# (a Cloud Run Job with the same image + command `npx drizzle-kit migrate`, as a pre-deploy
# step). Default 1 keeps single-instance/dev one-command-simple.
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "› Applying migrations…"
  npx drizzle-kit migrate
else
  echo "› Skipping migrations (RUN_MIGRATIONS=0 — expected to run as a pre-deploy job)"
fi

if [ "$SEED_ON_START" = "1" ]; then
  echo "› Seeding demo data…"
  npx tsx server/db/seed.ts || echo "  seed skipped/failed (continuing)"
fi

echo "› Starting Citadel Ops on :3000"
exec node .output/server/index.mjs
