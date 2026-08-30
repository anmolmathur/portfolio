/*
 * Analytics with a consent gate.
 *
 * Nothing is stored and nothing is sent until the visitor agrees. Before
 * consent PostHog runs in memory-only mode with autocapture and session replay
 * off, so there are no cookies and no identifiers — which is what makes the
 * Spanish page defensible for EU visitors.
 *
 * The one thing kept without consent is the consent decision itself, which is
 * strictly necessary and therefore doesn't require permission.
 */
(function () {
  const S = window.__SITE__ || {};
  const A = (S.analytics) || {};
  const KEY = 'analytics-consent';

  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } },
  };

  /* --- PII scrubber --------------------------------------------------------
     Free text is the only place a visitor can accidentally send personal data.
     It gets sanitised at ONE choke point rather than at every call site, so a
     new event can't quietly bypass it. */
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
  const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
  const LONGNUM = /\b\d{6,}\b/g;

  function scrub(value) {
    if (typeof value !== 'string') return value;
    return value
      .replace(EMAIL, '[email]')
      .replace(PHONE, '[phone]')
      .replace(LONGNUM, '[number]')
      .slice(0, 300);
  }

  function scrubProps(props) {
    const out = {};
    for (const [k, v] of Object.entries(props || {})) out[k] = scrub(v);
    return out;
  }

  // Exposed so the scrubber can be tested against the real implementation
  // rather than a copy that could drift from it.
  window.__scrub = scrubProps;

  let ready = false;
  const queue = [];

  function capture(event, props) {
    const payload = scrubProps(props);
    if (!ready || !window.posthog) { queue.push([event, payload]); return; }
    try { window.posthog.capture(event, payload); } catch (e) { /* never break the page */ }
  }
  window.track = capture;

  function loadPostHog() {
    if (!A.enabled || !A.posthogKey || window.posthog) return;
    // PostHog's own loader, fetched through the first-party proxy.
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_in_capturing opt_out_capturing has_opted_in_capturing set_config".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    window.posthog.init(A.posthogKey, {
      api_host: A.proxyPath || '/ingest',
      // Locked down until consent — see the module comment.
      persistence: 'memory',
      autocapture: false,
      disable_session_recording: true,
      capture_pageview: false,
      opt_out_capturing_by_default: true,
      // Belt and braces: the scrubber also runs on PostHog's own auto-props.
      sanitize_properties: (props) => scrubProps(props),
      loaded: () => { ready = true; flush(); },
    });

    // NOTE: super properties are registered in grant(), NOT here. Registering
    // before consent writes them into the in-memory persistence store, and the
    // switch to localStorage+cookie on consent discards that store -- so they
    // silently never reach PostHog. Verified the hard way.
  }

  function flush() {
    while (queue.length) {
      const [e, p] = queue.shift();
      try { window.posthog.capture(e, p); } catch (err) { /* ignore */ }
    }
  }

  function grant() {
    store.set('granted');
    if (!window.posthog) { loadPostHog(); }
    try {
      window.posthog.set_config({
        persistence: 'localStorage+cookie',
        autocapture: true,
        disable_session_recording: false,
      });
      /* This PostHog project is shared with BombayGothic, so tag every
         portfolio event to keep the two separable:

         - `bg_property: 'portfolio'` reuses the dimension BombayGothic already
           breaks down by (`main_site` / `shopify_store`), so existing insights
           filtered to those values exclude portfolio traffic on their own.
         - `site` is the honest name, for portfolio analysis and for the day
           these become separate projects.

         Must run AFTER set_config: switching persistence resets the property
         store, so anything registered earlier is thrown away. Registering here
         -- before opt_in and the first $pageview -- means every event that is
         ever actually sent carries both tags, autocapture included. */
      window.posthog.register({ bg_property: 'portfolio', site: 'anmolmathur.com' });
      window.posthog.opt_in_capturing();
      window.posthog.capture('$pageview');
    } catch (e) { /* ignore */ }
    loadGA();
    hideBanner();
  }

  function deny() {
    store.set('denied');
    try { window.posthog && window.posthog.opt_out_capturing(); } catch (e) { /* ignore */ }
    hideBanner();
  }

  function loadGA() {
    if (!A.gaId || window.gtag) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${A.gaId}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', A.gaId, { anonymize_ip: true });
  }

  const banner = document.getElementById('consent');
  function hideBanner() { if (banner) banner.hidden = true; }

  if (banner) {
    banner.addEventListener('click', (e) => {
      if (e.target.closest('[data-consent="accept"]')) grant();
      else if (e.target.closest('[data-consent="decline"]')) deny();
    });
  }

  const decision = store.get();
  loadPostHog();
  if (decision === 'granted') grant();
  else if (decision === 'denied') hideBanner();
  else if (banner) banner.hidden = false;

  /* --- Event taxonomy ------------------------------------------------------
     High-intent actions first: these are the ones that answer "is this site
     reaching the right people?" */
  const on = (sel, fn) => document.addEventListener('click', (e) => {
    const el = e.target.closest(sel);
    if (el) fn(el);
  });

  on('[data-resume]', (el) =>
    capture('resume_downloaded', {
      variant: el.dataset.resume,
      source: el.dataset.source || 'link',
      locale: S.locale,
    }));

  on('[data-contact]', (el) =>
    capture('contact_clicked', { channel: el.dataset.contact, locale: S.locale }));

  on('.read-more-btn', (el) =>
    capture('article_opened', { href: el.getAttribute('href'), locale: S.locale }));

  document.addEventListener('site:resume', (e) =>
    capture('resume_downloaded', { ...e.detail, locale: S.locale }));
  document.addEventListener('site:palette-open', () =>
    capture('palette_opened', { locale: S.locale }));
  document.addEventListener('site:palette-search', (e) =>
    capture('palette_search', { query: e.detail.query, results: e.detail.results, locale: S.locale }));
  document.addEventListener('site:palette-choose', (e) =>
    capture('palette_choose', { ...e.detail, locale: S.locale }));
  document.addEventListener('site:timeline-filter', (e) =>
    capture('timeline_filtered', { ...e.detail, locale: S.locale }));
  document.addEventListener('site:theme', (e) =>
    capture('theme_toggled', { theme: e.detail.theme }));

  // Section engagement: which parts get read, which get skipped.
  const seen = new Set();
  const sections = document.querySelectorAll('main section[id]');
  if (sections.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target.id)) continue;
        seen.add(entry.target.id);
        capture('section_viewed', { section: entry.target.id, locale: S.locale });
      }
    }, { threshold: 0.5 });
    sections.forEach((s) => io.observe(s));
  }

  // Article read depth.
  const article = document.querySelector('[data-article]');
  if (article) {
    let deepest = 0;
    addEventListener('scroll', () => {
      const r = article.getBoundingClientRect();
      const pct = Math.round(Math.min(100, Math.max(0, ((innerHeight - r.top) / r.height) * 100)));
      if (pct > deepest) deepest = pct;
    }, { passive: true });
    addEventListener('beforeunload', () =>
      capture('article_read', { slug: article.dataset.article, scroll_pct: deepest, locale: S.locale }));
  }
})();
