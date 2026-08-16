import { api } from '../api.js';
import { can } from '../permissions.js';
import { button, el, formatDate, icon } from '../ui/dom.js';
import { pageHeader, pageSection } from './page-utils.js';

export async function renderOverview({ session, navigate }) {
  const { data } = await api('/.netlify/functions/admin-overview');
  const counts = data.counts || {};
  const cards = [
    can(session, 'operations.orders.read') ? { label: 'Orders', value: counts.orders ?? 0, meta: `${counts.pendingOrders ?? 0} require attention`, route: '/admin/operations/orders' } : null,
    can(session, 'operations.give_one.read') ? { label: 'Active Give One codes', value: counts.activeGiveOneCodes ?? 0, meta: `${counts.pendingRedemptions ?? 0} redemptions pending`, route: '/admin/operations/give-one' } : null,
    can(session, 'operations.batches.read') ? { label: 'Open production batches', value: counts.openBatches ?? 0, meta: 'Draft through received', route: '/admin/operations/production-batches' } : null,
    can(session, 'catalog.products.read') ? { label: 'Products', value: counts.products ?? 0, meta: `${counts.publishedProducts ?? 0} published`, route: '/admin/catalog/products' } : null,
    can(session, 'campaigns.read') ? { label: 'Campaigns', value: counts.campaigns ?? 0, meta: 'Church and ministry programs', route: '/admin/campaigns' } : null,
    can(session, 'media.read') ? { label: 'Media assets', value: counts.media ?? 0, meta: 'Loaded only when requested', route: '/admin/catalog/media' } : null
  ].filter(Boolean).slice(0, 6);

  const page = el('div', { className: 'page' }, [
    pageHeader({
      title: 'Overview',
      description: 'Operational totals and current exceptions. Full customer and financial records are not loaded on this page.'
    }),
    el('div', { className: 'kpi-grid' }, cards.map((card) => {
      const node = el('article', { className: 'kpi-card' }, [
        el('span', { className: 'kpi-label', textContent: card.label }),
        el('strong', { className: 'kpi-value', textContent: String(card.value) }),
        el('span', { className: 'kpi-meta', textContent: card.meta })
      ]);
      node.tabIndex = 0;
      node.setAttribute('role', 'link');
      node.addEventListener('click', () => navigate(card.route));
      node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(card.route); } });
      return node;
    }))
  ]);

  const alerts = el('ul', { className: 'alert-list' });
  for (const alert of data.alerts || []) {
    alerts.append(el('li', { className: 'alert-row', dataset: { severity: alert.severity || 'information' } }, [
      el('span', { className: 'alert-marker', 'aria-hidden': 'true' }),
      el('div', { className: 'alert-content' }, [el('strong', { textContent: alert.label }), alert.route ? el('span', { textContent: 'Open the related workspace for details.' }) : null]),
      alert.route ? button('View Details', { tone: 'quiet', onClick: () => navigate(alert.route) }) : null
    ]));
  }
  if (!(data.alerts || []).length) alerts.append(el('li', { className: 'alert-row' }, [el('span', { className: 'alert-marker' }), el('div', { className: 'alert-content' }, [el('strong', { textContent: 'No current operational alerts' }), el('span', { textContent: 'The summary endpoints did not identify an exception requiring attention.' })]) ]));
  page.append(pageSection({ title: 'Operational alerts', description: 'High-value exceptions only; detail is loaded in the relevant module.', content: alerts }));

  if (can(session, 'administration.audit.read')) {
    const activity = el('ul', { className: 'activity-list' });
    for (const event of data.recentActivity || []) {
      activity.append(el('li', { className: 'activity-row' }, [
        el('span', { className: 'nav-icon' }, icon(event.result === 'success' ? 'check' : 'alert')),
        el('div', { className: 'alert-content' }, [
          el('strong', { textContent: `${event.actorDisplayName || 'Administrator'} · ${String(event.action || '').replaceAll('_', ' ')}` }),
          el('span', { className: 'activity-meta', textContent: `${event.resourceType || 'administrative resource'}${event.resourceId ? ` · ${event.resourceId}` : ''} · ${formatDate(event.timestamp)}` })
        ])
      ]));
    }
    page.append(pageSection({ title: 'Recent administrative activity', description: 'Attributable events from the append-only audit chain.', content: activity }));
  }
  return page;
}
