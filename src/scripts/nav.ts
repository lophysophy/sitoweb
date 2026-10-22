import { signal, onCleanup } from './lifecycle';

// Homepage: the fixed bar stays clear (no glass, white type) over the intro
// film and turns to frosted glass once the page starts to scroll.
function mountBarState() {
  const header = document.querySelector<HTMLElement>('.site-header[data-home]');
  if (!header) return;
  let ticking = false;
  function update() {
    ticking = false;
    header!.classList.toggle('is-clear', window.scrollY < 40);
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true, signal: signal() });
  update();
}

// Mobile dropdown menu (hamburger) holding every section.
function mountMenu() {
  const btn = document.querySelector<HTMLButtonElement>('.menu-toggle');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;
  const inner = menu.querySelector<HTMLElement>('.mobile-menu-inner') || menu;
  const isOpen = () => menu.classList.contains('open');

  function setOpen(open: boolean, restoreFocus = false) {
    btn!.classList.toggle('open', open);
    menu!.classList.toggle('open', open);
    btn!.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn!.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu!.inert = !open; // closed links stay out of the tab order
    if (open) {
      document.body.classList.add('menu-open');
      // Animate to the panel's exact height (plus room for its shadow).
      menu!.style.maxHeight = inner.scrollHeight + 36 + 'px';
    } else {
      menu!.style.maxHeight = '0px';
      // Keep .menu-open (white sheet + dark name) until the sheet finishes
      // rolling up, so the bar and dropdown collapse as one continuous piece.
      if (restoreFocus) btn!.focus();
    }
  }
  menu.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'max-height' && !isOpen()) document.body.classList.remove('menu-open');
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!isOpen());
  });
  const opts = { signal: signal() };
  document.addEventListener('click', (e) => {
    const t = e.target as Node;
    if (isOpen() && !menu.contains(t) && !btn.contains(t)) setOpen(false);
  }, opts);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setOpen(false, true);
  }, opts);
  // Tabbing out of the open menu closes it.
  menu.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (isOpen() && to && !menu.contains(to) && !btn.contains(to)) setOpen(false);
  });
  // Widening past the phone layout hides the menu without a transition, so
  // its end event never fires: reset the open state straight away. Same when
  // the page comes back from the Back/Forward cache.
  function reset() {
    setOpen(false);
    document.body.classList.remove('menu-open');
  }
  const phone = window.matchMedia('(max-width: 768px)');
  const check = () => { if (!phone.matches && (isOpen() || document.body.classList.contains('menu-open'))) reset(); };
  phone.addEventListener('change', check, opts);
  window.addEventListener('resize', check, opts);
  window.addEventListener('pageshow', (e) => { if (e.persisted) reset(); }, opts);
}

