// The back row under the bar. Its link always points one level up, so it works
// without script and on a direct landing. With the script it steps back
// through the tab's history instead when that is where it leads, so the grid
// or the homepage comes back scrolled to where you left it. Hopping between
// projects with Previous/Next keeps the page you came from: one click on the
// back link skips the whole chain.
//
// Each history entry remembers where it was entered from ({ url, index }) in
// sessionStorage, keyed by the router's history index, so it survives Back,
// Forward and reloads.
import { signal } from './lifecycle';

type Origin = { url: string; index: number };

let last: { path: string; index: number | undefined; project: string | null } | null = null;

const key = (i: number) => `back:${i}`;
function read(i: number | undefined): Origin | null {
  if (typeof i !== 'number') return null;
  try { return JSON.parse(sessionStorage.getItem(key(i)) || 'null'); } catch { return null; }
}
function write(i: number | undefined, o: Origin | null) {
  if (typeof i !== 'number') return;
  try {
    // A new page can reuse the index of entries dropped from Forward.
    if (o) sessionStorage.setItem(key(i), JSON.stringify(o));
    else sessionStorage.removeItem(key(i));
  } catch { /* storage off: the plain link still works */ }
}

export function mountBack() {
  const index: number | undefined = history.state?.index;
  const path = location.pathname;
  // Project pages carry their category ("/animation/") on the article.
  const project = document.querySelector<HTMLElement>('[data-project]') ? path.replace(/[^/]+\/$/, '') : null;
  const traverse = document.documentElement.dataset.nav === 'traverse';

  // A new entry reached by a link inside the site: note where it came from.
  if (last && !traverse && last.path !== path) {
    const hop = project && last.project === project; // Previous / Next
    write(index, hop ? read(last.index) : { url: last.path, index: last.index ?? -1 });
  }
  last = { path, index, project };

  const link = document.querySelector<HTMLAnchorElement>('[data-back]');
  if (!link) return;
  const origin = read(index);
  // A project opened from the homepage leads back there.
  if (project && origin?.url === '/') {
    link.href = '/';
    const label = link.querySelector('[data-back-label]');
    if (label) label.textContent = 'Home';
  }
  link.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!origin || typeof index !== 'number' || origin.index < 0) return;
    if (origin.url !== new URL(link.href).pathname || origin.index >= index) return;
    e.preventDefault();
    history.go(origin.index - index);
  }, { signal: signal() });
}
