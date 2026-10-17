// Page lifecycle for client-side navigation (Astro's ClientRouter swaps pages
// without reloading). Each page's behaviour is mounted after a swap and torn
// down before the next one: listeners on window/document take `signal()`,
// observers and timers register their teardown with `onCleanup()`.

let ctrl = new AbortController();
const cleanups: (() => void)[] = [];

/** Abort signal for listeners added to window/document during this page. */
export function signal() {
  return ctrl.signal;
}

export function onCleanup(fn: () => void) {
  cleanups.push(fn);
}

/** An IntersectionObserver that disconnects when the page is left. */
export function observe(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
  const io = new IntersectionObserver(cb, options);
  onCleanup(() => io.disconnect());
  return io;
}

export function teardown() {
  ctrl.abort();
  for (const fn of cleanups.splice(0)) {
    try { fn(); } catch {}
  }
  ctrl = new AbortController();
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
