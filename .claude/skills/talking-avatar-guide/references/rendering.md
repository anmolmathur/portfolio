# Rendering — stage, VRM path, GLB rig normalizer, style switch

## Stage: transparent cutout, not a window

The avatar is a CUTOUT floating over the page — no Paper/card/window chrome. Users consistently prefer this; it reads as a presence, not a widget.

- `WebGLRenderer({ alpha: true, antialias: true })` + `renderer.setClearColor(0x000000, 0)`.
- Canvas host: `pointerEvents: "none"` — the page stays clickable through the avatar. UI (mute/close buttons, speech bubble beside the head, input pill) are separate DOM siblings with pointer events on.
- Camera framing: waist-up. Compute frame from the loaded rig — frame bottom at `hips.y - 0.02` (hides baked-in casual shorts/legwear; reads as "trousers out of frame"). Expose `frameTopOffset` / `frameBottomOffset` props on the stage for variants (tour presenter uses different crop).
- Lights: soft key + ambient; nothing fancy needed for MToon or PBR at this size.
- Panel `createPortal` to `document.body` — never render inside header/layout stacking contexts (see pitfalls: driver.js overlay dimming).
- Dispose properly on unmount/style-switch: renderer, scene traversal (geometries/materials/textures), cancel the rAF loop.

## Adapter surface (the key design decision)

Both model formats load through an adapter exposing ONE surface; every animation layer runs unchanged on both:

```js
{
  scene,               // THREE.Object3D to add
  rigRoot,             // for framing measurements
  humanoid,            // getNormalizedBoneNode(vrmBoneName) → Object3D (VRM convention)
  expressionManager,   // setValue(vrmExpressionName, weight) e.g. "aa", "blink", "happy"
  setLookTarget(x,y,z),
  update(deltaSec),    // per-frame internals (spring bones / proxy write-back)
  dispose(),
}
```

Write ALL animation code against the three-vrm normalized convention: rest = T-pose, every bone frame world-aligned, model facing +Z. VRM gives this for free; GLB is adapted TO it (below). This is what makes gesture/rest constants portable across models.

## VRM path (do this first — easy rig)

- deps: `three` (^0.185), `@pixiv/three-vrm` (^3.5). Load via GLTFLoader + VRMLoaderPlugin; `VRMUtils.removeUnnecessaryJoints/Vertices` for perf.
- Requires expressions `aa ih ou ee oh` + `blink` (any VRoid Studio export has them). `happy/relaxed` nice for persona baseline.
- Expressions via `vrm.expressionManager.setValue(name, w)`; call `vrm.update(delta)` every frame (drives spring-bone hair/cloth too).
- Outfit restyling without a new model (optional): tint MToon materials by name pattern (`/^Tops_/`, `/^Bottoms_/`, `/^Shoes_/` on VRoid exports — unknown names left untouched), AND/OR runtime-paint details onto the Tops texture via canvas (standard VRoid flat layout is 1024x2048, front neckline center x≈505): draw collar/placket/buttons, then `texture.needsUpdate`. Keep the tint WHITE where you paint true colors — tints multiply.

## GLB path — the rig normalizer

Realistic avatars (RPM-style/Avaturn) use a Mixamo skeleton (A-pose rest, arbitrary per-bone axes) + ARKit blendshapes + Oculus visemes. The adapter normalizes the rig so all VRM-convention animation runs unchanged. This is real math — follow exactly:

**1. Bone map** — VRM humanoid name → Mixamo node name. Programmatic: `hips→Hips, spine→Spine, chest→Spine1, upperChest→Spine2, neck→Neck, head→Head, {side}Shoulder→{Side}Shoulder, {side}UpperArm→{Side}Arm, {side}LowerArm→{Side}ForeArm, {side}Hand→{Side}Hand`; fingers: VRM `Little`→Mixamo `Pinky`, joint words Proximal/Intermediate/Distal → suffixes 1/2/3, thumb Metacarpal/Proximal/Distal → Thumb1/2/3. Search nodes by name suffix — some exports prefix `mixamorig:`, some (Avaturn) don't.

**2. T-pose calibration (load time)** — measure the rest skeleton, compute world rotations that put it in VRM T-pose:
- Aim each arm chain onto ±X: for upperArm→foreArm→hand, compute the world direction to the child joint, `rotateSubtree` with the quaternion taking it to (±1,0,0). Do upper arm, then forearm, then hand.
- Roll each hand about the arm axis until the palm-dorsal normal (`cross(fingerDirection, indexToPinky)`) points +Y (palm faces down). Finger-curl axes depend on this — skip it and curls bend sideways.
- If the model is already T-pose (some Avaturn exports), calibration ≈ no-op — harmless, keep it anyway.

