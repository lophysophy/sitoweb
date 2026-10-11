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
    if (v.getAttribute('src') !== h264) { v.src = h264; v.play().catch(() => {}); }
  });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  v.addEventListener('playing', () => v.classList.add('is-playing'), { once: true });

  function setPaused(paused: boolean) {
    if (paused) v!.pause();
    else { const p = v!.play(); if (p && p.catch) p.catch(() => {}); }
    toggle?.setAttribute('aria-pressed', paused ? 'true' : 'false');
    toggle?.setAttribute('aria-label', paused ? 'Play intro animation' : 'Pause intro animation');
    toggle?.classList.toggle('is-paused', paused);
  }

  if (reduce) {
    v.preload = 'metadata';
    setPaused(true);
  } else {
    v.preload = 'auto';
    setPaused(false);
  }
  toggle?.addEventListener('click', () => setPaused(!v.paused));

  // Off screen the loop rests (saves battery while browsing the work below).
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      if (toggle?.classList.contains('is-paused')) return;
      if (e.isIntersecting) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
      else v.pause();
    }).observe(v);
  }
})();
