/**
 * BM25 retrieval over the shared site index.
 *
 * The guide answers ONLY from what this returns. That is the anti-hallucination
 * floor: an LLM handed the site's own words can quote them; an LLM handed
 * nothing invents a plausible career. See references/brain.md in the
 * talking-avatar-guide skill.
 *
 * It reads `getIndex()` — the same records the ⌘K palette searches — so the
 * palette and the guide can never disagree about what the site contains.
 */
import { getIndex } from './search-index.js';

// Common English words plus the ones this particular site is saturated with.
// "technology" in a technologist's portfolio carries almost no signal, and BM25
// already discounts it via IDF; listing it here just saves the work.
const STOP = new Set(`a an and are as at be been by for from has have he her his how i in
is it its of on or that the this to was were what when where which who will with you your
about tell me please can could would should do does did there their they them`.split(/\s+/));

const tokenize = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s+#.-]/gu, ' ')
  .split(/\s+/)
  .filter((t) => t.length > 1 && !STOP.has(t));

/**
 * Fields are weighted rather than concatenated. A query matching a role's
 * title ("CTO at TeamLease") should beat one matching the same words buried in
 * another role's prose, and keywords carry the hand-written aliases that make
 * "formula 1" find the Formula 1 work.
 */
const FIELD_WEIGHTS = { title: 3, subtitle: 2, keywords: 3, body: 1 };

const K1 = 1.4;   // term-frequency saturation
const B = 0.72;   // length normalisation

/**
 * "What does he do now?" is the single most likely visitor question, and plain
 * BM25 is blind to it: "now" is a stop word, and the current role has no more
 * lexical overlap with the question than any other role. Measured before this
 * boost, "who does he work for now" ranked an article first and the current
 * role third.
 *
 * So: when the question is explicitly about the present, ADD a bonus to records
 * that are ongoing. It has to be additive — a multiplier was tried first and
 * failed exactly where it was needed most: "what is his current role" scores
 * zero on the TeamLease record (no shared vocabulary at all), and any multiple
 * of zero is still zero, so the query returned nothing.
 *
 * The bonus clears `minScore` on its own, so an ongoing role becomes a
 * candidate on the strength of being current, which is precisely what the
 * question asked. Detection uses the same "Present" marker the timeline renders
 * from, so it cannot drift from what the page shows.
 */
const NOW_WORDS = /\b(now|current|currently|today|present|latest|nowadays|these days|at the moment|right now)\b/i;
const CURRENT_BONUS = 3.0;
const isOngoing = (r) => /present/i.test(r.subtitle ?? '');

const built = new Map();

function build(locale) {
  const records = getIndex(locale);

  const docs = records.map((r) => {
    const fields = {
      title: tokenize(r.title),
      subtitle: tokenize(r.subtitle),
      keywords: tokenize((r.keywords ?? []).join(' ')),
      body: tokenize(r.body),
    };
    // The weighted bag: a term in `title` is counted 3x, so BM25 scores it as
    // if it genuinely occurred three times. Keeps one scoring path.
    const tf = new Map();
    let length = 0;
    for (const [field, tokens] of Object.entries(fields)) {
      const w = FIELD_WEIGHTS[field] ?? 1;
      for (const t of tokens) {
        tf.set(t, (tf.get(t) ?? 0) + w);
        length += w;
      }
    }
    return { record: r, tf, length };
  });

  const avgLength = docs.reduce((a, d) => a + d.length, 0) / (docs.length || 1);

  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);

  const idf = new Map();
  for (const [t, n] of df) {
    // +1 inside the log keeps IDF positive for terms in most documents, which
    // otherwise go negative and actively push good matches down the list.
    idf.set(t, Math.log(1 + (docs.length - n + 0.5) / (n + 0.5)));
  }

  return { docs, avgLength, idf };
}

function indexFor(locale) {
  if (!built.has(locale)) built.set(locale, build(locale));
  return built.get(locale);
}

/**
 * @returns {{record: object, score: number}[]} best first, score-filtered.
 */
export function search(locale, query, { limit = 5, minScore = 0.35 } = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const { docs, avgLength, idf } = indexFor(locale);
  const asksAboutNow = NOW_WORDS.test(query);

  const scored = docs.map((d) => {
    let score = 0;
    for (const t of terms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const norm = 1 - B + B * (d.length / (avgLength || 1));
      score += (idf.get(t) ?? 0) * ((f * (K1 + 1)) / (f + K1 * norm));
    }
    // Applied only when the question is about the present, so it cannot
    // distort ordinary queries like "hsbc" or "mba".
    if (asksAboutNow && isOngoing(d.record)) score += CURRENT_BONUS;
    return { record: d.record, score };
  });

  // minScore exists so an unrelated question ("what's the weather?") returns
  // NOTHING rather than the least-bad record. The guide must be able to say it
  // does not know — a confident wrong answer is worse than a miss.
  return scored
    .filter((s) => s.score > minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Retrieved records as excerpts for the model, with the body trimmed. The
 * model sees only these; anything it says beyond them is ungrounded.
 */
export function excerpts(locale, query, opts = {}) {
  return search(locale, query, opts).map(({ record, score }) => ({
    id: record.id,
    kind: record.kind,
    title: record.title,
    subtitle: record.subtitle,
    url: record.externalUrl || record.url,
    text: String(record.body ?? '').slice(0, 900),
    score: Number(score.toFixed(3)),
  }));
}
