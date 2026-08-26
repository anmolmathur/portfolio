# Architecture — module layout, layers, contracts

## Isolation pattern (do this first)

The entire feature is ONE directory with ONE public export:

```
guide/                              # one feature dir (SPA component dir or public/js/guide/)
  index.js                          # exports ONLY the launcher
  config.js                         # every knob in one file
  launcher.js                       # FAB + lazy panel host
  panel.js                          # cutout avatar + bubble + chips + input UI
  engine-hook.js                    # ask → deliver orchestration
  pageContext.js                    # "what page is the visitor on" collector
  profile.js                        # device-local visitor record (name, interests, history)
  brain/    engine.js  intent.js  bm25.js  sections.js  [agent.js]
  speech/   tts.js  cloudTts.js  neuralTts.js  piperWorker.js
            stt.js  visemePlan.js  vendor/
  stage/    stage.js  scene.js  vrmAvatar.js  [glbAvatar.js]
            restPose.js  gestures.js  procedural.js  visemeDriver.js
```

Rules:
- Host page imports **only the launcher** (`import { AvatarGuideLauncher } from ".../HelpAvatar"`). One import + one JSX block = whole integration.
- The panel (and therefore three.js, ~600KB+) loads via dynamic import with SSR off (`next/dynamic ssr:false`, or `React.lazy`) — nothing loads until the FAB is clicked (or auto-open fires).
- No other module imports from inside the folder. Removing the feature = delete folder, delete one import.

## Layer map

```
Launcher (FAB, auto-open, passes filtered content + screen info)
   └─ Panel (UI shell: cutout stage, speech bubble, chips, input, controls)
        ├─ AvatarStage → createAvatarScene → [vrmAvatar | glbAvatar adapter]
        │                                     restPose → procedural → gestures → visemeDriver
        └─ useGuideEngine (orchestrator hook)
             ├─ brain/engine.ask(text)  → { speech, action?, gesture?, listenAfter? }
             ├─ speech/tts.speak(text, { onWord, onEnd })  → viseme + bubble timing
             └─ deliver(): setReply → speak → gesture → run action callbacks
```

Data flow for one question:
1. User types/speaks → `engine.ask(text)`.
2. Brain resolves (quick intent | BM25 verbatim | LLM RAG | live-data agent) → answer object.
3. `deliver()` clears the previous bubble (`setReply(null)` BEFORE the async ask — old answer must not linger during thinking), sets reply text, calls `tts.speak`, fires a gesture (persona pool), executes actions via callbacks the page provided.
4. Word/pacing events drive the viseme layer; bubble auto-fades ~1.8s after speech ends (muted → word-count-scaled delay).

## Config-first

ALL knobs live in `avatarConfig.js`: style registry (`AVATAR_STYLES` id → {label, modelUrl, format}), `DEFAULT_AVATAR_STYLE`, `PERSONAS`, TTS tier configs (`OPENAI_TTS`, `NEURAL_TTS`, `VOICE_PREFERENCES`, `SPEECH_RATE`), brain configs (`GUIDE_LLM`, `MIN_ANSWER_SCORE`, `MAX_SPOKEN_CHARS`), feature flags (`ENABLE_MIC_INPUT`), `STORAGE_KEYS` (muted, greeted, avatarStyle). Wrap all localStorage access in try/catch — persistence is best-effort.

Style switching: `setAvatarStyle(id)` writes localStorage + dispatches a window CustomEvent; every mounted stage listens and hot-swaps (React: `key={style}` on the canvas host = fresh GL context — do not try to reuse a context across model formats).

## Integration contracts (host page → avatar)

The avatar layer NEVER widens access. The page passes, as props/callbacks:
- `getVisibleArticles()` / `getAvailableTours()` — the content lists the guide may speak from (filter upstream if anything is gated). Brain indexes only these.
- Action callbacks: `selectArticle(slug, anchor)`, `launchFeatureTour(id)` — the avatar requests, the page executes with its own rules.
- Optional `screenInfo` for the LLM briefing (see brain.md). Pass via a ref read at ask-time so the brain memo never rebuilds (rebuilding loses conversation history).

Behavior contracts learned in production:
- Article-open actions should fire only ON the docs/help page; on other routes answer in place — yanking the visitor across routes on every question tested badly.
- Greet on open; store a "greeted" flag so later opens get a short return greeting (personas carry both strings).
- Auto-open on the help route is fine; greet each pop-up, then stay silent until the visitor acts.

