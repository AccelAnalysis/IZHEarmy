(() => {
  'use strict';
  let token = '';
  let data = null;
  const $ = (selector) => document.querySelector(selector);

  const designs = [
    ['yhwh','YHWH — IZHE The One Who Is?'],
    ['iam','I AM — IZHE Still I AM?'],
    ['elohim','Elohim — IZHE Your Creator?'],
    ['el','El — IZHE Mighty Enough?'],
    ['adonai','Adonai — IZHE Your Lord?'],
    ['shaddai','Shaddai — IZHE Enough?'],
    ['el-shaddai','El Shaddai — IZHE God Almighty?'],
    ['yhwh-tsevaot','YHWH Tsevaot — IZHE Fighting For You?'],
    ['holy-one','The Holy One — IZHE Holy?'],
    ['living-god','The Living God — IZHE Alive?'],
    ['most-high','Most High — IZHE Above All?'],
    ['lord-of-lords','Lord of Lords — IZHE Lord Over Lords?']
  ];
  $('#productId').innerHTML = designs.flatMap(([id,name]) => [
    `<option value="c1-${id}-adult">${name} — Adult</option>`,
    `<option value="c1-${id}-kids">${name} — Kids</option>`
  ]).join('');

  $('#tokenForm').addEventListener('submit', (event) => {
    event.preventDefault();
    token = $('#token').value;
    load();
  });

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'The request failed.');
    return body;
  }

  async function load() {
    try {
      data = await request('/.netlify/functions/admin-data');
      $('#login').classList.add('hidden');
      $('#dashboard').classList.remove('hidden');
      render();
    } catch (error) {
      $('#loginStatus').textContent = error.message;
    }
  }

  function render() {
    const active = data.codes.filter((code) => code.status === 'active');
    const pending = data.redemptions.filter((redemption) => redemption.status === 'pending_fulfillment');
    $('#orderCount').textContent = data.orders.length;
    $('#activeCount').textContent = active.length;
    $('#redemptionCount').textContent = pending.length;
    $('#updated').textContent = `Updated ${new Date().toLocaleString()}`;
    $('#redemptions').innerHTML = data.redemptions.map((redemption) => `
      <tr class="border-b border-white/5">
        <td class="p-4 font-mono">${redemption.confirmation}</td>
        <td class="p-4">${redemption.recipient.firstName} ${redemption.recipient.lastName}<br><span class="text-slate-400">${redemption.recipient.email}</span></td>
        <td class="p-4">${redemption.productName}<br>${redemption.fit || '—'} · Size ${redemption.size}</td>
        <td class="p-4">${redemption.recipient.address1}${redemption.recipient.address2 ? `<br>${redemption.recipient.address2}` : ''}<br>${redemption.recipient.city}, ${redemption.recipient.state} ${redemption.recipient.postalCode}</td>
        <td class="p-4">${redemption.status}${redemption.tracking ? `<br><span class="text-slate-400">${redemption.tracking}</span>` : ''}</td>
        <td class="p-4">${new Date(redemption.createdAt).toLocaleString()}</td>
        <td class="p-4">${redemption.status !== 'fulfilled' ? `<button class="text-amber-400 font-bold" data-fulfill="${redemption.confirmation}">MARK FULFILLED</button>` : '—'}</td>
      </tr>
    `).join('');

    document.querySelectorAll('[data-fulfill]').forEach((button) => {
      button.addEventListener('click', async () => {
        const tracking = prompt('Tracking number or fulfillment note (optional):') || '';
        try {
          await request('/.netlify/functions/admin-update-redemption', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ confirmation: button.dataset.fulfill, status: 'fulfilled', tracking })
          });
          await load();
        } catch (error) {
          alert(error.message);
        }
      });
    });
  }

  $('#refresh').addEventListener('click', load);

  $('#createCodes').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await request('/.netlify/functions/admin-create-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: $('#productId').value,
          orderRef: $('#orderRef').value,
          count: Number($('#count').value)
        })
      });
      alert(result.created.map((entry) => entry.code).join('\n'));
      await load();
    } catch (error) {
      alert(error.message);
    }
  });

  $('#export').addEventListener('click', () => {
    const rows = [
      ['Confirmation', 'Code', 'Product', 'Fit', 'Size', 'First Name', 'Last Name', 'Email', 'Address 1', 'Address 2', 'City', 'State', 'ZIP', 'Status', 'Created'],
      ...data.redemptions.map((redemption) => [
        redemption.confirmation,
        redemption.code,
        redemption.productName,
        redemption.fit,
        redemption.size,
        redemption.recipient.firstName,
        redemption.recipient.lastName,
        redemption.recipient.email,
        redemption.recipient.address1,
        redemption.recipient.address2,
        redemption.recipient.city,
        redemption.recipient.state,
        redemption.recipient.postalCode,
        redemption.status,
        redemption.createdAt
      ])
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    anchor.download = 'izhe-redemptions.csv';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  });
})();
