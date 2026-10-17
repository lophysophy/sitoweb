// One entry point for every page. With Astro's ClientRouter, moving between
// pages swaps the content without a full reload: the old page's behaviour is
// torn down before the swap and the new page's mounted right after it (inside
// the transition, before the new page is shown).
import { teardown } from './lifecycle';
import { mountNav } from './nav';
import { mountGallery } from './gallery';
import { mountHero } from './hero';

function mount() {
  mountNav();
  mountGallery();
  mountHero();
}

mount();

// Before the next page is fetched and shown: also wait (briefly) for its first
// pictures, so it arrives with its artwork already painted, not empty boxes.
document.addEventListener('astro:before-preparation', (e: any) => {
  const load = e.loader;
  e.loader = async () => {
    await load();
    const doc: Document | undefined = e.newDocument;
    if (!doc) return;
    const firsts = Array.from(doc.querySelectorAll<HTMLImageElement>('main img')).slice(0, 2);
    const warm = firsts.map((src) => {
      const img = new Image();
      if (src.getAttribute('sizes')) img.sizes = src.getAttribute('sizes')!;
      if (src.getAttribute('srcset')) img.srcset = src.getAttribute('srcset')!;
      img.src = src.getAttribute('src') || '';
      return img.decode().catch(() => {});
    });
    await Promise.race([Promise.all(warm), new Promise((r) => setTimeout(r, 160))]);
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
  if (gc && gc.count) gc.count({ path: location.pathname, title: document.title });
});
