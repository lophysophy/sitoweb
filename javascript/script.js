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