B2C visitor patterns (the consumer-site layer):
- **Device-local profile** (`profile.js`, one localStorage record): ask the visitor's name ONCE on first open, then remember it, their stated interests, products opened, topics asked. Send it with agent questions as context (a "VISITOR:" note) — but NEVER persist it server-side; the caption "Saved on this device" earns trust.
- **Funnels are answers too**: when a visitor states an aspiration ("I want to do an MBA, please help"), don't lecture — acknowledge and open the relevant funnel (finder/wizard) pre-seeded with what they already said, skipping the questions they answered. Seeded steps need their own phrasing: a follow-up-toned question ("Nice! And what interests you most?") reads wrong as a FIRST question.
- Aspiration detection is built on ordinary verbs (want/get/find), so three guards do the real work: the sentence must name a study/product object ("I want a refund" must NOT open the wizard); complaints/cancellations excluded; verb patterns need word boundaries on both sides with inflections spelled out (bare `pick` matches inside "pickup").
- **Compare by voice**: "compare X and Y" resolves the named products against the live catalogue API (token-scored, threshold), writes the same storage the compare page reads, then navigates — or routes through login first with picks preserved. Under two resolved products → fall through to normal answering ("how do I compare?" still reaches the article).
- **Login-aware actions**: actions that need auth (`login` action) reuse the site's own auth modal; treat it as a takeover — mic must not resume under an OTP modal.

## Tours (optional phase)

Two cooperating pieces, both driven by window events so any mounted avatar reacts:

- **Autopilot narration**: a `driveTour(tour)` wrapper narrates each driver.js step (reuse the speech facade — no three.js needed on non-help pages), then auto-advances (~350ms after speech ends; muted → `words * 220ms`). Manual Next/Back pauses autopilot; inject a "Resume auto-play" button via driver's `onPopoverRender`. Spoken outro, then destroy.
- **Tour presenter**: a small (~320x252) cutout avatar stage mounted by a global watcher component, shown during tours on feature pages. Glides (CSS transform transition) to the corner farthest from each highlighted element; re-measure ~300ms after each step (driver scrolls). Points at the highlight with the facing arm. Suppress it on the page that already shows the main panel avatar (a `window.__guideAvatarMounted` flag) — the panel avatar points instead, listening to the same event.
- Cross-page tours: stash the pending tour id in sessionStorage, navigate, a watcher on the target route consumes and starts it.
- Lazy chunks miss the first event: keep `getLastPresenterStep()` module state and replay it on mount.

Stacking trap: driver.js overlay uses a huge inline z-index; anything inside a header/layout stacking context gets dimmed REGARDLESS of its own z-index. `createPortal` the presenter (and the panel during tours) to `document.body` and raise z-index while a tour is active.

## Spotlight reels (lighter alternative to driver.js)

For "show me around this page" moments a full driver.js tour is heavy. A second shipped pattern: a hand-drawn **marker-pen highlighter** layer — no backdrop, no dimming, no click capture; marks are redrawn from the live element rect every rAF so they follow scrolling. A "reel" is data: an ordered list of `{selector, text}` steps; the avatar narrates each step and the mark holds until she finishes (floor ~2.6s, hard ceiling ~14s so a wedged voice can't strand a mark; muted → fixed hold). Rules learned:

- A mark with no narration on a 1.5s timer reads as "the tour is too fast and the voice isn't reading it" — narration drives the clock, not a timer.
- Steps whose target is missing on this page resolve instantly, don't count toward the drawn total, and leave no gap.
- Users MUST be able to bail: a stop ✕ pinned to the current note (the one element in the layer with `pointer-events:auto`), Escape, and tap-anywhere — all routed through one `onCancel` so the voice is hushed too; otherwise the ink vanishes but the avatar keeps narrating a mark that no longer exists.

## Server-rendered apps (no SPA) — classic-script variant

The same architecture ships in a Laravel/Blade (or any server-rendered) app with no build step:

- Feature = plain scripts in one public dir (`public/js/guide/`), served as ONE bundle from a tiny controller: concatenate files in a config-declared order, long immutable cache, cache key = asset version + newest source mtime (edits rebust automatically, no manual bumps).
- three.js stage and the TTS worker stay **ES modules loaded separately** (import map + `<script type="module">`) — only when the panel opens. The classic bundle must not pay their weight.
- Include via one partial at the END of the base layout — after any script whose globals you override, so your override wins.
- Import map gotcha: `"three/addons/": "<asset-base>/vendor/three/"` — the trailing slash goes OUTSIDE the asset() helper or the mapping silently breaks. Vendor three + three-vrm at pinned, mutually-compatible versions.
- CSP: the TTS worker needs `worker-src 'self' blob:` and `blob:` in `connect-src`.
- Immutable headers for `.glb/.vrm/.onnx/.wasm` via `.htaccess`/nginx conf — the model files are the big repeat cost.
- Cross-file API = one window namespace (`window.Guide.*`) instead of imports; same layer boundaries, same "delete one folder + one include" isolation.
- CSS trap that shipped a visible bug: a `display` rule like `#panel.expanded` OUTRANKS the UA's `[hidden]` rule — every display rule on the panel needs `:not([hidden])` or the shut panel renders anyway.

## Framework portability

The reference is Next.js App Router, but the design is framework-agnostic:
- "Server route" = any backend endpoint you control (keeps TTS/LLM keys server-side, session-gates callers).
- `next/dynamic` = `React.lazy` / route-level code splitting / a plain dynamic `import()` on first open (Vue/Svelte equivalents fine).
- Window CustomEvents are the cross-component bus on purpose — they work in any framework and across lazily-mounted islands.
- The stage/speech/brain layers are plain JS classes/closures with `create*()` factories — only the thin Panel/Launcher shells are framework components.
