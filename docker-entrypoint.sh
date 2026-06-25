#!/bin/sh
# Citadel Ops container entrypoint: migrate (+ optionally seed), then serve.
set -e

echo "› Applying migrations…"
npx drizzle-kit migrate

if [ "$SEED_ON_START" = "1" ]; then
  echo "› Seeding demo data…"
  npx tsx server/db/seed.ts || echo "  seed skipped/failed (continuing)"
fi

echo "› Starting Citadel Ops on :3000"
exec node .output/server/index.mjs
