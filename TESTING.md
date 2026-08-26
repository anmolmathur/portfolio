# How to test what's built

Three ways, cheapest first.

## 1. The clickable preview (no setup)

A self-contained snapshot of the homepage is published as an artifact — open it
and try ⌘K / Ctrl-K, the theme toggle, and the industry filter chips.

Limits of the preview: it is one static page, so article links, résumé downloads
and analytics are inert. Everything visual and interactive is real.

## 2. Run it locally

```bash
git clone -b claude/portfolio-conversational-agent-r6ulfx \
  https://github.com/anmolmathur/portfolio.git
cd portfolio
npm install
npm start                    # http://localhost:3000
```

Nothing else is required — no keys, no database, no build step. Without keys the
avatar and analytics simply stay off, which `GET /healthz` will tell you:

```bash
curl -s localhost:3000/healthz | python3 -m json.tool
```

### What to try

| Try this | Expected |
|---|---|
| ⌘K / Ctrl-K, type `hsbc`, `mba`, `kubernetes`, `formula` | Each finds the right role, degree or project |
| ⌘K then arrow keys and Enter | Keyboard-only navigation works throughout |
| Theme toggle, then reload | Dark mode persists with **no flash** of the wrong theme |
| Industry chips above the timeline | Filters the 8 roles; the URL updates so the view is shareable |
| Scroll slowly | Nav underlines the current section; progress bar fills |
| Open devtools console | A greeting with your contact details |
| Resize to phone width | No sideways scrolling at any width |
| `/articles/edtech-problem-india.html` | 301-redirects to the new URL (old links keep working) |
| Open devtools → Application → Cookies | **Empty** until you accept the consent banner |

### With analytics on

```bash
POSTHOG_PROJECT_KEY=phc_your_key npm start
```

Accept the banner, then watch the Network tab: requests go to `/ingest/…` on
your own origin, not to posthog.anmolmathur.com. That is the ad-blocker
workaround doing its job.

## 3. Run the automated suites

Requires Playwright and a running server on port 3111.

```bash
PORT=3111 POSTHOG_PROJECT_KEY=phc_test npm start &
npx playwright install chromium
node verify.mjs     # 17 UI checks across themes, reduced motion, 320–1280px
node consent.mjs    # 14 privacy checks: no cookies/storage/events pre-consent
```

These are the checks that have caught real bugs so far — the horizontal-scroll
overflow, four dark-mode contrast failures, and the pre-consent third-party
requests.

## What is NOT testable yet

- **Spanish** — not written; `/healthz` reports `locales: ["en"]`.
- **The avatar** — not built. Needs the Open WebUI API key.
- **Voice** — see VOICE.md. Gemini's free tier is ~15 requests/day, so speech is
  pre-rendered offline rather than synthesized live.
- **Photos** — still placeholders. See below.
