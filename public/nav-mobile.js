/**
 * Full-screen nav: burger + overlay. Narrow viewports always; desktop burger only on homepage (.site-header--home).
 * Open state uses .nav-mobile-overlay--open (not [hidden]) so CSS transitions can run.
 */
const MQ = '(max-width: 799px)';

function isOverlayOpen(overlay) {
  return overlay.classList.contains('nav-mobile-overlay--open');
}

function initMobileNav() {
  const burger = document.getElementById('nav-burger');
  const overlay = document.getElementById('nav-mobile-overlay');
  const header = document.getElementById('site-header');
  if (!burger || !overlay) return;

  overlay.removeAttribute('hidden');
  if (!overlay.hasAttribute('aria-hidden')) {
    overlay.setAttribute('aria-hidden', 'true');
  }
  overlay.setAttribute('inert', '');

  const mq = window.matchMedia(MQ);

  function isMobile() {
    return mq.matches;
  }

  function overlayEnabled() {
    return isMobile() || header?.classList.contains('site-header--home');
  }

  function open() {
    overlay.removeAttribute('inert');
    overlay.classList.add('nav-mobile-overlay--open');
    overlay.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('nav-mobile-open');
    header?.classList.add('site-header--menu-open');
    overlay.focus({ preventScroll: true });
  }

  function close() {
    if (!isOverlayOpen(overlay)) return;

    overlay.classList.remove('nav-mobile-overlay--open');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('inert', '');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');

    const finish = () => {
      document.body.classList.remove('nav-mobile-open');
      header?.classList.remove('site-header--menu-open');
      burger.focus({ preventScroll: true });
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      finish();
      return;
    }

    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      overlay.removeEventListener('transitionend', onEnd);
      clearTimeout(fallback);
      finish();
    };

    const onEnd = (e) => {
      if (e.target !== overlay) return;
      if (e.propertyName !== 'transform' && e.propertyName !== 'opacity') return;
      complete();
    };

    overlay.addEventListener('transitionend', onEnd);
    const homeDesktop =
      document.body.classList.contains('page-home') &&
      window.matchMedia('(min-width: 800px)').matches;
    const fallbackMs = homeDesktop ? 560 : 400;
    const fallback = window.setTimeout(complete, fallbackMs);
  }

  function toggle() {
    if (!isOverlayOpen(overlay)) open();
    else close();
  }

  burger.addEventListener('click', () => {
    if (!overlayEnabled()) return;
    toggle();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOverlayOpen(overlay)) {
      close();
    }
  });

  overlay.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      if (overlayEnabled()) close();
    });
  });

  mq.addEventListener('change', (ev) => {
    if (!ev.matches && !header?.classList.contains('site-header--home') && isOverlayOpen(overlay)) {
      close();
    }
  });
}

/** Homepage header: transparent at top, dark bar after scroll (mobile + desktop). */
function initHomeHeaderScroll() {
  const header = document.getElementById('site-header');
  if (!header?.classList.contains('site-header--home')) return;

  const scrolledClass = 'site-header--scrolled';
  const thresholdPx = 20;
  let ticking = false;

  function sync() {
    ticking = false;
    if (window.scrollY > thresholdPx) header.classList.add(scrolledClass);
    else header.classList.remove(scrolledClass);
  }

  function requestSync() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(sync);
    }
  }

  window.addEventListener('scroll', requestSync, { passive: true });
  window.addEventListener('resize', requestSync);
  sync();
}

initMobileNav();
initHomeHeaderScroll();
