const SVG_NS = 'http://www.w3.org/2000/svg';

export function text(value) {
  return document.createTextNode(value == null ? '' : String(value));
}

export function el(tagName, attributes = {}, children = []) {
  const node = document.createElement(tagName);
  for (const [name, value] of Object.entries(attributes || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'className') node.className = String(value);
    else if (name === 'textContent') node.textContent = String(value);
    else if (name === 'htmlFor') node.htmlFor = String(value);
    else if (name === 'dataset' && value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) node.dataset[key] = String(item);
    } else if (name === 'style' && value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) node.style[key] = String(item);
    } else if (name === 'on' && value && typeof value === 'object') {
      for (const [eventName, listener] of Object.entries(value)) node.addEventListener(eventName, listener);
    } else if (name in node && !name.startsWith('aria-') && !name.startsWith('data-') && name !== 'role') {
      try { node[name] = value; } catch { node.setAttribute(name, String(value)); }
    } else if (value === true) node.setAttribute(name, '');
    else node.setAttribute(name, String(value));
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  const values = Array.isArray(children) ? children : [children];
  for (const child of values.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    parent.append(child instanceof Node ? child : text(child));
  }
  return parent;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

const ICON_PATHS = Object.freeze({
  overview: ['M3 13h8V3H3z', 'M13 21h8V11h-8z', 'M13 3h8v6h-8z', 'M3 15h8v6H3z'],
  products: ['M4 7h16', 'M5 7l1 14h12l1-14', 'M9 11v6', 'M15 11v6', 'M8 7V5a4 4 0 0 1 8 0v2'],
  collections: ['M4 5h16v14H4z', 'M4 9h16', 'M8 13h8'],
  media: ['M4 4h16v16H4z', 'm4 12 3-3 4 4 3-3 4 4', 'M15 8h.01'],
  content: ['M5 3h14v18H5z', 'M8 7h8', 'M8 11h8', 'M8 15h5'],
  teaching: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z', 'M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z'],
  orders: ['M6 2h12v20H6z', 'M9 6h6', 'M9 10h6', 'M9 14h4'],
  gift: ['M20 12v10H4V12', 'M2 7h20v5H2z', 'M12 22V7', 'M12 7H7.5a2.5 2.5 0 1 1 2.5-2.5C10 6 12 7 12 7z', 'M12 7h4.5A2.5 2.5 0 1 0 14 4.5C14 6 12 7 12 7z'],
  fulfillment: ['M3 6h11v10H3z', 'M14 9h4l3 3v4h-7z', 'M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  batches: ['M4 7h16v12H4z', 'M7 7V4h10v3', 'M8 11h8', 'M8 15h5'],
  pickup: ['M12 21s7-5.4 7-12A7 7 0 0 0 5 9c0 6.6 7 12 7 12z', 'M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  campaigns: ['M3 11h4l9-5v12l-9-5H3z', 'M7 13l2 7h3'],
  accountability: ['M4 19V5', 'M4 19h16', 'm7 15 3-4 3 2 4-6'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  sessions: ['M12 2a10 10 0 1 0 10 10', 'M12 6v6l4 2'],
  audit: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'm9 12 2 2 4-5'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronRight: ['m9 18 6-6-6-6'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  search: ['M21 21l-4.35-4.35', 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z'],
  filter: ['M4 5h16', 'M7 12h10', 'M10 19h4'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  plus: ['M12 5v14', 'M5 12h14'],
  duplicate: ['M8 8h11v11H8z', 'M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M5 20h14'],
  download: ['M12 4v12', 'm7 11 5 5 5-5', 'M5 20h14'],
  logout: ['M10 17l5-5-5-5', 'M15 12H3', 'M21 19V5a2 2 0 0 0-2-2h-6'],
  alert: ['M12 3 2 21h20z', 'M12 9v4', 'M12 17h.01'],
  check: ['m5 12 4 4L19 6'],
  lock: ['M5 10h14v11H5z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  unlock: ['M5 10h14v11H5z', 'M8 10V7a4 4 0 0 1 7.7-1.5'],
  external: ['M14 3h7v7', 'm10 14 11-11', 'M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6']
});

export function icon(name, { title = '', className = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', title ? 'false' : 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  if (title) {
    const titleNode = document.createElementNS(SVG_NS, 'title');
    titleNode.textContent = title;
    svg.append(titleNode);
  }
  for (const pathData of ICON_PATHS[name] || ICON_PATHS.alert) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}

export function button(label, {
  tone = 'secondary',
  iconName = '',
  type = 'button',
  className = '',
  disabled = false,
  onClick,
  attributes = {}
} = {}) {
  return el('button', {
    type,
    className: `button button-${tone}${className ? ` ${className}` : ''}`,
    disabled,
    on: onClick ? { click: onClick } : undefined,
    ...attributes
  }, [iconName ? icon(iconName) : null, el('span', { textContent: label })]);
}

export function statusBadge(status, label = '') {
  const normalized = String(status || 'unknown').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return el('span', {
    className: 'status-badge',
    dataset: { status: normalized },
    textContent: label || normalized.replaceAll('_', ' ').replaceAll('-', ' ')
  });
}

export function formatDate(value, { dateOnly = false } = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, dateOnly
    ? { year: 'numeric', month: 'short', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
  ).format(date);
}

export function formatMoney(value, currency = 'usd', { cents = true } = {}) {
  const amount = Number(value || 0) / (cents ? 100 : 1);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: String(currency || 'usd').toUpperCase() }).format(amount);
}

export function initials(value) {
  const parts = String(value || 'Administrator').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
}

export function safeFilename(value, fallback = 'download') {
  const name = String(value || fallback).normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return name.slice(0, 160) || fallback;
}

export function definitionList(record, fields) {
  const list = el('dl', { className: 'detail-list' });
  for (const field of fields) {
    const raw = typeof field.value === 'function' ? field.value(record) : record?.[field.value];
    const value = field.format ? field.format(raw, record) : raw;
    append(list, [el('dt', { textContent: field.label }), el('dd', {}, value instanceof Node ? value : String(value ?? '—'))]);
  }
  return list;
}

export function debounce(callback, wait = 250) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), wait);
  };
}
