/* A note for anyone who opens devtools. They're the audience this site is for. */
(function () {
  const s = window.__SITE__ || {};
  const title = 'color:#0078d7;font-size:18px;font-weight:700';
  const body = 'color:#666;font-size:12px;line-height:1.6';
  try {
    console.log('%cAnmol Mathur', title);
    console.log(
      `%cCTO · 24+ years across EdTech, media, banking and ecommerce.

If you're reading this, you're my kind of visitor.
  email     ${s.email || 'contact@anmolmathur.com'}
  linkedin  linkedin.com/in/anmolmathur
  github    github.com/anmolmathur

Press ⌘K / Ctrl-K anywhere on this site to search it.`,
      body,
    );
  } catch (e) { /* console unavailable — nothing to do */ }
})();
