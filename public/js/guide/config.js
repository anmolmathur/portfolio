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
    // Versioned entry for the stage module graph; see server/lib/stage-modules.js
    stageEntry: injected.stageEntry || '/js/guide/stage/stage.js',
    modelUrl: injected.modelUrl || '/assets/guide/models/anmol.glb',
    // Rendered from the same GLB, so the phone sees the same character.
    stillUrl: injected.stillUrl || '/assets/guide/models/anmol-idle.png',
    copy: injected.copy || {},

    // The panel is built on first open, not on page load. The three.js stage
    // is a separate dynamic import behind that same gate, so the ~2MB of 3D
    // never touches a visitor who does not open the guide.
    lazyPanel: true,

    /* AVATAR OFF.
     *
     * Turned off by the site owner on 2026-08-30: the 3D figure read as
     * kiddish against a professional portfolio, and the browser's speech voice
     * sounded bad. Both judgements are the owner's and both are right to act on
     * -- a feature its owner finds embarrassing is worse than no feature.
     *
     * NOTHING IS DELETED. The stage, rig normalizer, poses, laptop, animator
     * and viseme driver all remain in public/js/guide/stage/ and still work;
     * this flag is the only thing standing between them and the page, so
     * re-enabling after a design pass is a one-line change.
     *
     * ?guide-stage=1 previews it without a deploy. */
    showAvatar: (function () {
      try { return /[?&]guide-stage=1/.test(location.search); } catch (e) { return false; }
    })(),

    /* VOICE OFF for the same reason. speechSynthesis is the always-available
       floor tier and it sounds like it; the good tiers (cloud TTS, Piper) are
       not built yet. It was already opt-in, but an opt-in to something the
       owner considers bad is still a trap for a visitor. */
    enableVoice: (function () {
      try { return /[?&]guide-voice=1/.test(location.search); } catch (e) { return false; }
    })(),

    limits: {
      question: 500,      // matches MAX_QUESTION on the server
      askTimeoutMs: 25000, // ceiling above the server's own 20s
      historyTurns: 12,    // kept locally
      historySent: 6,      // sent with each question, per brain.md
    },

    storageKeys: {
      greeted: 'guide-greeted',
      voice: 'guide-voice',
      side: 'guide-side',
      transcript: 'guide-transcript',
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
