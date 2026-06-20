/* ==========================================================================
   build-images.js — scans the images/ tree and writes images-data.js
   ----------------------------------------------------------------------------
   The site is hosted statically (GitHub Pages), so it cannot list folders at
   runtime. This script bakes the folder structure into a manifest that the
   pages read. Re-run it from the project root whenever you add, remove, rename
   or renumber files:

       node javascript/build-images.js

   Structure it expects:

       images/<MACRO>/<N>. <PROJECT>/<index> <label>.<ext>
       images/<MACRO>/<N>. <PROJECT>/<subfolder>/<index> <label>.<ext>   (e.g. storyboard)
       images/<MACRO>/preview/<N>. <PROJECT>/<index> <label>.<ext>        (preview overrides)

   Naming: index leads the name, no parentheses. "<major>" is the gallery order;
   "<major>.<minor>" (minor > 0) is a variant/COMP shown next to its base. So
   "1 duel.gif" < "1.1 duel.gif" < "2 duel.gif" < "10 duel.gif".
   The home + grid previews default to the project's own pieces (for animation,
   just the videos). The preview/ folder holds ONLY overrides: a file whose index
   matches a default piece replaces it (a custom crop/version) — identical copies
   don't go there, the default piece is reused in place so nothing is duplicated.
   ========================================================================== */

const fs = require('fs');
const path = require('path');

// This script lives in javascript/; the project root is one level up.
const ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');

// Top-level folders -> categories. Order here is the order shown on the site.
// page is a root-absolute URL (the site is served at the domain root).
const CATEGORIES = [
  { dir: 'VISUAL DEVELOPMENT', slug: 'visual-development', title: 'Visual Development', page: '/html/concept-art.html' },
  { dir: 'ILLUSTRATION',       slug: 'illustration',       title: 'Illustration',       page: '/html/illustration.html' },
  { dir: 'ANIMATION',          slug: 'animation',          title: 'Animation',          page: '/html/animation.html' },
];

const MEDIA_RE = /\.(jpe?g|png|gif|webp|avif|mp4|webm)$/i;
const VIDEO_RE = /\.(mp4|webm)$/i;

// Explorer-style natural order for folder names.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const naturalSort = (a, b) => collator.compare(a, b);

// Names carry a leading index: "<major>[.<minor>] label.ext" (and folders
// "<major>. NAME"). major is the order; minor (>0) marks a variant/COMP that
// sits right after its base. Examples: "1 duel.gif", "1.1 duel.gif", "2. DUEL".
function indexKey(name) {
  const m = name.match(/^\s*(\d+)(?:\.(\d+))?/);
  return {
    major: m ? parseInt(m[1], 10) : Infinity,
    minor: m && m[2] != null ? parseInt(m[2], 10) : 0,
  };
}

function indexSort(a, b) {
  const ka = indexKey(a), kb = indexKey(b);
  if (ka.major !== kb.major) return ka.major - kb.major;
  if (ka.minor !== kb.minor) return ka.minor - kb.minor;
  return collator.compare(a, b);
}

// Accent-fold so "LES LÉGENDAIRES" -> "les-legendaires", not "les-l-gendaires".
// NFD splits accents into combining marks (U+0300–U+036F); drop those.
function stripDiacritics(s) {
  return s.normalize('NFD').split('').filter(function (ch) {
    var c = ch.charCodeAt(0);
    return c < 0x300 || c > 0x36f;
  }).join('');
}

function slugify(s) {
  return stripDiacritics(s)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Strip an ordering index from a folder name for display, so "1 YOKAI" shows as
// "Yokai". Supports a leading index ("1 ", "01. ", "1) ") or a trailing "(1)".
function cleanName(s) {
  return s
    .replace(/^\s*\d+(?:\.\d+)?[)\s._-]*/, '')
    .replace(/\s*\(\d+(?:\.\d+)?\)\s*$/, '')
    .trim() || s;
}

// "A UN PASSO DAL CIELO" -> "A Un Passo Dal Cielo". Capitalises the first letter
// of each word only after whitespace/start, so accented letters (é in "Les
// Légendaires") don't trip a word boundary and get wrongly upper-cased.
function titleCase(s) {
  return s.toLowerCase().replace(/(^|\s)(\S)/g, (m, sep, ch) => sep + ch.toUpperCase());
}

