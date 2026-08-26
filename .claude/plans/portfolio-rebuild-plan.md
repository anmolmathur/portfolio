# anmolmathur.com — Hetzner migration, bilingual rebuild, conversational avatar

## Context

The portfolio is a hand-written static site on GitHub Pages: one 42KB `index.html` with all
copy welded into the markup, three article pages, `script.js`, `styles.css`. It was built
before an always-on server existed. Now there is a Hetzner box running Open WebUI, which
changes what's possible.

Five things are wanted, and they are more connected than they look:

1. **Move to a server-rendered Node app on Hetzner** — enables everything below.
2. **Conversational 3D avatar** — Anmol's own Avaturn likeness, greeting and answering out
   loud, brain served by the Hetzner Open WebUI. Built to the `talking-avatar-guide` skill.
3. **Replace the hero photo** with a new candid he supplied.
4. **Full Spanish version**, including the avatar speaking Spanish.
5. **Front-end elements that read "technology leader" on arrival** — ⌘K palette, animated
   impact metrics, industry-filterable timeline, dark mode + scroll-spy + console easter egg.
6. **WhatsApp button** connecting visitors straight to him.

The connective tissue: **all six need the copy extracted out of `index.html` into a
structured content model.** Spanish needs two locales of it, the avatar's retrieval brain
needs it indexed, and ⌘K needs it searchable. Do that refactor once and the rest follows;
skip it and each feature re-parses HTML separately. That is the spine of this plan.

Anti-hallucination remains the top non-functional requirement — a guide that invents an
employer or a date damages a personal reputation, and now it can do so in two languages.

---

## Immediate action, independent of everything else

**Install the `talking-avatar-guide` skill** to
`/home/user/portfolio/.claude/skills/talking-avatar-guide/` and commit it.

This session runs in an **ephemeral container** — anything written to `~/.claude/` is gone
next session. Committing to the repo is the only install that persists; it then loads
automatically in every future Claude session on this repo. To get it account-wide (like
`moodle-skill` and `bg-content-creator-agent` already are), upload the same folder via
**claude.ai → Settings → Capabilities → Skills**, or drop it in `~/.claude/skills/` on a
local machine. I can't write into the synced set from here — `/root/.claude/skills/synced/`
is a read-down mirror.

---

## Decisions locked

| Area | Choice |
|---|---|
| Stack | One Fastify app, server-rendered (Nunjucks), serving both locales and the avatar API from one process |
| Hosting | Hetzner + Caddy (TLS), **Cloudflare in front** — see Risks |
| Avatar | User's own Avaturn GLB, **gated and passed** (verdict below) |
| Voice | OpenAI `gpt-4o-mini-tts` via own route + content-addressed clip cache → in-browser Piper → OS `speechSynthesis` |
| Brain | Hetzner Open WebUI (agent tier) behind local BM25 over the site's own content |
| Spanish | Full site at `/es/` + avatar answers and speaks Spanish |
| UI elements | All four bundles |
| Scope | Everything: avatar + tour + mic + recruiter funnels |

---

## Avatar model gate — VERDICT: PASS

`Anmol_Model.glb` · Avaturn.me | Blender · glTF 2.0 · 13.3MB · 29,004 tris · 13 meshes.

| Gate | Found | Result |
|---|---|---|
| Skeleton | 54 Mixamo-named joints, **unprefixed** (no `mixamorig:`) | PASS |
| Humanoid bones | hips→head, both arm chains, 5 fingers × 3 joints × 2 hands | PASS |
| Eye bones | `LeftEye`, `RightEye` | PASS |
| Visemes | full 15-shape Oculus set on Head + Teeth + Tongue | PASS |
| Blink | `eyeBlinkLeft/Right` on Head, EyeAO, Eyelash (+ `eyesClosed` on Eye_Mesh) | PASS |
| ARKit set | 72 targets on Head_Mesh incl. `jawOpen`, `mouthSmileL/R`, `cheekSquintL/R`, brows | PASS |

