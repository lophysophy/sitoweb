// Homepage: once the category bar reaches the top, mark the page as pinned so the
// fixed corners (name + Showreel/About) gain a solid background and read as one
// bar with the categories. On mobile this also gives the name a solid bar.
(function () {
  const hero = document.querySelector<HTMLElement>('.hero');
  const corners = document.querySelector<HTMLElement>('.hero-corners');
  if (!hero || !corners) return;
  let ticking = false;
  function update() {
    ticking = false;
    const threshold = hero!.offsetHeight - corners!.offsetHeight;
    document.body.classList.toggle('nav-pinned', window.scrollY >= threshold);
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

// Page transition fallback (browsers without cross-page view transitions, see
// Base.astro): fade the page out before following an internal link.
(function () {
  const root = document.documentElement;
  if (!root.classList.contains('pt')) return;
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest?.('a');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.hash) return; // in-page anchor
    if (/\.[a-z0-9]{2,4}$/i.test(url.pathname) && !/\.html$/i.test(url.pathname)) return; // files (CV…)
    e.preventDefault();
    root.classList.add('pt-out');
    setTimeout(() => { location.href = url.href; }, 200);
  });
  // Coming back with Back/Forward restores the page as it was: show it again.
  window.addEventListener('pageshow', (e) => { if (e.persisted) root.classList.remove('pt-out'); });
})();

// Mobile dropdown menu (hamburger) holding every section.
(function () {
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
  document.addEventListener('click', (e) => {
    const t = e.target as Node;
    if (isOpen() && !menu.contains(t) && !btn.contains(t)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setOpen(false, true);
  });
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
  phone.addEventListener('change', check);
  window.addEventListener('resize', check);
  window.addEventListener('pageshow', (e) => { if (e.persisted) reset(); });
})();
