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

## Known gaps

- **Spanish is not written yet** — `/healthz` reports `locales: ["en"]`.
- **Photos are placeholders.** `content/site.json` still points at the existing
  images; swap in the blazer and striped-shirt headshots when they land.
- **The intro audio is a 44 MB WAV** served as `audio/mpeg`. Wrong MIME, ~40×
  larger than needed — transcode to Opus/MP3.
- **PostHog, the consent gate and the avatar are not built yet.**
- `style.css` (unreferenced) and `maycalendar.html` (unlinked) look like dead
  files. Confirm before deleting.
