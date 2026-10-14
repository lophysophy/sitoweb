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
    const grow = () => {
      if (getComputedStyle(m).flexDirection !== 'row') return;
      const ar = parseFloat(tile.style.getPropertyValue('--ar')) || 1.5;
      const rowH = parseFloat(getComputedStyle(m).height) || 0;
      const target = Math.max(tile.getBoundingClientRect().width, rowH * ar);
      if (target > 0) tile.style.flex = '0 0 ' + target + 'px';
    };
    const rest = () => { tile.style.flex = ''; };
    tile.addEventListener('mouseenter', grow);
    tile.addEventListener('mouseleave', rest);
    tile.addEventListener('focus', grow); // keyboard users get the same reveal
    tile.addEventListener('blur', rest);
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
  cell.addEventListener('focus', start); // keyboard users see the cycle too
  cell.addEventListener('blur', stop);
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
  cell.addEventListener('focus', start);
  cell.addEventListener('blur', stop);
}

// ---- Project page: synced side-by-side clips --------------------------------
// Clips in a pair-row (a base piece and its COMP) must start together. Hold
// every clip until all are buffered, start them on the same tick, and drive the
// loop from one "master" so they stay locked cycle to cycle.
// iOS details matter here: listen to loadeddata as well as canplay, call load()
// on paused clips, and start anyway after 3s so a row never stays blank.
// Rows only start buffering when they come near the screen, so a long project
// doesn't download every clip up front.
function syncGroup(vids: HTMLVideoElement[]) {
  vids.forEach((v) => {
    v.autoplay = false; v.removeAttribute('autoplay');
    v.loop = false; v.removeAttribute('loop'); // the master drives the loop
    try { v.pause(); } catch {}
  });
  const master = vids[0];
  let started = false, visible = false, armed = false;
  const seen: boolean[] = [];
  const box = master.parentElement as HTMLElement;
  function startAll() {
    if (!visible || box.dataset.paused === 'true') return;
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
  // The row's pause button resumes through here, so the clips restart together.
  box.dataset.synced = 'true';
  box.addEventListener('clip-resume', () => { if (started) startAll(); });
  function arm() {
    if (armed) return;
    armed = true;
    vids.forEach((v, idx) => {
      v.preload = 'auto';
      if (v.readyState >= 3) { markReady(idx); return; }
      const on = () => markReady(idx);
      v.addEventListener('canplay', on);
      v.addEventListener('loadeddata', on);
      try { v.load(); } catch {}
    });
    setTimeout(() => { if (!started) { started = true; startAll(); } }, 3000);
  }

  // Rows scrolled out of view rest, and restart together when they come back.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      const now = entries[entries.length - 1].isIntersecting;
      if (now) arm();
      if (now === visible) return;
      visible = now;
      if (!started) return;
      if (visible) startAll(); else vids.forEach((v) => v.pause());
    }, { rootMargin: '400px 0px' }).observe(box);
  } else {
    visible = true;
    arm();
  }
}

// Single clips also pause while off screen.
function wireSoloClips(root: HTMLElement) {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = e.target as HTMLVideoElement;
      if (!e.isIntersecting) v.pause();
      else if ((v.closest('.clip, .pair-row') as HTMLElement).dataset.paused !== 'true') play(v);
    });
  }, { rootMargin: '200px 0px' });
  root.querySelectorAll<HTMLVideoElement>('.clip > video, .pair-row:not([data-synced]) > video').forEach((v) => io.observe(v));
}

// Pause / play buttons: one per clip, one per side-by-side row (the row's clips
// pause together, so they stay in sync when they resume).
function wireClipToggles(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('.clip-toggle').forEach((btn) => {
    const box = btn.parentElement as HTMLElement;
    const vids = Array.from(box.querySelectorAll('video'));
    btn.addEventListener('click', () => {
      const paused = box.dataset.paused !== 'true';
      box.dataset.paused = String(paused);
      btn.setAttribute('aria-pressed', String(paused));
      btn.classList.toggle('is-paused', paused);
      if (paused) vids.forEach((v) => v.pause());
      else if (box.dataset.synced === 'true') box.dispatchEvent(new Event('clip-resume'));
      else vids.forEach(play);
    });
  });
}

