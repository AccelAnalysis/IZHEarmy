import { functionUrl, logout, readSession, setSession, stepUp } from './api.js';
import { breadcrumbs, can, groupedRoutes, roleLabels, routeForPath, visibleRoutes } from './permissions.js';
import { navigate, startRouter } from './router.js';
import { updateState } from './state.js';
import { renderAccountability } from './pages/accountability.js';
import { renderAudit, renderSessions, renderUsers } from './pages/administration.js';
import { renderCollections, renderMedia } from './pages/catalog.js';
import { renderCampaigns } from './pages/campaigns.js';
import { renderTeaching, renderVisualEditor, renderWebsiteContent } from './pages/content.js';
import { renderOperations } from './pages/operations.js';
import { renderOverview } from './pages/overview.js';
import { errorPage, loadingPage, openDrawer } from './pages/page-utils.js';
import { renderProducts } from './pages/products.js';
import { button, definitionList, el, icon, initials } from './ui/dom.js';
import { openMenu } from './ui/dropdown.js';
import { errorToast, toast } from './ui/toast.js';

const root = document.getElementById('admin-root');
let shell = null;
let main = null;
let nav = null;
let topbarTitle = null;
let breadcrumbNode = null;
let session = null;
let renderSequence = 0;

function cleanupLegacyCredential() {
  // Migration cleanup only. Server-side authorization never depends on this key.
  try { window.localStorage.removeItem('izhe-admin-token'); } catch {}
}

function normalizeSession(payload) {
  const user = payload?.user || {
    id: payload?.userId || payload?.administrator?.id || '',
    email: payload?.email || payload?.administrator?.email || '',
    displayName: payload?.displayName || payload?.administrator?.displayName || ''
  };
  return {
    ...payload,
    configured: payload?.configured !== false && payload?.configurationError !== true,
    authenticated: Boolean(payload?.authenticated ?? payload?.active ?? user?.id),
    user,
    userId: payload?.userId || user?.id || '',
    email: payload?.email || user?.email || '',
    displayName: payload?.displayName || user?.displayName || user?.email || 'Administrator',
    roles: Array.isArray(payload?.roles) ? payload.roles : user?.roles || [],
    roleSummary: Array.isArray(payload?.roleSummary) ? payload.roleSummary : [],
    permissions: Array.isArray(payload?.permissions) ? payload.permissions : [],
    csrfToken: payload?.csrfToken || ''
  };
}

function configurationScreen(message = '') {
  root.className = 'configuration-page';
  root.replaceChildren(el('section', { className: 'configuration-card' }, [
    el('span', { className: 'brand-mark', textContent: 'IZHE' }),
    el('h1', { textContent: 'Administration is not configured' }),
    el('p', { textContent: message || 'Named-account OIDC, MFA, secure session, and audit configuration must be completed before administrative access is enabled.' }),
    el('p', { className: 'field-help', textContent: 'The application fails closed. Public commerce and teaching access remain available according to their existing public rules.' })
  ]));
}

function loginScreen(message = '') {
  root.className = 'configuration-page';
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  root.replaceChildren(el('section', { className: 'configuration-card' }, [
    el('span', { className: 'brand-mark', textContent: 'IZHE' }),
    el('h1', { textContent: 'Administrator sign in' }),
    el('p', { textContent: message || 'Use your invited named administrator account. The configured identity provider enforces verified email and multifactor authentication.' }),
    el('a', { className: 'button button-primary', href: functionUrl('admin-login', { returnTo }), textContent: 'Sign in with MFA' }),
    el('p', { className: 'field-help', textContent: 'There is no public administrator registration and no shared-token fallback.' })
  ]));
}

function navLink(route) {
  return el('a', { className: 'nav-link', href: route.path, dataset: { routeId: route.id } }, [
    el('span', { className: 'nav-icon' }, icon(route.icon)),
    el('span', { className: 'nav-label', textContent: route.label })
  ]);
}