// Category drop-down panels (desktop, pointer with hover). Hovering a category
// opens its panel after a short pause (so passing over the bar doesn't flash
// it); moving to another category swaps the content and resizes the panel;
// leaving the bar and panel closes it after 0.12s. The chevron button next to
// each link does the same from the keyboard; Esc closes and returns focus.
function mountFlyouts() {
  document.querySelectorAll<HTMLElement>('.site-header').forEach((header) => {
    const flyout = header.querySelector<HTMLElement>('[data-flyout]');
    const curtain = header.querySelector<HTMLElement>('[data-flyout-curtain]');
    if (!flyout || !curtain) return;
    const opts = { signal: signal() };
    const menus = new Map<string, HTMLElement>();
    flyout.querySelectorAll<HTMLElement>('[data-menu]').forEach((m) => menus.set(m.dataset.menu!, m));
    let current: string | null = null;
    let openTimer = 0, closeTimer = 0, swapTimer = 0;
    const order = [...menus.keys()];

    const items = (slug: string) => header.querySelector<HTMLElement>(`[data-flyout-trigger="${slug}"]`)?.closest('.nav-item');
    const toggles = () => header.querySelectorAll<HTMLButtonElement>('[data-flyout-toggle]');

    function setHeight(menu: HTMLElement) {
      const h = menu.scrollHeight;
      // Taller panels take a little longer, as on apple.com (552px ≈ 0.25s).
      flyout!.style.setProperty('--flyout-rate', Math.min(400, Math.max(200, 160 + h * 0.17)) + 'ms');
      flyout!.style.height = h + 'px';
    }

    // The bar turns solid white while a panel is open, and goes back to glass
    // once the panel has rolled up.
    let whiteTimer = 0;
    function open(slug: string) {
      clearTimeout(closeTimer);
      clearTimeout(whiteTimer);
      header.classList.add('has-flyout');
      if (current === slug) return;
      const menu = menus.get(slug);
      if (!menu) return;
      const switching = current !== null;
      clearTimeout(swapTimer);
      menus.forEach((m) => m.classList.remove('is-leaving', 'is-entering'));
      if (switching) {
        // Slide towards the side the pointer is moving to.
        const dir = order.indexOf(slug) > order.indexOf(current!) ? 1 : -1;
        flyout!.style.setProperty('--dir', String(dir));
        menus.get(current!)?.classList.add('is-leaving');
        menu.classList.add('is-entering');
        swapTimer = window.setTimeout(() => {
          menus.forEach((m) => m.classList.remove('is-leaving', 'is-entering'));
        }, 900);
      }
      menus.forEach((m, k) => m.classList.toggle('is-current', k === slug));
      header.querySelectorAll('.nav-item.is-open').forEach((n) => n.classList.remove('is-open'));
      items(slug)?.classList.add('is-open');
      toggles().forEach((t) => t.setAttribute('aria-expanded', String(t.dataset.flyoutToggle === slug)));
      resetPreview(menu);
      if (!switching) {
        // Start from closed so the cascade plays, then open on the next frame.
        void flyout!.offsetHeight;
        curtain!.style.setProperty('--curtain-top', header.getBoundingClientRect().bottom + 'px');
      }
      current = slug;
      requestAnimationFrame(() => {
        flyout!.classList.add('is-open');
        curtain!.classList.add('is-on');
        setHeight(menu);
      });
    }

    function close(instant = false) {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      if (current === null) return;
      current = null;
      if (instant) flyout!.style.transition = 'none';
      clearTimeout(swapTimer);
      flyout!.classList.remove('is-open');
      menus.forEach((m) => m.classList.remove('is-leaving', 'is-entering'));
      curtain!.classList.remove('is-on');
      flyout!.style.height = '0px';
      header.querySelectorAll('.nav-item.is-open').forEach((n) => n.classList.remove('is-open'));
      toggles().forEach((t) => t.setAttribute('aria-expanded', 'false'));
      if (instant) { void flyout!.offsetHeight; flyout!.style.transition = ''; }
      clearTimeout(whiteTimer);
      if (instant) header.classList.remove('has-flyout');
      else whiteTimer = window.setTimeout(() => header.classList.remove('has-flyout'), 280);
    }

    const scheduleClose = () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => close(), 120);
    };

    // The work preview follows the pointer over the project titles.
    function resetPreview(menu: HTMLElement) {
      const img = menu.querySelector<HTMLImageElement>('.flyout-preview img');
      const cap = menu.querySelector<HTMLElement>('.flyout-preview figcaption');
      if (img && img.dataset.default) { img.src = img.dataset.default; img.dataset.want = ''; img.style.opacity = ''; }
      if (cap && cap.dataset.default) cap.textContent = cap.dataset.default;
    }
    menus.forEach((menu) => {
      const img = menu.querySelector<HTMLImageElement>('.flyout-preview img');
      const cap = menu.querySelector<HTMLElement>('.flyout-preview figcaption');
      if (!img || !cap) return;
      menu.querySelectorAll<HTMLAnchorElement>('[data-still]').forEach((a) => {
        // Cross-fade: the old picture fades, the new one comes up once decoded.
        const show = () => {
          const src = a.dataset.still;
          if (!src || img.dataset.want === src || img.getAttribute('src') === src) return;
          img.dataset.want = src;
          img.style.opacity = '0';
          const next = new Image();
          next.src = src;
          Promise.all([next.decode().catch(() => {}), new Promise((r) => setTimeout(r, 120))]).then(() => {
            if (img.dataset.want !== src) return;
            img.src = src;
            cap.textContent = a.dataset.title || '';
            img.style.opacity = '';
          });
        };
        a.addEventListener('mouseenter', show);
        a.addEventListener('focus', show);
      });
    });

    // Pointer: open on hover with a short intent delay, switch instantly.
    header.querySelectorAll<HTMLElement>('[data-flyout-trigger]').forEach((a) => {
      // Mouse only: a tap on a touch screen just follows the link.
      a.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(closeTimer);
        clearTimeout(openTimer);
        const slug = a.dataset.flyoutTrigger!;
        // A short pause before opening, and before switching: a pointer that
        // only crosses a neighbouring category on its way down into the
        // panel doesn't change it.
        openTimer = window.setTimeout(() => open(slug), current !== null ? 110 : 90);
      });
      a.addEventListener('pointerleave', () => clearTimeout(openTimer));
    });
    // Other things in the bar (name, Showreel, About) close it.
    header.querySelectorAll<HTMLElement>('.header-inner a:not([data-flyout-trigger]), .wordmark').forEach((a) => {
      a.addEventListener('mouseenter', scheduleClose);
    });
    header.addEventListener('mouseenter', () => clearTimeout(closeTimer));
    header.addEventListener('mouseleave', scheduleClose);

    // Keyboard.
    toggles().forEach((t) => {
      t.addEventListener('click', () => {
        const slug = t.dataset.flyoutToggle!;
        if (current === slug) { close(); return; }
        open(slug);
        setTimeout(() => menus.get(slug)?.querySelector<HTMLElement>('a')?.focus(), 60);
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || current === null) return;
      const slug = current;
      close();
      header.querySelector<HTMLElement>(`[data-flyout-toggle="${slug}"]`)?.focus();
    }, opts);
    header.addEventListener('focusout', (e) => {
      const to = e.relatedTarget as Node | null;
      if (current !== null && (!to || !header.contains(to))) close();
    });

    // Following a link, scrolling or resizing closes it at once.
    flyout.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) close(true); });
    window.addEventListener('scroll', () => { if (current !== null) close(true); }, { passive: true, ...opts });
    window.addEventListener('resize', () => { if (current !== null) close(true); }, opts);
    onCleanup(() => close(true));
  });
}

export function mountNav() {
  mountBarState();
  mountMenu();
  mountFlyouts();
}
