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

/**
 * Light suffix stripping. Per references/brain.md: "import"/"importing" must
 * meet, and ~30 lines is enough — no stemmer library.
 *
 * Measured here before adding it: "leading engineering teams" returned the
 * Formula 1 project while "led engineering team" returned Cloud Transformation.
 * The same question phrased two ways gave two different answers, which reads as
 * the guide being unreliable rather than as a retrieval subtlety.
 *
 * Deliberately conservative — over-stemming collides unrelated words, and a
 * wrong confident match is worse than a miss.
 */
function stem(t) {
  if (t.length <= 4) return t;
  for (const [suffix, min] of [['ingly', 7], ['edly', 6], ['ing', 6], ['ers', 5],
    ['ies', 5], ['ed', 5], ['es', 5], ['er', 5], ['ly', 5], ['s', 4]]) {
    if (t.length >= min && t.endsWith(suffix)) {
      let base = t.slice(0, -suffix.length);
      if (suffix === 'ies') base += 'y';                       // strategies -> strategy
      // "led"/"lead" and doubled consonants ("shipping" -> "ship") are not
      // worth chasing; they are rare in this vocabulary and the fixes misfire.
      return base;
    }
  }
  return t;
}

const tokenize = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s+#.-]/gu, ' ')
  .split(/\s+/)
  .filter((t) => t.length > 1 && !STOP.has(t))
  .map(stem);

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
    // The topic set: what this record is ABOUT, as opposed to what it happens
    // to mention. The gate below requires a query to intersect this, not just
    // the body. See `topicGate` for why.
    const topic = new Set([...fields.title, ...fields.subtitle, ...fields.keywords]);
    return { record: r, tf, length, topic };
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

  // Every term the site knows. The unknown-entity guard asks against this.
  const vocabulary = new Set(idf.keys());
  return { docs, avgLength, idf, vocabulary };
}

function indexFor(locale) {
  if (!built.has(locale)) built.set(locale, build(locale));
  return built.get(locale);
}

/**
 * Topic gate — a record may only answer when at least one query term appears in
 * its title, subtitle or keywords, not merely somewhere in its prose.
 *
 * Straight from references/brain.md, and the failures it describes reproduced
 * here exactly before this was added:
 *
 *   "tell me about the leadership team at Meta"  -> the Skills section and a
 *                                                   Michigan State leadership
 *                                                   certificate
 *   "what about quantum computing"               -> a cloud-computing publication
 *   "tell me about his time in Berlin"           -> the NEP 2020 article
 *
 * In each case a common prose word ("leadership", "computing", "time") carried
 * a record the visitor was not asking about. A score gate alone cannot catch
 * these — the junk scores were 5.9 and 6.0, well above any sane threshold,
 * because the word genuinely is frequent in that record.
 *
 * The current-role bonus is exempt: "what does he do now" is legitimately about
 * a record whose title shares no words with the question.
 */
function passesTopicGate(doc, terms) {
  /* Passages are exempt, and the exemption is principled rather than a patch.
   *
   * The gate exists because a long record can match a query on one rare prose
   * word it merely MENTIONS, while being about something else entirely -- a
   * 2000-char article winning on "leadership". A passage is a single
   * paragraph: what it mentions IS what it is about, so the dilution the gate
   * guards against cannot occur, and BM25's length normalisation already makes
   * a short record earn its score.
   *
   * Leaving them gated was actively wrong. Passages inherit their article's
   * TITLE as their topic, so a paragraph contrasting "virtual access" with
   * "real-world access" was blocked -- its own subject appeared nowhere in the
   * article's title -- and the question fell through to a much worse record. */
  if (doc.record.kind === 'passage') return true;
  return terms.some((t) => doc.topic.has(t));
}

/**
 * Unknown-entity guard, in the spirit of references/brain.md §Tier 4 rule 3.
 *
 * The topic gate alone still let two questions through, because the word they
 * shared with a record was genuinely in that record's title:
 *
 *   "tell me about the leadership team at Meta" -> a leadership certificate
 *   "how many years at Google"                  -> whatever mentions years
 *
 * The visitor is asking about Meta or Google. The site has never heard of
 * either, so the honest answer is that it does not cover them — answering about
 * a Michigan State certificate because both contain "leadership" is precisely
 * the confident-wrong-answer the skill says is worse than no guide.
 *
 * Capitalised words in the original question are treated as named entities. If
 * one is absent from the entire index vocabulary, the question is about
 * something the site does not cover, whatever else happens to match.
 *
 * Lower-cased unknown topics ("quantum computing") deliberately are NOT caught
 * here — capitalisation is the only signal available without an NER model, and
 * guessing wrong would suppress real answers. Those are caught one layer up
 * instead: the model sees the excerpt, finds no answer in it, and says so.
 */
