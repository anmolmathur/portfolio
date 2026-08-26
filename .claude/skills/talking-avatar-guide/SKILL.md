---
name: talking-avatar-guide
description: Build an interactive 3D talking avatar guide for a consumer (B2C) website — a cutout character that greets visitors, answers site + product-catalogue questions with voice + lipsync + gestures, grounded in the site's own content (no hallucination), and walks visitors into conversion funnels, with guided-tour presenter mode. Use when the user asks for a "talking avatar", "3D guide", "virtual assistant character", "digital human", "help mascot", "website guide avatar", "VRM/GLB avatar", "avatar with TTS/lipsync", or an "Interakt-style presenter". Covers three.js + VRM/Mixamo rigs, server-cached cloud TTS, in-browser neural TTS, retrieval brains, and every known trap.
---

# Talking Avatar Guide

Build a production 3D talking guide avatar: a transparent-cutout character floating over the page that greets users, answers questions about the app out loud (lipsynced, gesturing), opens the right docs, and optionally narrates guided tours while pointing at highlighted UI.

This skill distills the shipped **Digivarsity "Disha" guide** (Aug 2026) — a B2C avatar on a public consumer website: she greets anonymous visitors by name, answers questions about the site and the product catalogue out loud, walks them into conversion funnels (course finder, compare, login), and narrates page tours. The perspective throughout is B2C: no logged-in employee, no role/permission model — a visitor you have one chance to keep. Every recommendation was validated on real hardware; every trap in `references/pitfalls.md` cost real hours. Trust the empirical numbers over first-principles reasoning.

## What you end up with

- **Avatar stage** — three.js scene on a transparent canvas (no window chrome, pure cutout), waist-up framing, works with two model families behind one adapter: anime **VRM** (VRoid) and realistic **GLB** (Mixamo-rig, ARKit morphs), runtime-switchable.
- **Liveliness** — layered procedural animation (rest pose → idle breath/blink/drift → gestures → visemes), personas (different character per avatar style), fidgets.
- **Speech** — 3-tier TTS chain: cloud TTS route (best voice, key server-side) → in-browser neural TTS in a Web Worker (Piper/VITS, free, offline) → OS `speechSynthesis` (instant, always works). Per-sentence pipelining so audio starts fast. Optional push-to-talk STT.
- **Brain** — layered answering: regex quick-intents → BM25 retrieval over the site's own help content (speaks vetted copy verbatim) → catalogue/product agent with hard anti-hallucination guardrails. Never generative without grounding.
- **B2C visitor layer** — device-local profile (name asked once, interests, history), aspiration detection that seeds conversion funnels ("I want to do an MBA" → the finder opens pre-filled), product compare by voice, login-aware actions.
- **Actions** — answers can open articles/anchors, launch driver.js feature tours or narrated spotlight reels; tour mode adds a small presenter avatar that glides away from highlights and points at them.

## Stack decisions (pre-made — don't re-litigate without reason)

| Concern | Choice | Why / rejected alternatives |
|---|---|---|
| 3D | `three` + `@pixiv/three-vrm` | three-vrm's normalized humanoid gives a clean world-aligned bone convention; write all animation against it, adapt other rigs TO it |
| Anime model | VRM 1.0 (VRoid Studio export or three-vrm sample) | needs `aa/ih/ou/ee/oh` + `blink` expressions |
| Realistic model | GLB, Mixamo skeleton, ARKit + Oculus-viseme morphs (Ready Player Me-style / Avaturn export; met4citizen/TalkingHead repo ships MIT ones) | RPM website is dead (NXDOMAIN as of 2026-08); use TalkingHead repo avatars or user's own Avaturn export |
| Best voice | Cloud TTS behind YOUR server route (e.g. `gpt-4o-mini-tts`) | key stays server-side; per-sentence MP3; content-addressed server clip cache + CDN (`references/server-voice.md`) |
| Free/offline voice | Piper TTS (VITS) in a Web Worker | Kokoro-82M REJECTED: ~5x real-time on office CPUs, garbles on iGPUs. Piper is Raspberry-Pi-class fast. WebGPU path REJECTED: garble is undetectable from code, can't gate safely |
| Always-works voice | `speechSynthesis` with a voice-preference list | instant, zero download; robotic but reliable |
| Brain | BM25 first, LLM only with retrieved excerpts | pure-LLM answers hallucinate UI that doesn't exist; verbatim-from-docs is the safety floor |
| Tours | driver.js (full tours) or spotlight reels (marker-pen highlighter, no backdrop) | overlay stacking traps documented in pitfalls; reels in `references/architecture.md` |
| New avatar models | Avaturn export (realistic) / VRoid (anime), gated on bones+morphs | text-to-3D (Tripo/Meshy) output has 0 bones 0 morphs — unusable, don't re-try |

