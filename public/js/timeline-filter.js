/* Filter the work timeline by industry.
   State lives in the URL (?industry=…) so a filtered view is shareable — a
   recruiter checking banking depth can send the link on. */
(function () {
  const filter = document.getElementById('timelineFilter');
  const timeline = document.getElementById('timeline');
  if (!filter || !timeline) return;

  const chips = [...filter.querySelectorAll('.chip')];
  const items = [...timeline.querySelectorAll('.timeline-item')];
  const countEl = document.getElementById('filterCount');
  const strings = (window.__SITE__ && window.__SITE__.strings) || {};
  const template = (strings.timelineFilter && strings.timelineFilter.resultCount) || '';

  function apply(industry, { push = true } = {}) {
    let shown = 0;
    for (const item of items) {
      const industries = (item.dataset.industries || '').split(/\s+/).filter(Boolean);
      const match = industry === 'all' || industries.includes(industry);
      item.hidden = !match;
      if (match) shown += 1;
    }

    for (const chip of chips) {
      const active = chip.dataset.industry === industry;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    }

    if (countEl) {
      countEl.textContent =
        industry === 'all'
          ? ''
          : template.replace('{n}', shown).replace('{total}', items.length);
    }

    if (push) {
      const url = new URL(location.href);
      if (industry === 'all') url.searchParams.delete('industry');
      else url.searchParams.set('industry', industry);
      history.replaceState(null, '', url);
    }

    document.dispatchEvent(
      new CustomEvent('site:timeline-filter', { detail: { industry, shown } }),
    );
  }

  filter.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) apply(chip.dataset.industry);
  });

  const initial = new URL(location.href).searchParams.get('industry');
  if (initial && chips.some((c) => c.dataset.industry === initial)) {
    apply(initial, { push: false });
  }

  window.filterTimeline = apply;
})();