// Folders are ordered by a leading index when present (1 YOKAI, 2 …), then the
// rest alphabetically, using the same index parsing the files use.
function listDirs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort(indexSort);
}

function listImages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && MEDIA_RE.test(e.name))
    .map(e => e.name)
    .sort(indexSort);
}

// Path stored relative to the site root, with forward slashes. Encoding of
// spaces/parentheses happens at render time (encodeURI) in gallery.js.
function rel(...parts) {
  return parts.join('/');
}

function buildItems(absDir, relDir) {
  return listImages(absDir).map(name => {
    const k = indexKey(name);
    return {
      src: rel(relDir, name),
      type: VIDEO_RE.test(name) ? 'video' : 'image',
      name,
      major: k.major === Infinity ? null : k.major,
      minor: k.minor,
    };
  });
}

const categories = [];

for (const cat of CATEGORIES) {
  const catAbs = path.join(IMAGES_DIR, cat.dir);
  if (!fs.existsSync(catAbs)) {
    console.warn(`! Missing category folder: images/${cat.dir} — skipped`);
    continue;
  }

  const projects = [];
  const projNames = listDirs(catAbs).filter(n => n.toLowerCase() !== 'preview');

  for (const projName of projNames) {
    const projAbs = path.join(catAbs, projName);
    const projRel = rel('', 'images', cat.dir, projName); // leading '' -> root-absolute /images/…

    const items = buildItems(projAbs, projRel);

    const groups = listDirs(projAbs).map(groupName => {
      const groupAbs = path.join(projAbs, groupName);
      const groupRel = rel(projRel, groupName);
      return {
        name: groupName,
        title: titleCase(groupName),
        items: buildItems(groupAbs, groupRel),
      };
    }).filter(g => g.items.length > 0);

    // Preview (home cover + grid cycling). The default preview is the project's
    // own pieces — for animation just the moving ones (videos). The preview/
    // folder holds only *overrides*: a file whose leading index matches a default
    // piece replaces it (a custom crop/version). Identical copies don't belong
    // there, so the default piece is reused in place — no duplicated bytes.
    const vids = items.filter(it => it.type === 'video');
    const basePreview = (cat.slug === 'animation' && vids.length) ? vids : items;

    const previewAbs = path.join(catAbs, 'preview', projName);
    const overrides = fs.existsSync(previewAbs)
      ? buildItems(previewAbs, rel('', 'images', cat.dir, 'preview', projName))
      : [];
    const ovByIndex = {};
    overrides.forEach(it => { ovByIndex[it.major + '.' + it.minor] = it; });

    // Each default piece, swapped for its override when one shares its index.
    const preview = basePreview.map(it => ovByIndex[it.major + '.' + it.minor] || it);
    // An override with an index of its own (none in the default set) is added in
    // index order, so the preview can also introduce extra curated pieces.
    const extra = overrides.filter(o => !basePreview.some(b => b.major === o.major && b.minor === o.minor));
    if (extra.length) {
      preview.push(...extra);
      preview.sort((a, b) => ((a.major || 0) - (b.major || 0)) || (a.minor - b.minor));
    }

    const count = items.length + groups.reduce((n, g) => n + g.items.length, 0);
    if (count === 0) {
      console.warn(`! Empty project: ${projRel} — skipped`);
      continue;
    }

    const display = cleanName(projName);
    projects.push({
      slug: slugify(display),
      name: projName,
      title: titleCase(display),
      dir: projRel,
      preview,
      count,
      items,
      groups,
    });
  }

  categories.push({
    slug: cat.slug,
    title: cat.title,
    page: cat.page,
    cover: projects[0] && projects[0].preview[0] ? projects[0].preview[0].src : '',
    projects,
  });
}

const data = { categories };

const banner = `/* AUTO-GENERATED by build-images.js — do not edit by hand.
   Run "node javascript/build-images.js" after changing files in images/. */\n`;

const out = banner + 'window.PORTFOLIO = ' + JSON.stringify(data, null, 2) + ';\n';
fs.writeFileSync(path.join(__dirname, 'images-data.js'), out, 'utf8');

const totalProjects = categories.reduce((n, c) => n + c.projects.length, 0);
const totalItems = categories.reduce((n, c) => n + c.projects.reduce((m, p) => m + p.count, 0), 0);
console.log(`Wrote images-data.js — ${categories.length} categories, ${totalProjects} projects, ${totalItems} pieces.`);
