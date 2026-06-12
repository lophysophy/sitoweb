/* ==========================================================================
   gallery.js — renders everything from the images-data.js manifest.
   Three jobs, picked up from data-* hooks in the HTML:
     [data-portfolio-preview="slug"]  homepage teaser tiles for a category
     [data-portfolio-stacks="slug"]   the stacks (one per project) on a category page
     [data-project]                   the project page (reads ?cat=&project= from the URL)
   ========================================================================== */
(function () {
  var P = (window.PORTFOLIO && window.PORTFOLIO.categories) ? window.PORTFOLIO : { categories: [] };

  // The finished film embedded at the end of each animation project, keyed by
  // its project slug. Add a line here (slug: YouTube video id) for new projects.
  var VIDEOS = {
    'duel': '2AmUoiHabYk',
    'les-legendaires': '9TWNAKuO7MI',
    'rainy-day': 'Rtbq5nKTJ60',
    'skechy-notes': 'x5QG7ynAZck',
  };

  // Spaces and parentheses in the real filenames need encoding for the URL.
  function enc(src) { return encodeURI(src); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function findCat(slug) {
    for (var i = 0; i < P.categories.length; i++) {
      if (P.categories[i].slug === slug) return P.categories[i];
    }
    return null;
  }

  function projectHref(catSlug, projSlug) {
    return '/html/project.html?cat=' + encodeURIComponent(catSlug) + '&project=' + encodeURIComponent(projSlug);
  }

  // ---- Category page: a full-bleed grid, one cell per project ------------
  // Each cell links into the project. On hover it cycles through the project's
  // preview images in order (the curated preview/ folder, or a fallback).
  function cellList(proj) {
    return (proj.preview && proj.preview.length) ? proj.preview : proj.items;
  }

  function cellHtml(catSlug, proj) {
    var list = cellList(proj);
    var srcs = list.map(function (it) { return enc(it.src); });
    var media = isVideo(list[0].src)
      ? '<video class="grid-img" autoplay loop muted playsinline preload="metadata" src="' + srcs[0] + '"></video>'
      : '<img class="grid-img" src="' + srcs[0] + '" alt="' + esc(proj.title) + '" loading="lazy">';
    return '<a class="grid-cell" href="' + projectHref(catSlug, proj.slug) + '" data-srcs="' + srcs.join('|') + '">'
      + media
      + '<span class="grid-overlay"><span class="grid-label">' + esc(proj.title) + '</span></span>'
      + '</a>';
  }

  function wireCycle(cell) {
    var img = cell.querySelector('.grid-img');
    if (img.tagName === 'VIDEO') return; // a video loops on its own; no frame cycling
    var srcs = (cell.getAttribute('data-srcs') || '').split('|').filter(Boolean);
    if (srcs.length < 2) return;
    var idx = 0, timer = null;
    function start() {
      if (timer) return;
      timer = setInterval(function () {
        idx = (idx + 1) % srcs.length;
        img.src = srcs[idx];
      }, 700);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      idx = 0;
      img.src = srcs[0];
    }
    cell.addEventListener('mouseenter', start);
    cell.addEventListener('mouseleave', stop);
  }

  function renderGrid(el) {
    var cat = findCat(el.getAttribute('data-portfolio-grid'));
    if (!cat) return;
    el.className = 'work-grid';
    el.innerHTML = cat.projects.map(function (proj) { return cellHtml(cat.slug, proj); }).join('');
    var cells = el.querySelectorAll('.grid-cell');
    for (var i = 0; i < cells.length; i++) wireCycle(cells[i]);
  }

  // ---- Homepage: the squeeze mosaic linking into a category --------------
  // Tiles share a row and crop at rest; hovering one expands it to its image's
  // full width (set per tile via --ar) so the whole image shows, uncropped.

  // Size the row height so every image is at least as wide as its tile at the
  // current screen width: the narrowest cover just fills (no white gap), the
  // others crop a little (so the squeeze always has room). Recomputed on resize.
  function fitMosaic(m) {
    if (getComputedStyle(m).flexDirection !== 'row') return; // stacked on mobile
    var tiles = m.querySelectorAll('.tile');
    var tileW = m.clientWidth / (tiles.length || 1);
    if (!tileW) return;
    var rowH = 0;
    for (var i = 0; i < tiles.length; i++) {
      var ar = parseFloat(tiles[i].style.getPropertyValue('--ar')) || 1.5;
      rowH = Math.max(rowH, tileW / ar);
    }
    // Small margin over the just-fits height so images overflow their tiles a
    // little (no white gap, and a touch of squeeze room on hover).
    m.style.setProperty('--row-h', (rowH * 1.06) + 'px');
  }

  if (!window.__mosaicFit) {
    window.__mosaicFit = true;
    window.addEventListener('resize', function () {
      var ms = document.querySelectorAll('.mosaic');
      for (var i = 0; i < ms.length; i++) fitMosaic(ms[i]);
    });
  }

  function renderPreview(el) {
    var cat = findCat(el.getAttribute('data-portfolio-preview'));
    if (!cat) return;
    var limit = parseInt(el.getAttribute('data-limit'), 10) || 3;
    var projects = cat.projects.slice(0, limit);
    el.className = 'mosaic';
    el.innerHTML = projects.map(function (proj) {
      var cover = (proj.preview && proj.preview[0]) ? proj.preview[0].src : proj.items[0].src;
      var media = isVideo(cover)
        ? '<video autoplay loop muted playsinline preload="metadata" src="' + enc(cover) + '"></video>'
        : '<img src="' + enc(cover) + '" alt="' + esc(proj.title) + ' preview" loading="lazy">';
      return '<a class="tile" href="' + projectHref(cat.slug, proj.slug) + '">'
        + media
        + '<span class="tile-overlay"><span class="tile-label">' + esc(proj.title) + '</span></span>'
        + '</a>';
    }).join('');

    // Per tile: record its media aspect ratio, then on hover grow it smoothly
    // to max(current width, full image width) — reveals the whole image, and
    // never shrinks when the tile already has enough room.
    var tiles = el.querySelectorAll('.tile');
    for (var i = 0; i < tiles.length; i++) {
      (function (tile) {
        var img = tile.querySelector('img, video');
        function setAR() {
          var w = img.naturalWidth || img.videoWidth, h = img.naturalHeight || img.videoHeight;
          if (w && h) {
            tile.style.setProperty('--ar', (w / h).toFixed(4));
            fitMosaic(el);
          }
        }
        if (img.tagName === 'VIDEO') { if (img.videoWidth) setAR(); else img.addEventListener('loadedmetadata', setAR); }
        else if (img.complete) setAR();
        else img.addEventListener('load', setAR);

        tile.addEventListener('mouseenter', function () {
          if (getComputedStyle(tile.parentNode).flexDirection !== 'row') return; // off on mobile
          var ar = parseFloat(tile.style.getPropertyValue('--ar')) || 1.5;
          var rowH = parseFloat(getComputedStyle(tile.parentNode).height) || 0;
          var target = Math.max(tile.getBoundingClientRect().width, rowH * ar);
          if (target > 0) tile.style.flex = '0 0 ' + target + 'px'; // never collapse to 0
        });
        tile.addEventListener('mouseleave', function () {
          tile.style.flex = '';
        });
      })(tiles[i]);
    }
    fitMosaic(el);
  }

  // ---- Project page ------------------------------------------------------
  function isVideo(src) { return /\.(mp4|webm)$/i.test(src); }

  function imgHtml(item, alt) {
    if (item.type === 'video' || isVideo(item.src)) {
      return '<video src="' + enc(item.src) + '" autoplay loop muted playsinline preload="metadata"></video>';
    }
    return '<img src="' + enc(item.src) + '" alt="' + esc(alt) + '" loading="lazy">';
  }

  // A real, click-to-play YouTube player in a tidy rounded, centered card.
  function videoHtml(id, title) {
    return '<section class="video-block">'
      + '<h2 class="kicker video-heading">Watch the full video</h2>'
      + '<div class="video-frame"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(id) + '" '
      + 'title="' + esc(title) + ' — film" loading="lazy" '
      + 'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" '
      + 'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>'
      + '</section>';
  }

  // Group a base piece (minor 0) with its variants (minor > 0, e.g. the COMP)
  // into one row, so they show side by side with the variant(s) to the right.
  function pairRows(items) {
    var rows = [], baseByMajor = {};
    items.forEach(function (it) {
      if (it.minor && it.major != null && baseByMajor[it.major] != null) {
        rows[baseByMajor[it.major]].variants.push(it);
      } else {
        rows.push({ base: it, variants: [] });
        if (it.major != null && !it.minor) baseByMajor[it.major] = rows.length - 1;
      }
    });
    return rows;
  }

  function renderProject(el) {
    var params = new URLSearchParams(window.location.search);
    var cat = findCat(params.get('cat'));
    var proj = cat ? cat.projects.filter(function (p) { return p.slug === params.get('project'); })[0] : null;

    if (!proj) {
      el.innerHTML = '<section class="page-head"><h1 class="page-title">Project not found</h1>'
        + '<p class="intro">This project may have been renamed or removed. '
        + '<a class="email-link" href="/index.html">Back to work</a>.</p></section>';
      return;
    }

    document.title = proj.title + ' · Lophy Sophy';

    // Mark the category in the header nav as current.
    var navLinks = document.querySelectorAll('.site-nav a');
    for (var i = 0; i < navLinks.length; i++) {
      if (navLinks[i].getAttribute('href') === cat.page) {
        navLinks[i].setAttribute('aria-current', 'page');
      }
    }

    var html = '<section class="page-head">'
      + '<p class="kicker"><a class="crumb" href="' + cat.page + '">' + esc(cat.title) + '</a></p>'
      + '<h1 class="page-title">' + esc(proj.title) + '</h1>'
      + '</section>';

    // Direct pieces: full bleed, full resolution, never cropped, in index order.
    // A base piece and its variants (e.g. the COMP) share a row, variants to the
    // right. GIF projects get a vertical gap between rows.
    if (proj.items.length) {
      var spaced = cat.slug === 'animation' ? ' project-gallery--spaced' : '';
      var pieces = pairRows(proj.items).map(function (row, n) {
        if (row.variants.length) {
          return '<div class="pair-row">'
            + imgHtml(row.base, proj.title + ' — ' + (n + 1))
            + row.variants.map(function (v, k) {
                return imgHtml(v, proj.title + ' — ' + (n + 1) + ' variant ' + (k + 1));
              }).join('')
            + '</div>';
        }
        return imgHtml(row.base, proj.title + ' — ' + (n + 1));
      }).join('');
      html += '<section class="gallery project-gallery' + spaced + '" aria-label="' + esc(proj.title) + '">'
        + pieces + '</section>';
    }

    // Each subfolder (e.g. storyboard) becomes its own mega grid.
    proj.groups.forEach(function (group) {
      html += '<section class="group-block">'
        + '<h2 class="kicker group-title">' + esc(group.title) + '</h2>'
        + '<div class="story-grid">'
        + group.items.map(function (it, n) {
            return imgHtml(it, group.title + ' ' + (n + 1));
          }).join('')
        + '</div></section>';
    });

    // The finished film closes the project, in its own rounded card.
    var videoId = VIDEOS[proj.slug];
    if (videoId) html += videoHtml(videoId, proj.title);

    html += '<section class="more-work"><h2 class="kicker">More in ' + esc(cat.title) + '</h2>'
      + '<p class="back-row"><a class="btn" href="' + cat.page + '">Back to ' + esc(cat.title) + '</a></p>'
      + '</section>';

    el.innerHTML = html;
    wireStoryLightbox(el);
    window.scrollTo(0, 0);
  }

  // ---- Fullscreen lightbox for storyboard grids --------------------------
  var lightbox = null;

  function getLightbox() {
    if (lightbox) return lightbox;
    var lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.hidden = true;
    lb.innerHTML =
        '<button class="lightbox-btn lightbox-close" type="button" aria-label="Close">×</button>'
      + '<button class="lightbox-btn lightbox-prev" type="button" aria-label="Previous">‹</button>'
      + '<img class="lightbox-img" alt="">'
      + '<button class="lightbox-btn lightbox-next" type="button" aria-label="Next">›</button>';
    document.body.appendChild(lb);

    var imgEl = lb.querySelector('.lightbox-img');
    var group = [], idx = 0;

    function show(i) {
      idx = (i + group.length) % group.length;
      imgEl.src = group[idx].src;
      imgEl.alt = group[idx].alt;
    }
    function close() {
      lb.hidden = true;
      document.body.style.overflow = '';
      imgEl.removeAttribute('src');
    }
    lb.querySelector('.lightbox-next').addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1); });
    lb.querySelector('.lightbox-prev').addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1); });
    lb.querySelector('.lightbox-close').addEventListener('click', close);
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target === imgEl) close(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'ArrowLeft') show(idx - 1);
    });

    lightbox = {
      open: function (items, i) {
        group = items;
        show(i);
        lb.hidden = false;
        document.body.style.overflow = 'hidden';
      },
    };
    return lightbox;
  }

  // Make each storyboard frame open full screen, navigable in order.
  function wireStoryLightbox(root) {
    var grids = root.querySelectorAll('.story-grid');
    for (var g = 0; g < grids.length; g++) {
      var imgs = grids[g].querySelectorAll('img');
      var items = [];
      for (var k = 0; k < imgs.length; k++) {
        items.push({ src: imgs[k].getAttribute('src'), alt: imgs[k].alt });
      }
      (function (items) {
        for (var k = 0; k < imgs.length; k++) {
          imgs[k].classList.add('zoomable');
          (function (i) {
            imgs[i].addEventListener('click', function () { getLightbox().open(items, i); });
          })(k);
        }
      })(items);
    }
  }

  // ---- Wire up -----------------------------------------------------------
  function init() {
    var el;
    var grids = document.querySelectorAll('[data-portfolio-grid]');
    for (var i = 0; i < grids.length; i++) renderGrid(grids[i]);

    var previews = document.querySelectorAll('[data-portfolio-preview]');
    for (var j = 0; j < previews.length; j++) renderPreview(previews[j]);

    el = document.querySelector('[data-project]');
    if (el) renderProject(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
