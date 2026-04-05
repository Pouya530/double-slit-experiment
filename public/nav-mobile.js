/**
 * Full-screen nav: burger + overlay. Narrow viewports always; desktop only on homepage (.site-header--home).
 */
const MQ = '(max-width: 799px)';

function initMobileNav() {
  const burger = document.getElementById('nav-burger');
  const overlay = document.getElementById('nav-mobile-overlay');
  const header = document.getElementById('site-header');
  if (!burger || !overlay) return;

  const mq = window.matchMedia(MQ);

  function isMobile() {
    return mq.matches;
  }

  function overlayEnabled() {
    return isMobile() || header?.classList.contains('site-header--home');
  }

  function open() {
    overlay.hidden = false;
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('nav-mobile-open');
    header?.classList.add('site-header--menu-open');
    const first = overlay.querySelector('.nav-mobile-main a');
    if (first) first.focus({ preventScroll: true });
  }

  function close() {
    overlay.hidden = true;
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('nav-mobile-open');
    header?.classList.remove('site-header--menu-open');
    burger.focus({ preventScroll: true });
  }

  function toggle() {
    if (overlay.hidden) open();
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
    if (e.key === 'Escape' && !overlay.hidden) {
      close();
    }
  });

  overlay.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      if (overlayEnabled()) close();
    });
  });

  mq.addEventListener('change', (ev) => {
    if (!ev.matches && !header?.classList.contains('site-header--home') && !overlay.hidden) close();
  });
}

initMobileNav();