**3. Proxy rig + per-frame conjugation** — build one identity-rotation `Object3D` per humanoid bone at the calibrated joint positions, parented like the skeleton. Animation layers pose the PROXIES (they behave exactly like three-vrm normalized bones). Each frame, write back:

```
rawBoneLocalQuat = inverse(R'parent) · proxyQuat · R'bone
```

where R' are the calibrated rest WORLD rotations of parent and bone. (Same conjugation three-vrm uses internally for its normalized humanoid.)

**4. Expression fan-out** — table mapping VRM expression names → morph-target sets, applied across ALL meshes that have them (be mesh-name-agnostic: Wolf3D_* vs Avaturn naming both occur; iterate meshes, check `morphTargetDictionary`):
`aa → viseme_aa + jawOpen`, `ih → viseme_ih`, `ou → viseme_ou`, `ee → viseme_ee`, `oh → viseme_oh`, `blink → eyeBlinkLeft + eyeBlinkRight`, `happy → mouthSmileLeft/Right + cheekSquintLeft/Right` (weights < 1 for subtlety).

**5. Eyes** — Mixamo has eye bones, not look-at logic: clamp yaw ±0.45 rad, pitch ±0.28 rad on eye proxies. Human eyes barely travel; unclamped looks possessed.

## Model acceptance gate (before ANY new avatar ships)

A GLB works as an avatar only if it has BOTH a Mixamo-named skeleton AND named face morph targets — bones move the body, blendshapes do the talking, and **no amount of code adds either**. Enforce with a gate, not judgment:

- **AI text-to-3D output (Tripo, Meshy, etc.) is unusable.** It's a single fused sculpt: 0 bones, 0 morphs, ~2M tris, sealed mouth, eyes/teeth painted into the texture. Auto-rigging fixes only the body half — there is still no mouth to open. A stakeholder-favourite 54MB Tripo model scored 0/46 bones + 0/17 morphs and was deleted; record the verdict somewhere so nobody re-tries the route.
- **Avaturn.me exports pass** (46/46 bones, 17/17 morphs) — the working route for new realistic looks now that the Ready Player Me site is dead. VRoid Studio remains the anime route.
- **Gate script**: a node script that reads ONLY the glTF JSON chunk (instant on a 50MB file) and scores bones + morphs against the SAME rig-name vocabulary module the runtime adapter uses (case/separator-blind, strips `mixamorig\d*:`). Sharing the vocabulary file — kept dependency-free — means the gate and the browser can never drift.

## Style fallback + strike-off (self-healing styles)

Optional hardening once you have 2+ styles: each style may declare a `fallback` id; resolution always ends at a designated SAFE style whose model is committed to the repo and never struck. At load failure, strike the style off in **sessionStorage** (new tabs retry) — but only on PERMANENT failure: HTTP 4xx from the model fetch, or an `unusable-model` error thrown by the adapter when required bones/visemes/blinks are missing. Transient network failures are never struck. Struck styles drop out of the picker (re-read the list every render; hide the switch button under 2 offered). Warm the non-default style's model at idle to discover missing files early.

Race guard (this was a real HIGH): a model build finishing AFTER the user switched styles again must verify it is still the current build AND current style before attaching, else dispose itself — and a rebuild to the already-current style must early-return. Without both, switch-during-build orphans the stage for the session.

## Style switch

- Registry in config: `AVATAR_STYLES = { id: { label, modelUrl, format: "vrm"|"glb" } }`; persisted id in localStorage; `setAvatarStyle` dispatches a window event.
- Stage listens; React hosts remount canvas via `key={style}` (fresh GL context per model).
- Toggle button CYCLES `Object.keys(AVATAR_STYLES)`; tooltip "Switch avatar: <next label>"; icon by next style's format.
- Pair with PERSONAS (see animation.md) — different look must mean different character, or the swap feels pointless.

## Verifying (you cannot eyeball code into a correct pose)

Screenshot-driven tuning is mandatory for rig work:
- Serve the repo root with a scratch HTTP server + an import map page that loads YOUR modules. Import URLs must match the bundler's module identity — an extensionless mismatch silently patches a DIFFERENT module instance.
- Import maps DON'T apply inside workers — use absolute-path imports there.
- Headless browser page clocks run ~3x fast: screenshot gestures by POLLING bone state (expose `window.__AVATAR_DEBUG__` → the rig), never by timers.
- Sweep: set pose constants → screenshot → look → adjust. Elbow/shoulder fold axes are NOT intuitive from axis theory; trust the sweep.