function currentUserDetail() {
  return definitionList({
    id: session.userId,
    displayName: session.displayName,
    email: session.email,
    roles: roleLabels(session).join(', '),
    sessionExpiresAt: session.session?.absoluteExpiresAt || session.absoluteExpiresAt || '',
    recentAuthenticationUntil: session.session?.recentAuthenticationUntil || session.recentAuthenticationUntil || ''
  }, [
    { label: 'Administrator ID', value: 'id' },
    { label: 'Name', value: 'displayName' },
    { label: 'Email', value: 'email' },
    { label: 'Roles', value: 'roles' },
    { label: 'Session expires', value: 'sessionExpiresAt' },
    { label: 'Recent authentication until', value: 'recentAuthenticationUntil' }
  ]);
}

function accountMenu(trigger) {
  openMenu(trigger, [
    { label: 'My Account', onSelect: () => openDrawer({ title: session.displayName, description: session.email, content: currentUserDetail() }) },
    { label: 'Security', onSelect: () => stepUp() },
    { label: 'Active Sessions', onSelect: () => navigate('/admin/administration/sessions') },
    { separator: true },
    { label: 'Sign Out', danger: true, onSelect: async () => {
      try { await logout(); }
      catch (error) { errorToast(error, 'Sign out could not be completed'); return; }
      window.location.replace('/admin/');
    } }
  ], { label: 'Account menu' });
}

function buildShell() {
  const groups = groupedRoutes(session);
  nav = el('aside', { className: 'admin-nav', 'aria-label': 'Administration navigation' }, [
    el('div', { className: 'nav-brand' }, [
      el('span', { className: 'brand-mark', textContent: 'IZHE' }),
      el('span', { className: 'nav-brand-copy' }, [el('strong', { textContent: 'Administration' }), el('span', { textContent: 'Secure operations' })])
    ]),
    el('nav', { className: 'nav-scroll' }, groups.flatMap((group) => [
      group.label ? el('div', { className: 'nav-section', textContent: group.label }) : null,
      ...group.routes.map(navLink)
    ]))
  ]);

  const mobileNavButton = button('Open navigation', { tone: 'quiet', className: 'icon-button mobile-nav-button', attributes: { 'aria-label': 'Open navigation' } });
  mobileNavButton.replaceChildren(icon('menu'));
  const collapseButton = button('Collapse navigation', { tone: 'quiet', className: 'icon-button desktop-nav-button', attributes: { 'aria-label': 'Collapse navigation' } });
  collapseButton.replaceChildren(icon('menu'));
  breadcrumbNode = el('div', { className: 'breadcrumbs', 'aria-label': 'Breadcrumbs' });
  topbarTitle = el('h1', { textContent: 'Administration' });
  const accountButton = el('button', { type: 'button', className: 'account-button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, [
    el('span', { className: 'account-avatar', textContent: initials(session.displayName) }),
    el('span', { className: 'account-copy' }, [
      el('strong', { textContent: session.displayName }),
      el('span', { textContent: roleLabels(session).join(', ') || 'Administrator' })
    ]),
    icon('chevronDown')
  ]);
  accountButton.addEventListener('click', () => accountMenu(accountButton));

  const topbar = el('header', { className: 'admin-topbar' }, [
    el('div', { className: 'topbar-start' }, [
      mobileNavButton,
      collapseButton,
      el('div', { className: 'topbar-title' }, [breadcrumbNode, topbarTitle])
    ]),
    el('div', { className: 'topbar-actions' }, [
      button('Alerts', { tone: 'quiet', className: 'icon-button', attributes: { 'aria-label': 'Open operational alerts' }, onClick: () => navigate('/admin/') }),
      accountButton
    ])
  ]);
  topbar.querySelector('[aria-label="Open operational alerts"]').replaceChildren(icon('alert'));

  main = el('main', { id: 'admin-workspace', className: 'admin-main', tabindex: '-1' });
  shell = el('div', { className: 'admin-shell' }, [nav, topbar, main]);
  root.className = '';
  root.replaceChildren(shell);

  collapseButton.addEventListener('click', () => {
    shell.classList.toggle('nav-collapsed');
    collapseButton.setAttribute('aria-label', shell.classList.contains('nav-collapsed') ? 'Expand navigation' : 'Collapse navigation');
  });
  mobileNavButton.addEventListener('click', () => {
    shell.classList.add('mobile-nav-open');
    const backdrop = el('button', { type: 'button', className: 'mobile-nav-backdrop', 'aria-label': 'Close navigation' });
    backdrop.addEventListener('click', () => { shell.classList.remove('mobile-nav-open'); backdrop.remove(); mobileNavButton.focus(); });
    shell.append(backdrop);
  });
}

