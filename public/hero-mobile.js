/**
 * Mobile hero: crossfade between /img/1.png and /img/2.png only (see index.html + styles.css).
 * 3s between slide changes; disabled when prefers-reduced-motion or viewport > 799px.
 */
(function () {
  const MQ = '(max-width: 799px)';
  const mq = window.matchMedia(MQ);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const slides = document.querySelectorAll('.hero-mobile-slide');
  if (!slides.length) return;

  let idx = 0;
  let timer = null;

  function setActive(i) {
    slides.forEach(function (el, j) {
      if (j === i) el.classList.add('hero-mobile-slide--active');
      else el.classList.remove('hero-mobile-slide--active');
    });
  }

  function tick() {
    idx = (idx + 1) % slides.length;
    setActive(idx);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    slides.forEach(function (el) {
      el.classList.remove('hero-mobile-slide--active');
    });
  }

  function start() {
    stop();
    if (!mq.matches || reduce.matches) return;
    idx = 0;
    setActive(0);
    timer = setInterval(tick, 3000);
  }

  function onChange() {
    if (mq.matches && !reduce.matches) start();
    else stop();
  }

  mq.addEventListener('change', onChange);
  reduce.addEventListener('change', onChange);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onChange);
  } else {
    onChange();
  }
})();
