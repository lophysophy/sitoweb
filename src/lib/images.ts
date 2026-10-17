import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

export interface Responsive {
  src: string;
  srcset: string;
  width: number;
  height: number;
}

// File names keep their spaces and accents; URLs must be encoded, above all
// inside srcset, where a raw space would split the entry.
// (Dev-server /_image URLs come already encoded and are left alone.)
const url = (s: string) => (s.startsWith('/_image') ? s : encodeURI(decodeURI(s)));

// Smaller copies are generated for phones and grids; the largest entry is always
// the original file, served untouched, so full-screen views keep every detail.
export async function responsive(img: ImageMetadata, widths: number[]): Promise<Responsive> {
  // Animated GIFs would lose their motion if resized: serve them as they are.
  if (img.format === 'gif') return { src: url(img.src), srcset: '', width: img.width, height: img.height };
  const ws = widths.filter((w) => w < img.width * 0.9);
  const variants = await Promise.all(
    ws.map((w) => getImage({ src: img, width: w, format: 'avif', quality: 62 })),
  );
  const srcset = [...variants.map((v, i) => `${url(v.src)} ${ws[i]}w`), `${url(img.src)} ${img.width}w`].join(', ');
  return { src: url(img.src), srcset, width: img.width, height: img.height };
}

/** A single resized copy (used where a plain src is needed, e.g. hover cycling). */
export async function resized(img: ImageMetadata, width: number) {
  if (width >= img.width * 0.9 || img.format === 'gif') return url(img.src);
  return url((await getImage({ src: img, width, format: 'avif', quality: 62 })).src);
}

/** 1200x630 JPEG for Open Graph / Twitter cards. */
export async function socialImage(img: ImageMetadata) {
  const out = await getImage({ src: img, width: 1200, height: 630, fit: 'cover', format: 'jpg', quality: 80 });
  return out.src;
}

// ---- Blur preview -------------------------------------------------------------
// A ~200-byte blurred thumbnail, inlined in the page, shown behind each piece
// until it loads: the composition and colours are there at once, never an empty
// box. Cached on disk between builds.

const CACHE = path.join(process.cwd(), 'node_modules/.astro/placeholders.json');
let cache: Record<string, string> | null = null;

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { cache = {}; }
  return cache!;
}

// Saved on every new entry (a few KB; the build can end without an exit event).
function save() {
  try {
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(cache));
  } catch {}
}

export async function placeholder(file?: string): Promise<string | undefined> {
  if (!file) return undefined;
  const c = load();
  let key: string;
  try {
    const st = fs.statSync(file);
    key = `${file}:${st.size}:${st.mtimeMs}`;
  } catch {
    return undefined;
  }
  if (c[key]) return c[key];
  try {
    const buf = await sharp(file).resize(24).blur(0.6).webp({ quality: 45 }).toBuffer();
    c[key] = `data:image/webp;base64,${buf.toString('base64')}`;
    save();
    return c[key];
  } catch {
    return undefined;
  }
}
