#!/usr/bin/env bash
# Prepares a fresh Ubuntu server (AWS EC2 or any other) to run the game:
# Docker, the `deploy` user GitHub Actions logs in as, the secrets file,
# HTTPS with Caddy, a swap file and daily database backups. The game itself
# arrives with the first deploy from GitHub. See docs/DEPLOYMENT.md.
#
# Run once, as root, after the server's public (Elastic) IP is attached:
#
#   sudo bash ec2-setup.sh --deploy-key "ssh-ed25519 AAAA... github-deploy" \
#     [--domain ttt.example.com]
#
# Without --domain the site gets a free name made from the public IP
# (3-120-1-2.sslip.io), with a real certificate. Running it again is safe:
# existing secrets are kept, and only the domain and key are updated.

set -euo pipefail

APP=/srv/tic-tac-toe
BACKUPS=/backups
domain=''
deploy_key=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) domain="$2"; shift 2 ;;
    --deploy-key) deploy_key="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo 'Run as root: sudo bash ec2-setup.sh ...' >&2; exit 1; }
[[ -n "$deploy_key" ]] || { echo 'Missing --deploy-key "<public key>"' >&2; exit 1; }

# The public address, from the EC2 metadata service (IMDSv2), or any
# other server's view of it
public_ip() {
  local token
  if token=$(curl -fsS -m 2 -X PUT http://169.254.169.254/latest/api/token \
      -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' 2>/dev/null); then
    curl -fsS -m 2 -H "X-aws-ec2-metadata-token: $token" \
      http://169.254.169.254/latest/meta-data/public-ipv4 && return
  fi
  curl -fsS -m 5 https://checkip.amazonaws.com
}

if [[ -z "$domain" ]]; then
  ip=$(public_ip | tr -d '[:space:]')
  [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "No public IP found ($ip)" >&2; exit 1; }
  domain="${ip//./-}.sslip.io"
fi
echo "==> Setting up https://$domain"

export DEBIAN_FRONTEND=noninteractive

echo '==> Swap (building the images needs more than 2 GB of memory)'
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo '==> Security updates, installed automatically'
apt-get update -qq
apt-get install -y -qq unattended-upgrades caddy >/dev/null

echo '==> Docker'
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh >/dev/null

echo '==> The deploy user (GitHub Actions logs in as it)'
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos '' deploy >/dev/null
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf '%s\n' "$deploy_key" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
install -d -o deploy -g deploy "$APP" "$BACKUPS"

echo '==> Secrets file'
env_file="$APP/.env"
if [[ ! -f "$env_file" ]]; then
  cat > "$env_file" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)
# Only Caddy, on this machine, talks to nginx
WEB_PORT=127.0.0.1:8080
API_REPLICAS=1
SITE_URL=https://$domain
# Email (Amazon SES: see docs/DEPLOYMENT.md), then: cd $APP/current && docker compose up -d
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
EOF
  # Notification keys, made once: a new pair stops every subscription
  docker run --rm node:25-alpine npx -y web-push@3.6.7 generate-vapid-keys |
    awk '/Public Key/{getline; print "VAPID_PUBLIC_KEY=" $1}
         /Private Key/{getline; print "VAPID_PRIVATE_KEY=" $1}' >> "$env_file"
  new_secrets=1
else
  sed -i "s|^SITE_URL=.*|SITE_URL=https://$domain|" "$env_file"
fi
chown deploy:deploy "$env_file"
chmod 600 "$env_file"

echo '==> HTTPS (Caddy gets and renews the certificate itself)'
cat > /etc/caddy/Caddyfile <<EOF
$domain {
    reverse_proxy 127.0.0.1:8080
    header Strict-Transport-Security "max-age=31536000"
}
EOF
systemctl enable caddy >/dev/null 2>&1
systemctl reload-or-restart caddy

echo '==> Daily database backup at 03:30 UTC, 14 days kept'
cat > /etc/cron.d/tic-tac-toe-backup <<EOF
30 3 * * * deploy cd $APP/current && docker compose exec -T db pg_dump -U tictactoe -Fc tictactoe > $BACKUPS/ttt-\$(date +\%F).dump && find $BACKUPS -name 'ttt-*.dump' -mtime +14 -delete
EOF

echo
echo "Done. The site will be at https://$domain after the first deploy."
echo "DEPLOY_KNOWN_HOSTS for GitHub (from your computer):  ssh-keyscan -H $(public_ip)"
if [[ -n "${new_secrets:-}" ]]; then
  echo
  echo 'Save this key in a password manager: without it, players'"'"' personal data'
  echo 'cannot be read back, and backups are useless.'
  grep '^DATA_ENCRYPTION_KEY=' "$env_file"
fi
