// Marks the current page in the header navs (category links and Showreel, About).
// Compares normalised pathnames so it works whether the URL keeps the .html
// suffix (production) or drops it (some dev servers), and from any folder.
(function () {
  function norm(p) {
    return p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  }
  var here = norm(window.location.pathname);
  var links = document.querySelectorAll('.site-nav a');
  for (var i = 0; i < links.length; i++) {
    if (norm(new URL(links[i].href, window.location.href).pathname) === here) {
      links[i].setAttribute('aria-current', 'page');
    }
  }
})();

// Homepage: once the category bar reaches the top, mark the page as pinned so the
// fixed corners (name + Showreel/About) gain a solid background and read as one
// bar with the categories — on mobile this also lets the bar stack into two rows.
(function () {
  var hero = document.querySelector('.hero');
  var corners = document.querySelector('.hero-corners');
  if (!hero || !corners) return;
  var ticking = false;
  function update() {
    ticking = false;
    var threshold = hero.offsetHeight - corners.offsetHeight;
    document.body.classList.toggle('nav-pinned', window.scrollY >= threshold);
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

// Homepage hero: phones get the portrait-friendly intro, larger screens the wide
// one. Choosing the source in JS means only the file actually used is downloaded.
(function () {
  var v = document.querySelector('.hero video[data-src]');
  if (!v) return;
  var mobile = window.matchMedia('(max-width: 768px)').matches;
  v.src = mobile && v.dataset.srcMobile ? v.dataset.srcMobile : v.dataset.src;
  v.load();
})();

// Mobile dropdown menu (hamburger) holding every section.
(function () {
  var btn = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;
  var inner = menu.querySelector('.mobile-menu-inner') || menu;
  function setOpen(open) {
    btn.classList.toggle('open', open);
    menu.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      document.body.classList.add('menu-open');
      // Animate to the panel's exact height (plus room for its shadow).
      menu.style.maxHeight = (inner.scrollHeight + 36) + 'px';
    } else {
      menu.style.maxHeight = '0px';
      // Keep .menu-open (white sheet + dark name) until the sheet finishes
      // rolling up, so the bar and dropdown collapse as one continuous piece.
    }
  }
  menu.addEventListener('transitionend', function (e) {
    if (e.propertyName === 'max-height' && !menu.classList.contains('open')) {
      document.body.classList.remove('menu-open');
    }
  });
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!menu.classList.contains('open'));
  });
  document.addEventListener('click', function (e) {
    if (menu.classList.contains('open') && !menu.contains(e.target) && !btn.contains(e.target)) {
      setOpen(false);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
})();
