# anmolmathur.com — server-rendered site

The site is being migrated from static GitHub Pages files to a small Node app so
it can serve two languages, host the conversational avatar's API, and run on the
Hetzner box. **The old static files are untouched and still live** — nothing has
been cut over yet.

## Run it

```bash
npm install
npm start            # http://localhost:3000
npm run dev          # same, with --watch
```

`PORT` and `HOST` are read from the environment (defaults `3000` / `0.0.0.0`).

> Template changes need a restart. `@fastify/view` caches compiled templates
> even with nunjucks `noCache` set, so editing a `.njk` and refreshing shows the
> old markup until the process restarts. CSS and JS are served from disk and
> pick up immediately.

## Layout

```
content/            the single source of truth for all copy
  site.json           locale-neutral facts: contact, resumes, images, analytics ids
  en.json             every English string on the site
  metrics.json        impact numbers, each with a `source` field
  articles/           per-article body HTML + metadata index
server/
  app.js              Fastify: routing, i18n, sitemap, redirects
  lib/content.js      loads + validates locales at boot
  lib/search-index.js derives the shared search index
  lib/json-ld.js      Person / BlogPosting structured data
views/                Nunjucks templates — ONE set, both locales
public/css/tokens.css design tokens; the only place colours are defined
public/css/site.css   derived from the original styles.css, colours tokenised
public/js/            theme, nav, metrics, timeline filter, palette, console
```

## How the content model works

Every string lives in `content/<locale>.json`. Templates never hard-code copy.
Adding Spanish means adding `content/es.json` and `content/articles/*.es.html`;
routing, hreflang, the sitemap and the language switcher all pick it up with no
template changes. `server/lib/content.js` refuses to boot if the default locale
is missing, because a half-translated site is worse than a failed deploy.

`server/lib/search-index.js` derives ~33 records from that same content. **The
⌘K palette and the avatar's retrieval brain both read this index** — they are
answering the same question, and one index means they can never disagree about
what the site contains.

## Adding a locale

1. Copy `content/en.json` to `content/es.json` and translate the values.
2. Translate each `content/articles/<slug>.en.html` to `<slug>.es.html` and add
   `content/articles/index.es.json`.
3. Restart. `/es/` and `/es/articulos/<slug>` start serving; `hreflang`,
   `og:locale:alternate`, the sitemap and the switcher update automatically.

The URL segment per locale is set in `ARTICLE_SEGMENT` in `server/lib/content.js`.

## Theming

`public/css/tokens.css` is the only file that names a colour. Three states:
bare `:root` is light, `@media (prefers-color-scheme: dark)` guarded with
`:root:not([data-theme="light"])` follows the system, and `:root[data-theme=…]`
lets an explicit choice win either way. An inline script in `<head>` applies the
stored choice before first paint so the page never flashes the wrong theme.

Dark-mode contrast is verified, not assumed — all sampled text is ≥ 4.5:1 in
both themes. The brand navies (`--brand-800`, `--brand-700`) are *background*
colours; text uses `--heading` / `--accent-text`, which flip with the theme.

## Deliberate choices worth knowing

- **Critical header controls (search, theme, menu) are inline SVG**, not icon
  fonts. They are the only way to search or change the theme, and a CDN failure
  would otherwise leave them as invisible empty buttons. Decorative icons still
  use Font Awesome.
- **Legacy URLs 301-redirect.** `/index.html` and `/articles/<slug>.html` are
  indexed and linked externally, so they keep resolving.
- **One floating action stack**, not competing buttons. The avatar launcher
  mounts into `#guideLauncherSlot` above the WhatsApp button.
- **Metrics carry a `source`.** Do not add a number without one.

## Configuration

Non-secret hostnames and ids live in `server/lib/config.js` and
`content/site.json`. **Secrets are read from the environment only** — see
`.env.example`. `GET /healthz` reports which are wired without printing any value.

Currently wired: Open WebUI at `ai.anmolmathur.com` (model
`portfolio-website-helper`), PostHog at `posthog.anmolmathur.com`, GA
`G-12VK07Q8CB`. The API keys are still needed.

## Analytics and privacy

PostHog is proxied first-party at `/ingest` so ad-blockers and Safari ITP don't
eat it — a portfolio aimed at technologists has an unusually high share of
visitors running blockers.

