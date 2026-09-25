#!/usr/bin/env bash
# Backup restore drill: restores a backup into a scratch database next to
# the live one, checks it (server/restore-check.js: migrations, tables,
# personal data opens with this server's key), then drops the scratch
# copy. The live database is only read by pg_restore's target, never
# touched. Run it on the server, from the release folder:
#
#   cd /srv/tic-tac-toe/current && scripts/restore-drill.sh [backup.dump]
#
# Without an argument it takes the newest /backups/ttt-*.dump (set
# BACKUP_DIR to look elsewhere). Exits non-zero if the backup isn't usable,
# so a monthly cron job can mail the failure.

set -euo pipefail

dump="${1:-$(ls -1t "${BACKUP_DIR:-/backups}"/ttt-*.dump 2>/dev/null | head -n 1)}"
[ -n "$dump" ] && [ -f "$dump" ] || { echo "No backup found" >&2; exit 1; }
scratch="ttt_drill_$(date +%s)"
db() { docker compose exec -T db "$@"; }

echo "Restoring $dump ($(du -h "$dump" | cut -f1), $(date -r "$dump" '+%F %R')) into $scratch…"
trap 'db dropdb -U tictactoe --if-exists "$scratch" || true' EXIT
db createdb -U tictactoe "$scratch"
db pg_restore -U tictactoe -d "$scratch" --no-owner --exit-on-error < "$dump"

# The api image, with the scratch database instead of the live one
set -a
# shellcheck disable=SC1091
. ./.env
set +a
docker compose run --rm --no-deps -T \
  -e DATABASE_URL="postgres://tictactoe:${POSTGRES_PASSWORD}@db:5432/${scratch}" \
  api node server/restore-check.js
