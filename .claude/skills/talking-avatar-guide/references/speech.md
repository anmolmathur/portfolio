# Speech — 3-tier TTS, worker rules, lipsync, STT

## Tier chain (one `speak()` facade, silent fallthrough)

```
1. Cloud TTS (server route, e.g. gpt-4o-mini-tts)  — best voice; per-sentence MP3
2. Neural in-browser (Piper/VITS in a Web Worker)  — free, offline, natural
3. OS speechSynthesis                              — instant, always works, robotic
```

One facade `speak(text, { onWord, onEnd })`; callers never know which engine ran. Any failure/timeout at a tier drops that LINE to the next tier — the guide must never stall mid-answer. Playback is **per-sentence pipelined**: split text into sentences (`/[^.!?]+[.!?]+["”)]*|[^.!?]+$/g`), generate sentence N+1 while N plays — first sound arrives fast, latency hides behind playback.

One global `SPEECH_RATE` knob applied at PLAYBACK (`audio.playbackRate` / utterance rate), not generation — pitch preserved, cached clips unaffected, all three engines land on the same tempo. Clamp 0.5–2. Keep ≤ ~1.3 or accents start sounding clipped.

## Tier 1 — cloud TTS route

- Server route holds the vendor key; session-gate it like any internal API. Client posts text, receives MP3.
- **First chunk short, later chunks long**: first piece ≈ 80 chars (decides how long the user stares at a silent avatar), later ≈ 190 (better prosody, fewer requests, latency hidden by pipeline). Prefetch ~2 lines ahead.
- Per-line timeout (~10s) → that line falls to tier 2.
- Persist clips in Cache Storage keyed by (voice, text) — reloads and repeated phrases (greetings!) cost zero.
- Voice character via the API's `instructions`/voice params (e.g. "Indian professional female" delivery on `coral`) — set server-side so it's consistent.

## Tier 2 — in-browser neural TTS (Piper). THE RULES:

Model choice first: **Piper (VITS)** — built for Raspberry-Pi-class CPUs, faster than real time on office laptops, ~60MB voice, ONNX. **Kokoro-82M was tried and rejected**: better voice but ~5x real-time on office CPUs (15s freeze per sentence) and garbled on integrated GPUs. **WebGPU rejected entirely**: fp16 AND q4f16 garble on Intel iGPUs, ran SLOWER than playback, and garble is undetectable from code so it cannot be gated safely. Ship wasm q8, CPU only.

1. **ALL inference in a Web Worker.** Main-thread wasm froze the entire app (stuck UI, dead gestures, sluggish tours). postMessage protocol; transfer `Float32Array` samples (transferable), wrap to WAV on the main thread.
2. **Own model loader.** Do NOT use vits-web's `download()` (doesn't await its OPFS writes — resolves mid-write → truncated model → ort "No graph was found in the protobuf"; never checks `res.ok`) or `predict()` (re-creates the ONNX session EVERY call). Fetch yourself → OPFS; create the ONNX session ONCE and cache it.
3. **Corrupt-cache self-heal**: session create fails → purge the OPFS entry → refetch from network ONCE.
4. `numThreads: 1` unless `crossOriginIsolated`. Pin `onnxruntime-web` as a DIRECT dependency (transitive dep vanishing broke the build); pin `wasmPaths` to a matching CDN version.
5. Vendored/imported glue built for main thread needs a module-scope shim in the worker: `const window = globalThis.window ?? globalThis`.
6. espeak phonemizer voice id must come from the voice's own config (e.g. jenny = `"en-gb-x-rp"`); a bare `"en-gb"` throws raw wasm errors. Give phonemize a ~10s internal timeout so a hang can't wedge the queue.
7. **Warm-up before ready**: run a throwaway `generate("Hello.")` BEFORE flipping the ready flag — first wasm inference includes 5–10s of compile; without warm-up the voice "switch" stalls mid-answer.
8. **Benchmark gate**: after warm-up, synthesize a real sentence; report `{genMs, audioMs, chars}`. If `genMs > audioMs * 1.6 + 900` → machine too slow → stay on tier 3 (log why). 
9. **Length-scaled budgets — never a flat timeout.** Derive `msPerChar = genMs / chars` from the benchmark; per-request budget `= max(3000, msPerChar * text.length * 2.2 + 700)`. A flat budget sized on the ~48-char benchmark line blows up on a 180-char sentence → falls back → AND the abandoned request leaves the worker busy → every following sentence hits the `outstanding > 0` shortcut → one long sentence turns the rest of the answer robotic. Log budget + length on every miss ("too slow machine" vs "line too long" are different bugs).
10. **Chunk long sentences** before the engine: split > ~140 chars at clause boundaries (`, ; : —`, then word boundaries), delimiter kept attached. Pause lands on a comma — reads naturally, first sound sooner.
11. **`outstanding` guard**: a timed-out request must never let new requests queue behind an abandoned one — that cascade produced "voice ready but never speaks".
12. Progress UX: tiny pill ("Natural voice 43%… ready ✓") fed by download progress; hide on failure and on cached loads. Preload app-wide a few seconds after page load; OPFS/browser cache means refreshes never re-download.

## Tier 3 — speechSynthesis quirks (all real)

- `getVoices()` is empty until `voiceschanged` fires — await it with a 1.5s timeout (some browsers never fire).
- Long utterances get silently cut off — speak sentence-by-sentence (you already split).
- Some voices never fire word-`boundary` events → synthetic pacing (below) must kick in automatically.
- Voice picking: ordered preference list matched on name/lang substrings, FEMALE-FIRST if the avatar is female — a bare `{lang}` preference alone will happily pick a male voice. Cover Windows (Zira/Heera), Edge natural (Neerja/Aria/Jenny/Sonia), Chrome ("Google UK English Female"), then lang fallbacks.
- Autoplay policy can block clip playback → treat as failure → this tier (utterances are exempt).

## Lipsync

- Word events drive a viseme plan: per word pick a mouth shape (`aa/ih/ou/ee/oh`) + weight envelope; viseme layer eases weights each frame.
- Engines without boundary events (all clips + some OS voices): **synthetic pacing** — estimate per-word ms from word length, SCALE the schedule to the actual clip duration, emit synthetic word events on a timer. Looks correct because mouth precision doesn't matter, rhythm does.
- Optional upgrade: drive intensity from a WebAudio AnalyserNode amplitude envelope on clip playback.

## STT (optional push-to-talk)

- Web Speech API (`webkitSpeechRecognition`). Chrome routes audio through vendor servers — put it behind a config flag (`ENABLE_MIC_INPUT`) and say so in docs/privacy.
- `continuous: true` + YOUR OWN silence timers (stop ~2.8s after last speech, hard cap ~10s with no speech). Default one-shot mode closes the mic at the first pause — users get cut off.
- `listenAfter` pattern: when the guide asks the user something ("just say 'show me'"), auto-open the mic after speech ends (voice-mode only).

## Spoken-text hygiene

- Cap spoken answers (~360 chars, whole sentences) — full text stays in the bubble/article; nobody wants a 60-second monologue.
- Strip markdown/headings before speech; don't read the article H1 twice (intro sections often repeat it).