Nothing is stored or sent before consent: PostHog runs memory-only with
autocapture and session replay off until the visitor agrees. Verified by test —
zero cookies, zero localStorage, zero capture requests pre-consent. The only
thing kept without permission is the consent decision itself.

Free-text properties pass through a PII scrubber at one choke point
(`window.__scrub`), stripping emails, phone numbers and long digit runs before
anything leaves the browser.

Identity properties (`distinct_id`, `$device_id`, `$session_id` and friends) are
exempt from the scrubber. They are UUIDs, and a UUID has digit runs long enough
to match the phone pattern — they were being stored as `01a[phone]-f3f8-…`. The
exemption is a fixed list, not "skip everything `$`-prefixed", because
autocapture props like `$current_url` and `$el_text` genuinely can carry an
email address and must still be scrubbed.

**No third-party assets load before consent** except the Google Fonts stylesheet,
which is a documented fallback — drop `.woff2` files into `public/fonts/` and it
switches to self-hosted automatically. See `public/fonts/README.md` for why that
matters legally.

## /reports — the analytics dashboard

`GET /reports` renders events for **anmolmathur.com and
immersive.anmolmathur.com**, read back out of PostHog server-side. PostHog's own
UI answers the same questions for the whole shared instance, where Bombay
Gothic's shop traffic outnumbers this site's by ~50:1 and buries it; this page is
scoped to the two hosts and leads with the raw event log.

Scoping is by `$host`, not by the `site` super-property: `$host` is set by
posthog-js on every event including autocapture, and it is already correct for
events captured before the tagging existed.

Two env vars, both server-side only:

| Var | Why |
|---|---|
| `POSTHOG_API_KEY` | A **personal** key (`phx_…`), not the public `phc_` project key. It can read every project on the instance, so it never reaches a browser — the page talks to `/api/reports/*`. Shared with the `bg-posthog-mcp` container on the same box; rotating it means updating both. |
| `REPORTS_PASSWORD` | HTTP Basic gate. **With no password set the route returns 503, never open** — a deploy that forgets it should be visibly broken rather than quietly public. |

Queries are HogQL, cached in-process for 60s (15s for the log) so a reload does
not fire ten ClickHouse queries. `POST /api/reports/refresh` drops the cache.
The log paginates by keyset on `timestamp`, not `OFFSET`, so new events arriving
mid-scroll cannot shift rows under the reader.

`/reports` and `/api/` are disallowed in `robots.txt` and the page sends
`X-Robots-Tag: noindex`.

One gotcha when testing: the PostHog host is behind Cloudflare, which answers
403 (error 1010) to undici's default user-agent — the client sends an explicit
`User-Agent` and every panel is empty without it.

## Images

Source photos live in `images/`. `tools/build-images.mjs` generates responsive
AVIF/WebP/JPEG variants into `public/img/` plus a `manifest.json` the templates
read, so every `<picture>` carries explicit width/height and reserves its box
before loading.

Re-run it after changing any source photo:

```bash
npm install --no-save sharp
node tools/build-images.mjs
```

It is a build-time tool only — `sharp` is not a runtime dependency.

## Known gaps

- **PostHog GeoIP: fixed 30 Aug 2026**, but events recorded before then keep a
  null country — the Countries panel shows a large "—" bucket until the old data
  ages out of the window. Three separate faults had to be cleared: Caddy was
  replacing `X-Forwarded-For` with its own peer (fixed with `trusted_proxies` via
  `CADDY_TLS_BLOCK` in `/root/posthog-hobby/.env`); `ingestion-general` had no
  MaxMind database mounted; and PostHog's `plugins` container — which runs the
  GeoIP transformation — had been dead since 2 July because it exits *zero* when
  its logs consumer can't reach Redis, so `restart: on-failure` never revived it.

- **Spanish is not written yet** — `/healthz` reports `locales: ["en"]`.
- **The intro audio is a 44 MB WAV** served as `audio/mpeg`. Wrong MIME, ~40×
  larger than needed — transcode to Opus/MP3.
- **The avatar is not built yet.** PostHog, the consent gate and `/reports` are live.
- `style.css` (unreferenced) and `maycalendar.html` (unlinked) look like dead
  files. Confirm before deleting.