The good Avaturn outcome, and the opposite of pitfall 51 (text-to-3D: 0 bones, 0 morphs,
sealed mouth). Also comfortably small — a third of the reference project's model.

### Two findings that change the code — both are silent failures if missed

1. **Viseme names don't match the skill's table.** `rendering.md` maps
   `ih→viseme_ih, ou→viseme_ou, ee→viseme_ee, oh→viseme_oh`. This model uses Oculus casing:
   `viseme_I`, `viseme_U`, `viseme_E`, `viseme_O`. Only `viseme_aa` matches as written.
   Copying the table verbatim leaves the mouth doing nothing but "aa" — dead lipsync, no
   error anywhere. Correct map:
   `aa→viseme_aa + jawOpen · ih→viseme_I · ou→viseme_U · ee→viseme_E · oh→viseme_O`.
2. **Morphs are split across six meshes.** Visemes on Head/Teeth/Tongue; blinks on
   Head/EyeAO/Eyelash; `Eye_Mesh` has only `eyesClosed`; `Body_Mesh` none. Confirms the
   skill's mesh-agnostic rule: iterate every mesh, check `morphTargetDictionary`. Blink
   fan-out **must include `eyesClosed`** or the eyeballs stay open while the lids close.

Legs and shoes are modelled but cropped by the waist-up framing (`hips.y - 0.02`) — expected,
no action.

---

## The new photo — my honest recommendation

The candid (fedora, glasses, quilted jacket, warm smile, sunlit European street) is a
genuinely good photograph: it has personality and warmth that the current black-suit headshot
doesn't, and it's far more memorable. But it is a **travel candid**, and as the sole hero of a
CTO portfolio it risks reading "travel blog" to a recruiter landing cold — hat and outdoor
bokeh do a lot of work against "technology leader", which is the exact impression this whole
piece of work is meant to strengthen.

**Recommendation — use it, but place it where its warmth pays:**

- **Hero = the live 3D avatar.** It's what makes the site unforgettable, and it's what you
  asked for. The avatar breathes, blinks and greets on arrival.
- **The candid becomes the hero's static fallback** — the poster frame shown to no-WebGL
  devices, `prefers-reduced-motion` users, and crawlers. Everyone sees a real face; only
  capable browsers upgrade to the avatar.
- **The candid also anchors About Me**, where a human moment belongs and where the current
  page is a wall of prose.
- **Keep a professional shot for `og:image`.** LinkedIn share cards are seen out of context by
  people who don't know you; the black-suit frame is the right one there.

You may simply want the candid swapped in as the plain hero — say so and I'll do that instead.

**Blocker:** I can see the photo in our conversation, but **it is not on the container's
filesystem** (`/root/.claude/uploads/` holds only the skill zip and the GLB). I cannot
reconstruct an image from viewing it. Please re-attach it so it lands as a file — ideally the
original, not a re-compressed copy, since I'll be generating responsive AVIF/WebP variants.

---

## Target architecture

```
Cloudflare (CDN, TLS, WAF, Turnstile, rate limiting at the edge)
        │
     Hetzner box
        ├─ Caddy ──── /assets/*         static, immutable, long cache
        │             /guide/clips/*    TTS clip cache — static files, app bypassed
        │             everything else → Fastify
        │
        ├─ site (Fastify + Nunjucks)  ONE process
        │    ├─ GET  /            /es/                 rendered from content/{en,es}.json
        │    ├─ GET  /articles/:slug   /es/articulos/:slug
        │    ├─ GET  /sitemap.xml  /robots.txt         generated from the content model
        │    └─ POST /guide/ask  /guide/tts  GET /guide/stream/:hash
        │
        └─ open-webui (existing)  ← agent tier, knowledge collection per locale
```

One deploy unit. The avatar API lives in the same process as the site, so there is no CORS
problem, no second service to operate, and the same content model feeds the pages, the
retrieval brain and the ⌘K index.

