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
    set(`${side}LowerArm`, 0, -mirror * REST.lowerArmY, mirror * REST.lowerArmZ);
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