## Build order

Work phases in order; each is independently shippable. Read the linked reference BEFORE writing that phase's code.

1. **Skeleton + isolation** — one folder, one public export, lazy-loaded panel. → `references/architecture.md`
2. **Stage + model** — cutout canvas, camera framing, load VRM (start with VRM; it's the easy rig). → `references/rendering.md`
3. **Animation** — rest pose, idle motion, gesture player. Copy the empirical constants; do NOT re-derive elbow axes from theory. → `references/animation.md`
4. **Speech + lipsync** — start with `speechSynthesis` + synthetic visemes (ships day 1), then add the neural worker tier, then the cloud tier. → `references/speech.md`. If the cloud tier is primary, add the server clip cache → `references/server-voice.md`
5. **Brain + engine** — quick intents + BM25 over the app's docs; engine hook wires ask → speak → gesture → actions. → `references/brain.md`
6. **Realistic avatar (optional)** — GLB adapter with the rig normalizer (T-pose calibration + proxy-rig conjugation). Personas so the two styles feel like different people. → `references/rendering.md` §GLB
7. **Tours (optional)** — narrated auto-advancing tours + pointing presenter. → `references/architecture.md` §Tours

Before debugging ANYTHING weird, scan `references/pitfalls.md` — the symptom is probably listed.

## Non-negotiable rules

- **Neural TTS inference runs in a Web Worker.** Main-thread wasm froze an entire app (stuck UI, dead gestures). No exceptions.
- **Animation clock is `performance.now()`.** Never `THREE.Clock` (shim tick-rate bugs), never the rAF timestamp (headless/synthetic clocks run fast).
- **Every fallible tier falls through silently** to the next (cloud voice → neural → OS voice; LLM → verbatim BM25 → "not covered"). The guide must never break or hang mid-answer.
- **The brain only speaks grounded content.** LLM answers must cite/choose from retrieved excerpts and a factual app map; server drops any article/tour id it didn't send. Layout facts the model wasn't given are forbidden to state.
- **The avatar only knows what the host page hands it.** Content lists (articles, tours, page sections) are passed in, filtered upstream if anything is gated; the avatar layer never widens access. Visitor data (name, interests, history) stays device-local — never persisted server-side.
- **Isolation.** The whole feature lives in one directory, imported from one place, loaded only when opened. Removing the feature = deleting one folder + one import.

## Asset sourcing

- VRM: VRoid Studio (export VRM 1.0) or pixiv/three-vrm sample models (check the VRM meta: `commercialUsage`, `redistribution`).
- Realistic GLB: met4citizen/TalkingHead repo `avatars/` (MIT) or an Avaturn export. **Inspect the embedded textures before committing** — extract GLB images (JSON chunk → bufferViews) and LOOK at the outfit; filenames lie (a "brunette.glb" turned out to wear gym clothes).
- Piper voices: HuggingFace `rhasspy/piper-voices` (e.g. `en_GB-jenny_dioco-medium`, ~60MB, downloads once, OPFS-cached).
- Ship model binaries with a CacheFirst service-worker rule for `.vrm|.glb` if the app has a SW.

## Latency rules (the recurring complaint is always "it feels slow")

Every slow-guide complaint traced to a *blocking wait added for polish*, not slow code. The rules: no cosmetic `setTimeout` between a request and its answer; never build the 3D stage while anything waits on the main thread; speak with whatever voice is ready (or deliberately choose quality-over-latency — but decide, don't drift); warm fixed lines at idle; every async step has a ceiling because `speechSynthesis` can wedge with no event at all. Details in `references/server-voice.md` and pitfalls §Latency.

## Reference implementation

**Digivarsity repo** (`digivarisity-3.0`, Laravel/Blade): `public/js/dv-guide/` (classic bundle: engine, intent, avatar, tours, spotlight, profile, compare-action; `stage/` + `speech/` ES modules), `config/dv_guide.php`, `DvGuideAssetController` (bundle endpoint), `App\Support\DvGuideVoice` + `dv-guide:warm-voice` (server voice cache), `GuideAgentController` + `GuidePageBriefService` (agent guardrails), `tools/check-avatar.mjs` (model gate).

Read it before reinventing anything. In any other repo, the references in this skill are self-contained.
