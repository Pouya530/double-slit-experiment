/**
 * Toggle browser fullscreen on `.demo-layout` (advanced + classic demo pages).
 * Dispatches `resize` so WebGL canvases update. No-op if API missing.
 */
(function () {
  const root = document.querySelector('.demo-layout');
  const btn = document.getElementById('demo-fullscreen-btn');
  if (!root || !btn) return;

  function getFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function isLayoutFullscreen() {
    return getFullscreenElement() === root;
  }

  function triggerResize() {
    window.dispatchEvent(new Event('resize'));
  }

  function updateButton() {
    const on = isLayoutFullscreen();
    btn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Exit fullscreen' : 'Fullscreen';
    const label = btn.querySelector('.fullscreen-label');
    if (label) label.textContent = on ? 'Exit' : 'Full screen';
  }

  function onFullscreenChange() {
    updateButton();
    requestAnimationFrame(triggerResize);
  }

  async function toggle() {
    try {
      const current = getFullscreenElement();
      if (current) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
      } else {
        const req =
          root.requestFullscreen ||
          root.webkitRequestFullscreen ||
          root.msRequestFullscreen;
        if (req) await req.call(root);
      }
    } catch (_) {
      /* denied, unsupported (e.g. some mobile browsers) */
    }
    updateButton();
    requestAnimationFrame(triggerResize);
  }

  btn.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  document.addEventListener('MSFullscreenChange', onFullscreenChange);
  updateButton();
})();
