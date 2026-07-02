#!/bin/sh
# Citadel Ops — daily Postgres dump for the single-VPS deploy (docs/DEPLOY_VPS.md §9).
# Keeps the last 7 gzipped dumps. Run from cron, e.g.:
#   30 3 * * * /opt/citadel-ops/deploy/backup.sh
# Complements (does not replace) whole-VM snapshots (Hetzner backup checkbox).
set -e

# Resolve the project root from this script's location, so cron cwd doesn't matter.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP="${KEEP:-7}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F)"
OUT="$BACKUP_DIR/citadel-$STAMP.sql.gz"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
	pg_dump -U citadel citadel | gzip >"$OUT"
echo "› wrote $OUT"

# Prune all but the most recent $KEEP dumps.
ls -1t "$BACKUP_DIR"/citadel-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

# Offsite (optional): uncomment and configure an rclone remote (e.g. a Hetzner Storage Box, EU).
# rclone copy "$OUT" storagebox:citadel-backups/