---

## Workstream A — Content model (do this first; everything depends on it)

Extract every string from `index.html` and the three articles into:

```
content/
  en.json        hero, about, 8 roles (with `industries: []` tags), 16 skills,
                 6 tech domains, 8 industries, 2 publications, 4 education,
                 6 projects, 3 article summaries, contact, nav, UI labels
  es.json        same shape, translated
  metrics.json   the impact numbers (locale-neutral values, localized labels)
  articles/{slug}.{en,es}.md
```

Templates (`views/`) consume it: `layout.njk`, `partials/*.njk` per section, `article.njk`.
One template set, two locales — a section is written once.

Derived at boot into `search-index.{en,es}.json`: one record per section/role/project/article
`{id, anchor, title, body, keywords, url, locale}`. **This single index serves both the ⌘K
palette and the avatar's BM25 retrieval** — they are the same problem, and one index means
they can never disagree about what's on the site.

Cleanup found while surveying: `style.css` (293 lines) is referenced by nothing — dead.
`maycalendar.html` is linked from nothing and absent from the sitemap. The About audio is a
**44MB WAV served as `type="audio/mpeg"`** — wrong MIME and ~40× larger than needed; transcode
to Opus/MP3 (~1–2MB). Confirm before deleting anything.

## Workstream B — Fastify app + i18n routing

- `/` English canonical, `/es/` Spanish. No auto-redirect on `Accept-Language` (surprises
  people and confuses crawlers) — instead a language switcher that **preserves the current
  section anchor**, plus a one-time dismissible hint for `es-*` browsers.
- `hreflang` alternates both ways + `og:locale:alternate`; per-locale canonical, title,
  description, keywords, and JSON-LD `Person` with `inLanguage`.
