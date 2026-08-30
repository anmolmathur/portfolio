/* Guide — configuration. Every knob lives here.
 *
 * Phase 1 of the talking-avatar-guide skill: skeleton + isolation. The whole
 * feature is this one directory, reached through one window namespace and
 * included by one partial. Removing it = delete public/js/guide/ + delete the
 * include from layout.njk. Nothing else in the site imports from inside here.
 *
 * Copy is NOT defined in this file. Every string on this site lives in
 * content/<locale>.json so a second locale needs no code change, and the guide
 * follows that rule like everything else — the server hands the strings over on
 * `window.__guideConfig`. See views/partials/guide.njk.
 */
(function () {
  'use strict';

  var G = (window.Guide = window.Guide || {});
  var injected = window.__guideConfig || {};

  /* localStorage is best-effort. Safari in private mode throws on setItem, and
     a visitor who cannot persist a preference should still get a working guide
     rather than a dead panel. Every access is wrapped. */
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };

  G.config = {
    // Where the brain lives. Server-side so the OpenWebUI key never ships to
    // the browser, and so retrieval gates the model before it is ever called.
    endpoint: injected.endpoint || '/api/guide/ask',
    locale: injected.locale || 'en',
    copy: injected.copy || {},

    // The panel is built on first open, not on page load. The three.js stage
    // is a separate dynamic import behind that same gate, so the ~2MB of 3D
    // never touches a visitor who does not open the guide.
    lazyPanel: true,

    /* The avatar stage is OFF until it has a rest pose.
     *
     * Phase 2 loads and renders the model correctly, but a freshly loaded
     * Mixamo rig stands in a T-pose with its arms straight out. That is the
     * correct output for "stage + model" and it still reads as broken to a
     * visitor, so it stays behind this flag until phase 3 (animation.md) adds
     * the rest pose and idle motion. Flip to true to preview it.
     *
     * ?guide-stage=1 in the URL forces it on for testing without a deploy. */
    enableStage: (function () {
      try {
        if (/[?&]guide-stage=1/.test(location.search)) return true;
      } catch (e) { /* ignore */ }
      return false;
    })(),

    limits: {
      question: 500,      // matches MAX_QUESTION on the server
      askTimeoutMs: 25000, // ceiling above the server's own 20s
      historyTurns: 12,    // kept locally; sending them is phase 5 work
    },

    storageKeys: {
      greeted: 'guide-greeted',
    },

    store: store,
  };

  /* One namespace instead of imports — the classic-script variant from
     references/architecture.md. Same layer boundaries as the ESM layout, no
     build step required. */
  G.copy = function (key, fallback) {
    var v = G.config.copy[key];
    return (typeof v === 'string' && v) ? v : (fallback || '');
  };
})();
