'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);
const pathParts = location.pathname.split('/').filter(Boolean);
const slug = pathParts[0] === 'campaign' ? decodeURIComponent(pathParts[1] || '') : new URLSearchParams(location.search).get('slug') || '';
const storageKey = `izhe-campaign-cart:${slug}`;
const state = { data: null, products: new Map(), cart: loadCart() };
let messageTimer;

function loadCart() {
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]') || []; } catch { return []; }
}

function saveCart() {
  localStorage.setItem(storageKey, JSON.stringify(state.cart));
  renderCart();
}

function showMessage(text) {
  const element = $('#message');
  clearTimeout(messageTimer);
  element.textContent = text;
  element.classList.remove('hidden');
  messageTimer = setTimeout(() => element.classList.add('hidden'), 3500);
}

function dateRange(campaign) {
  const start = campaign.startAt ? new Date(campaign.startAt) : null;
  const end = campaign.endAt ? new Date(campaign.endAt) : null;
  if (start && end) return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
  if (start) return `Begins ${start.toLocaleDateString()}`;
  if (end) return `Ends ${end.toLocaleDateString()}`;
  return '';
}

function progressCard(label, value, progress = null) {
  return `<article class="bg-panel border border-white/10 rounded-2xl p-5 shadow-xl"><p class="text-xs tracking-[.15em] text-muted font-bold uppercase">${escapeHtml(label)}</p><strong class="text-3xl block mt-2">${escapeHtml(value)}</strong>${progress == null ? '' : `<div class="progress-track h-2 rounded-full mt-4 overflow-hidden"><div class="h-full bg-gold rounded-full" style="width:${Math.max(0, Math.min(100, progress))}%"></div></div><p class="text-xs text-muted mt-2">${escapeHtml(progress)}% of goal</p>`}</article>`;
}

function renderCampaign() {
  const { campaign, metrics, purchasable, qrUrl } = state.data;
  document.title = `${campaign.title} | IZHE`;
  $('#campaignOrganization').textContent = campaign.organization;
  $('#campaignHeadline').textContent = campaign.publicHeadline || campaign.title;
  $('#campaignDescription').textContent = campaign.publicDescription || campaign.ministryObjective;
  $('#campaignObjective').textContent = campaign.ministryObjective || 'This campaign supports the ministry objective established by the participating organization.';
  $('#campaignDates').textContent = [dateRange(campaign), campaign.presentationAt ? `IZHE presentation: ${new Date(campaign.presentationAt).toLocaleString()}` : ''].filter(Boolean).join(' · ');
  $('#campaignHero').style.backgroundImage = campaign.heroImage ? `url("${campaign.heroImage.replaceAll('"', '%22')}")` : 'linear-gradient(135deg,#111c2f,#09111f)';
  $('#campaignQr').src = qrUrl;
  $('#downloadCampaignQr').href = `${qrUrl}&download=1`;
  $('#cartCampaignName').textContent = campaign.title;
  $('#purchaseStatus').textContent = purchasable
    ? campaign.callToAction || 'Choose a product below to participate in this campaign.'
    : campaign.status === 'closed' || campaign.status === 'fulfilled'
      ? 'Ordering for this campaign has closed. Its results remain available below.'
      : 'This campaign is not currently accepting orders.';
  $('#shopCampaign').classList.toggle('hidden', !purchasable);
  $('#campaignMetrics').innerHTML = [
    progressCard('Campaign sales', money(metrics.revenue), metrics.revenueProgress),
    progressCard('Units purchased', String(metrics.soldUnits), metrics.unitProgress),
    progressCard('Give One claims', `${metrics.redeemedCodeCount} of ${metrics.codeCount}`, metrics.codeCount ? metrics.claimRate : null),
    progressCard(campaign.supportLabel || 'Ministry support', money(metrics.supportAmount), null)
  ].join('');
  renderProducts();
}

function productImage(product) {
  return product.primaryImage?.url || product.images?.find((item) => item.role === 'primary')?.url || product.images?.[0]?.url || '';
}

function availableVariants(product) {
  return (product.variants || []).filter((variant) => variant.isPurchasable);
}

