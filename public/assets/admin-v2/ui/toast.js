import { button, el } from './dom.js';

export function toast(message, { title = '', tone = 'information', timeout = 5_000 } = {}) {
  const region = document.getElementById('admin-toast-region');
  if (!region) return;
  const item = el('div', { className: 'toast', dataset: { tone }, role: tone === 'danger' ? 'alert' : 'status' });
  const copy = el('div', { className: 'toast-copy' }, [
    title ? el('strong', { textContent: title }) : null,
    el('span', { textContent: message })
  ]);
  const close = button('Dismiss', {
    tone: 'quiet',
    className: 'icon-button',
    attributes: { 'aria-label': 'Dismiss notification' },
    onClick: () => item.remove()
  });
  close.textContent = '×';
  item.append(copy, close);
  region.append(item);
  if (timeout > 0) window.setTimeout(() => item.remove(), timeout);
  return item;
}

export function errorToast(error, title = 'Action could not be completed') {
  const suffix = error?.requestId ? ` Request ID: ${error.requestId}` : '';
  return toast(`${error?.message || 'An unexpected error occurred.'}${suffix}`, { title, tone: 'danger', timeout: 9_000 });
}
