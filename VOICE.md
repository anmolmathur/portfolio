# Voice cloning — options, and what to record

## The finding that changes the plan

**OpenAI's TTS models cannot clone a voice.** `gpt-4o-mini-tts` offers a fixed
set of preset voices only. The earlier plan had it as the primary voice tier, so
wanting Anmol's own voice means changing that tier, not just configuring it.

## Existing audio

`audio/AnmolMathur.wav` — 15 min 23 s, 24 kHz mono, 16-bit, 42 MB.

That is far more than any cloning system needs. Signal analysis suggests it is a
**real acoustic recording** rather than TTS output: the noise floor sits at a
consistent −62 to −55 dBFS and only 0.1 % of frames are digitally silent, whereas
neural TTS pauses are normally exact zeros. **This is suggestive, not proof —
confirm before using it as a cloning reference.** If that file is itself
AI-generated, cloning from it would clone the synthetic voice, not Anmol's.

## Options

| Option | Licence | Languages | Cost | Runs on |
|---|---|---|---|---|
| **Chatterbox Multilingual** (Resemble AI) | **MIT** | 23+ incl. Spanish | free | self-host, GPU strongly preferred |
| ElevenLabs | commercial (paid plans) | multilingual v2 | per character | their cloud |
| OpenVoice v2 | MIT | EN/ES/FR/ZH/JA/KO | free | self-host |
| XTTS-v2 (Coqui) | **CPML — non-commercial** | 17 incl. Spanish | free | self-host |

**XTTS-v2 is ruled out.** Its weights are non-commercial under the Coqui Public
Model License, and Coqui shut down in January 2024, so there is nobody left to
sell a commercial licence. A portfolio promoting professional services should not
depend on it.

**Recommended: Chatterbox Multilingual.** MIT-licensed, holds speaker identity
across languages (clone once from English, speak Spanish in the same voice), and
self-hosts behind an OpenAI-compatible API. Note it embeds a PerTh watermark in
every output by default — that is a feature, not a problem: it marks the audio as
synthetic.

**The catch: it wants a GPU.** If the Hetzner box is CPU-only, live synthesis per
answer will be too slow for the "fast and seamless" requirement. Which leads to:

## The architecture that makes a CPU box viable

Most of what the avatar says is a **bounded, known set**: greetings, reel
narration, funnel prompts, section summaries, the honest-miss line. The
`talking-avatar-guide` skill already has a content-addressed clip cache and a
deploy-time warm-up step for exactly this.

So: **pre-render every fixed line in the cloned voice** — offline, slowly, even
on CPU, even as a one-off paid ElevenLabs batch. Those clips then play instantly
from cache at zero runtime cost. Only genuinely novel LLM answers need live
synthesis, and that decision can be made after hearing how the clone sounds.

Warm the cache **per sentence**, from the same `splitSentences()` the speaker
calls, with every fixed line built by one shared function — the hash *is* the
text, so a stray space is a cache miss mid-conversation.

## What to record

If the existing 15-minute file is confirmed as Anmol's real voice, **nothing new
is needed for English.** Otherwise:

- **Length:** 3–10 min of varied read speech is plenty for zero-shot cloning.
  ElevenLabs Instant needs ~1 min; their Professional clone wants ~30 min.
- **Format:** WAV, 24 kHz or higher, mono, 16-bit or better. **No compression, no
  noise reduction, no EQ, no de-esser** — cloning models learn artefacts as if
  they were part of the voice.
- **Room:** quiet, soft furnishings, no fan or aircon. A closet with clothes in it
  genuinely beats a large office.
- **Mic:** consistent distance, roughly a hand's width, slightly off-axis to avoid
  plosives. A decent USB mic or even a phone held steady in a quiet room works.
- **Delivery:** read as if explaining something to one interested person. Match the
  register the avatar will use. Include questions, numbers, and a few
  hard-to-pronounce proper nouns (TeamLease, Digitas, Mzaalo, NMIMS, HSBC).
- **Spanish:** cross-lingual cloning transfers timbre from English recordings, so
  Spanish samples are **not required**. If Anmol does speak Spanish, 2–3 minutes
  of Spanish improves the accent noticeably.

Good source material: read the About Me section, two or three role descriptions,
and one article aloud. That covers the vocabulary the avatar actually uses.

## How to get it to the build

The reference audio does **not** need to be sent through chat, and large WAVs
don't survive that route anyway. Either:

1. Commit it to `audio/` on the working branch (that is how the existing 42 MB
   file got there), or
2. Put it on the Hetzner box and reference the path, or
3. Create the clone in ElevenLabs and share only the **voice ID** — the audio
   never leaves their account.

## Two things worth deciding deliberately

- **Publishing a cloned voice is irreversible in practice.** Anyone can record
  the avatar's output and feed it to another cloning system. The mitigation is
  that this is already a public, professional voice — but it is a real
  consideration, not a hypothetical one.
- **Label the voice as synthetic.** A short line in the avatar's own help content
  ("this voice is an AI recreation of Anmol's") is honest, increasingly expected,
  and costs nothing. The Chatterbox watermark supports the same claim technically.
