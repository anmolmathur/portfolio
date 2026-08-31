/**
 * Job-description fitment analysis.
 *
 * A visitor pastes a link to a role; the server fetches it, builds a profile
 * from this site's own content, and asks the model how well the two match.
 *
 * The audience is BOTH sides, which is what shapes the prompt. Anmol uses it to
 * judge whether a role is worth pursuing; a recruiter uses it to judge whether
 * he is worth calling. An analysis that only flatters is useless to either —
 * it tells Anmol nothing he can act on, and a recruiter can spot it instantly,
 * at which point the whole site looks like marketing. So gaps are required
 * output, not an optional section, and the prompt says so explicitly.
 *
 * The profile is assembled in code from structured content rather than
 * retrieved by similarity: a fitment analysis needs the WHOLE career, and
 * top-k retrieval would quietly drop the roles that happen not to match the
 * query wording — which for this question is precisely the evidence of a gap.
 */
import { config } from './config.js';
import { locales, site } from './content.js';
import { careerFacts } from './career-facts.js';
import { fetchReadable } from './fetch-url.js';

const TIMEOUT_MS = 75_000;        // a whole JD against a whole career takes time
const MAX_JD_CHARS = 9_000;

/** Everything the site says about him, flattened for the prompt. */
export function buildProfile(locale = 'en') {
  const copy = locales[locale].copy;
  const facts = careerFacts(copy);
  const out = [];

  out.push(`CANDIDATE: ${site.person.name} — ${site.person.jobTitle}, based in ${site.person.locality}.`);
  out.push(`Stated experience: 25+ years. Sector totals computed from dated roles:`);
  for (const b of facts.byIndustry) out.push(`  ${b.industry}: about ${b.years} years`);

  out.push('\nROLES:');
  for (const r of copy.workExperience.roles) {
    out.push(`- ${r.title} — ${r.company} (${r.dates}, ${r.location})`);
    if (r.summary) out.push(`  ${strip(r.summary)}`);
    for (const a of (r.achievements ?? []).slice(0, 6)) out.push(`  * ${strip(a)}`);
  }

  const skills = copy.skills;
  if (skills?.groups) {
    out.push('\nSKILLS:');
    for (const g of skills.groups) {
      out.push(`- ${g.title}: ${(g.items ?? []).map(strip).join(', ')}`);
    }
  }

  if (copy.technologyDomains?.items) {
    out.push('\nTECHNOLOGY DOMAINS:');
    for (const d of copy.technologyDomains.items) {
      out.push(`- ${d.title}: ${strip(d.body ?? (d.items ?? []).join(', '))}`);
    }
  }

  out.push('\nEDUCATION:');
  for (const e of copy.education.items) {
    out.push(`- ${e.degree ?? e.title} — ${e.institute ?? ''} ${e.date ?? ''}`.trim());
  }

  if (copy.projects?.items) {
    out.push('\nSELECTED PROJECTS:');
    for (const p of copy.projects.items) {
      out.push(`- ${p.title}${p.impact ? ` — ${strip(p.impact)}` : ''}`);
    }
  }

  return out.join('\n');
}

const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function systemPrompt(today) {
  return [
    `Today's date is ${today}. Use it for any "how long" or "is this current" reasoning.`,
    'A role dated "Present" is ongoing as of today. Never describe a start date in the past as future-dated -- your own training cutoff is not today.',
    '',
    `You assess how well ${site.person.name} fits a specific job description.`,
    'You are on his own portfolio site, and BOTH he and recruiters read your answer.',
    '',
    'RULES:',
    '1. Use ONLY the candidate profile supplied below. Never invent experience, tools, employers, certifications or figures that are not in it. If the job asks for something the profile does not mention, that is a GAP — say so.',
    '2. GAPS ARE REQUIRED. An assessment with no gaps is not credible and is worthless to both readers. Name the real ones plainly, including seniority, sector, location and visa-shaped mismatches if they are visible.',
    '3. Deriving from the profile is fine: counting years, adding sector durations, comparing a requirement against a stated role.',
    '4. Be specific. "Strong leadership experience" is filler; "led a 66-person engineering org at Hungama" is evidence. Cite the employer for each claim.',
    '5. If the supplied job text is not actually a job description — a login wall, a cookie notice, an error page, an article — say exactly that and stop. Do not analyse a page you could not read.',
    '',
    'FORMAT — plain text, no markdown, no headings, in this order:',
    'A one-line verdict naming the fit level (strong / partial / weak) and the single biggest reason.',
    'Then "Where he fits:" followed by 3-5 short lines, each pairing a requirement with evidence.',
    'Then "Gaps:" followed by 2-4 short lines, each naming a requirement and what is missing.',
    'Then one closing line on how he should position himself for this role.',
  ].join('\n');
}

export async function analyseJd({ url, text, locale = 'en' }) {
  let jdText = String(text ?? '').trim();
  let source = 'pasted text';

  if (url) {
    const page = await fetchReadable(url);        // throws with a readable message
    jdText = page.text;
    source = page.title ? `${page.title} (${page.url})` : page.url;
  }

  if (jdText.length < 200) {
    return {
      ok: false,
      reason: 'too-short',
      answer: 'I could not read enough of that page to assess it — a lot of job boards '
        + 'block automated readers or need a login. Paste the job description text '
        + 'straight into the chat instead and I will analyse it.',
    };
  }

  if (!config.agent.enabled) {
    return {
      ok: false,
      reason: 'agent-disabled',
      answer: 'The assistant that does this analysis is not configured right now.',
    };
  }

  const jd = jdText.slice(0, MAX_JD_CHARS);
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
        model: config.agent.jdModel || config.agent.model,
        stream: false,
        temperature: 0.25,
        messages: [
          { role: 'system', content: systemPrompt(new Date().toISOString().slice(0, 10)) },
          {
            role: 'user',
            content: `CANDIDATE PROFILE:\n${buildProfile(locale)}\n\n`
              + `JOB DESCRIPTION (from ${source}):\n${jd}\n\n`
              + 'Assess the fit using the format you were given.',
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`agent HTTP ${res.status}`);
    const data = await res.json();
    const answer = clean(data?.choices?.[0]?.message?.content);
    if (!answer) throw new Error('empty analysis');
    return { ok: true, answer, source, kind: 'jd-analysis' };
  } catch (err) {
    return {
      ok: false,
      reason: err.name === 'AbortError' ? 'timeout' : 'agent-error',
      answer: err.name === 'AbortError'
        ? 'That analysis took too long. Try pasting a shorter version of the job description.'
        : 'Something went wrong running the analysis. Please try again.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/* The model behind this carries a planning persona from its own system prompt
   (Reasoning / Next actions / Pillar). Same cleaner as the main agent. */
function clean(text) {
  return String(text ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(reasoning|next actions?|analysis)\s*:\s*$/gim, '')
    // It emits markdown bullets despite the format rule; in a pre-wrap bubble
    // those render as literal asterisks. Normalise rather than re-ask.
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/\(?\bPillar\s*\d+[^)\n]*\)?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
