# Pitfalls — symptom → cause → fix

Every entry below was hit for real. Scan this list FIRST when something is weird.

## Rendering / animation

1. **Whole app freezes while avatar "thinks"/speaks** → wasm TTS inference on the main thread → move ALL inference to a Web Worker (postMessage, transfer Float32Array).
2. **Gestures/idle run fast, or snap in headless screenshots** → `THREE.Clock` mis-ticking or rAF synthetic timestamps → use `performance.now()` for all animation time; in headless harnesses poll bone state instead of waiting on timers (headless clocks run ~3x fast).
3. **Avatar dimmed/greyed during tours** → driver.js overlay has a huge inline z-index and your avatar sits inside a header/layout stacking context — its own z-index is irrelevant → `createPortal` to `document.body` and raise z-index while a tour is active.
4. **Arms bend wrong / curls sideways after retune** → axis "theory" instead of empirical constants → screenshot-sweep; elbow fold axes are not intuitive (right elbow z strongly negative folds forearm UP; y→0 cancels forward clasp).
5. **Patches to stage code have no effect in the tuning harness** → import URL (extensionless vs not) resolved to a DIFFERENT module instance than the bundler's → import URLs must match exactly.
6. **Import fails only inside the worker** → import maps don't apply to workers → absolute-path imports in worker code; and main-thread-built libs need `const window = globalThis.window ?? globalThis` at module scope.
7. **Edits invisible despite saving** → app running `next start` (production build) → `npm run build` first, or run dev. Check which server is up before an hour of confusion.
8. **Realistic GLB looks wrong outfit/person** → filenames lie → extract embedded GLB textures (JSON chunk → bufferViews → images) and LOOK at them before committing to a model.
9. **Eyes look possessed on GLB** → unclamped eye bones → clamp yaw ±0.45, pitch ±0.28 rad.
10. **Pointing reads as "pointing down"** → arm raised too low → near-horizontal (z 0.35, y 0.6 forward) for a standalone presenter; adjust per framing.
11. **Presenter misses the first tour step** → lazy-loaded stage mounted after the event fired → keep last-event module state, replay on mount.

## Neural TTS (Piper/onnx)

12. **ort: "No graph was found in the protobuf"** → third-party `download()` resolved before its OPFS writes finished (and never checked `res.ok`) → own fetch→OPFS loader; verify sizes; self-heal by purging the cache entry and refetching once when session create fails.
13. **Every sentence takes seconds despite fast machine** → library's `predict()` recreates the ONNX session per call → create the session once, cache it.
14. **Voice "ready" but never speaks / stalls at switch-over** → first wasm inference includes 5–10s compile → run a throwaway warm-up generate BEFORE flipping ready; plus per-sentence timeout race to system voice.
15. **Voice goes robotic mid-answer and stays robotic** → flat generation timeout sized on a short benchmark line; a long sentence misses it, AND the abandoned request leaves the worker busy so all following lines shortcut to fallback → length-scaled budget `max(3000, msPerChar·len·2.2 + 700)` + clause-chunk sentences > 140 chars + `outstanding` guard that never queues behind an abandoned request. Log budget+length on every miss.
16. **Garbled audio on some machines (GPU)** → iGPU shader precision garbles fp16 AND q4f16, undetectable from code → don't ship a WebGPU path; wasm q8 + benchmark gate (genMs > audioMs·1.6+900 → stay on system voice).
17. **Random wasm throw like "1058600" from phonemizer** → wrong espeak voice id → use the voice's own espeak config value (jenny = `en-gb-x-rp`), never a bare lang code; wrap phonemize in its own timeout.
18. **Build breaks after removing an unrelated TTS lib** → onnxruntime-web was a transitive dep → declare it as a direct dependency, pin the version, pin wasmPaths to the same version.
19. **Multithread wasm errors** → `numThreads > 1` without crossOriginIsolated (COOP/COEP headers) → numThreads 1, or ship the headers.

## speechSynthesis / audio

20. **No voices found** → `getVoices()` empty until `voiceschanged` → await event with 1.5s timeout fallback.
21. **Speech cuts off mid-paragraph** → long-utterance browser bug → speak sentence-by-sentence.
22. **Lipsync dead on some voices/clips** → no word-boundary events → synthetic word pacing scaled to actual clip duration, auto-engaged.
23. **Male voice on a female avatar** → bare `{lang}` preference picked the OS default → female-named voices first in the preference list.
24. **Clips silently don't play** → autoplay policy → treat as tier failure, fall to utterances (exempt).

## Brain / LLM

