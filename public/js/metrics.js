/* Count-up impact metrics.
   Reduced-motion visitors get the final value immediately — the number is the
   point, the animation is decoration. */
(function () {
  const metrics = [...document.querySelectorAll('.metric')];
  if (!metrics.length) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const locale = document.documentElement.lang || 'en';

  function format(value, { decimals, compact }) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      notation: compact ? 'compact' : 'standard',
    }).format(value);
  }

  function run(el) {
    const node = el.querySelector('[data-metric-number]');
    const target = Number(el.dataset.value);
    const decimals = Number(el.dataset.decimals || 0);
    const compact = el.dataset.format === 'compact';
    if (!node || !Number.isFinite(target)) return;

    if (reduced) { node.textContent = format(target, { decimals, compact }); return; }

    const duration = 1100;
    const start = performance.now();
    // easeOutCubic — fast start, gentle settle, so the final value is readable.
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      /* Clamped at BOTH ends. `now` is the rAF timestamp, which is the time the
         frame started and can therefore precede the performance.now() captured
         in this same task a moment earlier. A negative t made easeOutCubic go
         negative (1 - (1-t)^3 at t=-0.1 is -0.33), and the counters rendered
         "-327+ University partners" and "₹-0.0 Cr" for a frame or two before
         correcting themselves. Seen on the page, not theorised. */
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      node.textContent = format(target * ease(t), { decimals, compact });
      if (t < 1) requestAnimationFrame(step);
      else node.textContent = format(target, { decimals, compact });
    };
    requestAnimationFrame(step);
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      run(entry.target);
      io.unobserve(entry.target);
    }
  }, { threshold: 0.4 });

  metrics.forEach((m) => io.observe(m));
})();
