import { signal } from './lifecycle';

// Homepage: once the category bar reaches the top, mark the page as pinned so the
// fixed corners (name + Showreel/About) gain a solid background and read as one
// bar with the categories. On mobile this also gives the name a solid bar.
function mountPinnedBar() {
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
  }, { passive: true, signal: signal() });
  window.addEventListener('resize', update, { signal: signal() });
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

export function mountNav() {
  mountPinnedBar();
  mountMenu();
}
