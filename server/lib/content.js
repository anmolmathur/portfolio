import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT = path.join(ROOT, 'content');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export const site = readJson(path.join(CONTENT, 'site.json'));
export const metrics = readJson(path.join(CONTENT, 'metrics.json'));

/**
 * Locales are loaded eagerly at boot. A missing locale file is fatal rather than
 * silently falling back — a half-translated site is worse than a failed deploy,
 * and this is the cheapest place to catch it.
 */
function loadLocale(locale) {
  const file = path.join(CONTENT, `${locale}.json`);
  if (!fs.existsSync(file)) return null;
  const copy = readJson(file);

  const indexFile = path.join(CONTENT, 'articles', `index.${locale}.json`);
  const articleMeta = fs.existsSync(indexFile) ? readJson(indexFile) : {};

  const articles = {};
  for (const [slug, meta] of Object.entries(articleMeta)) {
    const bodyFile = path.join(CONTENT, 'articles', `${slug}.${locale}.html`);
    articles[slug] = {
      ...meta,
      body: fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, 'utf8') : '',
    };
  }

  return { copy, articles };
}

export const locales = {};
for (const locale of site.locales) {
  const loaded = loadLocale(locale);
  if (loaded) locales[locale] = loaded;
}

if (!locales[site.defaultLocale]) {
  throw new Error(`Default locale "${site.defaultLocale}" has no content file.`);
}

export const availableLocales = Object.keys(locales);

/** Locale prefix for URLs: the default locale lives at the root, others under /<locale>. */
export const localePrefix = (locale) => (locale === site.defaultLocale ? '' : `/${locale}`);

export function localeUrl(locale, pathname = '/') {
  const prefix = localePrefix(locale);
  if (pathname === '/') return prefix || '/';
  return `${prefix}${pathname}`;
}

/** Article URL segment differs per locale so Spanish gets real Spanish URLs. */
export const ARTICLE_SEGMENT = { en: 'articles', es: 'articulos' };

export function articleUrl(locale, slug) {
  return `${localePrefix(locale)}/${ARTICLE_SEGMENT[locale] ?? 'articles'}/${slug}`;
}
