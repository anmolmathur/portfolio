/**
 * Derived career facts — durations and per-industry totals.
 *
 * The guide could not answer "how many years of EdTech experience does he
 * have?". It said the site states 25 years overall but does not break that
 * down, which was true of the PROSE and false of the data: every role carries
 * `dates` and `industries`, and TeamLease EdTech plus TimesPro are both tagged
 * edtech. The answer was sitting in the index, one subtraction away.
 *
 * The distinction that matters for an anti-hallucination design: DERIVING from
 * stated data is not inventing. "He has 25 years of experience" is a fact on
 * the page; "two of his roles are EdTech and they span N years" is arithmetic
 * over facts on the page. Refusing the second is not caution, it is a guide
 * that cannot count.
 *
 * The arithmetic happens HERE, in code, rather than in the prompt. Models are
 * unreliable at date maths and there is no reason to make them do it when the
 * dates are structured — the model receives finished numbers and only has to
 * phrase them.
 */

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "Sep 2025", "Sep 2025 " -> Date, or null. */
function parseMonth(text) {
  const m = String(text || '').trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;
  return new Date(Date.UTC(Number(m[2]), month, 1));
}

/**
 * Splits "Sep 2021 - Mar 2023" / "Sep 2025 – Present" into a range.
 * Both dash characters occur in the content; so does "Present".
 */
export function parseRange(dates, now = new Date()) {
  const parts = String(dates || '').split(/\s*[–—-]\s*/);
  if (parts.length < 2) return null;
  const start = parseMonth(parts[0]);
  if (!start) return null;
  const endRaw = parts[1].trim();
  const ongoing = /^present$/i.test(endRaw);
  const end = ongoing ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) : parseMonth(endRaw);
  if (!end) return null;
  return { start, end, ongoing };
}

const months = (a, b) =>
  (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());

/**
 * Merge overlapping intervals before summing.
 *
 * Two roles in the same industry that overlap would otherwise be counted
 * twice. These happen to be sequential today, but a future overlapping entry
 * would silently inflate the total, and an inflated claim on a CV is exactly
 * the kind of error this site cannot afford.
 */
function mergedMonths(ranges) {
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  let total = 0;
  let cur = null;
  for (const r of sorted) {
    if (!cur) { cur = { start: r.start, end: r.end }; continue; }
    if (r.start <= cur.end) { if (r.end > cur.end) cur.end = r.end; }
    else { total += months(cur.start, cur.end); cur = { start: r.start, end: r.end }; }
  }
  if (cur) total += months(cur.start, cur.end);
  return total;
}

const humanYears = (m) => {
  const y = m / 12;
  // One decimal below ten years, whole numbers above — "2.5 years" is useful,
  // "23.4 years" is false precision on month-granularity data.
  return y < 10 ? Math.round(y * 10) / 10 : Math.round(y);
};

/**
 * @returns {{roles: object[], byIndustry: object[], totalYears: number}}
 */
export function careerFacts(copy, now = new Date()) {
  const roles = [];
  for (const role of copy.workExperience.roles ?? []) {
    const range = parseRange(role.dates, now);
    if (!range) continue;
    roles.push({
      company: role.company,
      title: role.title,
      dates: role.dates,
      ongoing: range.ongoing,
      industries: role.industries ?? [],
      years: humanYears(months(range.start, range.end)),
      range,
    });
  }

  const industries = new Map();
  for (const r of roles) {
    for (const ind of r.industries) {
      if (!industries.has(ind)) industries.set(ind, []);
      industries.get(ind).push(r.range);
    }
  }

  const byIndustry = [...industries.entries()]
    .map(([industry, ranges]) => ({
      industry,
      years: humanYears(mergedMonths(ranges)),
      companies: roles.filter((r) => r.industries.includes(industry)).map((r) => r.company),
    }))
    .sort((a, b) => b.years - a.years);

  return {
    roles,
    byIndustry,
    totalYears: humanYears(mergedMonths(roles.map((r) => r.range))),
  };
}

/** A compact block for the prompt. Numbers finished; the model only phrases. */
export function factsBlock(copy, now = new Date()) {
  const f = careerFacts(copy, now);
  const lines = [];
  lines.push('CAREER FACTS (computed from the dated roles on this site):');
  lines.push(`- The dated roles below span about ${f.totalYears} years. The site's own`);
  lines.push('  headline figure is "25+ years", counted from the start of his career;');
  lines.push('  prefer the headline when asked about total experience, and do not present');
  lines.push('  these two as a contradiction.');
  lines.push('- By sector, counting only roles tagged with that sector and merging any overlap:');
  for (const b of f.byIndustry) {
    lines.push(`    ${b.industry}: about ${b.years} years (${b.companies.join('; ')})`);
  }
  lines.push('- Individual roles:');
  for (const r of f.roles) {
    lines.push(`    ${r.company} — ${r.title} — ${r.dates} — about ${r.years} years${r.industries.length ? ` — sector: ${r.industries.join(', ')}` : ''}`);
  }
  return lines.join('\n');
}
