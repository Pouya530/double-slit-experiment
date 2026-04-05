/**
 * Desktop hero (≥800px): subtle parallax zoom on scroll for .hero-desktop-fullbleed__scale.
 * Disabled when prefers-reduced-motion: reduce.
 */
(function () {
  const MQ = '(min-width: 800px)';
  const mq = window.matchMedia(MQ);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scaleEl = document.getElementById('hero-desktop-parallax-scale');
  const hero = document.querySelector('.hero');
  if (!scaleEl || !hero) return;

  const SCALE_EXTRA = 0.055;
  const SCROLL_RANGE = 1.35;

  function apply() {
    if (!mq.matches || reduce.matches) {
      scaleEl.style.transform = '';
      scaleEl.style.webkitTransform = '';
      return;
    }
    const y = window.scrollY || window.pageYOffset;
    const vh = window.innerHeight || 1;
    const t = Math.min(1, Math.max(0, y / (vh * SCROLL_RANGE)));
    const scale = 1 + SCALE_EXTRA * t;
    const s = scale.toFixed(4);
    scaleEl.style.transform = 'scale(' + s + ')';
    scaleEl.style.webkitTransform = 'scale(' + s + ')';
  }

  let ticking = false;
  function onScrollOrResize() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function () {
        apply();
        ticking = false;
      });
    }
  }

  mq.addEventListener('change', apply);
  reduce.addEventListener('change', apply);
  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize);
  apply();
})();
