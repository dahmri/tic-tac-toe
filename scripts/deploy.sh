#!/usr/bin/env bash
# Uploads dist/ to a server over SSH as a new release folder, then switches
# the `current` symlink to it in one step, so visitors never see a
# half-uploaded site. Keeps the last 5 releases for instant rollback.
#
# Required env: DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH, DEPLOY_SSH_KEY,
#               DEPLOY_KNOWN_HOSTS
# Optional env: DEPLOY_PORT (default 22)
# See docs/DEPLOYMENT.md for the server setup.

set -euo pipefail

: "${DEPLOY_HOST:?missing}" "${DEPLOY_USER:?missing}" "${DEPLOY_PATH:?missing}"
: "${DEPLOY_SSH_KEY:?missing}" "${DEPLOY_KNOWN_HOSTS:?missing}"
[ -f dist/index.html ] || { echo "dist/ not found: run npm run build first" >&2; exit 1; }

port="${DEPLOY_PORT:-22}"
sha="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo local)}"
release="$(date -u +%Y%m%d-%H%M%S)-${sha:0:7}"
target="$DEPLOY_USER@$DEPLOY_HOST"

key="$(mktemp)"
known_hosts="$(mktemp)"
trap 'rm -f "$key" "$known_hosts"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" > "$key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$known_hosts"
chmod 600 "$key"

ssh_cmd="ssh -i $key -p $port -o UserKnownHostsFile=$known_hosts -o StrictHostKeyChecking=yes"

echo "Uploading release $release to $DEPLOY_HOST:$DEPLOY_PATH"
$ssh_cmd "$target" "mkdir -p '$DEPLOY_PATH/releases/$release'"
rsync -az --delete -e "$ssh_cmd" dist/ "$target:$DEPLOY_PATH/releases/$release/"

echo "Switching current -> releases/$release"
$ssh_cmd "$target" "set -e
  cd '$DEPLOY_PATH'
  ln -sfn 'releases/$release' current.new
  mv -Tf current.new current
  ls -1dt releases/*/ | tail -n +6 | xargs -r rm -rf"

echo "Deployed $release"
