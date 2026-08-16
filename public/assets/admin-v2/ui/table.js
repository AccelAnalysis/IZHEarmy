import { button, el, icon } from './dom.js';
import { attachMenu } from './dropdown.js';

function cellValue(column, record) {
  const raw = typeof column.value === 'function' ? column.value(record) : record?.[column.value];
  return column.render ? column.render(raw, record) : raw;
}

export function dataTable({
  columns,
  rows = [],
  rowKey = (record) => record.id,
  actions,
  emptyTitle = 'No records found',
  emptyMessage = 'Adjust the search or filters and try again.',
  loading = false,
  loadingRows = 6,
  caption = ''
}) {
  const shell = el('div', { className: 'table-shell' });
  const scroll = el('div', { className: 'table-scroll', tabindex: '0' });
  const table = el('table');
  if (caption) table.append(el('caption', { className: 'sr-only', textContent: caption }));
  const head = el('thead');
  const headRow = el('tr');
  for (const column of columns) {
    headRow.append(el('th', {
      scope: 'col',
      className: column.numeric ? 'numeric' : '',
      textContent: column.label,
      style: column.width ? { width: column.width } : undefined
    }));
  }
  if (actions) headRow.append(el('th', { scope: 'col', className: 'table-actions', textContent: 'Actions' }));
  head.append(headRow);
  const body = el('tbody');
  if (loading) {
    for (let index = 0; index < loadingRows; index += 1) {
      const row = el('tr', { className: 'loading-row', 'aria-hidden': 'true' });
      for (let columnIndex = 0; columnIndex < columns.length + (actions ? 1 : 0); columnIndex += 1) {
        row.append(el('td', {}, el('span', { className: 'skeleton', style: { width: `${58 + ((index + columnIndex) % 4) * 9}%` } })));
      }
      body.append(row);
    }
  } else {
    for (const record of rows) {
      const row = el('tr', { dataset: { rowId: rowKey(record) } });
      for (const column of columns) {
        const content = cellValue(column, record);
        row.append(el('td', { className: column.numeric ? 'numeric' : '' }, content instanceof Node ? content : String(content ?? '—')));
      }
      if (actions) {
        const trigger = button('More Actions', {
          tone: 'quiet',
          className: 'icon-button',
          attributes: { 'aria-label': `More Actions for ${record.name || record.title || record.orderNumber || rowKey(record)}` }
        });
        trigger.replaceChildren(icon('more'));
        attachMenu(trigger, () => actions(record), { label: 'More Actions' });
        row.append(el('td', { className: 'table-actions' }, trigger));
      }
      body.append(row);
    }
  }
  table.append(head, body);
  scroll.append(table);
  shell.append(scroll);
  if (!loading && !rows.length) shell.append(el('div', { className: 'empty-state' }, [
    el('h3', { textContent: emptyTitle }),
    el('p', { textContent: emptyMessage })
  ]));
  return { shell, table, body };
}

export function pagination({ total = 0, returned = 0, hasMore = false, hasPrevious = false, onNext, onPrevious }) {
  return el('div', { className: 'pagination' }, [
    el('span', { className: 'pagination-summary', textContent: total ? `Showing ${returned} of ${total} matching records` : `${returned} records` }),
    el('div', { className: 'pagination-actions' }, [
      button('Previous', { tone: 'secondary', disabled: !hasPrevious, onClick: onPrevious }),
      button('Next', { tone: 'secondary', disabled: !hasMore, onClick: onNext })
    ])
  ]);
}
