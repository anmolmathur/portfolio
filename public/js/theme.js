/* Theme toggle. The initial theme is resolved by an inline script in <head>
   so there is no flash; this file only handles the toggle afterwards. */
(function () {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  if (!btn) return;

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const current = () => root.dataset.theme || (media.matches ? 'dark' : 'light');

  function paint() {
    const dark = current() === 'dark';
    btn.setAttribute('aria-pressed', String(dark));
    const moon = btn.querySelector('.ico-moon');
    const sun = btn.querySelector('.ico-sun');
    if (moon && sun) { moon.hidden = dark; sun.hidden = !dark; }
  }

  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
    paint();
    document.dispatchEvent(new CustomEvent('site:theme', { detail: { theme: next } }));
  });

  // Follow the system only while the visitor hasn't made an explicit choice.
  media.addEventListener('change', () => { if (!root.dataset.theme) paint(); });

  paint();
})();