25. **Guide describes UI that doesn't exist** → prompt vocabulary primed it ("sidebar panel") + no layout ground truth + a doc section describing OTHER screens' layout → APP_MAP with audited layout facts incl. explicit negatives ("Dashboard has NO side panel"), hard never-invent-layout rule, fix the fuel article to state exceptions.
26. **"Yes" logic hijacks normal questions** → substring yes-match → whole-message regex only.
27. **Retrieval misses obvious doc** → no stemming ("import"≠"importing") or user typo → light stemmer + always-append current screen's article section to excerpts.
28. **Guide can't see custom tabs** → collector only reads `[role=tab]` → add app-specific selectors, send visible + selected tabs, prompt rule for misspelled tab names.
29. **Wrong "active panel" claims** → stale panel state persisting across routes → whitelist routes where the panel is real, null elsewhere.
30. **Conversation memory resets randomly** → brain instance rebuilt because a dependency (screen info) changed → pass collectors via ref-read callbacks; brain memo deps must be stable.
31. **Old answer lingers during thinking** → reply state not cleared before async ask → `setReply(null)` first.
32. **Late LLM response overwrites a newer answer** → no stale-async guard → per-ask token, check before delivering.
33. **Guide navigates user away on every question** → article actions firing on all routes → gate article-open to the docs route, answer in place elsewhere.

## STT

34. **Mic closes at the first pause** → default non-continuous recognition → `continuous:true` + own silence timers (~2.8s post-speech, ~10s no-speech cap).

## Ops

35. **90MB voice re-downloads** → no persistent cache → OPFS for the model (+ browser cache); Cache Storage for cloud clips; SW CacheFirst rule for `.vrm|.glb`.
36. **Service worker breaks streaming/SSE elsewhere in the app** → SW runtime caching intercepting API routes → exclude API/SSE paths from SW caching when adding the model cache rule.
37. **localStorage throws (private mode/quota)** → unguarded access → try/catch every read/write; feature works without persistence.

## Latency (each of these was a real "the guide is slow" complaint)

38. **Tour step 0 takes 30+ seconds** → the 3D stage was built (13MB glTF parse + texture upload, main thread) while the tour narration timers were already running → never build the stage while anything waits; presenter shows the avatar only if the stage ALREADY exists, and builds it after the tour ends.
39. **Everything feels 1–5s late despite fast code** → stacked cosmetic `setTimeout`s (250ms "thinking", 350ms tour start, 200+120ms resume…) each looked reasonable alone → zero cosmetic delays on the path between a request and its answer.
40. **Fixed lines sound great, every fresh answer is robotic** → clip-fetch abort timeout shorter than the caller's patience budget, so the abort decided the outcome and booked a false failure; fresh text takes 1.7–3.3s to synthesize → the abort MUST exceed the caller's wait (see server-voice.md fallback policy).
41. **Pre-warmed lines still miss the cache** → warmed per LINE but the speaker requests per SENTENCE, and/or warmed text differs from spoken text by one byte → warm `splitSentences(line)` output; build each fixed line from one shared function — the hash is the text.
42. **"Let me think" makes answers slower** → the filler line costs its own synthesis round trip before the real answer → speak it only when the answer is actually slow (>~1.8s).
43. **Voice never comes back after a wedge** → `speechSynthesis` can fire NEITHER `onend` NOR `onerror` → every hold (panel-open reason, narration step, sentence) carries its own ceiling timeout.

## Mobile / gating

44. **Avatar appears on no phone at all — but appears when the tester ticks "Desktop site"** → 3D gated on `screen width < 480px`, which is every portrait phone → gate on capabilities only (WebGL, `prefers-reduced-motion`, `deviceMemory < 2`); handle bandwidth separately (save-data/2G blocks the idle PREFETCH, not the feature).

## UI / behavior

45. **A suggestion chip loops forever ("Yes, show me" → same answer → same chip)** → string chips re-parsed through intent matching → chips carry `{label, action}`; never round-trip a label through the parser.
46. **Tour cleanup never runs on programmatic close** → driver.js `destroy()` does NOT fire `onDestroyed` → call your own single-shot `finishTour()` on every exit path.
47. **Closed panel renders beside the launcher (rail + input floating on the page)** → a `#panel.someState { display:… }` rule outranks the UA `[hidden]` rule → every display rule on the panel needs `:not([hidden])`.
48. **Highlight vanishes but the voice keeps narrating it** → early-exit paths (✕, Escape, tap-away) cleared the ink without telling the narrator → route every bail through one `onCancel` that also hushes speech.

## Live-data agent

49. **Guide confidently describes catalogue items that don't exist** → hosted agent's own knowledge store fabricates when retrieval misses → server-side ground-truth injection for entities named in the question + refuse-don't-guess persona; never treat an agent answer as evidence about your data (brain.md §Tier 4).
50. **Guide denies a real partner/product** → substring name-matching missed "JAIN (Deemed-to-be University)" for "Jain university", and the miss was read as proof of absence → distinctive-token matching + verified-query denials only.

## Models

51. **Beautiful AI-generated 3D model won't talk or move** → text-to-3D (Tripo/Meshy) output has 0 bones and 0 morphs — a fused sculpt with a sealed mouth; auto-rigging fixes only the body → gate every candidate GLB on bones + morphs before anyone falls in love with it (rendering.md §Model acceptance gate); Avaturn/VRoid are the working routes.