// ---- Lightbox --------------------------------------------------------------
// Every still on a project page opens full screen; arrows, swipe and Esc work.
// Opening is a shared-element zoom: the piece lifts off the page from exactly
// where it sits and grows to full screen; closing sets it back in its place.
// The thumbnail already on screen is shown first (no blank frame), and the
// full-resolution file replaces it as soon as it's decoded.
function wireLightbox(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-zoom]'));
  if (!imgs.length) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

  const dlg = document.createElement('dialog');
  dlg.className = 'lightbox';
  dlg.setAttribute('aria-label', 'Image viewer');
  dlg.innerHTML =
    '<div class="lightbox-scrim"></div>' +
    '<img class="lightbox-img" alt="" tabindex="-1" autofocus>' +
    '<button class="lightbox-btn lightbox-close" type="button" aria-label="Close">×</button>' +
    '<button class="lightbox-btn lightbox-prev" type="button" aria-label="Previous image">‹</button>' +
    '<button class="lightbox-btn lightbox-next" type="button" aria-label="Next image">›</button>' +
    '<p class="lightbox-count" aria-live="polite"></p>';
  document.body.appendChild(dlg);
  const scrim = dlg.querySelector<HTMLElement>('.lightbox-scrim')!;
  const big = dlg.querySelector<HTMLImageElement>('.lightbox-img')!;
  const count = dlg.querySelector<HTMLElement>('.lightbox-count')!;
  const chrome = Array.from(dlg.querySelectorAll<HTMLElement>('.lightbox-btn, .lightbox-count'));
  let group: HTMLImageElement[] = [], idx = 0, opener: HTMLElement | null = null, busy = false;

  // Size the full view from the original's dimensions (the width/height
  // attributes), never upscaling past the original.
  function fit(img: HTMLImageElement) {
    const w = Number(img.getAttribute('width')) || img.naturalWidth;
    const h = Number(img.getAttribute('height')) || img.naturalHeight;
    const desktop = window.innerWidth > 768;
    const maxW = desktop ? Math.min(window.innerWidth * 0.92, window.innerWidth - 160) : window.innerWidth - 16;
    const maxH = desktop ? window.innerHeight * 0.88 : window.innerHeight - 128;
    const k = Math.min(maxW / w, maxH / h, 1);
    return [Math.round(w * k), Math.round(h * k)];
  }

  function setImage(img: HTMLImageElement) {
    const [w, h] = fit(img);
    big.style.width = w + 'px';
    big.style.height = h + 'px';
    big.alt = img.alt;
    big.src = img.currentSrc || img.src; // already decoded: appears instantly
    const full = new URL(img.dataset.zoom!, location.href).href;
    if (full !== big.src) {
      const pre = new Image();
      pre.src = full;
      pre.decode().then(() => { if (group[idx] === img) big.src = full; }).catch(() => {});
    }
    count.textContent = group.length > 1 ? `${idx + 1} / ${group.length}` : '';
    dlg.classList.toggle('is-single', group.length < 2);
  }

  // The transform that places the full view exactly over the thumbnail. When
  // the thumbnail is a crop (object-fit: cover), the full view is scaled to
  // cover the same box and clipped to it, so the motion starts from the crop.
  function fromThumb(thumb: HTMLImageElement) {
    const a = thumb.getBoundingClientRect();
    const b = big.getBoundingClientRect();
    const k = Math.max(a.width / b.width, a.height / b.height);
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    const ix = Math.max(0, (b.width - a.width / k) / 2);
    const iy = Math.max(0, (b.height - a.height / k) / 2);
    return [
      { transform: `translate(${dx}px, ${dy}px) scale(${k})`, clipPath: `inset(${iy}px ${ix}px)`, boxShadow: '0 0 0 rgba(0,0,0,0)' },
      { transform: 'none', clipPath: 'inset(0px 0px)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' },
    ];
  }

  const inView = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  };

  function open(img: HTMLImageElement) {
    if (busy || dlg.open) return;
    // Navigate within the block the image belongs to (the main gallery or one
    // storyboard grid), in page order.
    const scope = img.closest('[data-zoom-group]') || root;
    group = imgs.filter((i) => scope.contains(i));
    idx = group.indexOf(img);
    opener = img;
    setImage(img);
    dlg.showModal();
    document.documentElement.classList.add('lightbox-open');
    if (reduce) return;

    busy = true;
    img.style.visibility = 'hidden'; // the piece "lifts off" the page
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease', fill: 'both' });
    chrome.forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 300, fill: 'both' }));
    const anim = big.animate(fromThumb(img), { duration: 520, easing: EASE, fill: 'both' });
    anim.finished.then(() => { img.style.visibility = ''; busy = false; }, () => { img.style.visibility = ''; busy = false; });
  }

  function close() {
    if (!dlg.open || busy) return;
    const thumb = group[idx];
    if (reduce) { dlg.close(); return; }

    busy = true;
    big.getAnimations().forEach((a) => a.cancel());
    const back = thumb && inView(thumb);
    if (back) thumb.style.visibility = 'hidden';
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease', fill: 'both' });
    chrome.forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'both' }));
    const anim = back
      ? big.animate(fromThumb(thumb).reverse(), { duration: 440, easing: EASE, fill: 'both' })
      : big.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 260, easing: 'ease', fill: 'both' });
    const done = () => {
      if (thumb) thumb.style.visibility = '';
      busy = false;
      dlg.close();
    };
    anim.finished.then(done, done);
  }

  function show(i: number, dir: number) {
    if (busy) return;
    idx = (i + group.length) % group.length;
    const img = group[idx];
    // Keep the page behind in step, so closing lands on the right piece.
    img.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    setImage(img);
    if (!reduce) {
      big.getAnimations().forEach((a) => a.cancel());
      big.animate(
        [{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: EASE },
      );
    }
  }

  dlg.addEventListener('close', () => {
    dlg.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    document.documentElement.classList.remove('lightbox-open');
    big.removeAttribute('src');
    (group[idx] || opener)?.focus({ preventScroll: true }); // the piece last viewed
  });
  // Esc runs the same animated close.
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.querySelector('.lightbox-close')!.addEventListener('click', close);
  dlg.querySelector('.lightbox-prev')!.addEventListener('click', () => show(idx - 1, -1));
  dlg.querySelector('.lightbox-next')!.addEventListener('click', () => show(idx + 1, 1));
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target === scrim || e.target === big) close();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(idx + 1, 1);
    else if (e.key === 'ArrowLeft') show(idx - 1, -1);
  });
  window.addEventListener('resize', () => {
    if (!dlg.open) return;
    const [w, h] = fit(group[idx]);
    big.style.width = w + 'px';
    big.style.height = h + 'px';
  });
  let x0: number | null = null;
  dlg.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  dlg.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) show(dx < 0 ? idx + 1 : idx - 1, dx < 0 ? 1 : -1);
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
      f.focus(); // keyboard focus follows into the player
    });
  });
}

