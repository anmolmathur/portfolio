# Animation — frame pipeline, rest pose, gestures, idle, personas

## Frame pipeline (strict order, every frame)

```
applyRestPose(bones)        // deterministic base — NO accumulated drift
→ idle layer                // breath, blink, head drift, weight shift
→ gesture layer             // active gesture curves add on top
→ viseme layer              // mouth expression weights
→ look-at
→ adapter.update(delta)     // vrm.update / proxy write-back
→ renderer.render
```

Rest-pose-first is the whole trick: every frame REWRITES base rotations, layers ADD. Nothing integrates, so nothing drifts and interrupted gestures can't leave the rig bent.

**Clock: `performance.now()` only.** `THREE.Clock` mis-ticks under some three shims; the rAF timestamp is synthetic/fast in headless. This bug looks like "animations sped up / gestures snap".

## Rest pose (empirical — copy, don't re-derive)

"Presenter at rest": arms relaxed down, elbows bent, hands forward at waist height (clasped look), fingers gently curled. A flat splayed hand is the fastest way to look like a mannequin.

Sign convention (three-vrm normalized, model facing +Z): RIGHT upper arm +Z lowers it, LEFT −Z. Elbow forward-bend: LEFT lower arm −Y, RIGHT +Y. Finger curl: RIGHT +Z, LEFT −Z; thumbs fold across palm about ∓Y.

Values found by screenshot sweep (the elbow's visible fold axis is NOT intuitive — trust these over first-principles):

```js
export const REST = {
  upperArmZ: 1.15,   // ~66° down from T-pose, elbows near body
  upperArmX: 0,
  lowerArmY: 1.4,    // forward swing — hands in front of waist
  lowerArmZ: -0.8,   // inward fold — fingertips meet at midline
  handX: -0.15,      // relax wrists
  fingerCurl: 0.24,  thumbCurl: 0.12,
};
```

Apply: mirror signs per side (`left upperArm.rotation.set(x, 0, -REST.upperArmZ)`, right `+Z`; left lowerArm `(x, -Y, +Z... )` — see restPose.js in the reference repo). Finger joints weighted base→tip `[1, 1.15, 0.7]` (intermediate folds hardest — how real fingers close), thumb `[0.4, 0.8, 0.6]`.

More hard-won arm facts: right-arm elbow z strongly NEGATIVE folds the forearm UP (wave target ≈ −2.15); y→0 cancels the forward clasp. Left arm mirrors signs.

## Gestures

A gesture player: `play(name)` runs a timed curve (ease in → hold → ease out) writing arm/head/hand targets on top of rest. Core set:

| Gesture | Use |
|---|---|
| `wave` | greeting |
| `explain` | default while answering (both hands open, animated beats) |
| `offer` | open-palm single hand — composed persona leads with this |
| `emphasis`, `think`, `clasp`, `nod` | answer variety |
| `point` / `pointRight` | article-open, tour-launch, tour presenter aiming at highlights. Raise near-horizontal: `z 0.35, y 0.6` forward for presenter (lower angles read as "pointing down"); panel avatar point at `z 0.05` so it clears bottom-standing framing. Viewer's left = model's RIGHT arm |
| fidgets: `checkWatch`, `weightShift`, `stretch`, `lookAround` | idle scheduler |

- `pickGesture(speech, pool)`: deterministic rotation through the persona's `answerPool` — every answer gets a gesture without repetition feel.
- **Talk beats**: while speech is playing, re-fire a beat gesture every ~5.5s (panel) / 3.8s+8.5s (tour steps) from `talkBeats` — hands must not die during long answers.
- Persona `gestureMap` substitutes at `play()` time (e.g. composed persona: `cheer → clasp`) — one choke point covers answers, fidgets, pokes, tours.

## Idle liveliness

- Blink: random gap ≥ persona `blinkMinGap` (s), double-blinks occasionally.
- Breath: chest/shoulder sine, rate × persona `breathRate`.
- Head drift: slow noise wander × persona `driftScale`.
- Fidget scheduler: base 12–26s interval × persona `fidgetRate`, fires from persona `fidgets` list.
- Baseline expression: persona `relaxedBaseline` (0.05 faint professional smile ↔ 0.12 visible resting smile).

## Personas — styles are different CHARACTERS

Avatar style swap must change the manner, not just the mesh. One `PERSONAS` map keyed by style id; every layer reads its own knob:

```js
{
  id, tone,                       // tone → LLM route personality block ("cheerful" | "professional")
  firstGreeting, returnGreeting,  // engine
  answerPool, talkBeats,          // gesture picker
  fidgets, fidgetRate,            // idle scheduler (1 = normal, 1.7 = rarer/composed)
  gestureMap,                     // substitutions, e.g. { cheer: "clasp" }
  idle: { driftScale, breathRate, relaxedBaseline, blinkMinGap },
}
```

Reference pair: **anime = bubbly trainer** (full fidgets incl. stretch, drift 1, baseline 0.12, cheers allowed) vs **realistic = composed senior consultant** (no stretch, fidgetRate 1.7, drift 0.55, baseline 0.05, leads answers with `offer`, cheer→clasp). Multiple realistic looks share one persona object (spread + own id) so swapping between them changes only the face.

Engine reads `getPersona()` at deliver/greet time (not construction) — mid-conversation style switches pick up the new character.

## Speech-synchronized extras

- Speech bubble fades ~1.8s after TTS ends; when muted, delay = word-count × reading-speed instead.
- Viseme layer: see speech.md — drive `aa/ih/ou/ee/oh` weights from word events; amplitude envelope optional upgrade.
- Point gesture fires when an answer carries an article/tour action.

## Debug workflow

Expose `window.__AVATAR_DEBUG__ = true` → put the rig on `window.__vrm` (or adapter). Screenshot harness rules in rendering.md §Verifying. Tune by sweep, one constant at a time; save every discovered sign/axis fact in comments — they are NOT re-derivable from theory.
