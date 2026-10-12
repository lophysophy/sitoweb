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
})();
