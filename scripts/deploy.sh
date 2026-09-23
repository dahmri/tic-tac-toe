#!/usr/bin/env bash
# Ships this commit to a server over SSH and (re)starts the game with
# Docker Compose. The source goes into a new release folder, `current` is
# switched to it, and `docker compose up` rebuilds and restarts only what
# changed. Players' data lives in Docker volumes, so it survives every
# release. Keeps the last 5 releases for rollback.
#
# Required env: DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH, DEPLOY_SSH_KEY,
#               DEPLOY_KNOWN_HOSTS
# Optional env: DEPLOY_PORT (default 22)
# The server needs Docker with the Compose plugin, and the secrets in
# $DEPLOY_PATH/.env (see .env.example). See docs/DEPLOYMENT.md.

set -euo pipefail

: "${DEPLOY_HOST:?missing}" "${DEPLOY_USER:?missing}" "${DEPLOY_PATH:?missing}"
: "${DEPLOY_SSH_KEY:?missing}" "${DEPLOY_KNOWN_HOSTS:?missing}"

port="${DEPLOY_PORT:-22}"
sha="${GITHUB_SHA:-$(git rev-parse HEAD)}"
release="$(date -u +%Y%m%d-%H%M%S)-${sha:0:7}"
target="$DEPLOY_USER@$DEPLOY_HOST"

key="$(mktemp)"
known_hosts="$(mktemp)"
trap 'rm -f "$key" "$known_hosts"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" > "$key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$known_hosts"
chmod 600 "$key"

ssh_cmd=(ssh -i "$key" -p "$port" -o UserKnownHostsFile="$known_hosts" -o StrictHostKeyChecking=yes)

echo "Uploading release $release to $DEPLOY_HOST:$DEPLOY_PATH"
git archive --format=tar.gz "$sha" |
  "${ssh_cmd[@]}" "$target" "set -e
    test -f '$DEPLOY_PATH/.env' || { echo 'Missing $DEPLOY_PATH/.env (see .env.example)' >&2; exit 1; }
    mkdir -p '$DEPLOY_PATH/releases/$release'
    tar -xzf - -C '$DEPLOY_PATH/releases/$release'"

echo "Starting release $release"
"${ssh_cmd[@]}" "$target" "set -e
  cd '$DEPLOY_PATH'
  ln -sfn ../../.env 'releases/$release/.env'
  ln -sfn 'releases/$release' current.new
  mv -Tf current.new current
  cd current
  GIT_COMMIT='$sha' docker compose up -d --build --remove-orphans
  cd '$DEPLOY_PATH'
  ls -1dt releases/*/ | tail -n +6 | xargs -r rm -rf
  docker image prune -f >/dev/null"

echo "Deployed $release"
