import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import nunjucks from 'nunjucks';

import { site, metrics, locales, availableLocales, localeUrl, articleUrl, ARTICLE_SEGMENT } from './lib/content.js';
import { clientIndex } from './lib/search-index.js';
import { personJsonLd, articleJsonLd } from './lib/json-ld.js';
import { config, publicConfig, describeConfig } from './lib/config.js';
import { registerAnalyticsProxy } from './lib/analytics-proxy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT = site.defaultLocale;

// Prefer self-hosted fonts when present. Loading fonts.googleapis.com sends the
// visitor's IP to Google before they have consented to anything — see
// public/fonts/README.md. Drop the .woff2 files in and this flips automatically.
const IMG_MANIFEST = (() => {
  const f = path.join(ROOT, 'public', 'img', 'manifest.json');
  // Falls back to an empty manifest so the site still boots before
  // tools/build-images.mjs has been run.
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
})();

const FONT_DIR = path.join(ROOT, 'public', 'fonts');
const hasLocalFonts = fs.existsSync(FONT_DIR)
  && fs.readdirSync(FONT_DIR).some((f) => f.endsWith('.woff2'));

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  trustProxy: true,
});

await app.register(fastifyView, {
  engine: { nunjucks },
  root: path.join(ROOT, 'views'),
  viewExt: 'njk',
  options: {
    // autoescape stays ON. Author-controlled HTML (article bodies, achievement
    // markup) is opted in explicitly with `| safe` at the call site.
    nunjucks: { autoescape: true, noCache: process.env.NODE_ENV !== 'production' },
  },
});

// Static assets. These directories are served as-is from the repo root so the
// migration doesn't churn every image path in one commit.
for (const dir of ['public', 'images', 'logos', 'docs', 'audio', 'assets']) {
  await app.register(fastifyStatic, {
    root: path.join(ROOT, dir),
    prefix: dir === 'public' ? '/' : `/${dir}/`,
    decorateReply: dir === 'public',
    maxAge: dir === 'public' ? '1h' : '7d',
    index: false,
  });
}

/** Everything a template needs, assembled once per request. */
function viewModel(locale, { pathname = '/', page = 'home' } = {}) {
  const copy = locales[locale].copy;
  const other = availableLocales.filter((l) => l !== locale);

  // Filter chips should only offer industries that actually have roles behind
  // them — an "Ecommerce" chip that filters to nothing reads as a broken filter.
  const industriesInUse = new Set(copy.workExperience.roles.flatMap((r) => r.industries ?? []));

  return {
    page,
    locale,
    copy,
    site,
    metrics: metrics.items,
    year: new Date().getFullYear(),
    home: localeUrl(locale, '/'),
    canonical: `${site.canonicalOrigin}${pathname === '/' ? localeUrl(locale, '/') : pathname}`,
    alternates: availableLocales.map((l) => ({
      locale: l,
      href: `${site.canonicalOrigin}${localeUrl(l, '/')}`,
    })),
    otherLocale: other[0] ?? null,
    otherLocaleUrl: other[0] ? localeUrl(other[0], '/') : null,
    searchIndex: clientIndex(locale),
    jsonLd: personJsonLd(locale),
    publicConfig: publicConfig(),
    hasLocalFonts,
    img: IMG_MANIFEST,
    industriesInUse: [...industriesInUse],
    url: (p) => localeUrl(locale, p),
    articleHref: (slug) => articleUrl(locale, slug),
    whatsappHref:
      `https://wa.me/${site.person.phoneE164}` +
      `?text=${encodeURIComponent(copy.ui.whatsapp.prefill)}`,
  };
}

const rendersFor = (locale) => {
  const prefix = locale === DEFAULT ? '' : `/${locale}`;
  const segment = ARTICLE_SEGMENT[locale] ?? 'articles';

  app.get(prefix || '/', async (req, reply) =>
    reply.view('home', viewModel(locale, { pathname: localeUrl(locale, '/'), page: 'home' })),
  );

  app.get(`${prefix}/${segment}/:slug`, async (req, reply) => {
    const article = locales[locale].articles[req.params.slug];
    if (!article) return reply.code(404).view('404', viewModel(locale, { page: '404' }));
    const model = viewModel(locale, {
      pathname: articleUrl(locale, req.params.slug),
      page: 'article',
    });
    return reply.view('article', { ...model, article, jsonLd: articleJsonLd(locale, article) });
  });
};

registerAnalyticsProxy(app);

for (const locale of availableLocales) rendersFor(locale);

// Legacy URLs from the GitHub Pages era are indexed and linked from elsewhere.
// They must keep resolving, so redirect permanently to the new shape.
app.get('/articles/:slug.html', async (req, reply) =>
  reply.redirect(articleUrl(DEFAULT, req.params.slug), 301),
);
app.get('/index.html', async (req, reply) => reply.redirect(localeUrl(DEFAULT, '/'), 301));

// favicon.ico and CNAME live at the repo root rather than in public/.
app.get('/favicon.ico', async (req, reply) =>
  reply.type('image/x-icon').send(fs.createReadStream(path.join(ROOT, 'favicon.ico'))),
);

app.get('/robots.txt', async (req, reply) =>
  reply
    .type('text/plain')
    .send(`User-agent: *\nAllow: /\nSitemap: ${site.canonicalOrigin}/sitemap.xml\n`),
);

app.get('/sitemap.xml', async (req, reply) => {
  const urls = [];
  for (const locale of availableLocales) {
    urls.push({ loc: `${site.canonicalOrigin}${localeUrl(locale, '/')}`, priority: '1.0', freq: 'monthly' });
    for (const slug of Object.keys(locales[locale].articles)) {
      urls.push({ loc: `${site.canonicalOrigin}${articleUrl(locale, slug)}`, priority: '0.7', freq: 'yearly' });
    }
  }
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n` +
          `    <changefreq>${u.freq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;
  return reply.type('application/xml').send(body);
});

app.get('/healthz', async () => ({
  ok: true,
  locales: availableLocales,
  indexed: clientIndex(DEFAULT).length,
  config: describeConfig(),
}));

app.setNotFoundHandler(async (req, reply) =>
  reply.code(404).view('404', viewModel(DEFAULT, { page: '404' })),
);

app.log.info(describeConfig(), 'configuration');
await app.listen({ port: config.port, host: config.host });
