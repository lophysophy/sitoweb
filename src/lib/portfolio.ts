/* ==========================================================================
   portfolio.ts: builds the whole portfolio from the folders in src/work/.
   It runs at build time only; nothing here reaches the browser.

   Folder structure (unchanged from the old images/ tree):

       src/work/<CATEGORY>/<N>. <PROJECT>/<index> <label>.<ext>
       src/work/<CATEGORY>/<N>. <PROJECT>/<subfolder>/<index> <label>.<ext>   (e.g. storyboard)
       src/work/<CATEGORY>/<N>. <PROJECT>/project.md                         (optional details)
       src/work/<CATEGORY>/preview/<N>. <PROJECT>/<index> <label>.<ext>      (preview overrides)

   Naming: the index leads the name. "<major>" is the gallery order;
   "<major>.<minor>" (minor > 0) is a variant/COMP shown next to its base. So
   "1 duel.mp4" < "1.1 duel.mp4" < "2 duel.mp4" < "10 duel.mp4".
   Project folders are ordered by their leading number the same way.

   The home + grid previews default to the project's own pieces (for animation,
   just the videos). They can be reordered with `preview:` in project.md, or a
   piece can be swapped for a custom crop by putting a file with the same index
   in the preview/ folder.
   ========================================================================== */

import type { ImageMetadata } from 'astro';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { CATEGORIES, type CategoryConfig } from './site';

export interface Piece {
  /** Public URL of the file as emitted by the build. */
  src: string;
  type: 'image' | 'video';
  name: string;
  major: number | null;
  minor: number;
  /** Set for images (the optimiser needs the import). */
  image?: ImageMetadata;
  /** Clips: a still of the first frame ("<name>.poster.avif", made by npm run media). */
  poster?: ImageMetadata;
  width?: number;
  height?: number;
}

export interface Group {
  name: string;
  title: string;
  items: Piece[];
}

export interface ProjectInfo {
  title?: string;
  slug?: string;
  /** Short line used for the meta description and social previews. */
  description?: string;
  year?: string | number;
  role?: string;
  tools?: string;
  team?: string;
  /** YouTube id of the finished film, embedded at the end of the project. */
  youtube?: string;
  /** Preview order by index, e.g. ["2.1", "2", "4"]. */
  preview?: (string | number)[];
  draft?: boolean;
}

export interface Project {
  slug: string;
  folder: string;
  title: string;
  info: ProjectInfo;
  /** Rendered markdown body of project.md, if any. */
  Content?: any;
  hasBody: boolean;
  items: Piece[];
  groups: Group[];
  preview: Piece[];
  /** First image of the project, used for social previews. */
  coverImage?: ImageMetadata;
  category: Category;
}

export interface Category extends CategoryConfig {
  url: string;
  projects: Project[];
}

const ROOT = '/src/work/';

const imageFiles = import.meta.glob<ImageMetadata>('/src/work/**/*.{avif,AVIF,png,PNG,jpg,JPG,jpeg,JPEG,webp,WEBP,gif,GIF}', {
  eager: true,
  import: 'default',
});
const videoFiles = import.meta.glob<string>('/src/work/**/*.{mp4,MP4,webm,WEBM}', {
  eager: true,
  import: 'default',
});
const infoFiles = import.meta.glob<{ frontmatter: ProjectInfo; Content: any; rawContent: () => string }>(
  '/src/work/**/project.md',
  { eager: true },
);

// ---- Ordering (same rules as the old build-images.js) ----------------------

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function indexKey(name: string) {
  const m = name.match(/^\s*(\d+)(?:\.(\d+))?/);
  return {
    major: m ? parseInt(m[1], 10) : Infinity,
    minor: m && m[2] != null ? parseInt(m[2], 10) : 0,
  };
}

function indexSort(a: string, b: string) {
  const ka = indexKey(a), kb = indexKey(b);
  if (ka.major !== kb.major) return ka.major - kb.major;
  if (ka.minor !== kb.minor) return ka.minor - kb.minor;
  return collator.compare(a, b);
}

// Accent-fold so "LES LÉGENDAIRES" -> "les-legendaires".
function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "1. YOKAI" -> "YOKAI"
function cleanName(s: string) {
  return s.replace(/^\s*\d+(?:\.\d+)?[)\s._-]*/, '').replace(/\s*\(\d+(?:\.\d+)?\)\s*$/, '').trim() || s;
}

// "A UN PASSO DAL CIELO" -> "A Un Passo Dal Cielo" (override with title: in project.md).
function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

