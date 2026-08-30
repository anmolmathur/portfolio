/* Guide — launcher. The one public entry point.
 *
 * The avatar is a presence on the page, so unlike a chat widget it mounts on
 * load rather than waiting for a click: the figure IS the affordance. What
 * stays lazy is everything behind it -- three.js and the model are fetched by
 * the panel's own figure logic, and on small screens never at all.
 *
 * A labelled button also goes into the floating action stack. The figure alone
 * is discoverable to someone who notices it, but a button that says what it
 * does is what a recruiter in a hurry actually clicks -- and it is the keyboard
 * and screen-reader path.
 */
(function () {
  'use strict';

  var G = (window.Guide = window.Guide || {});

  function mount() {
    if (document.getElementById('guideRoot')) return;

    var panel = G.createPanel({
      onOpen: function () { if (btn) btn.setAttribute('aria-expanded', 'true'); },
      onClose: function () { if (btn) btn.setAttribute('aria-expanded', 'false'); },
    });
    panel.el.id = 'guideRoot';
    document.body.appendChild(panel.el);

    var btn = null;
    var slot = document.getElementById('guideLauncherSlot');
    if (slot && !slot.dataset.guideMounted) {
      slot.dataset.guideMounted = '1';
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn action-guide';
      btn.setAttribute('aria-label', G.copy('aria', 'Open the assistant'));
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML =
        '<svg class="ico ico-lg" viewBox="0 0 24 24" aria-hidden="true">'
        + '<path d="M12 3c4.97 0 9 3.36 9 7.5 0 4.14-4.03 7.5-9 7.5a10 10 0 0 1-2.6-.34L5 20l.9-3.2C4.1 15.4 3 13.1 3 10.5 3 6.36 7.03 3 12 3z"'
        + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
        + '<circle cx="9" cy="10.5" r="1.1" fill="currentColor"/>'
        + '<circle cx="12" cy="10.5" r="1.1" fill="currentColor"/>'
        + '<circle cx="15" cy="10.5" r="1.1" fill="currentColor"/></svg>'
        + '<span class="action-label">' + G.copy('label', 'Ask') + '</span>';
      btn.addEventListener('click', function () {
        if (panel.isOpen()) panel.close(); else panel.open();
      });
      slot.appendChild(btn);
    }

    /* Keep the cutout clear of the floating action stack, measured rather than
       hardcoded: a fixed offset overlapped the launcher once already, and the
       stack's height changes when it gains a button or drops its labels. */
    var stack = document.getElementById('actionStack');
    function measure() {
      if (!stack) return;
      var box = stack.getBoundingClientRect();
      document.documentElement.style.setProperty(
        '--guide-stack-clearance',
        Math.ceil(box.height + (window.innerHeight - box.bottom)) + 'px');
    }
    measure();
    window.addEventListener('resize', function () {
      measure();
      // A phone rotated to landscape may now qualify for the 3D figure.
      panel.mountFigure();
    });

    G.panel = panel;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  G.mount = mount;
})();
