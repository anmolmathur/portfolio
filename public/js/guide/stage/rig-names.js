/* Rig vocabulary — shared by the runtime adapter and the offline gate script.
 *
 * references/rendering.md §Model acceptance gate: the gate and the browser must
 * score against the SAME vocabulary, or a model can pass the gate and still
 * fail to animate. Keeping it here, dependency-free, is what makes that
 * impossible.
 *
 * Names are matched by SUFFIX and normalised, because exports disagree: some
 * prefix `mixamorig:` (or `mixamorig1:`), Avaturn exports do not, and
 * separators/casing vary.
 */

/** VRM humanoid bone name -> Mixamo node name. */
export const BONE_MAP = (() => {
  const map = {
    hips: 'Hips',
    spine: 'Spine',
    chest: 'Spine1',
    upperChest: 'Spine2',
    neck: 'Neck',
    head: 'Head',
  };
  for (const side of ['left', 'right']) {
    const S = side === 'left' ? 'Left' : 'Right';
    map[`${side}Shoulder`] = `${S}Shoulder`;
    map[`${side}UpperArm`] = `${S}Arm`;
    map[`${side}LowerArm`] = `${S}ForeArm`;
    map[`${side}Hand`] = `${S}Hand`;
    map[`${side}UpperLeg`] = `${S}UpLeg`;
    map[`${side}LowerLeg`] = `${S}Leg`;
    map[`${side}Foot`] = `${S}Foot`;
    map[`${side}Eye`] = `${S}Eye`;

    // Fingers. VRM says "Little", Mixamo says "Pinky"; VRM joint words
    // Proximal/Intermediate/Distal are Mixamo's numeric suffixes 1/2/3.
    const digits = {
      Thumb: 'Thumb', Index: 'Index', Middle: 'Middle', Ring: 'Ring', Little: 'Pinky',
    };
    for (const [vrmDigit, mixamoDigit] of Object.entries(digits)) {
      const joints = vrmDigit === 'Thumb'
        ? [['Metacarpal', 1], ['Proximal', 2], ['Distal', 3]]
        : [['Proximal', 1], ['Intermediate', 2], ['Distal', 3]];
      for (const [word, n] of joints) {
        map[`${side}${vrmDigit}${word}`] = `${S}Hand${mixamoDigit}${n}`;
      }
    }
  }
  return map;
})();

/** Bones without which the rig cannot be driven at all. */
export const REQUIRED_BONES = [
  'hips', 'spine', 'head', 'neck',
  'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightUpperArm', 'rightLowerArm', 'rightHand',
];

/**
 * VRM expression name -> candidate morph targets, tried in order across every
 * mesh that has them.
 *
 * The casing here is NOT the skill's default table. assets/guide/models/README.md
 * records that this Avaturn export uses Oculus casing — `viseme_I/U/E/O`, where
 * the skill's table says `viseme_ih/ou/ee/oh`. Copying the table verbatim leaves
 * the mouth doing nothing but "aa", with no error anywhere. Both spellings are
 * listed so either export works.
 */
export const EXPRESSION_TARGETS = {
  aa: [['viseme_aa', 1], ['jawOpen', 0.55]],
  ih: [['viseme_I', 1], ['viseme_ih', 1]],
  ou: [['viseme_U', 1], ['viseme_ou', 1]],
  ee: [['viseme_E', 1], ['viseme_ee', 1]],
  oh: [['viseme_O', 1], ['viseme_oh', 1], ['jawOpen', 0.35]],
  // `eyesClosed` matters: it lives on Eye_Mesh, which carries NO eyeBlink*
  // targets. Without it the lids close while the eyeballs stay open.
  blink: [['eyeBlinkLeft', 1], ['eyeBlinkRight', 1], ['eyesClosed', 1]],
  happy: [['mouthSmileLeft', 0.7], ['mouthSmileRight', 0.7],
    ['cheekSquintLeft', 0.4], ['cheekSquintRight', 0.4]],
};

export const REQUIRED_EXPRESSIONS = ['aa', 'blink'];

/** Strip export-specific prefixes and punctuation so names compare equal. */
export function normaliseName(name) {
  return String(name || '')
    .replace(/^mixamorig\d*:/i, '')
    .replace(/[\s_.:-]/g, '')
    .toLowerCase();
}

/** Find a node whose normalised name matches, by exact match then suffix. */
export function findNode(root, wanted) {
  const target = normaliseName(wanted);
  let exact = null;
  let suffix = null;
  root.traverse((o) => {
    if (exact) return;
    const n = normaliseName(o.name);
    if (n === target) exact = o;
    else if (!suffix && n.endsWith(target)) suffix = o;
  });
  return exact || suffix;
}
