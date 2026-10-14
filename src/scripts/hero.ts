// Homepage intro. Phones get the portrait crop, larger screens the wide cut, and
// AV1 where the device decodes it (smaller files). Choosing in JS means only the
// file actually used is downloaded. The poster image sits underneath until the
// first frame is ready. Reduced-motion users start paused.
(function () {
  const v = document.querySelector<HTMLVideoElement>('.hero-video');
  const toggle = document.querySelector<HTMLButtonElement>('.hero-toggle');
  if (!v) return;

  const mobile = window.matchMedia('(max-width: 768px)').matches;
  const av1 = v.canPlayType('video/mp4; codecs="av01.0.08M.08"') === 'probably';
  const d = v.dataset;
  const h264 = (mobile ? d.mobile : d.desktop) || d.desktop!;
  v.src = (av1 && (mobile ? d.mobileAv1 : d.desktopAv1)) || h264;
  // If the AV1 file can't be played after all, fall back to H.264 once.
  v.addEventListener('error', () => {
    if (v.getAttribute('src') === h264) return;
    v.src = h264;
    if (!wantPaused) v.play().catch(() => {});
  });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = (navigator as any).connection;
  const saveData = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));
  v.addEventListener('playing', () => v.classList.add('is-playing'), { once: true });

  // The button shows what the video is actually doing (a refused play(), e.g.
  // in iOS Low Power Mode, leaves it paused and the button says so).
  let wantPaused = reduce || saveData;
  const sync = () => {
    toggle?.setAttribute('aria-pressed', v.paused ? 'true' : 'false');
    toggle?.classList.toggle('is-paused', v.paused);
  };
  v.addEventListener('play', sync);
  v.addEventListener('pause', sync);
  const start = () => { const p = v.play(); if (p && p.catch) p.catch(sync); };

  toggle?.addEventListener('click', () => {
    wantPaused = !v.paused;
    if (wantPaused) v.pause();
    else { v.preload = 'auto'; start(); }
  });
  sync();

  // Start once the page itself has loaded, so the film doesn't compete with the
  // poster, fonts and first images. Reduced motion and data saving start paused.
  let begun = false, onScreen = true;
  const begin = () => {
    begun = true;
    if (wantPaused) { v.preload = 'metadata'; return; }
    v.preload = 'auto';
    if (onScreen) start();
  };
  if (document.readyState === 'complete') begin();
  else window.addEventListener('load', begin, { once: true });

  // Off screen the loop rests (saves battery while browsing the work below).
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (!begun || wantPaused) return;
      if (onScreen) start();
      else v.pause();
    }).observe(v);
  }
})();
