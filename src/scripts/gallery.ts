// Client-side behaviour for the galleries. Markup is pre-rendered at build time;
// these only add motion: mosaic sizing, hover cycling, synced clips, lightbox.

function play(v: HTMLVideoElement) {
  const p = v.play();
  if (p && p.catch) p.catch(() => {});
}

// ---- Homepage mosaic --------------------------------------------------------
// Size the row so every image is at least as wide as its tile at the current
// screen width: the narrowest cover just fills (no white gap), the others crop
// a little (so the squeeze always has room).
function fitMosaic(m: HTMLElement) {
  if (getComputedStyle(m).flexDirection !== 'row') return; // stacked on mobile
  const tiles = m.querySelectorAll<HTMLElement>('.tile');
  const tileW = m.clientWidth / (tiles.length || 1);
  if (!tileW) return;
  let rowH = 0;
  tiles.forEach((t) => {
    const ar = parseFloat(t.style.getPropertyValue('--ar')) || 1.5;
    rowH = Math.max(rowH, tileW / ar);
  });
  const scale = parseFloat(m.dataset.scale || '') || 1;
  m.style.setProperty('--row-h', rowH * 1.06 * scale + 'px');
}

function wireMosaic(m: HTMLElement) {
  m.querySelectorAll<HTMLElement>('.tile').forEach((tile) => {
    const media = tile.querySelector<HTMLImageElement | HTMLVideoElement>('img, video')!;
    // Aspect ratios come from the build; only clips without one measure here.
    if (!tile.style.getPropertyValue('--ar')) {
      const setAR = () => {
        const w = (media as HTMLImageElement).naturalWidth || (media as HTMLVideoElement).videoWidth;
        const h = (media as HTMLImageElement).naturalHeight || (media as HTMLVideoElement).videoHeight;
        if (w && h) { tile.style.setProperty('--ar', (w / h).toFixed(4)); fitMosaic(m); }
      };
      if (media.tagName === 'VIDEO') {
        if ((media as HTMLVideoElement).videoWidth) setAR(); else media.addEventListener('loadedmetadata', setAR);
      } else if ((media as HTMLImageElement).complete) setAR();
      else media.addEventListener('load', setAR);
    }
    // On hover grow to max(current width, full image width): reveals the whole
    // image and never shrinks a tile that already has room.
    tile.addEventListener('mouseenter', () => {
      if (getComputedStyle(m).flexDirection !== 'row') return;
      const ar = parseFloat(tile.style.getPropertyValue('--ar')) || 1.5;
      const rowH = parseFloat(getComputedStyle(m).height) || 0;
      const target = Math.max(tile.getBoundingClientRect().width, rowH * ar);
      if (target > 0) tile.style.flex = '0 0 ' + target + 'px';
    });
    tile.addEventListener('mouseleave', () => { tile.style.flex = ''; });
  });
  fitMosaic(m);
}

// ---- Category grid: hover cycling ------------------------------------------
// One cadence for every category: a frame every CYCLE_MS.
const CYCLE_MS = 700;

function wireCycle(cell: HTMLElement) {
  const media = cell.querySelector<HTMLElement>('.grid-img');
  let frames: string[] = [];
  try { frames = JSON.parse(cell.dataset.frames || '[]'); } catch {}
  if (!media || frames.length < 2) return;
  if (media.tagName === 'VIDEO') wireVideoCycle(cell, media as HTMLVideoElement, frames);
  else wireImageCycle(cell, media as HTMLImageElement, frames);
}

