# talking-avatar-guide — Claude Code skill

Teaches Claude to build an interactive 3D talking avatar guide in a web app: a transparent-cutout character that answers questions with voice, lipsync and gestures, grounded in the app's own docs (no hallucination), with an optional guided-tour presenter mode.

Distilled from the production Digivarsity "Disha" guide (2026) — a B2C avatar on a public consumer website that greets visitors by name, answers site + product-catalogue questions out loud, and walks visitors into conversion funnels. Covers: three.js + VRM/Mixamo rigs behind one adapter, 3-tier TTS (cloud → in-browser Piper worker → OS voice) with a content-addressed server clip cache + CDN, BM25 + catalogue-agent brain with anti-hallucination guardrails, device-local visitor profiles, avatar-model acceptance gating, and 51 documented real-world pitfalls.

## Install

Copy this folder (keep the name) to ONE of:

- `~/.claude/skills/talking-avatar-guide/` — personal, available in all your projects
  - Windows: `C:\Users\<you>\.claude\skills\talking-avatar-guide\`
- `<your-project>/.claude/skills/talking-avatar-guide/` — project-scoped, share via git

No install step. Claude Code discovers it on the next session. It triggers automatically when you ask for a talking avatar / 3D guide / digital human / avatar with TTS, or invoke it explicitly.

## Contents

```
SKILL.md                    entry point: stack decisions, build order, rules, latency rules
references/
  architecture.md           module isolation, layers, host-page contracts, B2C
                            visitor patterns (profile, funnels, compare, login),
                            tours, spotlight reels, server-rendered (no-SPA) variant
  rendering.md              cutout stage, VRM path, GLB rig normalizer, model
                            acceptance gate, style switch + strike-off
  animation.md              frame pipeline, empirical rest-pose constants, gestures, personas
  speech.md                 3-tier TTS chain, web-worker rules, lipsync, STT
  server-voice.md           content-addressed server clip cache, streaming miss path,
                            CDN/S3, deploy warm-up, fallback policy
  brain.md                  grounded answering ladder, RAG guardrails,
                            catalogue-agent guardrails, page context
  pitfalls.md               51 symptom → cause → fix entries. Read before debugging.
```

## Assets you'll need (not included — large binaries)

- Anime avatar: any VRM 1.0 with `aa/ih/ou/ee/oh` + `blink` (VRoid Studio export, or pixiv/three-vrm samples — check VRM meta license).
- Realistic avatar: Mixamo-rig GLB with ARKit + viseme morphs (met4citizen/TalkingHead repo `avatars/`, MIT; or an Avaturn export).
- Neural voice: Piper voice from HuggingFace `rhasspy/piper-voices` (e.g. `en_GB-jenny_dioco-medium`).
