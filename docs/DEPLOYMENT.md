# Deployment

The game runs as four containers, defined in [`compose.yaml`](../compose.yaml):

| Service   | Image                       | Role                                              |
| --------- | --------------------------- | ------------------------------------------------- |
| `web`     | nginx (`Dockerfile`, `web`) | Serves the site, forwards `/api` and `/ws`        |
| `api`     | Node (`Dockerfile`, `api`)  | The game server; scale with `API_REPLICAS`        |
| `migrate` | same as `api`               | Brings the database schema up to date, then exits |
| `db`      | `postgres:18-alpine`        | Accounts; data in the `pgdata` volume             |
| `redis`   | `redis:8-alpine`            | Sessions and live state; data in `redisdata`      |

See [ARCHITECTURE.md](ARCHITECTURE.md) for why, and how it scales.

## Pipeline

| Event             | What happens                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Pull request      | CI: lint, formatting, unit and integration tests, then browser tests against the full Docker stack |
| Merge into `dev`  | CI                                                                                                 |
| Merge into `test` | CI, then deploy to the **staging** environment                                                     |
| Merge into `main` | CI, then deploy to the **production** environment, then tag and GitHub release                     |

Workflows: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

Until a server is configured, the deploy job ends with a "Deploy skipped"
notice. Nothing fails.

## Setting up a server

The deploy job uploads each commit's source to
`DEPLOY_PATH/releases/<timestamp>-<commit>/`, points `DEPLOY_PATH/current` at
it, and runs `docker compose up -d --build` there. Compose rebuilds and
restarts only what changed; the `migrate` service applies any new database
changes before the new game server starts. The last 5 releases are kept.

### 1. Prepare the server (once)

Any Linux machine with Docker. As root:

```sh
curl -fsSL https://get.docker.com | sh          # Docker Engine + Compose plugin
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /srv/tic-tac-toe && chown deploy:deploy /srv/tic-tac-toe
```

### 2. Create the secrets file (once)

As `deploy`, create `/srv/tic-tac-toe/.env` from
[`.env.example`](../.env.example):

```sh
cat > /srv/tic-tac-toe/.env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)
WEB_PORT=8080
API_REPLICAS=2
SITE_URL=https://tictactoe.example.com
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
MAIL_FROM="Pencil Tic-Tac-Toe <no-reply@tictactoe.example.com>"
EOF
chmod 600 /srv/tic-tac-toe/.env
```

`SITE_URL` is the site's public address: the links in confirmation emails
point there. The `SMTP_*` settings come from your email provider (Brevo,
Mailgun, Postmark, Amazon SES, Resend and most others offer SMTP). Players
must confirm their email to play online, so without SMTP settings nobody
can. Emails are then only written to the api's log (`docker compose logs
api`). Send from a domain you control, and add the SPF and DKIM records
your provider gives you, or the emails will land in spam.

Sign-ups carry a small puzzle the browser solves while the form is filled
in (no CAPTCHA service). `SIGNUP_CHALLENGE_BITS` sets how hard it is:
18, the default, takes about a second on a phone; each extra bit doubles
it. Raise it if bots get through, lower it if players complain.

**Back up `DATA_ENCRYPTION_KEY` somewhere safe** (a password manager). It
encrypts players' names, email addresses, birth dates and phone numbers; without it that data
can't be read, and changing it makes existing accounts unreadable.

### 3. HTTPS

nginx listens on `WEB_PORT` over plain http. Put a TLS proxy in front, for
example [Caddy](https://caddyserver.com/), which gets certificates by itself:

```
# /etc/caddy/Caddyfile
ttt.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

The session cookie is marked `Secure`, so logging in only works over HTTPS.
If the proxy is on another machine, have it pass `X-Forwarded-For` and
`X-Forwarded-Proto`, change `X-Forwarded-For $remote_addr` in
`deploy/nginx.conf` to `$proxy_add_x_forwarded_for`, and set `TRUST_PROXY`
to `2` in `compose.yaml`, so rate limits see players' real addresses.

### 4. Create a deploy key

```sh
# On your computer
ssh-keygen -t ed25519 -N "" -C "github-deploy" -f deploy_key
ssh-copy-id -i deploy_key.pub deploy@your.server   # or append it to ~deploy/.ssh/authorized_keys
ssh-keyscan -H your.server                          # output = DEPLOY_KNOWN_HOSTS
```

### 5. Add secrets to the GitHub environments

In **Settings → Environments**, open `staging` (test server) and
`production` (prod server), and add:

| Secret               | Example                                |
| -------------------- | -------------------------------------- |
| `DEPLOY_HOST`        | `203.0.113.10` or `prod.example.com`   |
| `DEPLOY_USER`        | `deploy`                               |
| `DEPLOY_PATH`        | `/srv/tic-tac-toe`                     |
| `DEPLOY_SSH_KEY`     | contents of `deploy_key` (private key) |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -H your.server` |
| `DEPLOY_PORT`        | optional, defaults to `22`             |

And one variable:

| Variable   | Example                   | Used for                                                     |
| ---------- | ------------------------- | ------------------------------------------------------------ |
| `SITE_URL` | `https://ttt.example.com` | After deploying, checks `/version.json` shows the new commit |

Delete the local `deploy_key` files once the secret is saved.

## Running it by hand

On any machine with Docker:

```sh
cp .env.example .env        # then fill in the secrets and SITE_URL
docker compose up -d --build
curl http://localhost:8080/api/health
docker compose logs -f api  # follow the game server's log
```

## Before launch: the legal pages

