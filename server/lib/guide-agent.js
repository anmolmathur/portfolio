/**
 * The guide's brain.
 *
 * Layered, and every layer falls through silently to the next:
 *
 *   1. retrieval finds nothing        -> honest miss, no model call at all
 *   2. model answers from excerpts    -> grounded answer
 *   3. model errors / times out / is  -> verbatim excerpt from the site's own
 *      disabled                          copy, which is always safe to say
 *
 * The rule from the talking-avatar-guide skill is that the guide never speaks
 * ungrounded content. Retrieval runs FIRST and gates everything: if the site
 * has nothing to say about a question, no model is asked, so there is nothing
 * to hallucinate from.
 */
import { config } from './config.js';
import { site } from './content.js';
import { excerpts } from './retrieval.js';

const TIMEOUT_MS = 20_000;
const MAX_QUESTION = 500;

/**
 * The site's model (`portfolio-website-helper`) carries its own system prompt
 * tuned for Anmol's personal career planning — it answers in a "Reasoning /
 * Next actions / Pillar 3: Career" format aimed at him, not at a visitor.
 * OpenWebUI PREPENDS a model's baked-in prompt rather than replacing it, so
 * this instruction has to actively countermand that persona, not merely set a
 * different one. The format rules below exist for that reason.
 */
function systemPrompt(personName) {
  return [
    `You are the assistant on ${personName}'s personal portfolio website.`,
    `You are speaking to a VISITOR to that website — a recruiter, a client, or a peer.`,
    `You are NOT advising ${personName}, and you are NOT a career planner.`,
    '',
    'ABSOLUTE RULES:',
    `1. Answer ONLY from the numbered excerpts supplied below. They are ${personName}'s own website copy.`,
    '2. If the excerpts do not contain the answer, say you do not have that on the site. Never guess, never fill gaps from general knowledge, never infer dates, employers, figures or technologies that are not written in an excerpt.',
    `3. Speak about ${personName} in the third person ("he", "his").`,
    '4. Reply in plain prose: 1-3 short sentences. This is read aloud, so no markdown, no bullet points, no headings, no emoji.',
    '5. Never output "Reasoning:", "Next actions:", "Pillar", scores, or any planning framework. Those belong to a different task and are wrong here.',
    '6. Do not invent URLs. Do not tell the visitor to look somewhere the excerpts do not mention.',
  ].join('\n');
}

function userPrompt(question, found) {
  const blocks = found.map((e, i) => {
    const head = [`[${i + 1}] ${e.title}`, e.subtitle].filter(Boolean).join(' — ');
    return `${head}\n${e.text}`;
  }).join('\n\n');
  return `EXCERPTS FROM THE WEBSITE:\n\n${blocks}\n\nVISITOR'S QUESTION: ${question}\n\nAnswer in 1-3 plain sentences using only the excerpts above.`;
}

/**
 * A model that ignores rule 5 would otherwise read its scaffolding aloud. Strip
 * the known shapes rather than trusting the instruction to hold, and fall back
 * to the verbatim excerpt if stripping leaves nothing usable.
 */
function clean(text) {
  let out = String(text ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')                       // bold
    .replace(/^#{1,6}\s+/gm, '')                            // headings
    .replace(/^\s*[-*]\s+/gm, '')                           // bullets
    .replace(/^\s*(reasoning|next actions?|analysis|recommendation)\s*:.*$/gim, '')
    .replace(/\(?\bPillar\s*\d+[^)\n]*\)?/gi, '')
    .replace(/^\s*N\/A\s*,?\s*N\/A\s*$/gim, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Models sometimes echo the citation markers; they read badly aloud.
  out = out.replace(/\[\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();
  return out;
}

/** Always-safe answer built from the site's own words, no model involved. */
function verbatim(found) {
  const top = found[0];
  const sentence = String(top.text).split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').trim();
  return sentence || top.title;
}

export async function ask({ question, locale }) {
  const q = String(question ?? '').trim().slice(0, MAX_QUESTION);
  if (!q) return { ok: false, reason: 'empty', answer: 'Ask me something about Anmol’s work.' };

  const found = excerpts(locale, q, { limit: 4 });

  // Layer 1 — nothing on the site covers this. Do not call the model at all:
  // with no excerpts it has nothing to be grounded by, and would invent.
  if (!found.length) {
    return {
      ok: true, grounded: false, source: 'miss', sources: [],
      answer: 'I don’t have anything about that on this site. Ask me about Anmol’s roles, skills, education, projects or how to get in touch.',
    };
  }

  const sources = found.map(({ id, title, url, kind }) => ({ id, title, url, kind }));

  // Layer 3 pre-empted — no key configured, so answer from the site directly.
  if (!config.agent.enabled) {
    return { ok: true, grounded: true, source: 'verbatim', answer: verbatim(found), sources };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${config.agent.baseUrl}/api/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.agent.apiKey}`,
      },
      body: JSON.stringify({
        model: config.agent.model,
        stream: false,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt(site.person.name) },
          { role: 'user', content: userPrompt(q, found) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`agent HTTP ${res.status}`);
    const data = await res.json();
    const answer = clean(data?.choices?.[0]?.message?.content);
    // An empty answer after cleaning means the model returned nothing but
    // scaffolding. The site's own words are better than an empty bubble.
    if (!answer) throw new Error('empty after cleaning');
    return { ok: true, grounded: true, source: 'model', answer, sources };
  } catch (err) {
    return {
      ok: true, grounded: true, source: 'verbatim', sources,
      answer: verbatim(found),
      degraded: err.name === 'AbortError' ? 'timeout' : String(err.message ?? err),
    };
  } finally {
    clearTimeout(timer);
  }
}
