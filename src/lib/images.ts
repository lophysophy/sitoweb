import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

export interface Responsive {
  src: string;
  srcset: string;
  width: number;
  height: number;
}

// File names keep their spaces and accents; URLs must be encoded, above all
// inside srcset, where a raw space would split the entry.
const url = (s: string) => encodeURI(decodeURI(s));

// Smaller copies are generated for phones and grids; the largest entry is always
// the original file, served untouched, so full-screen views keep every detail.
export async function responsive(img: ImageMetadata, widths: number[]): Promise<Responsive> {
  const ws = widths.filter((w) => w < img.width * 0.9);
  const variants = await Promise.all(
    ws.map((w) => getImage({ src: img, width: w, format: 'avif', quality: 62 })),
  );
  const srcset = [...variants.map((v, i) => `${url(v.src)} ${ws[i]}w`), `${url(img.src)} ${img.width}w`].join(', ');
  return { src: url(img.src), srcset, width: img.width, height: img.height };
}

/** A single resized copy (used where a plain src is needed, e.g. hover cycling). */
export async function resized(img: ImageMetadata, width: number) {
  if (width >= img.width * 0.9) return url(img.src);
  return url((await getImage({ src: img, width, format: 'avif', quality: 62 })).src);
}

/** 1200x630 JPEG for Open Graph / Twitter cards. */
export async function socialImage(img: ImageMetadata) {
  const out = await getImage({ src: img, width: 1200, height: 630, fit: 'cover', format: 'jpg', quality: 80 });
  return out.src;
}
