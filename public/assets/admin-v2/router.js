import { routeForPath } from './permissions.js';

let routeListener = null;
let navigationGuard = null;

function currentLocation() {
  return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash };
}

async function mayNavigate(destination) {
  if (!navigationGuard) return true;
  return navigationGuard(destination) !== false;
}

export function setNavigationGuard(guard) {
  navigationGuard = typeof guard === 'function' ? guard : null;
}

export async function navigate(to, { replace = false } = {}) {
  const destination = new URL(to, window.location.origin);
  if (destination.origin !== window.location.origin || !destination.pathname.startsWith('/admin')) {
    window.location.assign(destination.href);
    return;
  }
  if (!await mayNavigate(destination)) return;
  const route = routeForPath(destination.pathname);
  if (!route) {
    window.history[replace ? 'replaceState' : 'pushState']({}, '', destination.pathname + destination.search + destination.hash);
  } else {
    const canonical = route.path + destination.search + destination.hash;
    window.history[replace || route.path !== destination.pathname ? 'replaceState' : 'pushState']({}, '', canonical);
  }
  routeListener?.(currentLocation());
}

export function startRouter(listener) {
  routeListener = listener;
  window.addEventListener('popstate', async () => {
    if (!await mayNavigate(new URL(window.location.href))) {
      window.history.forward();
      return;
    }
    routeListener?.(currentLocation());
  });
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const destination = new URL(link.href, window.location.origin);
    if (destination.origin !== window.location.origin || !destination.pathname.startsWith('/admin')) return;
    event.preventDefault();
    navigate(destination.href);
  });
  routeListener(currentLocation());
}
