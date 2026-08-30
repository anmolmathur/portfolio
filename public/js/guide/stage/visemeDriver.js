/* Viseme driver — turns word events into a mouth that moves.
 *
 * references/speech.md §Lipsync: per word pick a mouth shape and a weight
 * envelope; the viseme layer eases the weights each frame. Precision does not
 * matter — a mouth that opens on the right RHYTHM reads as speech, a mouth
 * that holds one shape reads as broken.
 *
 * Sits between the gesture layer and adapter.update in the frame pipeline, and
 * writes expression weights rather than bone rotations, so it composes with
 * blink (a different set of morphs) without either fighting the other.
 */

/* Vowel -> viseme. English mouth shapes are carried almost entirely by
   vowels; consonants mostly modulate an existing shape, so mapping the
   dominant vowel of each word is enough at this fidelity. */
const VOWEL_SHAPE = {
  a: 'aa', e: 'ee', i: 'ih', o: 'oh', u: 'ou', y: 'ih',
};
const SHAPES = ['aa', 'ih', 'ou', 'ee', 'oh'];

/** Pick a shape and a strength for one spoken word. */
export function planWord(word) {
  const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return null;

  // Dominant vowel: the last one usually carries the held shape of the word.
  let shape = 'aa';
  for (let i = w.length - 1; i >= 0; i--) {
    if (VOWEL_SHAPE[w[i]]) { shape = VOWEL_SHAPE[w[i]]; break; }
  }
  // Longer words open the mouth a little wider, within a natural range.
  const strength = Math.max(0.45, Math.min(0.95, 0.4 + w.length * 0.07));
  return { shape, strength };
}

export function createVisemeDriver(avatar, opts = {}) {
  const attack = opts.attack ?? 0.055;    // seconds to open
  const release = opts.release ?? 0.13;   // seconds to close

  let target = null;      // { shape, strength, until }
  const weights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

  /** Called from the speech facade's onWord. */
  function say(word, durationMs) {
    const plan = planWord(word);
    if (!plan) return;
    // Hold slightly shorter than the word so the mouth closes between words
    // instead of smearing one shape into the next.
    const hold = Math.max(0.06, (durationMs || 200) / 1000 * 0.8);
    target = { shape: plan.shape, strength: plan.strength, until: hold };
  }

  function silence() { target = null; }

  /** Frame step. `dt` in seconds. */
  function update(dt) {
    if (target) {
      target.until -= dt;
      if (target.until <= 0) target = null;
    }
    let changed = false;
    for (const s of SHAPES) {
      const want = (target && target.shape === s) ? target.strength : 0;
      const rate = want > weights[s] ? dt / attack : dt / release;
      const next = weights[s] + Math.max(-1, Math.min(1, want - weights[s])) * Math.min(1, rate);
      if (Math.abs(next - weights[s]) > 1e-4 || (next === 0 && weights[s] !== 0)) changed = true;
      weights[s] = Math.abs(next) < 1e-3 ? 0 : next;
    }
    if (changed) {
      for (const s of SHAPES) avatar.expressionManager.setValue(s, weights[s]);
    }
  }

  return { say, silence, update, weights, isSpeaking: () => !!target };
}
