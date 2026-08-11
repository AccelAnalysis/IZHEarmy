'use strict';
(() => {
  const fulfillmentStorageKey = `izhe-campaign-fulfillment:${slug}`;
  let selectedMode = '';
  try { selectedMode = localStorage.getItem(fulfillmentStorageKey) || ''; } catch {}

  const fmtDate = (value) => value ? new Date(value).toLocaleString() : '';
  const address = (pickup) => [pickup?.address1, pickup?.address2, pickup?.city, pickup?.state, pickup?.postalCode].filter(Boolean).join(', ');

  function fulfillmentData() {
    return state.data?.fulfillment || { campaignMethod: state.data?.campaign?.fulfillmentMethod || 'individual_shipping', availableModes: ['individual_shipping'], churchBatch: null, ready: true };
  }

  function effectiveMode() {
    const data = fulfillmentData();
    if (data.campaignMethod === 'church_batch') return 'church_batch';
    if (data.campaignMethod === 'individual_shipping') return 'individual_shipping';
    return data.availableModes.includes(selectedMode) ? selectedMode : '';
  }

  function ensureFulfillmentSection() {
    if ($('#campaignFulfillment')) return $('#campaignFulfillment');
    const products = $('#campaignProducts');
    const section = document.createElement('section');
    section.id = 'campaignFulfillment';
    section.className = 'max-w-7xl mx-auto px-6 pb-20';
    products.parentNode.insertBefore(section, products);
    return section;
  }

  function renderFulfillment() {
    if (!state.data) return;
    const data = fulfillmentData();
    const pickup = data.churchBatch;
    const section = ensureFulfillmentSection();
    if (data.campaignMethod === 'individual_shipping') {
      section.innerHTML = `<div class="bg-panel border border-white/10 rounded-[2rem] p-7 md:p-9"><p class="text-gold text-xs tracking-[.18em] font-bold">FULFILLMENT</p><h2 class="text-3xl font-bold mt-3">Direct U.S. shipping</h2><p class="text-muted mt-3">Your U.S. shipping address, shipping charge, and applicable tax are calculated in secure Stripe Checkout.</p></div>`;
      return;
    }
    const details = `<div class="grid md:grid-cols-2 gap-5 mt-6 text-sm"><div><span class="text-muted block">Pickup location</span><strong>${escapeHtml(pickup?.pickupLocationName || '')}</strong><p class="mt-1">${escapeHtml(address(pickup))}</p></div><div><span class="text-muted block">Pickup timing</span><p>${pickup?.estimatedReadyAt ? `Estimated ready: ${escapeHtml(fmtDate(pickup.estimatedReadyAt))}` : 'Estimated ready date will be announced.'}</p><p>${pickup?.pickupStartAt || pickup?.pickupEndAt ? `${escapeHtml(fmtDate(pickup.pickupStartAt))}${pickup?.pickupEndAt ? ` – ${escapeHtml(fmtDate(pickup.pickupEndAt))}` : ''}` : 'Pickup window will be announced.'}</p></div></div><div class="mt-6 border border-white/10 rounded-2xl p-5"><span class="text-muted text-xs font-bold tracking-[.12em]">PICKUP INSTRUCTIONS</span><p class="mt-2 leading-relaxed">${escapeHtml(pickup?.publicInstructions || '')}</p></div>`;
    if (data.campaignMethod === 'church_batch') {
      section.innerHTML = `<div class="bg-panel border border-gold/30 rounded-[2rem] p-7 md:p-9"><p class="text-gold text-xs tracking-[.18em] font-bold">CHURCH PICKUP</p><h2 class="text-3xl font-bold mt-3">Delivered with ${escapeHtml(state.data.campaign.organization)}’s consolidated campaign order</h2><p class="text-white mt-4">No individual shipping charge will be added. No individual shipment will be sent to you; you will pick up your order at the campaign location.</p>${details}</div>`;
      return;
    }
    const pickupChecked = selectedMode === 'church_batch' ? ' checked' : '';
    const shipChecked = selectedMode === 'individual_shipping' ? ' checked' : '';
    section.innerHTML = `<div class="bg-panel border border-gold/30 rounded-[2rem] p-7 md:p-9"><p class="text-gold text-xs tracking-[.18em] font-bold">CHOOSE FULFILLMENT</p><h2 class="text-3xl font-bold mt-3">How should we fulfill this entire checkout?</h2><p class="text-muted mt-3">Choose one option for all items in this campaign cart. Mixed pickup and shipping in the same checkout is not supported.</p><fieldset class="grid md:grid-cols-2 gap-4 mt-6" aria-describedby="fulfillmentChoiceError"><legend class="sr-only">Fulfillment mode</legend><label class="border border-white/15 rounded-2xl p-5 cursor-pointer focus-within:ring-2 focus-within:ring-gold"><input type="radio" name="campaignFulfillmentMode" value="church_batch" class="mr-2"${pickupChecked}><strong>Pick up at ${escapeHtml(pickup?.pickupLocationName || 'campaign location')}</strong><span class="block text-sm text-muted mt-2">No individual shipping charge.</span></label><label class="border border-white/15 rounded-2xl p-5 cursor-pointer focus-within:ring-2 focus-within:ring-gold"><input type="radio" name="campaignFulfillmentMode" value="individual_shipping" class="mr-2"${shipChecked}><strong>Ship to my U.S. address</strong><span class="block text-sm text-muted mt-2">Shipping calculated in Checkout.</span></label></fieldset><p id="fulfillmentChoiceError" class="text-amber-300 text-sm mt-3" role="alert">${effectiveMode() ? '' : 'Choose a fulfillment option before checkout.'}</p>${details}</div>`;
    $$('input[name="campaignFulfillmentMode"]', section).forEach((input) => input.addEventListener('change', () => {
      selectedMode = input.value;
      try { localStorage.setItem(fulfillmentStorageKey, selectedMode); } catch {}
      renderFulfillment();
      renderCart();
    }));
  }

  function ensureCartSummary() {
    let summary = $('#cartFulfillmentSummary');
    if (summary) return summary;
    summary = document.createElement('div');
    summary.id = 'cartFulfillmentSummary';
    summary.className = 'border border-white/10 rounded-2xl p-4 mb-5 text-sm';
    $('#cartSubtotal').closest('.p-6').insertBefore(summary, $('#cartSubtotal').closest('.p-6').firstChild);
    return summary;
  }

  const originalRenderCampaign = renderCampaign;
  renderCampaign = function renderCampaignWithFulfillment() {
    originalRenderCampaign();
    renderFulfillment();
  };

  const originalRenderCart = renderCart;
  renderCart = function renderCartWithFulfillment() {
    originalRenderCart();
    if (!state.data) return;
    const mode = effectiveMode();
    const pickup = fulfillmentData().churchBatch;
    const summary = ensureCartSummary();
    if (mode === 'church_batch') summary.innerHTML = `<strong class="text-gold">Church pickup</strong><p class="mt-1">${escapeHtml(pickup?.pickupLocationName || '')} · ${escapeHtml(address(pickup))}</p><div class="flex justify-between mt-3"><span>Individual shipping</span><strong>$0.00</strong></div>`;
    else if (mode === 'individual_shipping') summary.innerHTML = '<strong>Direct shipping</strong><div class="flex justify-between mt-3"><span>Shipping</span><strong>Calculated in Checkout</strong></div>';
    else summary.innerHTML = '<strong class="text-amber-300">Fulfillment choice required</strong><p class="text-muted mt-1">Choose church pickup or direct shipping above before checkout.</p>';
    const missingHybridChoice = fulfillmentData().campaignMethod === 'hybrid' && !mode;
    $('#checkoutButton').disabled = !state.cart.length || !state.data.purchasable || missingHybridChoice;
    const footnote = $('#checkoutButton').nextElementSibling;
    if (footnote) footnote.textContent = mode === 'church_batch' ? 'Church pickup adds no individual shipping charge. Applicable tax is calculated in Stripe Checkout.' : mode === 'individual_shipping' ? 'Shipping and applicable taxes are calculated in Stripe Checkout.' : 'Choose a fulfillment option before secure checkout.';
  };

  async function fulfillmentCheckout(event) {
    if (!state.data) return;
    const mode = effectiveMode();
    if (fulfillmentData().campaignMethod === 'hybrid' && !mode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderFulfillment();
      ensureFulfillmentSection().scrollIntoView({ behavior: 'smooth', block: 'center' });
      showMessage('Choose church pickup or direct shipping before checkout.');
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const button = $('#checkoutButton');
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'OPENING CHECKOUT…';
    try {
      const response = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: slug,
          fulfillmentMode: mode,
          cart: state.cart.map(({ productId, variantId, fit, size, quantity }) => ({ productId, variantId, fit, size, quantity }))
        })
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

  $('#checkoutButton').addEventListener('click', fulfillmentCheckout, true);
})();
