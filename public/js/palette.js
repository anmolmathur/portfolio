/* Command palette (⌘K / Ctrl-K).
   Searches the same index the avatar's retrieval brain uses, so the two can
   never disagree about what exists on this site. */
(function () {
  const S = window.__SITE__ || {};
  const strings = (S.strings && S.strings.commandPalette) || {};
  const el = {
    root: document.getElementById('palette'),
    input: document.getElementById('paletteInput'),
    results: document.getElementById('paletteResults'),
    empty: document.getElementById('paletteEmpty'),
    open: document.getElementById('paletteOpen'),
  };
  if (!el.root || !el.input || !el.results) return;

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  if (el.open) {
    const kbd = el.open.querySelector('.kbd-hint');
    if (kbd) kbd.textContent = isMac ? '⌘K' : 'Ctrl K';
  }

  const actions = [
    { id: 'a:resume', kind: 'action', title: strings.actionResume, icon: 'fa-file-download',
      run: () => download(S.resumes && S.resumes.general && S.resumes.general.path, 'general') },
    { id: 'a:resume-bfsi', kind: 'action', title: strings.actionResumeBfsi, icon: 'fa-file-download',
      run: () => download(S.resumes && S.resumes.bfsi && S.resumes.bfsi.path, 'bfsi') },
    { id: 'a:whatsapp', kind: 'action', title: strings.actionWhatsapp, icon: 'fa-whatsapp',
      run: () => S.whatsappHref && window.open(S.whatsappHref, '_blank', 'noopener') },
    { id: 'a:email', kind: 'action', title: strings.actionEmail, icon: 'fa-envelope',
      run: () => { location.href = `mailto:${S.email}`; } },
    { id: 'a:theme', kind: 'action', title: strings.actionTheme, icon: 'fa-moon',
      run: () => document.getElementById('themeToggle') && document.getElementById('themeToggle').click() },
    S.otherLocaleUrl
      ? { id: 'a:lang', kind: 'action', title: strings.actionLanguage, icon: 'fa-language',
          run: () => { location.href = S.otherLocaleUrl; } }
      : null,
  ].filter((a) => a && a.title);

  function download(path, variant) {
    if (!path) return;
    const a = document.createElement('a');
    a.href = path;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    document.dispatchEvent(new CustomEvent('site:resume', { detail: { variant, source: 'palette' } }));
  }

  const records = (S.searchIndex || []).map((r) => ({
    ...r,
    haystack: `${r.title} ${r.subtitle || ''} ${r.terms || ''} ${r.snippet || ''}`.toLowerCase(),
  }));

  /* Scoring.
     Word-boundary matching, NOT bare substring. A naive `indexOf` makes "ai"
     match inside "em-ai-l" and lets a loose subsequence match almost anything,
     which is the same trap the retrieval brain has to avoid. Ranking, best
     first: exact title, title word prefix, keyword word prefix, then a
     substring match only for queries long enough to be meaningful. */
  const wordStarts = (haystack, q) => {
    let i = haystack.indexOf(q);
    while (i !== -1) {
      if (i === 0 || /[^a-z0-9]/.test(haystack[i - 1])) return i;
      i = haystack.indexOf(q, i + 1);
    }
    return -1;
  };

  function score(rec, q) {
    const title = rec.title.toLowerCase();
    const terms = (rec.terms || '').toLowerCase();

    if (title === q) return 1200;
    if (title.startsWith(q)) return 1000 - title.length;

    const tw = wordStarts(title, q);
    if (tw >= 0) return 850 - tw;

    const kw = wordStarts(terms, q);
    if (kw >= 0) return 700 - Math.min(kw, 200);

    // Mid-word matches are only trustworthy once the query is specific enough.
    if (q.length >= 4) {
      const body = `${title} ${terms} ${rec.snippet || ''}`.toLowerCase();
      const i = body.indexOf(q);
      if (i >= 0) return 400 - Math.min(i, 300);
    }
    return -1;
  }

  let matches = [];
  let cursor = 0;

  function render(query) {
    const q = query.trim().toLowerCase();
    const acts = q
      ? actions.filter((a) => wordStarts(a.title.toLowerCase(), q) >= 0)
      : actions.slice(0, 3);
    const secs = q
      ? records.map((r) => ({ r, s: score(r, q) })).filter((x) => x.s >= 0)
          .sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.r)
      : records.slice(0, 6);

    matches = [...acts, ...secs];
    cursor = 0;

    el.results.innerHTML = '';
    el.empty.hidden = matches.length > 0;

    const group = (label) => {
      const li = document.createElement('li');
      li.className = 'palette-group';
      li.setAttribute('role', 'presentation');
      li.textContent = label;
      el.results.appendChild(li);
    };

    if (acts.length) group(strings.groupActions || 'Actions');
    acts.forEach((a) => el.results.appendChild(row(a)));
    if (secs.length) group(strings.groupSections || 'Sections');
    secs.forEach((r) => el.results.appendChild(row(r)));

    highlight();
  }

  function row(item) {
    const li = document.createElement('li');
    li.className = 'palette-item';
    li.id = `pi-${item.id.replace(/\W+/g, '-')}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.id = item.id;

    const title = document.createElement('span');
    title.className = 'pi-title';
    title.textContent = item.title;
    li.appendChild(title);

    if (item.subtitle) {
      const sub = document.createElement('span');
      sub.className = 'pi-sub';
      sub.textContent = item.subtitle;
      li.appendChild(sub);
    }
    if (item.kind && item.kind !== 'action') {
      const kind = document.createElement('span');
      kind.className = 'pi-kind';
      kind.textContent = item.kind;
      li.appendChild(kind);
    }

    li.addEventListener('click', () => choose(item));
    return li;
  }

  function highlight() {
    const rows = [...el.results.querySelectorAll('.palette-item')];
    rows.forEach((r, i) => r.setAttribute('aria-selected', String(i === cursor)));
    const active = rows[cursor];
    if (active) {
      el.input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function choose(item) {
    close();
    document.dispatchEvent(
      new CustomEvent('site:palette-choose', { detail: { id: item.id, kind: item.kind } }),
    );
    if (typeof item.run === 'function') { item.run(); return; }
    if (item.externalUrl) { window.open(item.externalUrl, '_blank', 'noopener'); return; }
    if (item.url) location.href = item.url;
  }

  let lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    el.root.hidden = false;
    el.root.setAttribute('aria-hidden', 'false');
    el.input.value = '';
    render('');
    el.input.focus();
    document.body.style.overflow = 'hidden';
    document.dispatchEvent(new CustomEvent('site:palette-open'));
  }

  function close() {
    el.root.hidden = true;
    el.root.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  el.input.addEventListener('input', () => {
    render(el.input.value);
    if (el.input.value.trim().length > 1) {
      document.dispatchEvent(
        new CustomEvent('site:palette-search', {
          detail: { query: el.input.value.trim(), results: matches.length },
        }),
      );
    }
  });

  el.root.addEventListener('click', (e) => {
    if (e.target.closest('[data-palette-close]')) close();
  });

  el.input.addEventListener('keydown', (e) => {
    const rows = el.results.querySelectorAll('.palette-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, rows.length - 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); highlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (matches[cursor]) choose(matches[cursor]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') { e.preventDefault(); } // focus stays in the dialog
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      el.root.hidden ? open() : close();
    } else if (e.key === 'Escape' && !el.root.hidden) {
      close();
    }
  });

  if (el.open) el.open.addEventListener('click', open);
  window.openPalette = open;
})();