const SENTENCE_START = /^(what|who|where|when|why|how|is|are|was|were|does|did|do|can|could|tell|give|show)$/i;

function namesUnknownEntity(rawQuery, vocabulary) {
  const words = String(rawQuery ?? '').trim().split(/\s+/);
  return words.some((w, i) => {
    const bare = w.replace(/[^\p{L}\p{N}]/gu, '');
    if (bare.length < 3) return false;
    // A capital merely because it opens the sentence carries no signal.
    if (i === 0 || SENTENCE_START.test(bare)) return false;
    if (!/^\p{Lu}/u.test(bare)) return false;
    const t = stem(bare.toLowerCase());
    return !vocabulary.has(t) && !vocabulary.has(bare.toLowerCase());
  });
}

/**
 * @returns {{record: object, score: number}[]} best first, score-filtered.
 */
export function search(locale, query, { limit = 5, minScore = 0.35 } = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const { docs, avgLength, idf, vocabulary } = indexFor(locale);
  const asksAboutNow = NOW_WORDS.test(query);

  // Asking about an entity the site has never mentioned: answer nothing,
  // regardless of what else in the question happens to match.
  if (namesUnknownEntity(query, vocabulary)) return [];

  const scored = docs.map((d) => {
    let score = 0;
    for (const t of terms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const norm = 1 - B + B * (d.length / (avgLength || 1));
      score += (idf.get(t) ?? 0) * ((f * (K1 + 1)) / (f + K1 * norm));
    }
    const onTopic = passesTopicGate(d, terms);
    // Applied only when the question is about the present, so it cannot
    // distort ordinary queries like "hsbc" or "mba". This is also the one
    // legitimate way to answer without sharing vocabulary with the question,
    // so it bypasses the topic gate.
    if (asksAboutNow && isOngoing(d.record)) return { record: d.record, score: score + CURRENT_BONUS };
    return { record: d.record, score: onTopic ? score : 0 };
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
 * Timeline neighbours for "what came before/after X".
 *
 * Retrieval carries a TOPIC forward but has no notion of temporal adjacency,
 * so "and what did he do before that?" retrieved the Hungama records again and
 * the model answered, honestly but wrongly, that the site did not say -- while
 * TimesPro sat one row further down the same timeline.
 *
 * The roles are already stored in reverse-chronological order (the order the
 * page renders them), so "before X" is simply the next role and "after X" the
 * previous one. No date parsing, and it cannot drift from what the page shows.
 */
const RELATIVE_TIME = /\b(before|prior to|preceding|after|following|next|previous|earlier|later|then)\b/i;

function withTimelineNeighbours(locale, query, hits) {
  if (!RELATIVE_TIME.test(query) || !hits.length) return hits;
  const records = getIndex(locale);
  const roles = records.filter((r) => r.kind === 'role');
  if (roles.length < 2) return hits;

  const wantsEarlier = /\b(before|prior to|preceding|previous|earlier)\b/i.test(query);
  const out = hits.slice();
  const seen = new Set(hits.map((h) => h.record.id));

  for (const hit of hits.slice(0, 2)) {
    if (hit.record.kind !== 'role') continue;
    const i = roles.findIndex((r) => r.id === hit.record.id);
    if (i === -1) continue;
    // Reverse-chronological: later index = earlier in time.
    const neighbour = wantsEarlier ? roles[i + 1] : roles[i - 1];
    if (neighbour && !seen.has(neighbour.id)) {
      seen.add(neighbour.id);
      // Just under the role it neighbours, so it is offered as context rather
      // than displacing what was actually asked about.
      out.push({ record: neighbour, score: hit.score * 0.9 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Retrieved records as excerpts for the model, with the body trimmed. The
 * model sees only these; anything it says beyond them is ungrounded.
 */
export function excerpts(locale, query, opts = {}) {
  return withTimelineNeighbours(locale, query, search(locale, query, opts)).map(({ record, score }) => ({
    id: record.id,
    kind: record.kind,
    title: record.title,
    subtitle: record.subtitle,
    url: record.externalUrl || record.url,
    text: String(record.body ?? '').slice(0, 900),
    score: Number(score.toFixed(3)),
  }));
}
