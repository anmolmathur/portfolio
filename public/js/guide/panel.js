/* Guide — panel. The UI shell: header, transcript, suggestion chips, input.
 *
 * Built on first open, not at page load. Phase 2's three.js stage mounts into
 * `.guide-stage` below via a separate dynamic import, so the 3D weight stays
 * behind the same gate.
 */
(function () {
  'use strict';

  var G = (window.Guide = window.Guide || {});

  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function createPanel(opts) {
    var engine = G.createEngine();
    var root = el('div', 'guide-panel');
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'false');
    root.setAttribute('aria-label', G.copy('title', 'Assistant'));

    // ---- header -----------------------------------------------------------
    var head = el('div', 'guide-head');
    var heading = el('div', 'guide-heading');
    heading.appendChild(el('strong', null, G.copy('title', 'Ask about Anmol')));
    heading.appendChild(el('span', 'guide-sub', G.copy('subtitle', '')));
    var close = el('button', 'guide-close');
    close.type = 'button';
    close.setAttribute('aria-label', G.copy('close', 'Close'));
    close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">'
      + '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    head.appendChild(heading);
    head.appendChild(close);

    // Reserved for the avatar. Empty in phase 1 — the panel is a working text
    // guide without it, which is the point of shipping the phases separately.
    var stage = el('div', 'guide-stage');
    stage.setAttribute('aria-hidden', 'true');

    var log = el('div', 'guide-log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');

    var chips = el('div', 'guide-chips');

    // ---- input ------------------------------------------------------------
    var form = el('form', 'guide-form');
    var input = el('input', 'guide-input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = G.copy('placeholder', 'Ask a question…');
    input.setAttribute('aria-label', G.copy('placeholder', 'Ask a question'));
    input.maxLength = G.config.limits.question;
    var send = el('button', 'guide-send');
    send.type = 'submit';
    send.setAttribute('aria-label', G.copy('send', 'Send'));
    send.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">'
      + '<path d="M4 12l16-8-6 8 6 8z" fill="currentColor"/></svg>';
    form.appendChild(input);
    form.appendChild(send);

    var note = el('p', 'guide-note', G.copy('disclosure', ''));

    root.appendChild(head);
    root.appendChild(stage);
    root.appendChild(log);
    root.appendChild(chips);
    root.appendChild(form);
    root.appendChild(note);

    // ---- transcript -------------------------------------------------------
    function bubble(kind, text) {
      var b = el('div', 'guide-msg guide-msg-' + kind);
      b.appendChild(el('p', null, text));
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
      return b;
    }

    function addSources(after, sources) {
      if (!sources || !sources.length) return;
      var wrap = el('div', 'guide-sources');
      wrap.appendChild(el('span', 'guide-sources-label', G.copy('sourceLabel', 'On this page')));
      sources.slice(0, 3).forEach(function (s) {
        if (!s.url) return;
        var a = el('a', 'guide-source', s.title);
        a.href = s.url;
        /* Answers cite where on the page the claim came from, so a visitor can
           check it. Grounding the visitor can verify is worth more than
           grounding they have to take on trust. */
        a.addEventListener('click', function () { close_(); });
        wrap.appendChild(a);
      });
      if (wrap.children.length > 1) after.appendChild(wrap);
    }

    var busy = false;
    function submit(question) {
      if (busy) return;
      var q = String(question || '').trim();
      if (!q) return;
      busy = true;
      input.value = '';
      chips.hidden = true;
      bubble('visitor', q);
      var thinking = bubble('guide guide-thinking', G.copy('thinking', 'Thinking…'));

      engine.ask(q).then(function (res) {
        // Null means a newer question superseded this one; its bubble is
        // already gone and delivering now would answer the wrong question.
        if (!res) { thinking.remove(); busy = false; return; }
        thinking.remove();
        var b = bubble('guide', res.answer || '');
        addSources(b, res.sources);
        log.scrollTop = log.scrollHeight;
        busy = false;
        input.focus();
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(input.value);
    });

    function renderChips() {
      chips.textContent = '';
      var list = G.config.copy.suggestions || [];
      list.slice(0, 4).forEach(function (s) {
        var c = el('button', 'guide-chip', s);
        c.type = 'button';
        c.addEventListener('click', function () { submit(s); });
        chips.appendChild(c);
      });
      chips.hidden = list.length === 0;
    }

    /* ---- avatar stage (phase 2) -----------------------------------------
     * Dynamically imported on first open so three.js (~800KB) never reaches a
     * visitor who does not open the guide. Failure is silent by design: the
     * guide is a working text assistant without an avatar, and a WebGL or
     * model problem must not take the answers down with it. */
    var stageApi = null;
    var stageTried = false;
    function ensureStage() {
      if (stageTried) return;

      /* Gates are re-evaluated on every open and the latch is set only when an
         import actually starts. Latching first looked equivalent and was not:
         a viewport reporting 0 width (a page opened in a background tab, or an
         automated browser) matches `max-width: 600px`, so the avatar would be
         suppressed permanently for that page view and never retried after a
         resize. Found exactly that way. */
      if (!G.config.enableStage) return;              // see config.enableStage
      if (!window.WebGLRenderingContext) return;      // no WebGL, no avatar
      // Small screens skip the avatar: the panel is nearly full-height there
      // and the transcript is worth more than the figure. A zero width is not
      // a small screen, it is an unlaid-out page — do not treat it as one.
      var w = window.innerWidth;
      if (w > 0 && w <= 600) return;
      if (w === 0) return;

      stageTried = true;
      import(G.config.stageEntry)
        .then(function (mod) {
          return mod.createStage(stage, {
            modelUrl: '/assets/guide/models/anmol.glb',
          });
        })
        .then(function (s) {
          stageApi = s;
          stage.classList.add('is-live');
          // Respect the visitor's motion preference: a still first frame is
          // already rendered, so honouring this costs nothing visually.
          var reduce = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!reduce && !root.hidden) s.start();
        })
        .catch(function (err) {
          // Leave the stage host empty; CSS collapses it when it has no canvas.
          if (window.console && console.warn) console.warn('[guide] avatar unavailable:', err && err.message);
        });
    }

    // ---- open / close -----------------------------------------------------
    var greeted = false;
    function open_() {
      root.hidden = false;
      ensureStage();
      if (!greeted) {
        greeted = true;
        var seen = G.config.store.get(G.config.storageKeys.greeted);
        bubble('guide', seen
          ? G.copy('greetingReturn', G.copy('greeting', ''))
          : G.copy('greeting', ''));
        G.config.store.set(G.config.storageKeys.greeted, '1');
        renderChips();
      }
      // Focus the input, not the panel: a visitor who opened this wants to type.
      setTimeout(function () { input.focus(); }, 0);
      if (opts && opts.onOpen) opts.onOpen();
    }

    function close_() {
      root.hidden = true;
      // Nothing is visible now; keep the GL context but stop the loop.
      if (stageApi) stageApi.stop();
      if (opts && opts.onClose) opts.onClose();
    }

    close.addEventListener('click', close_);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close_(); }
    });

    return {
      el: root,
      open: open_,
      close: close_,
      isOpen: function () { return !root.hidden; },
      stageHost: stage,
      stageApi: function () { return stageApi; },
    };
  }

  G.createPanel = createPanel;
})();
