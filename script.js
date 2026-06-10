// Marks the current page in the header navs (category links and Work, About).
(function () {
  var page = window.location.pathname.split('/').pop() || 'index.html';
  var links = document.querySelectorAll('.site-nav a');
  for (var i = 0; i < links.length; i++) {
    if (links[i].getAttribute('href') === page) {
      links[i].setAttribute('aria-current', 'page');
    }
  }
})();
