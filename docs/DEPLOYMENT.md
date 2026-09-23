# Deployment

The game is a static site: `npm run build` produces `dist/` (HTML, CSS, JS
and a `version.json`). Any web server can host it. Online play also needs the
public PeerJS matchmaking server (`0.peerjs.com`), which browsers reach
directly, so there is no backend to run.

## Pipeline

| Event             | What happens                                                                           |
| ----------------- | -------------------------------------------------------------------------------------- |
| Pull request      | CI: lint, formatting, unit tests, build, Docker image, browser tests against the image |
| Merge into `dev`  | CI                                                                                     |
| Merge into `test` | CI, then deploy to the **staging** environment                                         |
| Merge into `main` | CI, then **production** deploy after manual approval, then tag and GitHub release      |

Workflows: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

Until a server is configured, the deploy job builds the site and ends with a
"Deploy skipped" notice. Nothing fails.

## Option A: a Linux server with nginx (SSH deploy)

The deploy job uploads each build to `DEPLOY_PATH/releases/<timestamp>-<commit>/`
and points the `DEPLOY_PATH/current` symlink at it in one step. The last 5
releases are kept.

### 1. Prepare the server (once)

```sh
# On the server, as root
adduser --disabled-password --gecos "" deploy
mkdir -p /var/www/tic-tac-toe
chown deploy:deploy /var/www/tic-tac-toe
apt install nginx rsync
```

Copy [`deploy/nginx.conf`](../deploy/nginx.conf) to
`/etc/nginx/sites-available/tic-tac-toe`, then:

- set `root /var/www/tic-tac-toe/current;`
- set `server_name` to your domain
- enable it: `ln -s /etc/nginx/sites-available/tic-tac-toe /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx`
- add HTTPS: `apt install certbot python3-certbot-nginx && certbot --nginx -d your.domain`

### 2. Create a deploy key

```sh
# On your computer
ssh-keygen -t ed25519 -N "" -C "github-deploy" -f deploy_key
ssh-copy-id -i deploy_key.pub deploy@your.server   # or append it to ~deploy/.ssh/authorized_keys
ssh-keyscan -H your.server                          # output = DEPLOY_KNOWN_HOSTS
```

### 3. Add secrets to the GitHub environments

In **Settings → Environments**, open `staging` (test server) and
`production` (prod server), and add:

| Secret               | Example                                |
| -------------------- | -------------------------------------- |
| `DEPLOY_HOST`        | `203.0.113.10` or `prod.example.com`   |
| `DEPLOY_USER`        | `deploy`                               |
| `DEPLOY_PATH`        | `/var/www/tic-tac-toe`                 |
| `DEPLOY_SSH_KEY`     | contents of `deploy_key` (private key) |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -H your.server` |
| `DEPLOY_PORT`        | optional, defaults to `22`             |

And one variable:

| Variable   | Example                   | Used for                                                     |
| ---------- | ------------------------- | ------------------------------------------------------------ |
| `SITE_URL` | `https://ttt.example.com` | After deploying, checks `/version.json` shows the new commit |

Delete the local `deploy_key` files once the secret is saved.

### Rollback

```sh
ssh deploy@your.server
cd /var/www/tic-tac-toe
ls -1t releases/                      # newest first
ln -sfn releases/<previous> current.new && mv -Tf current.new current
```

Or revert the bad commit on `main` through a PR, which redeploys.

## Option B: Docker

The [`Dockerfile`](../Dockerfile) builds an nginx image with the same config.
CI builds it and runs the browser tests against it on every pull request.

```sh
docker build --build-arg GIT_COMMIT=$(git rev-parse HEAD) -t tic-tac-toe .
docker run -d --restart unless-stopped -p 8080:80 --name tic-tac-toe tic-tac-toe
curl http://localhost:8080/version.json
```

Put a TLS-terminating proxy (Caddy, Traefik, nginx) in front for HTTPS.
To deploy containers from CI, the next step would be publishing the image to
GitHub Container Registry (`ghcr.io`) in `deploy.yml` and pulling it on the server.

## Checking what's live

Every build serves `/version.json`:

```json
{ "version": "1.1.0", "commit": "9a3f7d3", "builtAt": "2026-09-23T18:01:20.248Z" }
```

## Security

- `index.html` sets a Content-Security-Policy that allows scripts only from
  this site and `cdn.jsdelivr.net`, and network connections only to this
  site and the PeerJS server. Browser tests fail on any policy violation.
  Update both if you add a new external service.
- `deploy/nginx.conf` adds `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy` and `Permissions-Policy`, and refuses hidden files.
- Serve production over HTTPS.
