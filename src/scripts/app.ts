// One entry point for every page. With Astro's ClientRouter, moving between
// pages swaps the content without a full reload: the old page's behaviour is
// torn down before the swap and the new page's mounted right after it (inside
// the transition, before the new page is shown).
import { teardown } from './lifecycle';
import { mountNav } from './nav';
import { mountGallery } from './gallery';
import { mountHero } from './hero';

// "Copy" next to the email address.
function mountCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => {
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy!);
        b.textContent = 'Copied';
      } catch {
        b.textContent = 'Select & copy';
      }
      setTimeout(() => { b.textContent = 'Copy'; }, 1800);
    });
  });
}

function mount() {
  mountCopy();
  mountNav();
  mountGallery();
  mountHero();
}

mount();

// Before the next page is fetched and shown: also wait (briefly) for its first
// pictures, so it arrives with its artwork already painted, not empty boxes.
// The pictures that matter are the ones the page marks as first (high fetch
// priority) and the posters of its clips. On a slow or data-saving connection
// the swap never waits: the blur previews cover the gap.
let prevUrl = location.href;
document.addEventListener('astro:before-preparation', (e: any) => {
  prevUrl = e.from?.href || prevUrl;
  const load = e.loader;
  e.loader = async () => {
    await load();
    const doc: Document | undefined = e.newDocument;
    if (!doc) return;
    const conn = (navigator as any).connection;
    if (conn && (conn.saveData || (conn.effectiveType && conn.effectiveType !== '4g'))) return;
    const urls: { src: string; srcset?: string; sizes?: string }[] = [];
    doc.querySelectorAll<HTMLImageElement>('main img[fetchpriority="high"]').forEach((i) => {
      urls.push({ src: i.getAttribute('src') || '', srcset: i.getAttribute('srcset') || undefined, sizes: i.getAttribute('sizes') || undefined });
    });
    doc.querySelectorAll<HTMLVideoElement>('main video[poster]').forEach((v, k) => {
      if (k < 2) urls.push({ src: v.getAttribute('poster')! });
    });
    const imgs = urls.slice(0, 3).map((u) => {
      const img = new Image();
      if (u.sizes) img.sizes = u.sizes;
      if (u.srcset) img.srcset = u.srcset;
      img.src = u.src;
      return img;
    });
    if (!imgs.length || imgs.every((i) => i.complete)) return; // already cached
    await Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 80))]);
  };
});

document.addEventListener('astro:before-swap', (e: any) => {
  teardown();
  // Coming back: skip the intro text's entrance, it was already seen.
  e.newDocument.documentElement.dataset.nav = e.navigationType;
});

document.addEventListener('astro:after-swap', () => {
  mount();
  // Back/Forward: the homepage mosaic sizes itself in script, after the router
  // restored the scroll position; restore it again so you land where you left.
  const st = history.state;
  if (st && typeof st.scrollY === 'number' && (document.documentElement.dataset.nav === 'traverse')) {
    window.scrollTo(st.scrollX || 0, st.scrollY);
  }
});

// Page views: GoatCounter counts the first load by itself; count the rest.
let first = true;
document.addEventListener('astro:page-load', () => {
  if (first) { first = false; return; }
  const gc = (window as any).goatcounter;
  // Referrer: the page the visitor came from on this site, not the outside
  // site they first arrived from.
  if (gc && gc.count) gc.count({ path: location.pathname, title: document.title, referrer: prevUrl });
});
