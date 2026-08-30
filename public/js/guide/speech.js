/* Guide — speech. One speak() facade over the OS voice (tier 3).
 *
 * references/speech.md defines a three-tier chain: cloud TTS -> in-browser
 * neural (Piper in a Worker) -> speechSynthesis. This is tier 3, which the
 * skill says ships day one: instant, free, no key, no model download, always
 * available. The facade is shaped so tiers 1 and 2 slot in front of it later
 * without callers changing.
 *
 * It lives in the classic bundle rather than the stage's ES modules on
 * purpose: a visitor whose WebGL fails should still be able to hear an answer.
 * The avatar drives its mouth from the word events emitted here, but nothing
 * here depends on the avatar existing.
 */
(function () {
  'use strict';

  var G = (window.Guide = window.Guide || {});

  // Playback rate, applied to the utterance rather than at generation, so all
  // three tiers land on the same tempo. Above ~1.3 the accent starts clipping.
  var RATE = 1.02;

  // Nobody wants a sixty-second monologue from a portfolio. The full answer
  // stays in the bubble; only this much is spoken.
  var MAX_SPOKEN = 360;

  /** references/speech.md — sentence splitter, kept verbatim. */
  function splitSentences(text) {
    return String(text || '').match(/[^.!?]+[.!?]+["”)]*|[^.!?]+$/g) || [];
  }

  /* Markdown would otherwise be read aloud as punctuation soup. */
  function forSpeech(text) {
    var t = String(text || '')
      .replace(/[*_`#>]/g, ' ')
      .replace(/\[(.+?)\]\(.*?\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length <= MAX_SPOKEN) return t;
    // Trim to whole sentences, never mid-word.
    var out = '';
    var parts = splitSentences(t);
    for (var i = 0; i < parts.length; i++) {
      if ((out + parts[i]).length > MAX_SPOKEN) break;
      out += parts[i];
    }
    return (out || t.slice(0, MAX_SPOKEN)).trim();
  }

  /* Voice preference. The avatar is male, so male voices lead — the reference
     warns that a bare {lang} preference will happily pick the wrong gender.
     Indian English first (it is his accent), then other English males, then
     any en voice. Matched as case-insensitive substrings on name or lang. */
  var VOICE_PREFERENCES = [
    'en-IN', 'Ravi', 'Prabhat', 'Hemant',
    'Google UK English Male', 'Daniel', 'Arthur', 'Oliver',
    'Microsoft Ravi', 'Microsoft George', 'Microsoft Guy',
    'en-GB', 'en-AU', 'en-US', 'en',
  ];

  var voicesReady = null;
  function loadVoices() {
    if (voicesReady) return voicesReady;
    voicesReady = new Promise(function (resolve) {
      if (!window.speechSynthesis) return resolve([]);
      var list = window.speechSynthesis.getVoices();
      if (list && list.length) return resolve(list);
      /* getVoices() is empty until `voiceschanged` fires — and some browsers
         never fire it at all, so this must not wait forever. */
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        resolve(window.speechSynthesis.getVoices() || []);
      };
      window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
      setTimeout(finish, 1500);
    });
    return voicesReady;
  }

  function pickVoice(voices) {
    for (var i = 0; i < VOICE_PREFERENCES.length; i++) {
      var want = VOICE_PREFERENCES[i].toLowerCase();
      for (var j = 0; j < voices.length; j++) {
        var v = voices[j];
        if ((v.name + ' ' + v.lang).toLowerCase().indexOf(want) !== -1) return v;
      }
    }
    return voices[0] || null;
  }

  function createSpeaker() {
    var enabled = false;
    var current = null;         // active utterance
    var syntheticTimers = [];
    var stopped = false;

    function clearSynthetic() {
      for (var i = 0; i < syntheticTimers.length; i++) clearTimeout(syntheticTimers[i]);
      syntheticTimers = [];
    }

    function cancel() {
      stopped = true;
      clearSynthetic();
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      current = null;
    }

    /* Synthetic word pacing.
     *
     * Some voices never fire `boundary` events at all, and clip-based tiers
     * never will. The reference's guidance: estimate per-word duration from
     * word length, then SCALE the schedule to the real duration. Mouth
     * precision does not matter; rhythm does.
     *
     * Fired unconditionally alongside the real events would double-drive the
     * mouth, so this only starts if no boundary event has arrived.
     */
    function scheduleSynthetic(words, totalMs, onWord) {
      var weights = words.map(function (w) { return Math.max(2, w.length); });
      var sum = weights.reduce(function (a, b) { return a + b; }, 0) || 1;
      var at = 0;
      words.forEach(function (w, i) {
        var share = (weights[i] / sum) * totalMs;
        var when = at;
        at += share;
        syntheticTimers.push(setTimeout(function () {
          onWord(w, share);
        }, when));
      });
    }

    function speakSentence(text, onWord) {
      return new Promise(function (resolve) {
        if (!window.speechSynthesis) return resolve();
        var u = new SpeechSynthesisUtterance(text);
        u.rate = Math.max(0.5, Math.min(2, RATE));
        if (createSpeaker.voice) u.voice = createSpeaker.voice;
        u.lang = (createSpeaker.voice && createSpeaker.voice.lang) || 'en-IN';

        var words = text.split(/\s+/).filter(Boolean);
        var gotBoundary = false;

        u.onboundary = function (e) {
          if (e.name && e.name !== 'word') return;
          gotBoundary = true;
          clearSynthetic();
          var slice = text.slice(e.charIndex).split(/\s+/)[0] || '';
          if (slice) onWord(slice, 220);
        };

        /* An utterance that is cut off, errors, or never speaks must not hang
           the queue — every tier in this design falls through silently. */
        var settled = false;
        var finish = function () {
          if (settled) return;
          settled = true;
          clearSynthetic();
          resolve();
        };
        u.onend = finish;
        u.onerror = finish;

        // Estimate duration so the synthetic pacer has a schedule: ~14 chars
        // per second at rate 1, scaled by the playback rate.
        var estMs = Math.max(700, (text.length / 14) * 1000 / u.rate);
        setTimeout(function () {
          if (!gotBoundary && !settled) scheduleSynthetic(words, estMs, onWord);
        }, 120);

        // Hard ceiling: speechSynthesis can wedge with no event at all.
        setTimeout(finish, estMs + 4000);

        current = u;
        try { window.speechSynthesis.speak(u); } catch (e) { finish(); }
      });
    }

    /**
     * speak(text, { onWord, onEnd }) — the facade.
     * Sentence-by-sentence because long utterances are silently truncated.
     */
    async function speak(text, opts) {
      opts = opts || {};
      var onWord = opts.onWord || function () {};
      if (!enabled) { if (opts.onEnd) opts.onEnd(); return; }

      cancel();
      stopped = false;

      if (!createSpeaker.voice) {
        var voices = await loadVoices();
        createSpeaker.voice = pickVoice(voices);
      }

      var spoken = forSpeech(text);
      var sentences = splitSentences(spoken);
      for (var i = 0; i < sentences.length; i++) {
        if (stopped) break;
        var s = sentences[i].trim();
        if (s) await speakSentence(s, onWord);
      }
      if (opts.onEnd) opts.onEnd();
    }

    return {
      speak: speak,
      cancel: cancel,
      isEnabled: function () { return enabled; },
      setEnabled: function (v) {
        enabled = !!v;
        if (!enabled) cancel();
        return enabled;
      },
      supported: !!window.speechSynthesis,
      forSpeech: forSpeech,
      splitSentences: splitSentences,
    };
  }

  G.createSpeaker = createSpeaker;
})();