// Image cells: flip the stills by swapping the element's src. The responsive
// srcset is set aside while cycling and restored on leave.
function wireImageCycle(cell: HTMLElement, img: HTMLImageElement, frames: string[]) {
  const restSrc = img.getAttribute('src')!;
  const restSet = img.getAttribute('srcset');
  let idx = 0, timer: number | null = null, warmed = false;
  function start() {
    if (timer) return;
    if (!warmed) { warmed = true; frames.forEach((f) => { const i = new Image(); i.src = f; }); }
    timer = window.setInterval(() => {
      idx = (idx + 1) % frames.length;
      img.removeAttribute('srcset');
      img.src = frames[idx];
    }, CYCLE_MS);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    idx = 0;
    if (restSet) img.setAttribute('srcset', restSet);
    img.src = restSrc;
  }
  cell.addEventListener('mouseenter', start);
  cell.addEventListener('mouseleave', stop);
}

// Video cells: stack one <video> per clip and switch with an instant opacity
// cut (no black flash). Extra layers are built on first hover, so the page only
// loads the cover clips up front.
function wireVideoCycle(cell: HTMLElement, cover: HTMLVideoElement, srcs: string[]) {
  let layers: HTMLVideoElement[] | null = null, idx = 0, timer: number | null = null;
  function build() {
    layers = [cover];
    for (let i = 1; i < srcs.length; i++) {
      const v = document.createElement('video');
      v.className = 'grid-img';
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.style.opacity = '0';
      v.src = srcs[i];
      cell.insertBefore(v, cover.nextSibling);
      layers.push(v);
    }
  }
  function show(i: number) {
    idx = (i + layers!.length) % layers!.length;
    layers!.forEach((l, k) => { l.style.opacity = k === idx ? '1' : '0'; });
  }
  function start() {
    if (!layers) build();
    layers!.forEach(play); // keep every layer live and decoded
    if (timer) return;
    timer = window.setInterval(() => show(idx + 1), CYCLE_MS);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (!layers) return;
    show(0);
    for (let k = 1; k < layers.length; k++) layers[k].pause();
  }
  cell.addEventListener('mouseenter', start);
  cell.addEventListener('mouseleave', stop);
}

// ---- Project page: synced side-by-side clips --------------------------------
// Clips in a pair-row (a base piece and its COMP) must start together. Hold
// every clip until all are buffered, start them on the same tick, and drive the
// loop from one "master" so they stay locked cycle to cycle.
// iOS details matter here: listen to loadeddata as well as canplay, call load()
// on paused clips, and start anyway after 3s so a row never stays blank.
function syncGroup(vids: HTMLVideoElement[]) {
  vids.forEach((v) => {
    v.autoplay = false; v.removeAttribute('autoplay');
    v.loop = false; v.removeAttribute('loop'); // the master drives the loop
    v.preload = 'auto';
    try { v.pause(); } catch {}
  });
  const master = vids[0];
  let started = false, visible = true;
  const seen: boolean[] = [];
  function startAll() {
    if (!visible) return;
    vids.forEach((v) => { try { v.currentTime = 0; } catch {} });
    vids.forEach(play);
  }
  function markReady(idx: number) {
    if (seen[idx]) return;
    seen[idx] = true;
    if (started) return;
    if (vids.every((_v, i) => seen[i])) { started = true; startAll(); }
  }
  master.addEventListener('ended', startAll);
  vids.forEach((v, idx) => {
    if (v.readyState >= 3) { markReady(idx); return; }
    const on = () => markReady(idx);
    v.addEventListener('canplay', on);
    v.addEventListener('loadeddata', on);
    try { v.load(); } catch {}
  });
  setTimeout(() => { if (!started) { started = true; startAll(); } }, 3000);

  // Rows scrolled out of view rest, and restart together when they come back.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      const now = entries[entries.length - 1].isIntersecting;
      if (now === visible) return;
      visible = now;
      if (!started) return;
      if (visible) startAll(); else vids.forEach((v) => v.pause());
    }, { rootMargin: '200px 0px' }).observe(master.parentElement || master);
  }
}

// Single clips also pause while off screen.
function wireSoloClips(root: HTMLElement) {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting) play(v); else v.pause();
    });
  }, { rootMargin: '200px 0px' });
  root.querySelectorAll<HTMLVideoElement>('.project-gallery > video').forEach((v) => io.observe(v));
}

