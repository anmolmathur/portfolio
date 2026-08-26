/* Mobile menu, scroll-spy, and reading progress. */
(function () {
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const open = navLinks.classList.toggle('show');
      hamburger.setAttribute('aria-expanded', String(open));
    });
    navLinks.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        navLinks.classList.remove('show');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Smooth scrolling for in-page anchors, honouring reduced-motion.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="#"]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    const target = document.querySelector(url.hash);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth' });
    history.pushState(null, '', url.hash);
  });

  // Reveal-on-scroll, preserved from the original site.
  const revealTargets = document.querySelectorAll(
    '.about-card, .timeline-item, .skill-card, .project-card, .education-card, .article-card, .flip-card',
  );
  if (revealTargets.length) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('visible');
        entry.target.querySelectorAll('.content').forEach((el) => el.classList.add('visible'));
        io.unobserve(entry.target);
      }
    }, { threshold: 0.2 });
    revealTargets.forEach((t) => io.observe(t));
  }

  // Scroll-spy: mark the nav link for whichever section owns the viewport.
  const sections = [...document.querySelectorAll('main section[id]')];
  const linkFor = new Map(
    [...document.querySelectorAll('[data-nav]')].map((a) => [a.dataset.nav, a]),
  );
  if (sections.length && linkFor.size) {
    let active = null;
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const link = linkFor.get(entry.target.id);
          if (!link || link === active) continue;
          if (active) active.removeAttribute('aria-current');
          link.setAttribute('aria-current', 'true');
          active = link;
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach((s) => spy.observe(s));
  }

  // Reading progress.
  const bar = document.getElementById('scrollProgress');
  if (bar) {
    let ticking = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = max > 0 ? `${Math.min(100, (window.scrollY / max) * 100)}%` : '0%';
      ticking = false;
    };
    addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  // Flip cards: clickable on touch, and keyboard-operable everywhere.
  document.querySelectorAll('.flip-card').forEach((card) => {
    const flip = () => card.classList.toggle('touch-flip');
    card.addEventListener('click', () => { if (window.innerWidth <= 768) flip(); });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });
  });
})();
