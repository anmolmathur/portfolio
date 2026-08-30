/* Animation layers — idle liveliness and the gesture player.
 *
 * references/animation.md, frame pipeline (strict order):
 *
 *   applyRestPose -> idle -> gesture -> viseme -> look-at -> adapter.update
 *
 * Rest writes, everything here ADDS. That is what keeps the rig from drifting.
 *
 * CLOCK: performance.now(), never THREE.Clock and never the rAF timestamp.
 * The reference is explicit — headless and shimmed clocks run fast, and the
 * symptom is "animations sped up / gestures snap", which is miserable to
 * diagnose from the other end.
 */

/* Deliberately NO local now() helper. Every time value in this module arrives
   as the `t` argument of update(), so there is one clock and no way to
   accidentally mix in a second one — which is exactly the bug that drove a
   forearm to -2815 radians. The frame loop owns the clock; this file only
   consumes it. */

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* Gesture curves. Each writes ADDITIVE offsets, keyed by humanoid bone name,
   as [x, y, z] radians at full strength. The player scales them by an
   ease-in/hold/ease-out envelope. Signs follow restPose.js: the model's RIGHT
   arm is the viewer's left. */
export const GESTURES = {
  wave: {
    duration: 2.2,
    // Right elbow z strongly NEGATIVE folds the forearm UP; y->0 cancels the
    // forward clasp of the rest pose. Both facts from the reference.
    bones: {
      rightUpperArm: [0, 0, -0.55],
      rightLowerArm: [0, -1.4, -2.15],
      rightHand: [0, 0, 0],
    },
    // Hand oscillation during the hold, in radians about z.
    wobble: { bone: 'rightHand', axis: 2, amplitude: 0.45, rate: 6.5 },
  },
  explain: {
    duration: 2.6,
    bones: {
      leftUpperArm: [0, 0, 0.28], rightUpperArm: [0, 0, -0.28],
      leftLowerArm: [0, 0.25, 0.3], rightLowerArm: [0, -0.25, -0.3],
      leftHand: [-0.2, 0, 0], rightHand: [-0.2, 0, 0],
    },
    wobble: { bone: 'chest', axis: 1, amplitude: 0.05, rate: 2.2 },
  },
  offer: {
    duration: 2.2,
    bones: {
      rightUpperArm: [0, 0, -0.32],
      rightLowerArm: [0, -0.35, -0.45],
      rightHand: [-0.35, 0, 0],
    },
  },
  nod: {
    duration: 1.1,
    bones: {},
    wobble: { bone: 'head', axis: 0, amplitude: 0.16, rate: 3.4 },
  },
  think: {
    duration: 2.4,
    bones: {
      rightUpperArm: [0, 0, -0.5],
      rightLowerArm: [0, -0.9, -1.5],
      head: [0.06, 0.12, 0.05],
    },
  },
  clasp: {
    duration: 2.0,
    bones: {
      leftLowerArm: [0, 0.15, 0.18], rightLowerArm: [0, -0.15, -0.18],
    },
  },
  weightShift: {
    duration: 3.2,
    bones: { hips: [0, 0.04, 0.03], spine: [0, -0.03, -0.02] },
  },
};

