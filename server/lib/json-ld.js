import { site, locales } from './content.js';

/**
 * Person schema. Kept in code rather than the content files because it must
 * stay factually identical across locales — only `description` is translated.
 */
export function personJsonLd(locale) {
  const copy = locales[locale].copy;
  const p = site.person;

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.name,
    alternateName: p.alternateName,
    jobTitle: p.jobTitle,
    image: `${site.canonicalOrigin}/images/${site.images.og}`,
    url: site.canonicalOrigin,
    email: `mailto:${p.email}`,
    telephone: p.phone,
    nationality: p.nationality,
    address: { '@type': 'PostalAddress', addressLocality: p.locality, addressCountry: 'IN' },
    sameAs: p.sameAs,
    knowsLanguage: ['en', 'es'],
    knowsAbout: copy.skills.items,
    alumniOf: copy.education.items.map((e) => ({
      '@type': 'EducationalOrganization',
      name: e.institute,
    })),
    worksFor: { '@type': 'Organization', name: copy.workExperience.roles[0].company },
    hasOccupation: {
      '@type': 'Occupation',
      name: p.jobTitle,
      description: copy.meta.description,
    },
    description: copy.meta.description,
    inLanguage: locale,
  });
}

export function articleJsonLd(locale, article) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.description,
    image: `${site.canonicalOrigin}/images/${article.image}`,
    author: { '@type': 'Person', name: site.person.name, url: site.canonicalOrigin },
    publisher: { '@type': 'Person', name: site.person.name },
    inLanguage: locale,
  });
}
