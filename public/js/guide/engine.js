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
    /* The transcript lives in sessionStorage, not memory.
     *
     * In memory it survived closing and reopening the panel, but not a page
     * NAVIGATION -- and the guide's own source links navigate. A visitor who
     * asked three questions, followed a citation, and came back found a blank
     * panel and a greeting, which reads as the assistant having forgotten them.
     *
     * sessionStorage is the right scope: it survives navigation and reload,
     * and dies with the tab, so a shared or public machine does not hand the
     * next person someone else's conversation. It is best-effort like every
     * other storage call here -- private mode throws, and a guide that works
     * without memory is better than one that fails to open. */
    var KEY = G.config.storageKeys.transcript;
    var history = (function () {
      try {
        var raw = sessionStorage.getItem(KEY);
        var parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) { return []; }
    })();

    function persist() {
      try { sessionStorage.setItem(KEY, JSON.stringify(history)); } catch (e) { /* private mode */ }
    }
    /* Stale-response guard from references/brain.md: a visitor who asks a
       second question before the first returns must not receive the first
       answer afterwards. Each ask takes a token; a reply is delivered only if
       its token is still the current one. */
    var token = 0;

    function remember(role, text, sources) {
      history.push({ role: role, text: text, sources: sources || null });
      var max = G.config.limits.historyTurns;
      if (history.length > max) history.splice(0, history.length - max);
      persist();
    }

    function ask(question) {
      var q = String(question || '').trim().slice(0, G.config.limits.question);
      if (!q) return Promise.resolve(null);

      var mine = ++token;

      /* Snapshot the history BEFORE recording this turn. Recording first put
         the current question into `history` as well as into the prompt, so the
         model saw it twice -- and worse, the server's follow-up resolution
         looks for the last visitor turn to carry the topic forward, which
         would have found this very question and carried nothing. */
      var prior = history.slice(-G.config.limits.historySent);
      remember('visitor', q);

      /* Tier 1. Answered locally, so "hi" costs no network round trip and no
         model call. A miss returns null and falls through to the server. */
      var quick = G.quickIntent && G.quickIntent(q, G.config.copy);
      if (quick) {
        remember('guide', quick.answer);
        quick.speech = quick.answer;
        return Promise.resolve(quick);
      }

      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, G.config.limits.askTimeoutMs);

      return fetch(G.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // History travels with the question so a bare follow-up ("and before
        // that?") can resolve against what was already asked.
        body: JSON.stringify({
          question: q,
          locale: G.config.locale,
          history: prior,
        }),
        signal: controller.signal,
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          if (mine !== token) return null;   // superseded
          remember('guide', data.answer || '', data.sources);
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

    /* Job-description fitment.
     *
     * Its own call, not a variant of ask(): it makes the server fetch a URL,
     * takes far longer, and returns an analysis rather than a grounded answer.
     * Shares the stale-response token so a JD analysis cannot land after the
     * visitor has moved on to a different question. */
    function analyseJd(payload) {
      var mine = ++token;
      remember('visitor', payload.url || 'Job description');

      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, G.config.limits.jdTimeoutMs);

      return fetch(G.config.jdEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: payload.url || null,
          text: payload.text || null,
          locale: G.config.locale,
        }),
        signal: controller.signal,
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (mine !== token) return null;
          remember('guide', data.answer || '');
          return data;
        })
        .catch(function (err) {
          if (mine !== token) return null;
          return {
            ok: false,
            answer: err && err.name === 'AbortError'
              ? G.copy('jdTimeout', 'That took too long. Try pasting the job text instead.')
              : G.copy('error', 'Something went wrong. Please try again.'),
          };
        })
        .finally(function () { clearTimeout(timer); });
    }

    return {
      ask: ask,
      analyseJd: analyseJd,
      history: function () { return history.slice(); },
      clear: function () {
        history.length = 0;
        try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      },
      /* Phase 4 will add speak() here; the delivery order (clear bubble ->
         set reply -> speak -> gesture) is defined in architecture.md and
         belongs in this seam, not in the panel. */
    };
  }

  G.createEngine = createEngine;
})();
