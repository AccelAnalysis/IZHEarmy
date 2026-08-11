import { el } from './dom.js';

let activeMenu = null;

function closeActive({ restoreFocus = true } = {}) {
  if (!activeMenu) return;
  const { menu, trigger, outsideListener, resizeListener } = activeMenu;
  document.removeEventListener('pointerdown', outsideListener, true);
  window.removeEventListener('resize', resizeListener);
  window.removeEventListener('scroll', resizeListener, true);
  menu.remove();
  trigger.setAttribute('aria-expanded', 'false');
  activeMenu = null;
  if (restoreFocus && trigger.isConnected) trigger.focus();
}

function positionMenu(menu, trigger) {
  const rect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  let left = rect.right - menuRect.width;
  if (left < margin) left = margin;
  if (left + menuRect.width > window.innerWidth - margin) left = window.innerWidth - menuRect.width - margin;
  let top = rect.bottom + 6;
  if (top + menuRect.height > window.innerHeight - margin && rect.top > menuRect.height + margin) top = rect.top - menuRect.height - 6;
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
}

export function openMenu(trigger, items, { label = 'More Actions' } = {}) {
  if (activeMenu?.trigger === trigger) { closeActive(); return; }
  closeActive({ restoreFocus: false });
  const menu = el('div', { className: 'menu', role: 'menu', 'aria-label': label });
  const actionable = [];
  for (const item of items.filter((candidate) => candidate && candidate.visible !== false)) {
    if (item.separator) { menu.append(el('div', { className: 'menu-separator', role: 'separator' })); continue; }
    const control = el('button', {
      type: 'button',
      className: `menu-item${item.danger ? ' menu-item-danger' : ''}`,
      role: 'menuitem',
      disabled: item.disabled,
      textContent: item.label,
      on: {
        click: async () => {
          closeActive({ restoreFocus: false });
          await item.onSelect?.();
        }
      }
    });
    menu.append(control);
    if (!item.disabled) actionable.push(control);
  }
  if (!actionable.length) menu.append(el('div', { className: 'menu-item', textContent: 'No actions available' }));
  document.body.append(menu);
  positionMenu(menu, trigger);
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'true');

  const outsideListener = (event) => {
    if (!menu.contains(event.target) && event.target !== trigger) closeActive({ restoreFocus: false });
  };
  const resizeListener = () => activeMenu && positionMenu(menu, trigger);
  activeMenu = { menu, trigger, outsideListener, resizeListener };
  document.addEventListener('pointerdown', outsideListener, true);
  window.addEventListener('resize', resizeListener);
  window.addEventListener('scroll', resizeListener, true);

  menu.addEventListener('keydown', (event) => {
    const itemsNow = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const index = itemsNow.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); closeActive(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); itemsNow[(index + 1 + itemsNow.length) % itemsNow.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); itemsNow[(index - 1 + itemsNow.length) % itemsNow.length]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); itemsNow[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); itemsNow.at(-1)?.focus(); }
  });
  window.requestAnimationFrame(() => actionable[0]?.focus());
  return menu;
}

export function attachMenu(trigger, itemFactory, options) {
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    openMenu(trigger, typeof itemFactory === 'function' ? itemFactory() : itemFactory, options);
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu(trigger, typeof itemFactory === 'function' ? itemFactory() : itemFactory, options);
    }
  });
  return trigger;
}

export function closeMenus() {
  closeActive({ restoreFocus: false });
}