// ---- Cover clips (homepage mosaic, category grid) ---------------------------
// They loop only while on screen; under reduced motion they stay still and
// play only while hovered or focused.
function wireCoverClips(reduce: boolean) {
  const clips = Array.from(document.querySelectorAll<HTMLVideoElement>('.tile video, .grid-cell video'));
  if (!clips.length) return;
  if (reduce) {
    clips.forEach((v) => {
      v.autoplay = false; v.removeAttribute('autoplay');
      v.pause();
      const box = v.closest<HTMLElement>('.tile, .grid-cell')!;
      if (box.classList.contains('tile')) {
        box.addEventListener('mouseenter', () => play(v));
        box.addEventListener('mouseleave', () => v.pause());
        box.addEventListener('focus', () => play(v));
        box.addEventListener('blur', () => v.pause());
      }
    });
    return;
  }
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting) play(v); else v.pause();
    });
  }, { rootMargin: '200px 0px' });
  clips.forEach((v) => io.observe(v));
}

// ---- Wire up -----------------------------------------------------------------
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll<HTMLElement>('[data-mosaic]').forEach(wireMosaic);
let fitQueued = false;
window.addEventListener('resize', () => {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    document.querySelectorAll<HTMLElement>('[data-mosaic]').forEach(fitMosaic);
  });
});
document.querySelectorAll<HTMLElement>('.grid-cell').forEach(wireCycle);
wireCoverClips(reduceMotion);

// Reduced motion: project clips start paused with their own controls.
const project = document.querySelector<HTMLElement>('[data-project]');
if (project && reduceMotion) {
  project.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
    v.autoplay = false;
    v.pause();
    v.controls = true;
    v.preload = 'metadata';
  });
  project.querySelectorAll('.clip-toggle').forEach((b) => b.remove()); // native controls instead
  wireLightbox(project);
} else if (project) {
  project.querySelectorAll('.pair-row').forEach((row) => {
    const vids = Array.from(row.querySelectorAll('video'));
    if (vids.length >= 2) syncGroup(vids);
  });
  wireSoloClips(project);
  wireClipToggles(project);
  wireLightbox(project);
}
wireFilms(document);
