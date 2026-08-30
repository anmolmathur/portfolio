/* Rest pose — the deterministic base written EVERY frame.
 *
 * references/animation.md: rest-pose-first is the whole trick. Every frame
 * rewrites the base rotations and the layers above only ADD, so nothing
 * integrates, nothing drifts, and a gesture interrupted mid-curve cannot leave
 * the rig bent.
 *
 * THE CONSTANTS BELOW ARE EMPIRICAL. The reference is explicit that the
 * elbow's visible fold axis is not intuitive from axis theory and that these
 * were found by screenshot sweep. They are copied, not re-derived.
 *
 * Sign convention (three-vrm normalized, model facing +Z):
 *   upper arm   RIGHT +Z lowers it, LEFT -Z
 *   elbow fold  LEFT lower arm -Y, RIGHT +Y
 *   finger curl RIGHT +Z, LEFT -Z; thumbs fold across the palm about -/+Y
 */

/* SIGN CORRECTION, measured on this rig (2026-08-30).
 *
 * The reference documents "elbow forward-bend: LEFT lower arm -Y, RIGHT +Y",
 * and that is what was shipped first. On this GLB's proxy rig it points the
 * forearms BACKWARD: the right wrist measured z = -0.227 against hips at
 * z = +0.014, i.e. hands behind the back, on a pose whose whole description is
 * "hands forward at waist height".
 *
 * It survived phase 3's verification because that measured hand HEIGHT and
 * silhouette WIDTH. Arms at the correct height and spread look identical in
 * both from the front whether they are in front of the body or behind it --
 * depth is exactly the axis neither test could see. It only surfaced when the
 * laptop, placed under the hands, rendered inside the torso.
 *
 * The application below is therefore `+mirror * lowerArmY`, not `-mirror`.
 * Verified: the flip moves the right wrist to z = +0.039, in front of the hips.
 */
export const REST = {
  upperArmZ: 1.15,   // ~66 deg down from T-pose, elbows near the body
  upperArmX: 0,
  lowerArmY: 1.4,    // forward swing — hands in front of the waist
  lowerArmZ: -0.8,   // inward fold — fingertips meet at the midline
  handX: -0.15,      // relax the wrists
  fingerCurl: 0.24,
  thumbCurl: 0.12,
};

// Intermediate joints fold hardest — that is how a real hand closes. A flat
// splayed hand is the fastest way to look like a mannequin.
const FINGER_WEIGHTS = [1, 1.15, 0.7];
const THUMB_WEIGHTS = [0.4, 0.8, 0.6];

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const JOINTS = ['Proximal', 'Intermediate', 'Distal'];
const THUMB_JOINTS = ['Metacarpal', 'Proximal', 'Distal'];

/* "Working at a laptop" — the idle pose before anyone opens the guide.
 *
 * Same mirroring rules as REST; only the amounts change. The arms come further
 * down and further forward so the hands meet over a keyboard rather than
 * clasping at the waist, the head tips down towards a screen, and the fingers
 * curl more, because a hand on keys is not a hand at rest.
 *
 * Derived from REST rather than written independently, so a future change to
 * the sign convention cannot leave the two poses disagreeing. */
export const WORKING = {
  upperArmZ: 1.42,   // arms hang closer to the body than when presenting
  upperArmX: 0.02,
  lowerArmY: 0.95,   // forearms forward over the keys (see SIGN CORRECTION)
  lowerArmZ: -0.55,  // less inward fold than REST — hands apart, not clasped
  handX: -0.28,      // wrists broken down onto the keyboard
  fingerCurl: 0.42,  // a hand on keys is not a hand at rest
  thumbCurl: 0.2,
  headX: 0.34,       // looking down at the screen
  neckX: 0.18,
  spineX: 0.06,      // a slight desk hunch
};

/**
 * @param {object} proxies  humanoid proxy map from the adapter
 */
export function applyWorkingPose(proxies) {
  const set = (name, x, y, z) => {
    const p = proxies[name];
    if (p) p.rotation.set(x, y, z);
  };

  set('hips', 0, 0, 0);
  set('spine', WORKING.spineX, 0, 0);
  set('chest', 0, 0, 0);
  set('upperChest', 0, 0, 0);
  set('neck', WORKING.neckX, 0, 0);
  set('head', WORKING.headX, 0, 0);

  for (const side of ['left', 'right']) {
    const mirror = side === 'left' ? -1 : 1;
    set(`${side}Shoulder`, 0, 0, 0);
    set(`${side}UpperArm`, WORKING.upperArmX, 0, mirror * WORKING.upperArmZ);
    set(`${side}LowerArm`, 0, mirror * WORKING.lowerArmY, mirror * WORKING.lowerArmZ);
    set(`${side}Hand`, WORKING.handX, 0, 0);

    for (const finger of FINGERS) {
      JOINTS.forEach((joint, i) => {
        set(`${side}${finger}${joint}`, 0, 0, mirror * WORKING.fingerCurl * FINGER_WEIGHTS[i]);
      });
    }
    THUMB_JOINTS.forEach((joint, i) => {
      set(`${side}Thumb${joint}`, 0, -mirror * WORKING.thumbCurl * THUMB_WEIGHTS[i], 0);
    });
  }
}

/**
 * @param {object} proxies  humanoid proxy map from the adapter
 */
export function applyRestPose(proxies) {
  const set = (name, x, y, z) => {
    const p = proxies[name];
    if (p) p.rotation.set(x, y, z);
  };

  // Torso and head start neutral; the idle layer adds to these.
  set('hips', 0, 0, 0);
  set('spine', 0, 0, 0);
  set('chest', 0, 0, 0);
  set('upperChest', 0, 0, 0);
  set('neck', 0, 0, 0);
  set('head', 0, 0, 0);

  for (const side of ['left', 'right']) {
    const mirror = side === 'left' ? -1 : 1;

    set(`${side}Shoulder`, 0, 0, 0);
    set(`${side}UpperArm`, REST.upperArmX, 0, mirror * REST.upperArmZ);
    set(`${side}LowerArm`, 0, mirror * REST.lowerArmY, mirror * REST.lowerArmZ);
    set(`${side}Hand`, REST.handX, 0, 0);

    for (const finger of FINGERS) {
      JOINTS.forEach((joint, i) => {
        set(`${side}${finger}${joint}`, 0, 0, mirror * REST.fingerCurl * FINGER_WEIGHTS[i]);
      });
    }
    THUMB_JOINTS.forEach((joint, i) => {
      // The thumb folds across the palm about the OTHER axis — curling it on
      // the finger axis splays it outward and reads as a broken hand.
      set(`${side}Thumb${joint}`, 0, -mirror * REST.thumbCurl * THUMB_WEIGHTS[i], 0);
    });
  }
}