// ---- Video dimensions --------------------------------------------------------
// Knowing a clip's size at build time lets the page reserve its space (no jump
// while loading). Locally ffprobe is optional (a warning, and the browser sizes
// the clip once it loads); on the deploy server it is required, so a broken
// install can't quietly bring the layout jumps back.

const probeCache = new Map<string, { width: number; height: number } | null>();
let ffprobeMissing = false;

function probeVideo(file: string) {
  if (ffprobeMissing) return null;
  if (probeCache.has(file)) return probeCache.get(file)!;
  let dims: { width: number; height: number } | null = null;
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file],
      { encoding: 'utf8' },
    );
    const [w, h] = out.trim().split(',').map(Number);
    if (w && h) dims = { width: w, height: h };
  } catch (e: any) {
    if (e && e.code === 'ENOENT') {
      if (process.env.CI) throw new Error('ffprobe is missing on the build server: install ffmpeg before building.');
      ffprobeMissing = true;
      console.warn('[portfolio] ffprobe not found: clip sizes are measured in the browser instead (install ffmpeg to fix).');
    } else {
      console.warn(`[portfolio] could not read the size of ${path.basename(file)}`);
    }
  }
  probeCache.set(file, dims);
  return dims;
}

// ---- Tree -------------------------------------------------------------------

interface FileEntry {
  /** Path relative to src/work, split into folders + file name. */
  parts: string[];
  piece: Piece;
}

function toPiece(absKey: string, name: string): Piece | null {
  const k = indexKey(name);
  const base = { name, major: k.major === Infinity ? null : k.major, minor: k.minor };
  const img = imageFiles[absKey];
  if (img) return { ...base, src: img.src, type: 'image', image: img, width: img.width, height: img.height };
  const vid = videoFiles[absKey];
  if (vid) {
    const dims = probeVideo(path.join(process.cwd(), absKey));
    const poster = imageFiles[absKey.replace(/\.(mp4|webm)$/i, '.poster.avif')];
    if (!poster) console.warn(`[portfolio] no poster for ${name}: run "npm run media" to make one.`);
    return { ...base, src: vid, type: 'video', poster, ...(dims || {}) };
  }
  return null;
}

const entries: FileEntry[] = [];
const isPoster = (key: string) => /\.poster\.avif$/i.test(key);
for (const key of [...Object.keys(imageFiles), ...Object.keys(videoFiles)]) {
  if (isPoster(key)) continue; // a clip's poster, not a piece of its own
  const parts = key.slice(ROOT.length).split('/');
  const piece = toPiece(key, parts[parts.length - 1]);
  if (piece) entries.push({ parts, piece });
}

/** Files directly inside folder `dir` (array of path segments), in index order. */
function filesIn(dir: string[]): Piece[] {
  return entries
    .filter((e) => e.parts.length === dir.length + 1 && dir.every((d, i) => e.parts[i] === d))
    .map((e) => e.piece)
    .sort((a, b) => indexSort(a.name, b.name));
}

/** Immediate subfolder names of `dir`, in index order. */
function foldersIn(dir: string[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    if (e.parts.length > dir.length + 1 && dir.every((d, i) => e.parts[i] === d)) set.add(e.parts[dir.length]);
  }
  return [...set].sort(indexSort);
}

const pieceKey = (p: { major: number | null; minor: number }) => `${p.major}.${p.minor}`;

function parseIndex(v: string | number) {
  const k = indexKey(String(v));
  return `${k.major}.${k.minor}`;
}

function buildPreview(cat: CategoryConfig, folder: string, items: Piece[], info: ProjectInfo): Piece[] {
  const vids = items.filter((it) => it.type === 'video');
  let base = cat.slug === 'animation' && vids.length ? vids : items;

  // A file in preview/<project>/ replaces the default piece with the same index
  // (a custom crop); one with a new index is added in index order.
  const overrides = filesIn([cat.dir, 'preview', folder]);
  const byIndex = new Map(overrides.map((o) => [pieceKey(o), o]));
  let preview = base.map((it) => byIndex.get(pieceKey(it)) || it);
  const extra = overrides.filter((o) => !base.some((b) => pieceKey(b) === pieceKey(o)));
  if (extra.length) {
    preview.push(...extra);
    preview.sort((a, b) => (a.major || 0) - (b.major || 0) || a.minor - b.minor);
  }

  // `preview:` in project.md sets the order (and selection) explicitly.
  if (info.preview && info.preview.length) {
    const all = new Map([...items, ...preview].map((p) => [pieceKey(p), p]));
    for (const p of preview) all.set(pieceKey(p), p); // overrides win
    const picked = info.preview.map((v) => all.get(parseIndex(v))).filter(Boolean) as Piece[];
    if (picked.length) preview = picked;
  }
  return preview;
}

