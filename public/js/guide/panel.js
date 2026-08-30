/* Guide — the cutout.
 *
 * references/rendering.md §Stage: "The avatar is a CUTOUT floating over the
 * page — no Paper/card/window chrome. Users consistently prefer this; it reads
 * as a presence, not a widget." The first version of this file was exactly the
 * widget that warns against: a bordered panel with a header bar and the avatar
 * squeezed into a strip along the top.
 *
 * So the root is a transparent fixed container with pointer-events NONE, and
 * only the pieces that must be clickable turn them back on. The page stays
 * usable through the avatar, which is what makes it read as standing ON the
 * page rather than sitting in a box on top of it.
 *
 * Two states. IDLE is the avatar working at its laptop, small, docked to one
 * edge. OPEN raises it, switches the pose to attentive, and reveals the
 * transcript, chips and input pill stacked beneath.
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

  var svg = function (paths, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18)
      + '" aria-hidden="true">' + paths + '</svg>';
  };

  function createPanel(opts) {
    var engine = G.createEngine();
    var speaker = G.createSpeaker();

    var voiceOn = G.config.enableVoice && G.config.store.get(G.config.storageKeys.voice) === '1';
    speaker.setEnabled(voiceOn);

    // ---- root ------------------------------------------------------------
    var root = el('div', 'guide-root');
    root.dataset.state = 'idle';
    root.dataset.side = G.config.store.get(G.config.storageKeys.side) || 'left';

    // The figure: 3D canvas on desktop, a still image on small screens.
    var figure = el('button', 'guide-figure');
    figure.type = 'button';
    figure.setAttribute('aria-label', G.copy('aria', 'Open the assistant'));
    figure.setAttribute('aria-expanded', 'false');

    var dialog = el('div', 'guide-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', G.copy('title', 'Assistant'));

    var head = el('div', 'guide-head');
    head.appendChild(el('strong', 'guide-title', G.copy('title', 'Ask about Anmol')));
    head.appendChild(el('span', 'guide-sub', G.copy('subtitle', '')));
    dialog.appendChild(head);

    var log = el('div', 'guide-log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');

    var chips = el('div', 'guide-chips');

    var form = el('form', 'guide-bar');
    var input = el('input', 'guide-input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = G.copy('placeholder', 'Ask me anything...');
    input.setAttribute('aria-label', G.copy('placeholder', 'Ask me anything'));
    input.maxLength = G.config.limits.question;
    var send = el('button', 'guide-send');
    send.type = 'submit';
    send.setAttribute('aria-label', G.copy('send', 'Send'));
    send.innerHTML = svg('<path d="M4 12l16-8-6 8 6 8z" fill="currentColor"/>');
    form.appendChild(input);
    form.appendChild(send);

    dialog.appendChild(log);
    dialog.appendChild(chips);
    dialog.appendChild(form);

    // ---- controls, stacked beside the head -------------------------------
    var controls = el('div', 'guide-controls');

    var closeBtn = el('button', 'guide-ctl guide-ctl-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', G.copy('close', 'Close'));
    closeBtn.innerHTML = svg('<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');

    var sideBtn = el('button', 'guide-ctl guide-ctl-side');
    sideBtn.type = 'button';
    sideBtn.setAttribute('aria-label', G.copy('switchSide', 'Move to the other side'));
    sideBtn.innerHTML = svg('<path d="M9 7L4 12l5 5M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');

    var voiceBtn = el('button', 'guide-ctl guide-ctl-voice');
    voiceBtn.type = 'button';
    function paintVoice() {
      voiceBtn.setAttribute('aria-pressed', voiceOn ? 'true' : 'false');
      var label = voiceOn ? G.copy('speakOff', 'Turn voice off') : G.copy('speakOn', 'Turn voice on');
      voiceBtn.setAttribute('aria-label', label);
      voiceBtn.title = label;
      voiceBtn.innerHTML = voiceOn
        ? svg('<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>')
        : svg('<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
    }
    paintVoice();
    if (!speaker.supported || !G.config.enableVoice) voiceBtn.hidden = true;

    var resetBtn = el('button', 'guide-ctl guide-ctl-reset');
    resetBtn.type = 'button';
    resetBtn.setAttribute('aria-label', G.copy('reset', 'Start a new conversation'));
    resetBtn.title = resetBtn.getAttribute('aria-label');
    resetBtn.innerHTML = svg('<path d="M4 12a8 8 0 1 1 2.3 5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
    resetBtn.addEventListener('click', function () {
      engine.clear();
      log.textContent = '';
      speaker.cancel();
      bubble('guide', G.copy('greeting', ''));
      renderChips();
      input.focus();
    });

    controls.appendChild(resetBtn);
    controls.appendChild(closeBtn);
    if (G.config.showAvatar) controls.appendChild(sideBtn);
    controls.appendChild(voiceBtn);

    root.appendChild(controls);
    root.appendChild(figure);
    root.appendChild(dialog);

    // ---- transcript ------------------------------------------------------
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
      sources.slice(0, 3).forEach(function (s) {
        if (!s.url) return;
        var a = el('a', 'guide-source', s.title);
        a.href = s.url;
        a.addEventListener('click', function () { close_(); });
        wrap.appendChild(a);
      });
      if (wrap.children.length) after.appendChild(wrap);
    }

    // ---- figure ----------------------------------------------------------
    var stageApi = null;
    var stageTried = false;
    var still = null;

    function useStill() {
      if (still) return;
      still = el('img', 'guide-still');
      still.src = G.config.stillUrl;
      still.alt = '';
      still.setAttribute('aria-hidden', 'true');
      still.addEventListener('error', function () { root.classList.remove('has-figure'); });
      figure.appendChild(still);
      root.classList.add('has-figure');
    }

    function ensureFigure() {
      if (stageTried) return;
      // Avatar off: no figure at all, not even the still. The panel below
      // styles itself as an ordinary chat window when there is nothing to show.
      if (!G.config.showAvatar) { root.classList.add('no-figure'); return; }
      if (!window.WebGLRenderingContext) { useStill(); return; }
      var w = window.innerWidth;
      if (w === 0) return;                        // unlaid-out page; retry on open
      /* Small screens get the still image rather than ~15MB of three.js and
         model. The presence is worth having on a phone; the download is not. */
      if (w <= 700) { useStill(); return; }

      stageTried = true;
      import(G.config.stageEntry)
        .then(function (mod) {
          return mod.createStage(figure, { modelUrl: G.config.modelUrl, mode: 'working' });
        })
        .then(function (s) {
          stageApi = s;
          root.classList.add('has-figure', 'has-stage');
          var reduce = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!reduce) s.start();
        })
        .catch(function (err) {
          // Never leave an empty hole where the avatar should be.
          useStill();
          if (window.console && console.warn) console.warn('[guide] 3D unavailable:', err && err.message);
        });
    }

    // ---- ask -> deliver --------------------------------------------------
    var busy = false;
    var beatTimer = null;

    function deliver(text, gesture) {
      if (stageApi) { if (gesture) stageApi.play(gesture); else stageApi.playFromPool(); }
      if (!speaker.isEnabled() || !text) return;
      if (beatTimer) clearInterval(beatTimer);
      // Talk beats: the hands must not die halfway through a long answer.
      beatTimer = setInterval(function () { if (stageApi) stageApi.playFromPool(); }, 5500);
      speaker.speak(text, {
        onWord: function (w, ms) { if (stageApi) stageApi.sayWord(w, ms); },
        onEnd: function () {
          if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
          if (stageApi) stageApi.stopSpeaking();
        },
      });
    }

    function submit(question) {
      if (busy) return;
      var q = String(question || '').trim();
      if (!q) return;
      busy = true;
      input.value = '';
      chips.hidden = true;
      bubble('visitor', q);
      var thinking = bubble('guide guide-thinking', G.copy('thinking', 'Thinking...'));

      engine.ask(q).then(function (res) {
        if (!res) { thinking.remove(); busy = false; return; }
        thinking.remove();
        var b = bubble('guide', res.answer || '');
        addSources(b, res.sources);
        log.scrollTop = log.scrollHeight;
        busy = false;
        input.focus();
        deliver(res.speech || res.answer || '', res.gesture);
      });
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); submit(input.value); });

    function renderChips() {
      chips.textContent = '';
      (G.config.copy.suggestions || []).slice(0, 4).forEach(function (s) {
        var c = el('button', 'guide-chip', s);
        c.type = 'button';
        c.addEventListener('click', function () { submit(s); });
        chips.appendChild(c);
      });
      chips.hidden = !chips.children.length;
    }

    // ---- open / close ----------------------------------------------------
    var greeted = false;

    /* Replay whatever the visitor already said this session.
     *
     * Runs once, before the first greeting decision, so a returning visitor
     * sees their own conversation rather than an empty panel and a greeting
     * that ignores it. Following a source link and coming back is the common
     * case, and the guide's own citations navigate. */
    var restored = false;
    function restore() {
      if (restored) return;
      restored = true;
      var prior = engine.history();
      if (!prior.length) return false;
      prior.forEach(function (turn) {
        var b = bubble(turn.role === 'visitor' ? 'visitor' : 'guide', turn.text);
        if (turn.role !== 'visitor') addSources(b, turn.sources);
      });
      log.scrollTop = log.scrollHeight;
      return true;
    }

    function open_() {
      if (root.dataset.state === 'open') return;
      ensureFigure();                       // covers a first open after a resize
      root.dataset.state = 'open';
      figure.setAttribute('aria-expanded', 'true');
      /* Stand up from the desk. The laptop goes away and the pose becomes
         attentive -- the visual cue that it is now listening rather than busy. */
      if (stageApi) {
        stageApi.setMode('attentive');
        stageApi.resize(figure.clientWidth, figure.clientHeight);
      }
      if (!greeted) {
        greeted = true;
        var hadTranscript = restore();
        if (!hadTranscript) {
          var seen = G.config.store.get(G.config.storageKeys.greeted);
          bubble('guide', seen ? G.copy('greetingReturn', G.copy('greeting', '')) : G.copy('greeting', ''));
          G.config.store.set(G.config.storageKeys.greeted, '1');
          renderChips();
        }
        // Chips are for a blank slate. Mid-conversation they are noise, and
        // re-offering "What does he do now?" after it has been answered reads
        // as the guide not having followed along.
      }
      setTimeout(function () { input.focus(); }, 0);
      if (opts && opts.onOpen) opts.onOpen();
    }

    function close_() {
      if (root.dataset.state === 'idle') return;
      root.dataset.state = 'idle';
      figure.setAttribute('aria-expanded', 'false');
      if (stageApi) {
        stageApi.setMode('working');        // back to work
        stageApi.stopSpeaking();
        stageApi.resize(figure.clientWidth, figure.clientHeight);
      }
      speaker.cancel();
      if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
      if (opts && opts.onClose) opts.onClose();
    }

    figure.addEventListener('click', function () {
      if (root.dataset.state === 'open') close_(); else open_();
    });
    closeBtn.addEventListener('click', close_);

    voiceBtn.addEventListener('click', function () {
      voiceOn = !voiceOn;
      speaker.setEnabled(voiceOn);
      G.config.store.set(G.config.storageKeys.voice, voiceOn ? '1' : '0');
      if (!voiceOn && stageApi) stageApi.stopSpeaking();
      paintVoice();
    });

    /* "Drag me to either side" is a button here, not a drag.
       A drag on a fixed overlay fights page scrolling on touch, and the only
       meaningful destinations are the two edges -- so a control that states the
       outcome beats a gesture the visitor has to discover. */
    sideBtn.addEventListener('click', function () {
      root.dataset.side = (root.dataset.side === 'left') ? 'right' : 'left';
      G.config.store.set(G.config.storageKeys.side, root.dataset.side);
      if (stageApi) stageApi.resize(figure.clientWidth, figure.clientHeight);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.dataset.state === 'open') close_();
    });

    // The figure appears on load; the rest waits for a click.
    if (document.readyState === 'complete') ensureFigure();
    else window.addEventListener('load', ensureFigure);

    return {
      el: root,
      open: open_,
      close: close_,
      isOpen: function () { return root.dataset.state === 'open'; },
      mountFigure: ensureFigure,
      stageApi: function () { return stageApi; },
    };
  }

  G.createPanel = createPanel;
})();
