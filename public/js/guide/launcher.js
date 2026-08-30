/* Guide — launcher. The one public entry point.
 *
 * Mounts a button into #guideLauncherSlot (the reserved spot in the single
 * floating action stack, above WhatsApp — one stack, not two competing
 * circles). The panel is constructed on FIRST OPEN, so a visitor who never
 * asks anything pays nothing beyond this button.
 */
(function () {
  'use strict';

  var G = (window.Guide = window.Guide || {});

  function mount() {
    var slot = document.getElementById('guideLauncherSlot');
    // No slot means this page does not offer the guide. Not an error.
    if (!slot || slot.dataset.guideMounted) return;
    slot.dataset.guideMounted = '1';

    var btn = document.createElement('button');
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

    var panel = null;

    function toggle() {
      if (!panel) {
        // Built once, on demand. Phase 2's stage import hangs off this same
        // moment so three.js is never fetched for a visitor who never opens it.
        panel = G.createPanel({
          onOpen: function () { btn.setAttribute('aria-expanded', 'true'); },
          onClose: function () {
            btn.setAttribute('aria-expanded', 'false');
            btn.focus();
          },
        });
        document.body.appendChild(panel.el);
      }
      if (panel.isOpen()) panel.close(); else panel.open();
    }

    btn.addEventListener('click', toggle);
    slot.appendChild(btn);

    /* Keep the panel clear of the floating stack.
     *
     * Measured rather than hardcoded: the panel first sat at a fixed
     * `bottom: 92px` and overlapped its own launcher (panel bottom 808 against
     * a button spanning 768-820). A magic number would also drift the moment a
     * third action is added to the stack, or the labels are hidden at the
     * mobile breakpoint, which changes the stack's height. Measuring is
     * self-correcting; the CSS reads the variable and falls back if this never
     * runs. */
    var stack = document.getElementById('actionStack');
    function measure() {
      if (!stack) return;
      var box = stack.getBoundingClientRect();
      var clearance = Math.ceil(box.height + (window.innerHeight - box.bottom));
      document.documentElement.style.setProperty('--guide-stack-clearance', clearance + 'px');
    }
    measure();
    window.addEventListener('resize', measure);

    // Escape closes from anywhere, matching the ⌘K palette's behaviour.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel && panel.isOpen()) panel.close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  G.mount = mount;
})();
