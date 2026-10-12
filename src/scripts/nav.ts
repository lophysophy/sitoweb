// Floating nav behaviour: the gliding indicator, hide-on-scroll-down, the dark
// glass over the homepage intro, and the phone menu card.
(function () {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!nav) return;
  const links = nav.querySelector<HTMLElement>('.nav-links');
  const indicator = nav.querySelector<HTMLElement>('.nav-indicator');
  const btn = nav.querySelector<HTMLButtonElement>('.menu-toggle');
  const menu = document.getElementById('mobile-menu');

  // ---- Indicator: glides to the hovered/focused link, rests on the current one.
  if (links && indicator) {
    const current = links.querySelector<HTMLElement>('a[aria-current="page"]');
    const moveTo = (a: HTMLElement | null, instant = false) => {
      if (!a) { indicator.style.opacity = '0'; return; }
      if (instant) indicator.style.transition = 'none';
      indicator.style.opacity = '1';
      indicator.style.width = a.offsetWidth + 'px';
      indicator.style.transform = `translateX(${a.offsetLeft}px)`;
      if (instant) { void indicator.offsetWidth; indicator.style.transition = ''; }
    };
    const rest = () => moveTo(current);
    links.querySelectorAll<HTMLElement>('a').forEach((a) => {
      a.addEventListener('mouseenter', () => moveTo(a));
      a.addEventListener('focus', () => moveTo(a));
    });
    links.addEventListener('mouseleave', rest);
    links.addEventListener('focusout', (e) => { if (!links.contains(e.relatedTarget as Node)) rest(); });
    // Place it once fonts have settled the link widths, without animating in.
    const place = () => moveTo(current, true);
    place();
    document.fonts?.ready.then(place);
    window.addEventListener('resize', place);
  }

  // ---- Scroll: step aside going down, come back going up. -------------------
  const hero = document.querySelector<HTMLElement>('.hero');
  let lastY = window.scrollY;
  function onScroll() {
    const y = window.scrollY;
    const menuOpen = menu?.classList.contains('open');
    const focused = nav!.contains(document.activeElement);
    if (!menuOpen && !focused && y > 160 && y - lastY > 6) nav!.classList.add('nav--hidden');
    else if (lastY - y > 6 || y <= 160) nav!.classList.remove('nav--hidden');
    nav!.classList.toggle('nav--scrolled', y > 8);
    if (hero) nav!.classList.toggle('nav--hero', y < hero.offsetHeight - nav!.offsetHeight - 24);
    if (Math.abs(y - lastY) > 6) lastY = y;
  }
  // Only class toggles happen here, so running on every scroll event is cheap.
  window.addEventListener('scroll', onScroll, { passive: true });
  nav.addEventListener('focusin', () => nav.classList.remove('nav--hidden'));
  onScroll();

  // ---- Phone menu card -------------------------------------------------------
  if (!btn || !menu) return;
  const isOpen = () => menu.classList.contains('open');
  function setOpen(open: boolean, restoreFocus = false) {
    btn!.classList.toggle('open', open);
    menu!.classList.toggle('open', open);
    nav!.classList.toggle('nav--menu', open);
    btn!.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn!.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu!.inert = !open; // closed links stay out of the tab order
    if (!open && restoreFocus) btn!.focus();
  }
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
  window.matchMedia('(min-width: 769px)').addEventListener('change', (m) => { if (m.matches) setOpen(false); });
})();
