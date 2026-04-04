/**
 * “How it works” dialog for demo controls (aligned with marketing Features copy).
 */
(function () {
  function init() {
    const openBtn = document.getElementById('features-help-open');
    const modal = document.getElementById('features-help-modal');
    const closeBtn = document.getElementById('features-help-close');
    const tourNote = document.getElementById('features-help-tour-note');
    if (!openBtn || !modal || !closeBtn) return;

    if (tourNote && document.getElementById('tour-toggle')) {
      tourNote.removeAttribute('hidden');
    }

    let lastFocus = null;

    function openModal() {
      lastFocus = document.activeElement;
      modal.removeAttribute('hidden');
      openBtn.setAttribute('aria-expanded', 'true');
      closeBtn.focus();
    }

    function closeModal() {
      modal.setAttribute('hidden', '');
      openBtn.setAttribute('aria-expanded', 'false');
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
      lastFocus = null;
    }

    openBtn.addEventListener('click', () => openModal());
    closeBtn.addEventListener('click', () => closeModal());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
        e.preventDefault();
        closeModal();
      }
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('how') === '1' || params.get('how') === 'true') {
      openModal();
      params.delete('how');
      const next =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : '') +
        window.location.hash;
      window.history.replaceState({}, '', next);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
