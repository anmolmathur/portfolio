# Server voice cache — content-addressed clips, streaming, CDN

The cloud-TTS tier gets 10x cheaper and faster with a server-side clip cache. This design shipped in the Digivarsity "Disha" guide (Laravel, but the scheme is backend-agnostic). Three delays were once stacked in front of every sentence; the rules below removed all of them. Measured: blocking POST 5.4s → first audio byte 2.2s (streaming), cached line 0.21s with **zero** POSTs, warm path 159–198ms click-to-speech.

## Content addressing (the core idea)

- A clip's name is `sha1(voiceId|text)` where `voiceId` fingerprints EVERY synthesis input: `engine|model|voice|instructions|speed`. Same text + same settings = same file, forever.
- One server class owns the scheme; the browser re-implements the same sha1 (~40 lines) so it computes the URL itself. Verify byte-identical output across block boundaries and multi-byte UTF-8 once, then trust it. Publish the inputs to the client (e.g. `window.ttsVoiceId`, `window.ttsBase`).
- **No lookup POST in front of a sentence.** The client GETs the static URL directly; a miss is a cheap static 404, and only then does it ask the server to synthesize.
- Changing voice/model/speed/instructions re-addresses EVERY clip — re-run the warm-up (below) after any such change, not just after deploys.

## Serving

- Clips are **static files, not app responses** — public dir with immutable/1yr cache headers, rewrite/framework bypassed so a MISS costs nothing (Apache: own `.htaccess` with `RewriteEngine Off`).
- Multi-pod / autoscaled deployments: back the clip store with a shared object-store disk (S3) so every pod sees every clip, and put a CDN (CloudFront) in front — clips are immutable so CDN caching is free wins. Configure the storage credentials EXPLICITLY (e.g. IRSA role); the SDK default chain picks the wrong identity in-cluster.
- Client memoizes text→url in **localStorage**, not sessionStorage — URLs are content-addressed and immutable, a dead one self-heals, and a return visit re-synthesizes nothing.

## Miss path: stream, don't block

- POST parks the text in cache and returns a stream URL in ~10ms; `GET .../stream/{hash}.mp3` pipes the vendor's audio THROUGH to the browser while writing the cache. First audio byte 2.2s vs 5.4s for synthesize-then-respond.
- Make the stream a **stateless API route** — session middleware on a web route holds the session lock open for the whole stream and serializes every other request from that user.
- A failed stream retries ONCE with a `blocking:1` fallback — the only request that can report WHY (503 = misconfigured, stop asking; 502 = vendor transient). Keep that path.

## Warm-up (fixed lines cost zero at runtime)

- A deploy-time command reads a manifest of every fixed line the guide can say (greetings, tour narration, finder questions) and synthesizes any missing clips through the same route. Run it after each deploy AND after any fingerprint-input change.
- The client also warms likely-next lines at idle (opening lines on page load, reel narration when the page has the anchors).
- **Warm per SENTENCE, not per line** — the speaker splits text into sentences and requests those, so line-level warming never hits the cache. Export the same `splitSentences` the speaker uses and warm its output.
- **Warmed and spoken text must be byte-identical** — the hash IS the text. Build every fixed spoken line from ONE function that both the warmer and the speaker call; a stray period or template-literal space means a cache miss and a synthesis round trip mid-conversation.
- If a batch `/prepare` endpoint synthesizes serially, send the FIRST line of a sequence in its own call so it's ready before the rest.

## Fallback policy — pick one deliberately

Two valid policies for what happens while a fresh clip synthesizes (a NEW sentence takes 1.7–3.3s at the vendor):

1. **Race with generous budgets**: wait N ms then drop that line to the next tier. If you do this, the fetch-abort timeout MUST exceed the caller's patience budget — an abort shorter than the wait decides the outcome itself and books a false failure. Budgets sized for cached lines (2.5s/4s) made every *fresh* answer robotic while every canned line sounded great — a very confusing symptom.
2. **Quality-over-latency** (what Disha ships): wait for the clip, fall back only on null/refusal/dead audio, with a ~30s stall guard. A beat of silence beats a robot voice; the text is already on screen.

Either way: never a latency-based fallback you haven't measured. And measure vendor speed params empirically with 3+ samples (CBR mp3 bytes ≈ duration) — single samples are worthless, output varies ±10% run to run, and vendor docs about which params work can be wrong in your favor.

## Vendor key diagnosis (both bit for real)

- 403 `model_not_found` on a key that "should work" → project-scoped key whose model-access allowlist excludes speech models. Fastest diagnosis: `GET /v1/models` with that key and read the list.
- 429 `insufficient_quota` → the key's account is out of credits; nothing wrong with your code.
