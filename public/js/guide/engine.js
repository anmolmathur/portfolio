/* Guide — engine. Orchestrates ask -> deliver.
 *
 * The brain itself is server-side (server/lib/guide-agent.js): retrieval gates
 * the model, and the answer falls through to the site's own copy on any
 * failure. This layer is the client half of that contract — it must never let
 * a slow or broken request leave the visitor staring at a spinner.
 */
(function () {
  'use strict';

  var G = (window.Guide = window.Guide || {});

  function createEngine() {
    var history = [];
    /* Stale-response guard from references/brain.md: a visitor who asks a
       second question before the first returns must not receive the first
       answer afterwards. Each ask takes a token; a reply is delivered only if
       its token is still the current one. */
    var token = 0;

    function remember(role, text) {
      history.push({ role: role, text: text });
      var max = G.config.limits.historyTurns;
      if (history.length > max) history.splice(0, history.length - max);
    }

    function ask(question) {
      var q = String(question || '').trim().slice(0, G.config.limits.question);
      if (!q) return Promise.resolve(null);

      var mine = ++token;
      remember('visitor', q);

      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, G.config.limits.askTimeoutMs);

      return fetch(G.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, locale: G.config.locale }),
        signal: controller.signal,
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          if (mine !== token) return null;   // superseded
          remember('guide', data.answer || '');
          return data;
        })
        .catch(function (err) {
          if (mine !== token) return null;
          /* The server answers even when the model is down, so reaching here
             means the request itself failed — offline, aborted, 5xx. Surface
             copy rather than an exception; the guide never shows a stack. */
          return {
            ok: false,
            source: 'error',
            answer: G.copy('error', 'Something went wrong. Please try again.'),
            sources: [],
            aborted: err && err.name === 'AbortError',
          };
        })
        .finally(function () { clearTimeout(timer); });
    }

    return {
      ask: ask,
      history: function () { return history.slice(); },
      /* Phase 4 will add speak() here; the delivery order (clear bubble ->
         set reply -> speak -> gesture) is defined in architecture.md and
         belongs in this seam, not in the panel. */
    };
  }

  G.createEngine = createEngine;
})();