- **Preserve existing URLs exactly** — `/articles/edtech-problem-india.html` and siblings must
  keep working (they're indexed and in the sitemap). Spanish gets `/es/articulos/:slug`.
- `sitemap.xml` generated from the content model with both locales and real `lastmod`.

Spanish translation: I'll produce it, but a native speaker should review before launch — it's
his professional voice, and machine-translated executive prose reads subtly off. Article
translation is the largest text task in the plan.

## Workstream C — Front-end elements

- **⌘K command palette** — ⌘/Ctrl+K, fuzzy over `search-index`, jumps to sections, downloads
  the resume, switches language, opens WhatsApp, or hands the question to the avatar. Full
  keyboard nav, focus trap, `aria-activedescendant`, Escape to close.
- **Animated impact metrics** — band under the hero counting on scroll: 25 years · 150+
  technologists led · ₹1.5 Cr saved · 600,000+ students · 60+ universities · 8 industries.
  All already in his copy, currently buried in paragraphs. `prefers-reduced-motion` renders
  final values immediately. Reuses the IntersectionObserver pattern already in `script.js`.
- **Industry-filterable timeline** — chips (EdTech, Banking, Media, Ecommerce, Sports) over
  the existing 8 `.timeline-item` roles, driven by the `industries` tags in `en.json`. Real
  `<button>`s with `aria-pressed`; filter state in the URL so a filtered view is shareable.
- **Dark mode** — `styles.css` has **141 hard-coded colour literals and zero custom
  properties**, so this needs a token pass first (`--bg`, `--surface`, `--text`, `--accent`…).
  That's the bulk of the work here, and it also makes future restyling trivial.
  `prefers-color-scheme` default + explicit toggle in localStorage, with a tiny inline script
  in `<head>` setting the attribute **before first paint** so there's no flash of wrong theme.
- **Scroll-spy + reading progress**, and a styled `console.log` greeting with contact details.

## Workstream D — WhatsApp

Floating button → `https://wa.me/919867191999?text=…` with a locale-appropriate prefilled
message. His number is already published on the page, so this exposes nothing new.

**Placement matters:** the avatar FAB and a WhatsApp button both want bottom-right. One
vertical action stack, avatar primary (larger, bottom) and WhatsApp above it — never two
competing circles. On mobile the stack collapses so it can't cover content. The avatar can
also *offer* WhatsApp as a funnel action ("shall I open WhatsApp so you can message him?").

## Workstream E — The avatar

Built to the skill; full detail in `talking-avatar-guide` once installed. Phase order:

1. **Isolation** — one directory `public/guide/`, one export, lazy `import()` on first open.
   Every `display` rule on the panel carries `:not([hidden])` (pitfall 47).
2. **Stage** — transparent cutout (`alpha:true`, clear alpha 0), canvas `pointer-events:none`
   with DOM siblings for controls, waist-up framing, full dispose on unmount.
3. **Rig normalizer** — Mixamo↔VRM bone map (unprefixed), T-pose calibration, proxy rig with
   per-frame conjugation `inverse(R'parent)·proxyQuat·R'bone`, **the corrected viseme map and
   `eyesClosed` blink from the gate findings**, eye clamp ±0.45/±0.28 rad.
4. **Animation** — frame order `rest → idle → gesture → viseme → look-at → update → render`,
   rewritten every frame so nothing drifts. Clock is `performance.now()` (pitfall 2). Copy the
   `REST` constants verbatim — elbow fold axes are not derivable from theory (pitfall 4).
   Talk beats every ~5.5s so the hands don't die mid-answer. Persona: composed senior
   technology executive.
5. **Speech** — one `speak()` facade, silent fallthrough, per-sentence pipelining (first chunk
   ~80 chars, later ~190). Client computes `sha1(voiceId|text)` and GETs the clip URL directly
   — **no lookup POST in front of a sentence**; a miss is a cheap static 404 that then streams.
   Piper worker: own OPFS loader, session created once, warm-up generate before ready,
   benchmark gate, **length-scaled budgets** `max(3000, msPerChar·len·2.2+700)`, clause-chunk
   >140 chars, `outstanding` guard, wasm q8 CPU only. Then `speechSynthesis`.
   **Spanish**: `gpt-4o-mini-tts` handles it natively (same voice, Spanish text) so tier 1 is
   free; tier 2 needs a second Piper voice (~60MB, `es_ES-*`) loaded only on `/es/`; tier 3
   needs an `es-ES`/`es-MX` preference list. `voiceId` fingerprint must include locale or the
   two languages collide in the clip cache.
6. **Brain** — quick intents → BM25 over `search-index.{locale}` with light stemmer, score
   gate and **topic gate** → Open WebUI agent. Route by *question*, not page. Rolling history.
   Clear the reply before the async ask; per-ask token guards stale responses. **Answer in the
   language of the question, defaulting to page locale** — a Spanish question on `/` gets
   Spanish. Server drops any id it didn't send; `PERSON_MAP` of audited facts (employers,
   exact dates, titles, education) with explicit negatives is the anti-hallucination floor,
   and it is language-neutral so both locales inherit the same truth.
7. **Funnels** — `scrollTo`, `openArticle`, `downloadResume(variant)` picking BFSI vs general
   from the question, `contact(channel)` incl. WhatsApp, `fitCheck(role)`. Chips carry
   `{label, action}` — never round-trip a label through the parser (pitfall 45).
8. **Spotlight reel** — marker-pen highlighter redrawn from live rects every rAF, over
   `#about-me → #work-experience → #skills → #projects → #contact`. **Narration drives the
   clock** (floor 2.6s, ceiling 14s). Bail via ✕/Escape/tap, all through one `onCancel` that
   also hushes speech (pitfall 48). No driver.js — reels fit a single-page site and avoid the
   overlay stacking traps.
9. **Mic** — `continuous:true` with own silence timers (2.8s post-speech, 10s cap), behind a
   flag, with a visible note that Chrome routes audio through Google. Spanish sets `lang`.
