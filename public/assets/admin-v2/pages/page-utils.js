import { button, el, icon } from '../ui/dom.js';

export function pageHeader({ title, description = '', actions = [] }) {
  return el('header', { className: 'page-header' }, [
    el('div', { className: 'page-heading' }, [el('h2', { textContent: title }), description ? el('p', { textContent: description }) : null]),
    actions.length ? el('div', { className: 'page-actions' }, actions) : null
  ]);
}

export function pageSection({ title, description = '', action = null, content }) {
  return el('section', { className: 'page-section' }, [
    el('header', { className: 'section-header' }, [
      el('div', {}, [el('h3', { textContent: title }), description ? el('p', { textContent: description }) : null]),
      action
    ]),
    content
  ]);
}

export function loadingPage(title = 'Loading') {
  return el('div', { className: 'page' }, [
    pageHeader({ title, description: 'Loading current administrative data…' }),
    el('div', { className: 'table-shell' }, Array.from({ length: 7 }, () => el('div', { className: 'loading-row', style: { padding: '14px' } }, el('span', { className: 'skeleton', style: { width: `${55 + Math.random() * 35}%` } }))))
  ]);
}

export function errorPage(title, error, retry) {
  return el('div', { className: 'page' }, [
    pageHeader({ title, description: 'This administrative page could not be loaded.' }),
    el('div', { className: 'empty-state table-shell' }, [
      el('h3', { textContent: error?.status === 403 ? 'Access is not authorized' : 'Administrative data is unavailable' }),
      el('p', { textContent: `${error?.message || 'An unexpected error occurred.'}${error?.requestId ? ` Request ID: ${error.requestId}` : ''}` }),
      retry ? button('Try Again', { tone: 'secondary', onClick: retry }) : null
    ])
  ]);
}

export function openDrawer({ title, description = '', content, footer = null }) {
  const previousFocus = document.activeElement;
  const backdrop = el('button', { type: 'button', className: 'drawer-backdrop', 'aria-label': 'Close detail view' });
  const drawer = el('aside', { className: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = button('Close', { tone: 'quiet', className: 'icon-button', attributes: { 'aria-label': 'Close detail view' } });
  close.replaceChildren(icon('close'));
  const closeDrawer = () => {
    backdrop.remove();
    drawer.remove();
    document.body.style.overflow = '';
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  };
  close.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  drawer.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); } });
  drawer.append(
    el('header', { className: 'drawer-header' }, [el('div', {}, [el('h2', { textContent: title }), description ? el('p', { className: 'field-help', textContent: description }) : null]), close]),
    el('div', { className: 'drawer-body' }, content),
    footer ? el('footer', { className: 'drawer-footer' }, footer) : el('footer', { className: 'drawer-footer' }, button('Close', { tone: 'secondary', onClick: closeDrawer }))
  );
  document.body.append(backdrop, drawer);
  document.body.style.overflow = 'hidden';
  window.requestAnimationFrame(() => close.focus());
  return { drawer, close: closeDrawer };
}

export function filterChip(label, onRemove) {
  return el('span', { className: 'filter-chip' }, [
    el('span', { textContent: label }),
    el('button', { type: 'button', 'aria-label': `Remove ${label} filter`, textContent: '×', on: { click: onRemove } })
  ]);
}

export function field(label, input, { help = '', span = 1 } = {}) {
  const id = input.id || `field-${crypto.randomUUID()}`;
  input.id = id;
  return el('div', { className: `field${span === 2 ? ' span-2' : ''}` }, [
    el('label', { htmlFor: id, textContent: label }),
    input,
    help ? el('span', { className: 'field-help', textContent: help }) : null
  ]);
}

export function jsonDetails(record) {
  const block = el('pre', { className: 'code-block' });
  block.textContent = JSON.stringify(record, null, 2);
  return block;
}
