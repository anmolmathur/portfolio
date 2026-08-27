/*
 * Project card flip.
 *
 * Driven by an explicit button, not hover: hover offered no affordance and was
 * unreachable on touch, so the case studies were effectively invisible.
 *
 * The important detail is focus. A face rotated away is still in the DOM and
 * still focusable, so without intervention Tab walks into invisible content.
 * `inert` removes the hidden face from the tab order and the accessibility
 * tree, which `backface-visibility` alone does not do.
 */
(function () {
  const cards = document.querySelectorAll('.project-card');
  if (!cards.length) return;

  const supportsInert = 'inert' in HTMLElement.prototype;

  function setFace(card, flipped) {
    const front = card.querySelector('.flip-front');
    const back = card.querySelector('.flip-back');
    const opener = card.querySelector('[data-flip="open"]');
    if (!front || !back) return;

    card.classList.toggle('is-flipped', flipped);
    if (opener) opener.setAttribute('aria-expanded', String(flipped));

    if (supportsInert) {
      front.inert = flipped;
      back.inert = !flipped;
    } else {
      // Older browsers: aria-hidden at least keeps screen readers straight.
      front.setAttribute('aria-hidden', String(flipped));
      back.setAttribute('aria-hidden', String(!flipped));
    }

    // Move focus to the face the visitor just revealed, so keyboard users
    // continue from where they are rather than from the top of the card.
    const target = flipped ? card.querySelector('[data-flip="close"]') : opener;
    if (target && document.activeElement !== target) target.focus({ preventScroll: true });

    document.dispatchEvent(new CustomEvent('site:project-flip', {
      detail: { project: card.dataset.project, open: flipped },
    }));
  }

  /**
   * Size every card to the tallest face in the set.
   *
   * A hard-coded height is a guess that breaks the moment a case study is
   * edited or the font falls back — which is exactly how the old 320px face
   * ended up one sentence away from clipping. Measuring means the cards stay
   * uniform and nothing ever needs to scroll, at any width, for any content.
   */
  function sizeCards() {
    for (const card of cards) card.style.minHeight = '';   // release before measuring

    let tallest = 0;
    for (const card of cards) {
      const body = card.querySelector('.case-body');
      if (!body) continue;
      // The back face is absolutely positioned at the card's size, so any
      // shortfall shows up as overflow on the scrollable body.
      const shortfall = Math.max(0, body.scrollHeight - body.clientHeight);
      tallest = Math.max(tallest, card.clientHeight + shortfall);
    }
    if (!tallest) return;

    /* No cap. Capping was there to stop short cards looking half-empty, but
       the front-face teaser now absorbs any leftover height, so the only thing
       a cap would buy is a scrollbar in the longest case study. Measured
       height means nothing ever scrolls and nothing is ever clipped, at any
       width, for any content length. */
    for (const card of cards) {
      card.style.minHeight = `${Math.ceil(tallest)}px`;
      const body = card.querySelector('.case-body');
      if (body) card.classList.toggle('has-scroll', body.scrollHeight > body.clientHeight + 1);
    }
  }

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(sizeCards, 150);
  });
  // Web fonts change line counts, so re-measure once they land.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeCards).catch(() => {});
  sizeCards();

  for (const card of cards) {
    setFace(card, false);                 // establish the initial inert state
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-flip]');
      if (!btn) return;
      setFace(card, btn.dataset.flip === 'open');
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && card.classList.contains('is-flipped')) {
        e.stopPropagation();
        setFace(card, false);
      }
    });
  }
})();
