# anmolmathur.com — Hetzner migration, bilingual rebuild, conversational avatar

## Context

The portfolio is a hand-written static site on GitHub Pages: one 42KB `index.html` with all
copy welded into the markup, three article pages, `script.js`, `styles.css`. It was built
before an always-on server existed. Now there is a Hetzner box running Open WebUI, which
changes what's possible.

Seven things are wanted, and they are more connected than they look:

1. **Move to a server-rendered Node app on Hetzner** — enables everything below.
2. **Conversational 3D avatar** — Anmol's own Avaturn likeness, greeting and answering out
   loud, brain served by the Hetzner Open WebUI. Built to the `talking-avatar-guide` skill.
3. **Replace the hero photo** — three images now supplied: two studio headshots and a candid.
4. **Full Spanish version**, including the avatar speaking Spanish.
5. **Front-end elements that read "technology leader" on arrival** — ⌘K palette, animated
   impact metrics, industry-filterable timeline, dark mode + scroll-spy + console easter egg.
6. **WhatsApp button** connecting visitors straight to him.
7. **PostHog** on his existing self-hosted instance, with dashboards showing how visitors use
   the site — in service of reaching the right people more effectively.

The connective tissue: **nearly all of them need the copy extracted out of `index.html` into a
structured content model.** Spanish needs two locales of it, the avatar's retrieval brain
needs it indexed, and ⌘K needs it searchable. Do that refactor once and the rest follows;
skip it and each feature re-parses HTML separately. That is the spine of this plan.

Anti-hallucination remains the top non-functional requirement — a guide that invents an
employer or a date damages a personal reputation, and now it can do so in two languages.

---

## Already done (committed to `claude/portfolio-conversational-agent-r6ulfx`, commit `d835a27`)

- **`talking-avatar-guide` skill installed** at `.claude/skills/talking-avatar-guide/` — all
  684 lines. It now loads automatically in every future Claude session on this repo. To get it
  account-wide (like `moodle-skill` already is), upload the same folder via **claude.ai →
  Settings → Capabilities → Skills**; I can't write into the synced set from here, as
  `/root/.claude/skills/synced/` is a read-down mirror.
- **Avatar model preserved** at `assets/guide/models/anmol.glb` with its gate verdict recorded
  in a sibling README — committed because this container is ephemeral and the file would
  otherwise need re-uploading.
- **This plan preserved** at `.claude/plans/portfolio-rebuild-plan.md` (now stale — see the
  note at the end).

No changes to the live site.

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
| Analytics | **Existing self-hosted PostHog on Hetzner**, extended to this domain, first-party proxied |
| GA | Kept alongside PostHog — GA answers acquisition, PostHog answers behaviour |
| Privacy | Cookieless/anonymous until consent; banner opts into full analytics + replay |
| Question log | Avatar questions captured with a PII scrubber; misses flagged as content gaps |
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

## Photography — three images, three jobs

Three photos are now in play, and each is right for a different moment. The two new studio
headshots (cream backdrop, sharp, well-lit) settle the concern I had about the travel candid
carrying the whole first impression on its own.

| Image | Placement | Why |
|---|---|---|
| **Blazer** — black jacket, teal pocket square, composed closed-lip smile | `og:image` / social cards, **and** the hero's static fallback | The authoritative frame. Social cards get seen out of context by people who don't know him, and the hero fallback is what a cold recruiter sees on a no-WebGL device. Both want gravitas. |
| **Striped shirt** — open collar, warm open smile | About Me | Approachable and human, next to prose that's currently a wall of text. |
| **Travel candid** — fedora, sunlit street | Footer / a small "beyond work" note, or omitted | Real personality, but it undercuts the leadership read if it lands first. Optional. |

**Hero remains the live 3D avatar**, with the blazer shot as its poster frame for no-WebGL
devices, `prefers-reduced-motion` users and crawlers. Everyone sees a real face; capable
browsers upgrade to the avatar.

Two practical notes on the new headshots:

- **Cream backdrop needs handling in dark mode** — a bright beige rectangle glows against a
  dark page. Plan: background-removed **cutout** for on-page use (hero fallback, About), which
  also matches the avatar's cutout treatment and gives the two a shared visual language; keep
  the original framed version for `og:image`, where social cards need a solid background.