10. **Gating** — capabilities only: WebGL, `prefers-reduced-motion`, `deviceMemory<2`.
    **Never gate on screen width** (pitfall 44 — that hid the avatar from every portrait
    phone). Save-Data blocks the idle prefetch, not the feature.

## Workstream F — Deploy

`docker-compose.yml`: caddy + site + existing open-webui. `Caddyfile` with automatic TLS and
immutable headers for `/assets/*` and `/guide/clips/*`. Deploy-time voice warm-up over every
fixed line **in both locales**, warmed **per sentence** through the same `splitSentences()`
the speaker calls, with every fixed line built from one shared function — the hash *is* the
text, so one stray space is a cache miss mid-conversation (pitfall 41). Re-run after any
change to voice/model/speed/instructions, which re-addresses every clip.

Cutover: stand up on a staging hostname → verify → lower DNS TTL → switch A record → watch.
Keep the GitHub Pages deployment intact as an instant rollback until the new site is proven.

---

## Verification

- **Rig/pose**: screenshot sweep only, `window.__AVATAR_DEBUG__`, **poll bone state, never
  timers** (headless clocks run ~3× fast). One constant at a time.
- **Hash parity**: browser sha1 == server sha1 across block boundaries and multi-byte UTF-8
  (Spanish accents make this a real case, not a theoretical one).
- **Grounding probe**: 15 questions × **3+ runs each** in both locales — 5 answerable, 5
  out-of-scope, 5 adversarial ("what's his salary", "did he work at Google"). Out-of-scope
  must miss honestly every time. Open WebUI retrieval is non-deterministic (guardrail 6), so a
  single pass proves nothing; a refusal counts as a non-answer, not a pass.
- **Latency**: click-to-first-audio warm (~200ms target), cold, and with Open WebUI stopped
  (must fall to Piper then OS voice without stalling).
- **i18n**: every `en.json` key present in `es.json` (test, not eyeballing); hreflang round
  trip; old article URLs still 200.
- **Playwright** on Chromium (already installed): both locales × {⌘K, filters, dark mode
  incl. no-flash on reload, metrics with and without reduced-motion, WhatsApp href, avatar
  greet → question → spoken answer → reel → bail}.
- **Lighthouse** before/after — the migration must not cost performance or a11y.

## Risks

- **Losing GitHub's CDN.** One Hetzner box in one region is slower for distant visitors than
  GitHub Pages' global edge, and it's now a single point of failure with you as the on-call.
  Cloudflare in front is the mitigation and is why it's in the architecture rather than
  optional.
- **DNS cutover.** Mis-sequenced, the site is down and email/SEO wobble. Staging host first,
  low TTL, Pages kept warm for rollback.
- **Public endpoint, your OpenAI key.** No login to gate behind. Per-IP token bucket, daily
  global ceiling, max question length, TTS restricted to proxy-produced or warm-manifest text
  — an open TTS endpoint is a free synthesis service for whoever finds it. Cloudflare Turnstile
  is the next lever.
- **Reputational hallucination, now doubled.** Two languages, same guards; the grounding probe
  runs in both.
- **Scope.** This is six substantial workstreams. A→B→C/D are independently shippable before
  the avatar lands; I'd ship in that order rather than big-bang.

## What I need

1. **The photo as an actual file** — re-attach; I can see it but can't read it from disk.
2. **Hetzner access**: host/SSH, Open WebUI base URL + API key, model id, knowledge collection
   id (or permission to create), whether Docker/Caddy are already installed, and a staging
   hostname.
3. **OpenAI key** with speech-model access — verify with `GET /v1/models`; a project-scoped key
   with a restricted allowlist 403s on TTS.
4. **Confirm the hero recommendation** (avatar hero + candid as fallback and in About) or tell
   me to just swap the photo.
5. **Your review of the `PERSON_MAP` facts and the Spanish copy** before either goes live.
