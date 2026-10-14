// "Portal" into a project: clicking a project cover (category grid or homepage
// mosaic) opens the cover from where it sits until it fills the screen, then
// the project page arrives behind that same picture, which dissolves forward
// while the page settles in (see the inline script in Base.astro and the
// .portal styles). Modifier clicks, new tabs and reduced motion keep plain links.

const KEY = 'portal';

/** The picture currently shown in a cell: an image URL, or a still of a clip. */
function frameOf(cell: HTMLElement): string {
  const layers = Array.from(cell.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video'));
  const media = layers.find((m) => m.style.opacity !== '0') || layers[0];
  if (!media) return '';
  if (media instanceof HTMLImageElement) return media.currentSrc || media.src;
  if (media.readyState < 2 || !media.videoWidth) return '';
  try {
    const k = Math.min(1, 1600 / media.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(media.videoWidth * k);
    c.height = Math.round(media.videoHeight * k);
    c.getContext('2d')!.drawImage(media, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  } catch {
    return '';
  }
}

function prefetch(href: string) {
  if (document.head.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'prefetch';
  l.href = href;
  document.head.appendChild(l);
}

function open(cell: HTMLAnchorElement) {
  const url = new URL(cell.href, location.href);
  const src = frameOf(cell);
  const r = cell.getBoundingClientRect();

  const el = document.createElement('div');
  el.className = 'portal';
  if (src) el.style.backgroundImage = `url("${src}")`;
  document.body.appendChild(el);

  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path: url.pathname, src, t: Date.now() }));
  } catch {}

  const anim = el.animate(
    [
      { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' },
      { left: '0px', top: '0px', width: window.innerWidth + 'px', height: window.innerHeight + 'px' },
    ],
    { duration: 640, easing: 'cubic-bezier(0.65, 0, 0.25, 1)', fill: 'both' },
  );
  anim.finished.then(() => { location.href = url.href; });
}

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll<HTMLAnchorElement>('a.grid-cell, a.tile').forEach((cell) => {
    cell.addEventListener('pointerenter', () => prefetch(cell.href), { once: true });
    cell.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open(cell);
    });
  });
}

// Coming back with the browser's Back button restores this page from cache:
// clear the expanded cover so the grid shows again.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) document.querySelectorAll('.portal:not(.portal--in)').forEach((p) => p.remove());
});