function updateRouteContext(route) {
  for (const link of nav?.querySelectorAll('.nav-link') || []) {
    if (link.dataset.routeId === route?.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const crumbs = breadcrumbs(route);
  breadcrumbNode?.replaceChildren(...crumbs.flatMap((label, index) => [
    index ? el('span', { textContent: '/' }) : null,
    el('span', { textContent: label })
  ]).filter(Boolean));
  if (topbarTitle) topbarTitle.textContent = route?.label || 'Administration';
  document.title = `${route?.label || 'Administration'} · IZHE Army`;
  shell?.classList.remove('mobile-nav-open');
  shell?.querySelector('.mobile-nav-backdrop')?.remove();
}

async function pageForRoute(route) {
  const context = { session, route, navigate };
  if (route.id === 'overview') return renderOverview(context);
  if (route.id === 'products') return renderProducts(context);
  if (route.id === 'collections') return renderCollections(context);
  if (route.id === 'media') return renderMedia(context);
  if (route.id === 'website-content') return renderWebsiteContent(context);
  if (route.id === 'visual-editor') return renderVisualEditor(context);
  if (route.id === 'teaching') return renderTeaching(context);
  if (['orders', 'give-one', 'fulfillment', 'batches', 'pickup'].includes(route.id)) return renderOperations(context);
  if (route.id === 'campaigns') return renderCampaigns(context);
  if (route.id === 'accountability') return renderAccountability(context);
  if (route.id === 'users') return renderUsers(context);
  if (route.id === 'sessions') return renderSessions(context);
  if (route.id === 'audit') return renderAudit(context);
  throw Object.assign(new Error('The requested administration page does not exist.'), { status: 404 });
}

async function renderLocation(location) {
  const sequence = ++renderSequence;
  let route = routeForPath(location.pathname);
  if (!route) {
    const first = visibleRoutes(session)[0];
    if (first) { await navigate(first.path, { replace: true }); return; }
    main.replaceChildren(errorPage('Administration', { status: 403, message: 'This account has no administrative permissions.' }));
    return;
  }
  if (!can(session, route.permission)) {
    updateRouteContext(route);
    main.replaceChildren(errorPage(route.label, { status: 403, message: 'Your current administrator roles do not grant access to this page.' }));
    return;
  }
  updateState({ route });
  updateRouteContext(route);
  main.replaceChildren(loadingPage(route.label));
  main.focus({ preventScroll: true });
  try {
    const page = await pageForRoute(route);
    if (sequence !== renderSequence) return;
    main.replaceChildren(page);
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (error) {
    if (sequence !== renderSequence) return;
    main.replaceChildren(errorPage(route.label, error, () => renderLocation(location)));
    if (error?.status !== 403) errorToast(error, `${route.label} could not be loaded`);
  }
}

async function boot() {
  cleanupLegacyCredential();
  try {
    const payload = await readSession();
    session = normalizeSession(payload);
    setSession(session);
    updateState({ session });
    if (!session.configured) { configurationScreen(payload.configurationMessage || payload.error || 'Administrator identity and secure-session configuration is incomplete.'); return; }
    if (!session.authenticated) { loginScreen(payload.message || 'Your administrator session is not active.'); return; }
    buildShell();
    startRouter(renderLocation);
  } catch (error) {
    if (error?.status === 401) { loginScreen(error.message); return; }
    if (error?.status === 503 || error?.code === 'admin_not_configured') { configurationScreen(error.message); return; }
    root.className = 'configuration-page';
    root.replaceChildren(el('section', { className: 'configuration-card' }, [
      el('span', { className: 'brand-mark', textContent: 'IZHE' }),
      el('h1', { textContent: 'Administration is unavailable' }),
      el('p', { textContent: `${error?.message || 'The secure administrator session could not be checked.'}${error?.requestId ? ` Request ID: ${error.requestId}` : ''}` }),
      button('Try Again', { tone: 'secondary', onClick: () => window.location.reload() })
    ]));
  }
}

window.addEventListener('izhe:admin-session-expired', () => {
  toast('Your administrator session has expired or was revoked.', { title: 'Sign in required', tone: 'warning', timeout: 0 });
  window.setTimeout(() => window.location.replace('/admin/'), 900);
});

boot();
