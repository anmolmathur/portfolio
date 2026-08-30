import { site, locales, articleUrl, localeUrl } from './content.js';

const text = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const join = (...parts) => parts.flat().filter(Boolean).map(text).join(' ').trim();

/**
 * One record per addressable thing on the site.
 *
 * This index is deliberately shared by the ⌘K palette and the avatar's BM25
 * retrieval. They are the same question — "what does this site say about X?" —
 * and a single index means the two can never disagree about what exists.
 */
export function buildIndex(locale) {
  const entry = locales[locale];
  if (!entry) return [];
  const { copy, articles } = entry;
  const home = localeUrl(locale, '/');
  const at = (anchor) => `${home === '/' ? '' : home}/#${anchor}`.replace('//#', '/#');

  const records = [];
  const push = (r) => records.push({ locale, ...r });

  push({
    id: 'about', kind: 'section', anchor: 'about-me', url: at('about-me'),
    title: copy.about.heading,
    body: join(copy.about.paragraphs),
    keywords: ['about', 'bio', 'background', 'experience', 'summary'],
  });

  for (const role of copy.workExperience.roles) {
    push({
      id: `role:${role.id}`, kind: 'role', anchor: 'work-experience', url: at('work-experience'),
      title: `${role.title} — ${role.company}`,
      subtitle: `${role.dates} · ${role.location}`,
      body: join(role.summary, role.achievements),
      keywords: [role.company, role.title, role.location, ...(role.industries ?? []), ...(role.aliases ?? [])],
    });
  }

  push({
    id: 'skills', kind: 'section', anchor: 'skills', url: at('skills'),
    title: copy.skills.heading,
    body: join(copy.skills.items),
    keywords: copy.skills.items,
  });

  for (const d of copy.technologyDomains.items) {
    push({
      id: `domain:${d.title.toLowerCase().replace(/\W+/g, '-')}`, kind: 'domain',
      anchor: 'technology-domains', url: at('technology-domains'),
      title: d.title, body: text(d.body),
      keywords: d.body.split(',').map((s) => s.trim()).filter(Boolean),
    });
  }

  push({
    id: 'industries', kind: 'section', anchor: 'industries', url: at('industries'),
    title: copy.industries.heading,
    body: join(copy.industries.items.map((i) => `${i.title} ${i.body}`)),
    keywords: copy.industries.items.map((i) => i.title),
  });

  for (const p of copy.publications.items) {
    push({
      id: `publication:${p.title.toLowerCase().replace(/\W+/g, '-').slice(0, 40)}`, kind: 'publication',
      anchor: 'publications', url: at('publications'), externalUrl: p.url,
      title: p.title, subtitle: p.journal, body: join(p.title, p.journal),
      keywords: ['publication', 'article', 'writing', p.journal],
    });
  }

  for (const e of copy.education.items) {
    push({
      id: `education:${e.title.toLowerCase().replace(/\W+/g, '-').slice(0, 40)}`, kind: 'education',
      anchor: 'education', url: at('education'),
      title: e.title, subtitle: `${e.institute} · ${e.date}`,
      body: join(e.title, e.institute, e.university, e.specialization),
      keywords: ['education', 'degree', 'qualification', e.institute, e.university, ...(e.aliases ?? [])],
    });
  }

  for (const p of copy.projects.items) {
    push({
      id: `project:${p.id}`, kind: 'project', anchor: 'projects', url: at('projects'),
      title: p.title, subtitle: `${p.org} · ${p.period}`,
      body: join(p.impact, p.body),
      keywords: ['project', p.org, p.title],
    });
  }

  for (const a of copy.articles.items) {
    const full = articles[a.slug];
    push({
      id: `article:${a.slug}`, kind: 'article', anchor: 'articles',
      url: articleUrl(locale, a.slug),
      title: a.title, body: join(a.excerpt, full?.body),
      keywords: (full?.keywords ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    });
  }

  /* The actual channels are part of the record, not just the invitation to get
     in touch. "How do I contact him?" is the conversion question on a
     portfolio, and with only the subheading indexed the guide had to answer
     that it did not have his email -- while the page displayed it directly
     above. These values are already public on the rendered page; putting them
     in the index changes nothing about who can see them. */
  push({
    id: 'contact', kind: 'section', anchor: 'contact', url: at('contact'),
    title: copy.contact.heading,
    body: join(
      text(copy.contact.subheading),
      `Email: ${site.person.email}.`,
      `Phone: ${site.person.phone}.`,
      `WhatsApp is available on the same number.`,
      `Website: ${site.canonicalOrigin}.`,
    ),
    keywords: ['contact', 'email', 'phone', 'whatsapp', 'reach', 'hire', 'connect',
      'get in touch', 'talk', 'call', 'message', site.person.email],
  });

  return records;
}

const cache = new Map();
export function getIndex(locale) {
  if (!cache.has(locale)) cache.set(locale, buildIndex(locale));
  return cache.get(locale);
}

/** Compact payload for the browser — full bodies stay server-side. */
export function clientIndex(locale) {
  return getIndex(locale).map(({ id, kind, title, subtitle, url, externalUrl, body, keywords }) => ({
    id, kind, title, subtitle, url, externalUrl,
    snippet: body.slice(0, 180),
    terms: [title, subtitle, ...(keywords ?? [])].filter(Boolean).join(' ').toLowerCase(),
  }));
}