// ---- project.md checks --------------------------------------------------------
// Mistakes in project.md stop the build with a message that names the file,
// instead of quietly showing the wrong film or ignoring a setting.

function fail(where: string, msg: string): never {
  throw new Error(`[portfolio] ${where}: ${msg}`);
}

function checkInfo(info: ProjectInfo, where: string) {
  const s = (v: unknown) => typeof v === 'string';
  if (info.youtube != null && !(s(info.youtube) && /^[\w-]{11}$/.test(info.youtube as string))) {
    fail(where, `youtube must be the 11-character video id in quotes, e.g. youtube: "2AmUoiHabYk" (got ${JSON.stringify(info.youtube)})`);
  }
  if (info.preview != null) {
    if (!Array.isArray(info.preview)) fail(where, 'preview must be a list, e.g. preview: ["2.1", "2"]');
    for (const v of info.preview) {
      if (!s(v)) fail(where, `write each preview index in quotes, e.g. "2.10" (got ${JSON.stringify(v)})`);
    }
  }
  if (info.slug != null && !(s(info.slug) && /^[a-z0-9-]+$/.test(info.slug as string))) {
    fail(where, 'slug may only use lowercase letters, digits and dashes');
  }
  for (const k of ['title', 'description', 'role', 'team', 'tools'] as const) {
    if (info[k] != null && !s(info[k])) fail(where, `${k} must be text`);
  }
}

// Folders under src/work that no category uses are ignored by the site:
// say so, so a new folder doesn't silently go missing.
const known = new Set(CATEGORIES.map((c) => c.dir));
for (const top of foldersIn([])) {
  if (!known.has(top)) console.warn(`[portfolio] src/work/${top} is not listed in CATEGORIES (src/lib/site.ts), so it is not on the site.`);
}

function build(): Category[] {
  return CATEGORIES.map((cfg) => {
    const category: Category = { ...cfg, url: `/${cfg.slug}/`, projects: [] };
    const folders = foldersIn([cfg.dir]).filter((n) => n.toLowerCase() !== 'preview');

    for (const folder of folders) {
      const infoMod = infoFiles[`${ROOT}${cfg.dir}/${folder}/project.md`];
      const info: ProjectInfo = (infoMod && infoMod.frontmatter) || {};
      checkInfo(info, `src/work/${cfg.dir}/${folder}/project.md`);
      if (info.draft) continue;

      const items = filesIn([cfg.dir, folder]);
      const groups: Group[] = foldersIn([cfg.dir, folder])
        .map((g) => ({ name: g, title: titleCase(cleanName(g)), items: filesIn([cfg.dir, folder, g]) }))
        .filter((g) => g.items.length);
      if (!items.length && !groups.length) continue;

      const display = cleanName(folder);
      const all = [...items, ...groups.flatMap((g) => g.items)];
      const preview = buildPreview(cfg, folder, items.length ? items : groups[0].items, info);
      const body = infoMod && infoMod.rawContent ? infoMod.rawContent().trim() : '';

      // A name with no Latin letters or digits ("★", "東京") still gets an
      // address, from its number; two projects can't share one.
      const slug = info.slug || slugify(display) || `project-${indexKey(folder).major}`;
      const twin = category.projects.find((p) => p.slug === slug);
      if (twin) {
        fail(`src/work/${cfg.dir}`, `"${folder}" and "${twin.folder}" would have the same address /${cfg.slug}/${slug}/. Rename one folder, or set slug: in its project.md.`);
      }

      category.projects.push({
        slug,
        folder,
        title: info.title || titleCase(display),
        info,
        Content: infoMod && infoMod.Content,
        hasBody: body.length > 0,
        items,
        groups,
        preview,
        coverImage: (preview.find((p) => p.image) || all.find((p) => p.image))?.image,
        category,
      });
    }
    return category;
  });
}

export const categories: Category[] = build();

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}

export function projectUrl(p: Project) {
  return `/${p.category.slug}/${p.slug}/`;
}

/** Group a base piece (minor 0) with its variants (minor > 0) into one row. */
export function pairRows(items: Piece[]) {
  const rows: { base: Piece; variants: Piece[] }[] = [];
  const baseByMajor = new Map<number, number>();
  for (const it of items) {
    if (it.minor && it.major != null && baseByMajor.has(it.major)) {
      rows[baseByMajor.get(it.major)!].variants.push(it);
    } else {
      rows.push({ base: it, variants: [] });
      if (it.major != null && !it.minor) baseByMajor.set(it.major, rows.length - 1);
    }
  }
  return rows;
}
