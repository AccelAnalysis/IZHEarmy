import { button, el, icon } from './dom.js';

function focusable(dialog) {
  return [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
}

export function createDialog({ title, description = '', wide = false, content, actions = [] }) {
  const previousFocus = document.activeElement;
  const dialog = el('dialog', { className: `dialog${wide ? ' dialog-wide' : ''}`, 'aria-labelledby': `dialog-title-${Date.now()}` });
  const titleId = dialog.getAttribute('aria-labelledby');
  const close = button('Close', {
    tone: 'quiet',
    className: 'icon-button',
    attributes: { 'aria-label': 'Close dialog' },
    onClick: () => dialog.close('cancel')
  });
  close.replaceChildren(icon('close'));
  const header = el('header', { className: 'dialog-header' }, [
    el('div', {}, [el('h2', { id: titleId, textContent: title }), description ? el('p', { textContent: description }) : null]),
    close
  ]);
  const body = el('div', { className: 'dialog-body' }, typeof content === 'function' ? content(dialog) : content);
  const footer = el('footer', { className: 'dialog-footer' }, actions.map((action) => button(action.label, {
    tone: action.tone || 'secondary',
    iconName: action.icon || '',
    disabled: action.disabled,
    attributes: action.attributes || {},
    onClick: (event) => action.onClick?.({ event, dialog, body })
  })));
  dialog.append(header, body, footer);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close('cancel');
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const items = focusable(dialog);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  document.body.append(dialog);
  dialog.showModal();
  window.requestAnimationFrame(() => focusable(dialog)[0]?.focus());
  return { dialog, body, footer };
}

export function confirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Explanation',
  reasonHelp = 'This explanation will be recorded in the administrative audit history.',
  requireCheckbox = false,
  checkboxLabel = 'I understand and confirm this action.',
  onConfirm
}) {
  const reason = requireReason ? el('textarea', { id: `reason-${Date.now()}`, rows: 4, maxLength: 1000 }) : null;
  const checkbox = requireCheckbox ? el('input', { type: 'checkbox', id: `confirm-${Date.now()}` }) : null;
  const content = el('div', { className: 'form-grid' }, [
    requireReason ? el('div', { className: 'field span-2' }, [
      el('label', { htmlFor: reason.id, textContent: reasonLabel }),
      reason,
      el('span', { className: 'field-help', textContent: reasonHelp })
    ]) : null,
    requireCheckbox ? el('label', { className: 'span-2' }, [checkbox, ' ', checkboxLabel]) : null
  ]);
  const modal = createDialog({
    title,
    description,
    content,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      {
        label: confirmLabel,
        tone,
        onClick: async ({ dialog, footer }) => {
          const explanation = reason?.value.trim() || '';
          if (requireReason && explanation.length < 10) {
            reason.setCustomValidity('Enter an explanation of at least 10 characters.');
            reason.reportValidity();
            reason.setCustomValidity('');
            return;
          }
          if (requireCheckbox && !checkbox.checked) {
            checkbox.setCustomValidity('Confirm this action before continuing.');
            checkbox.reportValidity();
            checkbox.setCustomValidity('');
            return;
          }
          const controls = [...footer.querySelectorAll('button')];
          controls.forEach((control) => { control.disabled = true; });
          try {
            const close = await onConfirm?.({ reason: explanation, confirmed: checkbox?.checked === true, dialog });
            if (close !== false) dialog.close('confirmed');
          } finally {
            if (dialog.open) controls.forEach((control) => { control.disabled = false; });
          }
        }
      }
    ]
  });
  return modal;
}
