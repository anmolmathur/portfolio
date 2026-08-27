# Deploying to the Hetzner box

**Read the first section before running anything.** `ai.anmolmathur.com` and
`posthog.anmolmathur.com` already serve HTTPS, so something on that box is
already holding ports 80 and 443. A deploy that grabs those ports takes Open
WebUI and PostHog offline.

## The safe default

`docker-compose.yml` starts **only the site container**, bound to
`127.0.0.1:3000`. Nothing is publicly reachable until you point your existing
reverse proxy at it. That is deliberate — it cannot conflict with what is
already running.

## 1. Get the code onto the box

```bash
ssh <you>@<hetzner-host>
git clone -b claude/portfolio-conversational-agent-r6ulfx \
  https://github.com/anmolmathur/portfolio.git anmolmathur-site
cd anmolmathur-site
```

## 2. Configure

```bash
cp .env.example .env
nano .env
```

Fill in at minimum:

```ini
POSTHOG_PROJECT_KEY=phc_...        # from PostHog → Settings → Project API key
OPENWEBUI_API_KEY=sk-...           # only needed once the avatar is built
GEMINI_API_KEY=...                 # only needed for offline voice pre-render
```

`.env` is gitignored. Never commit it.

**If PostHog runs in Docker on this same box**, point the proxy at its container
rather than back out through the public internet:

```ini
POSTHOG_HOST=http://posthog:8000
```

…and join the site container to that network (see step 5). Otherwise leave the
public URL; it works, it is just a round trip out and back.

## 3. Build and start

```bash
docker compose build
docker compose up -d
docker compose ps          # should show "healthy" within ~15s
```

Verify before wiring any proxy:

```bash
curl -s localhost:3000/healthz | python3 -m json.tool
curl -sI localhost:3000/ | head -1        # expect HTTP/1.1 200 OK
```

`/healthz` reports which integrations are wired, and says `MISSING` for any key
it does not have — without printing the value.

## 4. Route a hostname to it

**Use a staging hostname first.** `anmolmathur.com` currently points at GitHub
Pages and is live; do not cut it over until you have clicked around the new one.

### If you already run Caddy

```caddyfile
staging.anmolmathur.com {
    encode zstd gzip
    @immutable path /img/* /guide/clips/* /fonts/*
    header @immutable Cache-Control "public, max-age=31536000, immutable"
    reverse_proxy 127.0.0.1:3000
}
```

`caddy reload --config /etc/caddy/Caddyfile`

### If you already run nginx

```nginx
server {
    server_name staging.anmolmathur.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location ~* ^/(img|fonts|guide/clips)/ {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

Then `certbot --nginx -d staging.anmolmathur.com` and `nginx -s reload`.

### If nothing is serving 80/443 yet

Only in that case, use the bundled Caddy:

```bash
echo 'SITE_DOMAIN=staging.anmolmathur.com' >> .env
echo 'ACME_EMAIL=contact@anmolmathur.com'  >> .env
docker compose --profile edge up -d
```

It obtains a certificate automatically. **Do not run this if Open WebUI or
PostHog are already using those ports.**

## 5. Optional: join the existing Docker network

If Open WebUI and PostHog are in Docker here, sharing a network lets the site
reach them by service name and keeps the traffic internal:

```bash
docker network ls                                  # find the network name
docker network connect <that-network> anmolmathur-site
```

Then set `POSTHOG_HOST` / `OPENWEBUI_URL` to the internal names in `.env` and
`docker compose up -d` to apply.

## 6. Check it

```bash
curl -s https://staging.anmolmathur.com/healthz
```

Then open it and walk through `TESTING.md` — ⌘K search, theme toggle with a
reload, the industry filters, and a phone-width check.

Confirm the consent gate on the real domain: open devtools → Application →
Cookies before accepting. It should be **empty**.

## 7. Updating

```bash
git pull
docker compose build && docker compose up -d
```

The dependency layer is cached, so content-only changes rebuild in seconds.
The container drains in-flight requests on SIGTERM, so there is no dropped
request during restart.

## 8. Cutting over the live domain — later, deliberately

Only once staging has been exercised:

1. Lower the DNS TTL on `anmolmathur.com` to 300s and wait for the old TTL to expire.
2. Point the A record at the Hetzner IP (remove the GitHub Pages records).
3. Watch: `docker compose logs -f site`.
4. **Leave the GitHub Pages deployment intact.** It is your rollback — reverting
   DNS restores the old site in minutes.

Consider putting Cloudflare in front. A single box in one region is slower for
distant visitors than GitHub's edge, and it becomes a single point of failure
with you as the on-call.

## Automated deploys (recommended over doing it by hand)

`.github/workflows/deploy.yml` deploys from GitHub Actions. The SSH key lives in
**GitHub Secrets** — encrypted, never in a chat transcript, rotatable in one
place, and every run is logged. It is manual by default (Actions → Deploy to
Hetzner → Run workflow); a push trigger is commented out in the file if you want
it automatic later.

### One-time setup

**1. Create a deploy-only key** on your machine — a fresh key, not the one you
log in with, so it can be revoked without affecting your own access:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/anmolmathur_deploy -N ""
ssh-copy-id -i ~/.ssh/anmolmathur_deploy.pub <you>@<hetzner-host>
```

**2. Restrict what that key can do.** On the box, edit
`~/.ssh/authorized_keys` and prefix the new line:

```
restrict,pty,command="/home/<you>/deploy.sh" ssh-ed25519 AAAA... github-actions-deploy
```

with `~/deploy.sh` containing exactly the deploy steps. Then a leaked key can
run the deploy and nothing else. Optional but worth the ten minutes — without
it, that key is full shell access.

**3. Capture the host key** so the workflow isn't trusting-on-first-use:

```bash
ssh-keyscan -H <hetzner-host>
```

**4. Add the secrets** in GitHub → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `HETZNER_SSH_KEY` | contents of `~/.ssh/anmolmathur_deploy` (the **private** key) |
| `HETZNER_HOST` | hostname or IP |
| `HETZNER_USER` | the SSH user |
| `HETZNER_APP_DIR` | e.g. `/home/<you>/anmolmathur-site` |
| `HETZNER_KNOWN_HOSTS` | output of the `ssh-keyscan` above |
| `HETZNER_PORT` | only if not 22 |

**5. Prerequisites on the box:** the repo cloned at `HETZNER_APP_DIR` with
`.env` filled in (steps 1–2 above), and the deploy user in the `docker` group.

The workflow refuses to deploy if `.env` is missing, waits for the container's
own healthcheck rather than assuming success, dumps logs and fails the job if it
never turns healthy, and deletes the key from the runner even on failure.

## What is in the image

Node 22 Alpine, production dependencies only, running as the unprivileged
`node` user with a read-only root filesystem and `no-new-privileges`. There is
no build step — templates render per request and the responsive images are
committed — so the image is small and the build is mostly `npm ci`.

`sharp` is a build-time tool for `tools/build-images.mjs` and is deliberately
**not** in the image.

## Verified vs not

Verified here: the exact file set the Dockerfile copies boots with
production-only dependencies and serves every route; the app writes nothing at
runtime, so `read_only: true` holds; SIGTERM drains and exits cleanly; the
compose file and Caddyfile parse.

**Not verified: the image build and container run.** This environment has the
Docker CLI but no daemon, so `docker compose build` has not actually been
executed. If the build fails, send me the output.