The privacy policy and terms (`index.html`, `#privacyDialog` and
`#termsDialog`, and their translations in `js/locales/`) contain
placeholders: `[Your name]`, `[contact email]`, `[country]` and `[30]` (days
backups are kept). Replace them everywhere (the same text is in all three
languages), remove the "Draft" notices, and have someone who knows the law
where you operate read them.

## Capacity

`npm run load-test` connects many players to a server and has them play
online matches (invitations, moves every ~0.3 s, new rounds) while their
lobbies poll the player list, then reports how quickly moves are answered:

```sh
# a test server: no rate limits, emails readable by the script, an easy
# sign-up puzzle
RATE_LIMITS=off MAIL_OUTBOX=on SIGNUP_CHALLENGE_BITS=4 SIGNUP_CHALLENGE_MIN_MS=0 \
  PORT=4280 node server/index.js
npm run load-test -- --url http://127.0.0.1:4280 --players 1000 --seconds 60
```

Never point it at production: it creates accounts. On staging, start the
api with those settings for the test only.

Measured on 25 September 2026, on a laptop (Apple Silicon) running one
game server, PostgreSQL, Redis and the load test itself:

| Players | Matches at once | Moves a second | Move answered: median / 99% / worst |
| ------- | --------------- | -------------- | ----------------------------------- |
| 500     | 250             | 632            | 1.1 ms / 6.8 ms / 21 ms             |
| 1,000   | 500             | 1,249          | 0.8 ms / 5.4 ms / 17 ms             |
| 2,000   | 1,000           | 2,674          | 0.8 ms / 4.3 ms / 28 ms             |
| 4,000   | 2,000           | 5,331          | 0.9 ms / 8.1 ms / 259 ms            |

No errors at any size; the server used about 400 MB of memory at 4,000
players. A small VPS is slower than this laptop: run the test on staging
before a launch. Beyond one server, run more game servers behind nginx
(`API_REPLICAS=4`): they share everything through Redis.

## Admins

Make yourself an admin once you have an account on the site:

```sh
cd /srv/tic-tac-toe/current && docker compose exec api node server/make-admin.js <username>
# and to take it back:
cd /srv/tic-tac-toe/current && docker compose exec api node server/make-admin.js <username> --remove
```

Admins get an **Admin** button: open reports (dismiss them, or rename,
suspend or delete the player), a player search, and the usage numbers
(players active each day, sign-ups, games by kind, for the last 30 days).
The numbers are counts only; which players were active isn't stored. Every
admin action is written to a log, visible in the same dialog. Admins can't
change other admins.

- **Is it up?** The Uptime workflow (`.github/workflows/uptime.yml`)
  checks `SITE_URL` every 15 minutes: the page, and `/api/health`, which
  answers `{ ok: true, version }` only when PostgreSQL and Redis do. After
  three failed tries a minute apart the run fails, and GitHub emails you
  (keep "Actions" notifications on in your GitHub settings). It stays
  quiet until the production environment has a `SITE_URL` variable.
- **Errors in players' browsers** are sent to `POST /api/client-errors`
  (at most five per page, rate limited) and logged by the game server as
  `Error in a browser`, next to its own errors:

  ```sh
  docker compose logs api | grep -i error
  ```

- **Logs** rotate at 10 MB, five files per service, so they can't fill
  the disk.

## Backups

Player data lives in PostgreSQL. Back it up daily, for example with a cron
job on the server:

```sh
cd /srv/tic-tac-toe/current
docker compose exec -T db pg_dump -U tictactoe -Fc tictactoe > /backups/ttt-$(date +%F).dump
```

Restore with `pg_restore -U tictactoe -d tictactoe --clean`. Keep backups
off the server, and keep `DATA_ENCRYPTION_KEY` apart from them.

A backup nobody has restored is a hope, not a backup. Once a month, run
the restore drill: it restores the newest backup into a scratch database
beside the live one, checks that every migration is there, that the
tables read, and that players' personal data opens with the server's
`DATA_ENCRYPTION_KEY`, then drops the copy. It exits non-zero if the
backup isn't usable.

```sh
cd /srv/tic-tac-toe/current && scripts/restore-drill.sh            # newest /backups/ttt-*.dump
cd /srv/tic-tac-toe/current && scripts/restore-drill.sh old.dump   # a given one
# monthly, mailing any failure (cron sends output to MAILTO):
0 5 1 * * cd /srv/tic-tac-toe/current && scripts/restore-drill.sh >/dev/null
```

## Rollback

```sh
ssh deploy@your.server
cd /srv/tic-tac-toe
ls -1t releases/                      # newest first
ln -sfn releases/<previous> current.new && mv -Tf current.new current
cd current && docker compose up -d --build
```

Database changes are not undone by a rollback; migrations are written so the
previous release keeps working with the new schema. Or revert the bad commit
on `main` through a PR, which redeploys.

## Checking what's live

`/version.json` shows the site's build, and `/api/health` whether the game
server can reach PostgreSQL and Redis:

```json
{ "version": "1.2.0", "commit": "9a3f7d3", "builtAt": "2026-09-23T18:01:20.248Z" }
```

## Security

- Passwords are hashed with Argon2id; names, birth dates and phone numbers
  are encrypted in the database. Details in [ARCHITECTURE.md](ARCHITECTURE.md).
- `.env` holds the secrets and never leaves the server. It is ignored by git
  and Docker builds.
- `index.html` sets a Content-Security-Policy. Browser tests fail on any
  policy violation. Update it if you add a new external service.
- `deploy/nginx.conf` adds `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy` and `Permissions-Policy`, and refuses hidden files.
- PostgreSQL and Redis are reachable only inside the Compose network, never
  from outside the machine.
- Serve production over HTTPS.
