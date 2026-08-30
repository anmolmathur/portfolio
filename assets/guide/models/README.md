# Avatar model — acceptance gate record

`anmol.glb` — Avaturn.me export (via Blender), glTF 2.0, 13.3 MB, 29,004 triangles,
13 meshes, 54 skin joints, 29 embedded textures.
sha1 `b651789f64b7f0b7840c15efc255ec883944eb3a`

## Verdict: PASS — gated 2026-08-26

Per `.claude/skills/talking-avatar-guide/references/rendering.md` §Model acceptance gate,
a GLB is usable as a talking avatar only if it has BOTH a Mixamo-named skeleton AND named
face morph targets. No amount of code adds either.

| Gate | Found | Result |
|---|---|---|
| Skeleton | 54 Mixamo-named joints, **unprefixed** (no `mixamorig:`) | PASS |
| Humanoid bones | hips→head, both arm chains, 5 fingers x 3 joints x 2 hands | PASS |
| Eye bones | `LeftEye`, `RightEye` | PASS |
| Visemes | full 15-shape Oculus set on Head_Mesh + Teeth_Mesh + Tongue_Mesh | PASS |
| Blink | `eyeBlinkLeft/Right` on Head, EyeAO, Eyelash (+ `eyesClosed` on Eye_Mesh) | PASS |
| ARKit set | 72 targets on Head_Mesh incl. `jawOpen`, `mouthSmileL/R`, `cheekSquintL/R`, brows | PASS |

This is the expected good outcome for an Avaturn export, and the opposite of the
text-to-3D failure mode (pitfall 51: Tripo/Meshy output has 0 bones, 0 morphs, a sealed
mouth, and cannot be rescued by auto-rigging). Avaturn and VRoid remain the working routes.

## Two findings that MUST be reflected in the adapter

Both fail silently — no error is thrown, the avatar simply doesn't work right.

### 1. Viseme names differ from the skill's table

`rendering.md` §4 maps `ih→viseme_ih, ou→viseme_ou, ee→viseme_ee, oh→viseme_oh`.
This model uses Oculus casing. Only `viseme_aa` matches as written — copying the skill's
table verbatim leaves the mouth doing nothing but "aa" (dead lipsync, no error anywhere).

Correct fan-out for this model:

    aa → viseme_aa + jawOpen
    ih → viseme_I
    ou → viseme_U
    ee → viseme_E
    oh → viseme_O

### 2. Morph targets are split across six meshes

| Mesh | Morphs | Carries |
|---|---|---|
| Head_Mesh | 72 | visemes + full ARKit set |
| Teeth_Mesh | 20 | visemes + jaw |
| Tongue_Mesh | 21 | visemes + jaw + tongueOut |
| EyeAO_Mesh | 32 | brows, blinks, cheeks |
| Eyelash_Mesh | 31 | brows, blinks, cheeks |
| Eye_Mesh | 11 | eye look directions + `eyesClosed` (NO `eyeBlink*`) |
| Body_Mesh | 0 | — |

Confirms the skill's mesh-name-agnostic rule: iterate every mesh, check
`morphTargetDictionary`, apply wherever found. **Blink fan-out must include `eyesClosed`**
or the eyeballs stay open while the lids close.

## Notes

- Legs, feet and shoes are modelled but cropped out by waist-up framing (`hips.y - 0.02`).
  Expected; no action needed.
- Mesh list includes `avaturn_glasses_0/1`, `avaturn_hair_0/1`, `avaturn_shoes_0`,
  `avaturn_look_0` (outfit).

## Texture inspection — DONE 2026-08-30

Pitfall 8 says filenames lie, so the embedded images were extracted from the GLB binary
chunk and looked at directly, not trusted by name.

| Material | Image | What it actually shows |
|---|---|---|
| `avaturn_look_0_material` (outfit) | 26 | Charcoal/black panels with white collar and cuff pieces — reads as a dark suit over a white shirt. Business attire, appropriate for the site's hero. |
| `Head` | 11 | UV-unwrapped head: middle-aged South Asian man, short dark hair, trimmed beard. Plausible likeness basis. |

Not the gym-clothes failure mode the skill warns about. **The model gate is now fully
closed** — skeleton, visemes, morphs and appearance all verified.