export function createAnimator(avatar, opts = {}) {
  const proxies = avatar.proxies;
  const persona = Object.assign({
    driftScale: 0.55,        // composed senior consultant, per the reference
    breathRate: 1,
    relaxedBaseline: 0.05,   // faint professional smile
    blinkMinGap: 3.2,
    fidgetRate: 1.7,         // rarer than the bubbly persona
    fidgets: ['weightShift', 'clasp'],
    answerPool: ['offer', 'explain', 'emphasisFallback'],
  }, opts.persona || {});

  // Seeded on the first frame for the same reason play() defers its stamp:
  // these must live in the frame loop's clock, whatever that is.
  let blinkAt = null;
  let blinkPhase = 0;          // 0 = idle, >0 = closing/opening
  let fidgetAt = null;
  let active = null;           // { name, start, spec }
  let poolIndex = 0;

  function play(name) {
    const spec = GESTURES[name];
    if (!spec) return false;
    /* start is stamped by the FIRST FRAME that sees this gesture, not by
       calling now() here.
       Stamping here mixes clocks: the caller may drive update(t) from a
       different time base than performance.now(), and then
       `elapsed = t - start` is nonsense. Measured with a synthetic clock, a
       wave produced elapsed = -2815s and drove the forearm to -2815 rad --
       the rig folded through itself. Deferring the stamp makes the player
       agnostic to whatever clock the frame loop uses. */
    active = { name, start: null, spec };
    return true;
  }

  /** Deterministic rotation through the pool — variety without randomness. */
  function playFromPool() {
    const pool = persona.answerPool.filter((n) => GESTURES[n]);
    if (!pool.length) return false;
    const name = pool[poolIndex % pool.length];
    poolIndex += 1;
    return play(name);
  }

  const add = (boneName, x, y, z) => {
    const p = proxies[boneName];
    if (!p) return;
    p.rotation.x += x; p.rotation.y += y; p.rotation.z += z;
  };

  function idleLayer(t) {
    // Breath — chest and shoulders on a slow sine.
    const breath = Math.sin(t * 1.1 * persona.breathRate) * 0.018;
    add('chest', breath, 0, 0);
    add('leftShoulder', 0, 0, -breath * 0.6);
    add('rightShoulder', 0, 0, breath * 0.6);

    // Head drift — two incommensurate sines read as noise without a PRNG.
    const d = persona.driftScale;
    add('head', Math.sin(t * 0.37) * 0.035 * d, Math.sin(t * 0.23) * 0.06 * d, 0);
    add('neck', Math.sin(t * 0.31) * 0.02 * d, Math.sin(t * 0.19) * 0.03 * d, 0);

    // Blink — a scheduled short close, occasionally doubled.
    if (blinkPhase > 0) {
      blinkPhase -= 1 / 12;                       // ~200ms at 60fps
      const w = Math.sin(clamp01(blinkPhase) * Math.PI);
      avatar.expressionManager.setValue('blink', clamp01(w));
      if (blinkPhase <= 0) {
        avatar.expressionManager.setValue('blink', 0);
        blinkAt = t + persona.blinkMinGap + Math.random() * 3.5;
      }
    } else if (t >= blinkAt) {
      blinkPhase = 1;
    }
  }

  function gestureLayer(t) {
    if (!active) return;
    if (active.start === null) active.start = t;   // first frame defines t0
    const elapsed = t - active.start;
    // A clock that jumped backwards (a re-driven synthetic clock, or a step
    // into the past) must not resurrect a finished gesture.
    if (elapsed < 0) { active = null; return; }
    const { duration } = active.spec;
    if (elapsed >= duration) { active = null; return; }

    // Envelope: ease in over the first 25%, hold, ease out over the last 30%.
    const p = elapsed / duration;
    let strength;
    if (p < 0.25) strength = easeInOut(p / 0.25);
    else if (p > 0.7) strength = easeInOut(1 - (p - 0.7) / 0.3);
    else strength = 1;

    for (const [bone, [x, y, z]] of Object.entries(active.spec.bones)) {
      add(bone, x * strength, y * strength, z * strength);
    }
    const w = active.spec.wobble;
    if (w) {
      const v = Math.sin(elapsed * w.rate) * w.amplitude * strength;
      add(w.bone, w.axis === 0 ? v : 0, w.axis === 1 ? v : 0, w.axis === 2 ? v : 0);
    }
  }

  function fidgetLayer(t) {
    if (active || t < fidgetAt) return;
    const list = persona.fidgets.filter((n) => GESTURES[n]);
    if (list.length) play(list[Math.floor(Math.random() * list.length)]);
    // Base 12-26s, stretched by the persona's rate.
    fidgetAt = t + (12 + Math.random() * 14) * persona.fidgetRate;
  }

  /** Called once per frame, AFTER applyRestPose and BEFORE adapter.update. */
  function update(t) {
    if (blinkAt === null) blinkAt = t + 2 + Math.random() * 2;
    if (fidgetAt === null) fidgetAt = t + 14;
    idleLayer(t);
    fidgetLayer(t);
    gestureLayer(t);
  }

  // The resting expression is a persona knob, not a constant: a face at 0 is
  // a face that looks unhappy the moment it stops talking.
  avatar.expressionManager.setValue('happy', persona.relaxedBaseline);

  return {
    update,
    play,
    playFromPool,
    persona,
    isPlaying: () => !!active,
    activeGesture: () => (active ? active.name : null),
  };
}