// ---- Lightbox --------------------------------------------------------------
// Every still on a project page opens full screen; arrows, swipe and Esc work.
function wireLightbox(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-zoom]'));
  if (!imgs.length) return;
  const dlg = document.createElement('dialog');
  dlg.className = 'lightbox';
  dlg.setAttribute('aria-label', 'Image viewer');
  dlg.innerHTML =
    '<img class="lightbox-img" alt="" tabindex="-1" autofocus>' +
    '<button class="lightbox-btn lightbox-close" type="button" aria-label="Close">×</button>' +
    '<button class="lightbox-btn lightbox-prev" type="button" aria-label="Previous image">‹</button>' +
    '<button class="lightbox-btn lightbox-next" type="button" aria-label="Next image">›</button>' +
    '<p class="lightbox-count" aria-live="polite"></p>';
  document.body.appendChild(dlg);
  const big = dlg.querySelector<HTMLImageElement>('.lightbox-img')!;
  const count = dlg.querySelector<HTMLElement>('.lightbox-count')!;
  let group: HTMLImageElement[] = [], idx = 0, opener: HTMLElement | null = null;

  function show(i: number) {
    idx = (i + group.length) % group.length;
    big.src = group[idx].dataset.zoom!;
    big.alt = group[idx].alt;
    count.textContent = group.length > 1 ? `${idx + 1} / ${group.length}` : '';
    dlg.classList.toggle('is-single', group.length < 2);
  }
  function open(img: HTMLImageElement) {
    // Navigate within the block the image belongs to (the main gallery or one
    // storyboard grid), in page order.
    const scope = img.closest('[data-zoom-group]') || root;
    group = imgs.filter((i) => scope.contains(i));
    opener = img;
    show(group.indexOf(img));
    dlg.showModal();
    document.documentElement.classList.add('lightbox-open');
  }
  dlg.addEventListener('close', () => {
    document.documentElement.classList.remove('lightbox-open');
    big.removeAttribute('src');
    opener?.focus({ preventScroll: true });
  });
  dlg.querySelector('.lightbox-close')!.addEventListener('click', () => dlg.close());
  dlg.querySelector('.lightbox-prev')!.addEventListener('click', () => show(idx - 1));
  dlg.querySelector('.lightbox-next')!.addEventListener('click', () => show(idx + 1));
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target === big) dlg.close(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(idx + 1);
    else if (e.key === 'ArrowLeft') show(idx - 1);
  });
  let x0: number | null = null;
  dlg.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  dlg.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) show(dx < 0 ? idx + 1 : idx - 1);
  });

  imgs.forEach((img) => {
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', (img.alt ? img.alt + '. ' : '') + 'Open full screen');
    img.addEventListener('click', () => open(img));
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(img); }
    });
  });
}

// ---- YouTube facade ---------------------------------------------------------
// The film loads only when asked for: a still and a play button until then.
function wireFilms(root: ParentNode) {
  root.querySelectorAll<HTMLButtonElement>('[data-youtube]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.youtube!;
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`;
      f.title = btn.dataset.title || 'Video';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.allowFullscreen = true;
      btn.replaceWith(f);
    });
  });
}

// ---- Wire up -----------------------------------------------------------------
document.querySelectorAll<HTMLElement>('[data-mosaic]').forEach(wireMosaic);
window.addEventListener('resize', () => document.querySelectorAll<HTMLElement>('[data-mosaic]').forEach(fitMosaic));
document.querySelectorAll<HTMLElement>('.grid-cell').forEach(wireCycle);

const project = document.querySelector<HTMLElement>('[data-project]');
if (project) {
  project.querySelectorAll('.pair-row').forEach((row) => {
    const vids = Array.from(row.querySelectorAll('video'));
    if (vids.length >= 2) syncGroup(vids);
  });
  wireSoloClips(project);
  wireLightbox(project);
}
wireFilms(document);