- Generate responsive AVIF/WebP at 1x/2x with explicit `width`/`height` to avoid layout shift.

### Delivery problem — this is now the one thing blocking the visual work

The images reach me rendered in the conversation but **never land on the container's
filesystem**. I've now swept the entire disk three times: `/root/.claude/uploads/` contains
only `6a45ff1d-talkingavatarguideskill.zip` and `a11cf005-Anmol_Model.glb`. Those two arrived
as **file attachments** and wrote to disk correctly; the photos appear to be arriving **pasted
inline**, which renders for me but writes nothing. I cannot reconstruct an image file from
viewing it, so re-sending the same way will not help.

Any of these works:

1. **Attach via the file picker / paperclip**, the same route the `.glb` took — that one
   worked.
2. **Commit them yourself** to `images/` on branch `claude/portfolio-conversational-agent-r6ulfx`
   via the GitHub web UI (drag-and-drop into the folder). I'll `git pull` and pick them up.
3. Put them anywhere I can fetch over HTTPS and send the URL.

Suggested names: `anmol_blazer.jpg`, `anmol_shirt.jpg`. Originals preferred over
re-compressed copies, since everything downstream is generated from them.

---

## Target architecture

```
Cloudflare (CDN, TLS, WAF, Turnstile, rate limiting at the edge)
        │
     Hetzner box
        ├─ Caddy ──── /assets/*         static, immutable, long cache
        │             /guide/clips/*    TTS clip cache — static files, app bypassed
        │             /ingest/*      →  PostHog (first-party proxy, beats ad-blockers)
        │             everything else → Fastify
        │
        ├─ site (Fastify + Nunjucks)  ONE process
        │    ├─ GET  /            /es/                 rendered from content/{en,es}.json
        │    ├─ GET  /articles/:slug   /es/articulos/:slug
        │    ├─ GET  /sitemap.xml  /robots.txt         generated from the content model
        │    └─ POST /guide/ask  /guide/tts  GET /guide/stream/:hash
        │
        ├─ open-webui (existing)  ← agent tier, knowledge collection per locale
        └─ posthog   (existing)   ← analytics, reached only via the /ingest proxy
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

## Workstream F — PostHog analytics + dashboards

PostHog is **already self-hosted and running on the Hetzner box**, so the ops cost is sunk and
the earlier Cloud-vs-self-host debate is moot. This workstream extends that instance to this
domain. GA (`G-12VK07Q8CB`) stays: GA answers *how did they find me*, PostHog answers *what did
they do once here*.

### First-party ingest (do this, not the default snippet)

Proxy PostHog through the site's own domain in Caddy — `anmolmathur.com/ingest/*` → the local
PostHog instance — and point `posthog-js` at `/ingest` via `api_host`. Since the site and
PostHog will sit on the same box this is a local hop. Three reasons this is the right default:

- Ad-blockers and Safari ITP eat third-party analytics domains; first-party ingest survives.
- No cross-origin cookie or CORS handling.
- PostHog's public hostname never has to be exposed if it isn't already.

### Consent gate (cookieless until opted in)

Initialise with `persistence: 'memory'`, `autocapture: false`, `disable_session_recording:
true`, `opt_out_capturing_by_default: true` — no cookies, no replay, nothing persisted. A small
locale-aware banner offers full analytics; on accept, switch persistence to `localStorage+cookie`,
enable autocapture and replay, and `opt_in_capturing()`. The choice itself lives in
localStorage (strictly-necessary, so it needs no consent). The same gate governs GA. This is
what makes the Spanish page defensible for EU visitors.

### Event taxonomy (the actual design work)

| Event | Properties | What it answers |
|---|---|---|
| `resume_downloaded` | `variant` (bfsi/general), `source` (hero/footer/palette/avatar), `locale` | **Highest-intent signal on the site** |
| `contact_clicked` | `channel` (whatsapp/email/phone/linkedin/github), `locale` | Which channel people actually reach for |
| `avatar_question_asked` | `question_scrubbed`, `tier` (intent/bm25/agent), `answered`, `matched_section`, `latency_ms`, `locale` | **What visitors want to know about him** |
| `avatar_answer_missed` | `question_scrubbed`, `locale` | **Content gaps — what the site should say but doesn't** |
| `palette_search` | `query_scrubbed`, `result_count` | Same gap signal, typed rather than spoken |
| `timeline_filtered` | `industry` | Which domains people care about — EdTech vs Banking vs Media |
| `section_viewed` | `section`, `dwell_ms`, `locale` | What gets read vs skipped |
| `article_read` | `slug`, `scroll_pct`, `locale` | Whether the writing lands |
| `language_switched` | `from`, `to` | Whether Spanish earns its keep |
| `avatar_opened`, `avatar_voice_used`, `avatar_reel_*`, `theme_toggled` | — | Feature adoption |

**PII scrubber, one choke point**: a `before_send` hook strips emails, phone numbers and long
digit runs from every free-text property before it leaves the browser. Free text is the one
place a visitor can accidentally send personal data, so it gets sanitised centrally rather than
per-call-site. Disclosed in the privacy note.

### Dashboards

Provision via the PostHog API from a script in `deploy/scripts/posthog-dashboards.mjs` so they
are code, reproducible, and survive a rebuild — not hand-clicked.

1. **Reach** — visitors, sources, countries, EN vs ES split, new vs returning.
2. **Intent** — resume downloads by variant and source; contact clicks by channel; funnel
   `landed → engaged → resume-or-contact`.
3. **What they want to know** — avatar question feed, top topics, miss rate over time, ⌘K
   queries. This is the content-gap board and the one likely to change what he writes.
4. **Content performance** — section dwell, article scroll depth, timeline filter usage.

**One honest caveat.** The stated goal is "improve my reachability and traffic for the right
set of people." PostHog measures what happens *on* the site; it cannot tell him how to be
found. Reachability is an acquisition problem, answered by Google Search Console (queries,
impressions, position), UTM discipline on anything he shares, and LinkedIn referral tracking.
Dashboard 1 shows which channels arrive and which convert — pair it with Search Console rather
than expecting PostHog to cover both halves.

### Self-hosted specifics to confirm on the box

Whether PostHog is reachable from the browser at all (bound to localhost vs a hostname), the
project API key, ClickHouse disk headroom and retention policy (replay is by far the heaviest
table — the consent gate helps by keeping volume low), and the instance version. PostHog's own
guidance puts hobby Docker Compose deployments at roughly **100k events/month** before they
recommend Cloud; a personal portfolio sits far under that, so this is a note for later, not a
concern now.

## Workstream G — Deploy

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
- **Analytics**: assert **zero cookies and zero network calls to `/ingest`** before consent —
  this is the compliance claim, so it gets a test, not a manual check. Then accept consent and
  assert events land in PostHog. Unit-test the PII scrubber against emails, international phone
  formats and long digit runs.
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
- **Scope.** This is seven substantial workstreams. A→B→C/D/F are independently shippable
  before the avatar lands; I'd ship in that order rather than big-bang. PostHog in particular
  is worth landing **early** — instrumenting before the redesign gives a baseline to compare
  against, and shipping it last means never knowing whether any of this changed behaviour.
- **PostHog on a shared box.** ClickHouse is memory- and disk-hungry and will now sit next to
  Open WebUI and the site on one machine. Watch RAM and disk headroom; session replay is the
  table that grows fastest, which the consent gate usefully throttles.

## What I need

1. **The two headshots as actual files** — see the delivery section above; pasting them inline
   doesn't reach the filesystem. This is the only hard blocker on the visual work.
2. **Hetzner access**: host/SSH, Open WebUI base URL + API key, model id, knowledge collection
   id (or permission to create), whether Docker/Caddy are already installed, and a staging
   hostname.
3. **PostHog instance details**: project API key, how it's currently exposed (localhost only or
   a hostname), and its version.
4. **OpenAI key** with speech-model access — verify with `GET /v1/models`; a project-scoped key
   with a restricted allowlist 403s on TTS.
5. **Your review of the `PERSON_MAP` facts and the Spanish copy** before either goes live.

## Note on the committed copy of this plan

`.claude/plans/portfolio-rebuild-plan.md` in the repo is the version committed earlier and is
now **stale** — it predates the photography decision and Workstream G. Re-sync it from this
file as the first step of execution.