function renderProducts() {
  const products = state.data.products;
  state.products = new Map(products.map((product) => [product.id, product]));
  $('#productGrid').innerHTML = products.map((product) => {
    const variants = availableVariants(product);
    const image = productImage(product);
    const canBuy = state.data.purchasable && product.isPurchasable && (product.productType !== 'apparel' || variants.length);
    const options = variants.map((variant) => `<option value="${escapeHtml(variant.id)}">${escapeHtml([variant.fit, variant.size, variant.color && variant.color !== 'Standard' ? variant.color : ''].filter(Boolean).join(' · '))}</option>`).join('');
    return `<article class="product-card bg-ink border border-white/10 rounded-[1.75rem] overflow-hidden shadow-xl flex flex-col">
      <div class="aspect-[4/3] bg-panel overflow-hidden">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.primaryImage?.alt || product.shortName)}" class="product-image w-full h-full object-cover" loading="lazy">` : ''}</div>
      <div class="p-6 flex-1 flex flex-col"><div class="flex justify-between gap-4"><div><p class="text-gold text-xs tracking-[.15em] font-bold">${escapeHtml((product.audienceLabel || product.productType).toUpperCase())}</p><h3 class="text-2xl font-bold mt-2">${escapeHtml(product.shortName)}</h3></div><strong class="text-xl">${money(product.unitAmount)}</strong></div><p class="text-muted text-sm leading-relaxed mt-4">${escapeHtml(product.description)}</p>
      <div class="mt-auto pt-6 space-y-3">${product.productType === 'apparel' ? `<label class="block"><span class="text-xs font-bold text-muted">FIT & SIZE</span><select data-product-variant="${escapeHtml(product.id)}" class="mt-2 w-full bg-panel border border-white/15 rounded-xl px-4 py-3">${options || '<option value="">No variants available</option>'}</select></label>` : ''}<div class="grid grid-cols-[90px_1fr] gap-3"><input data-product-qty="${escapeHtml(product.id)}" type="number" min="1" max="10" value="1" class="bg-panel border border-white/15 rounded-xl px-4 py-3"><button data-add-product="${escapeHtml(product.id)}" ${canBuy ? '' : 'disabled'} class="bg-gold text-ink rounded-xl px-4 py-3 font-extrabold disabled:opacity-40">${canBuy ? 'ADD TO CART' : 'UNAVAILABLE'}</button></div></div></div>
    </article>`;
  }).join('') || '<div class="col-span-full border border-white/10 rounded-2xl p-10 text-center text-muted">No products are currently assigned to this campaign.</div>';
  $$('[data-add-product]').forEach((button) => button.addEventListener('click', () => addProduct(button.dataset.addProduct)));
}

function addProduct(productId) {
  const product = state.products.get(productId);
  if (!product?.isPurchasable || !state.data.purchasable) return showMessage('This item is not currently available.');
  let variant = null;
  if (product.productType === 'apparel') {
    const variantId = $(`[data-product-variant="${CSS.escape(productId)}"]`)?.value || '';
    variant = availableVariants(product).find((item) => item.id === variantId);
    if (!variant) return showMessage('Select an available fit and size.');
  }
  const quantity = Math.max(1, Math.min(10, Number($(`[data-product-qty="${CSS.escape(productId)}"]`)?.value || 1)));
  const key = `${productId}:${variant?.id || ''}`;
  const existing = state.cart.find((item) => item.key === key);
  if (existing) existing.quantity = Math.min(10, existing.quantity + quantity);
  else state.cart.push({ key, productId, variantId: variant?.id || '', fit: variant?.fit || '', size: variant?.size || '', color: variant?.color || '', quantity });
  saveCart();
  showMessage('Added to the campaign cart.');
  openCart();
}

function renderCart() {
  if (!state.data) return;
  state.cart = state.cart.filter((item) => state.products.has(item.productId));
  const count = state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  $('#cartCount').textContent = String(count);
  const total = state.cart.reduce((sum, item) => sum + Number(state.products.get(item.productId)?.unitAmount || 0) * Number(item.quantity || 0), 0);
  $('#cartSubtotal').textContent = money(total);
  $('#checkoutButton').disabled = !state.cart.length || !state.data.purchasable;
  $('#cartItems').innerHTML = state.cart.map((item) => {
    const product = state.products.get(item.productId);
    const variant = product?.variants?.find((candidate) => candidate.id === item.variantId);
    return `<article class="border border-white/10 rounded-2xl p-4"><div class="flex justify-between gap-4"><div><h3 class="font-bold">${escapeHtml(product?.shortName || item.productId)}</h3><p class="text-sm text-muted mt-1">${product?.productType === 'apparel' ? escapeHtml([variant?.fit || item.fit, variant?.size || item.size, variant?.color && variant.color !== 'Standard' ? variant.color : ''].filter(Boolean).join(' · ')) : 'Physical product'}</p><p class="text-gold mt-2">${money(product?.unitAmount)}</p></div><button data-remove-item="${escapeHtml(item.key)}" class="text-red-300 font-bold">REMOVE</button></div><div class="flex items-center gap-3 mt-4"><button data-dec-item="${escapeHtml(item.key)}" class="w-9 h-9 border border-white/15 rounded-lg">−</button><span>${item.quantity}</span><button data-inc-item="${escapeHtml(item.key)}" class="w-9 h-9 border border-white/15 rounded-lg">+</button></div></article>`;
  }).join('') || '<div class="text-center text-muted py-16">Your campaign cart is empty.</div>';
  $$('[data-remove-item]').forEach((button) => button.addEventListener('click', () => { state.cart = state.cart.filter((item) => item.key !== button.dataset.removeItem); saveCart(); }));
  $$('[data-dec-item]').forEach((button) => button.addEventListener('click', () => { const item = state.cart.find((candidate) => candidate.key === button.dataset.decItem); if (!item) return; item.quantity -= 1; if (item.quantity < 1) state.cart = state.cart.filter((candidate) => candidate.key !== item.key); saveCart(); }));
  $$('[data-inc-item]').forEach((button) => button.addEventListener('click', () => { const item = state.cart.find((candidate) => candidate.key === button.dataset.incItem); if (item && item.quantity < 10) { item.quantity += 1; saveCart(); } }));
}

function openCart() {
  $('#overlay').classList.remove('hidden');
  $('#cartDrawer').setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => { $('#overlay').classList.remove('opacity-0'); $('#cartDrawer').classList.remove('translate-x-full'); });
  document.body.classList.add('modal-open');
}

function closeCart() {
  $('#overlay').classList.add('opacity-0');
  $('#cartDrawer').classList.add('translate-x-full');
  $('#cartDrawer').setAttribute('aria-hidden', 'true');
  setTimeout(() => { $('#overlay').classList.add('hidden'); document.body.classList.remove('modal-open'); }, 250);
}

async function checkout() {
  const button = $('#checkoutButton');
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = 'OPENING CHECKOUT…';
  try {
    const response = await fetch('/.netlify/functions/create-checkout-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaignSlug: slug, cart: state.cart.map(({ productId, variantId, fit, size, quantity }) => ({ productId, variantId, fit, size, quantity })) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Checkout could not be started.');
    location.assign(result.url);
  } catch (error) {
    showMessage(error.message);
    button.disabled = false;
    button.textContent = previous;
  }
}

async function shareCampaign() {
  const data = { title: state.data.campaign.title, text: state.data.campaign.publicHeadline, url: location.href.split('?')[0] };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(data.url); showMessage('Campaign link copied.'); }
  } catch (error) { if (error.name !== 'AbortError') showMessage('The campaign link could not be shared.'); }
}

async function loadCampaign() {
  if (!slug) throw new Error('Campaign link is incomplete.');
  const response = await fetch(`/.netlify/functions/public-campaign?slug=${encodeURIComponent(slug)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'This campaign could not be loaded.');
  state.data = data;
  renderCampaign();
  renderCart();
}

$('#cartButton').addEventListener('click', openCart);
$('#closeCart').addEventListener('click', closeCart);
$('#overlay').addEventListener('click', closeCart);
$('#checkoutButton').addEventListener('click', checkout);
$('#shareCampaign').addEventListener('click', shareCampaign);
$('#copyCampaignLink').addEventListener('click', async () => { await navigator.clipboard.writeText(location.href.split('?')[0]); showMessage('Campaign link copied.'); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCart(); });
if (new URLSearchParams(location.search).get('checkout') === 'cancelled') setTimeout(() => showMessage('Checkout was cancelled. Your campaign cart is still saved.'), 500);

loadCampaign().catch((error) => {
  $('#campaignHero').innerHTML = `<div class="max-w-3xl mx-auto px-6 py-40 text-center"><h1 class="font-serif text-5xl">Campaign unavailable</h1><p class="text-muted mt-5">${escapeHtml(error.message)}</p><a href="/" class="inline-block bg-gold text-ink rounded-full px-7 py-4 font-bold mt-8">RETURN TO IZHE</a></div>`;
  $('#campaignProducts').classList.add('hidden');
  $('#campaignPurpose').classList.add('hidden');
});
