'use strict';
const baseCampaignRenderWithAccountability = renderCampaign;
renderCampaign = function renderCampaignWithAccountability() {
  baseCampaignRenderWithAccountability();
  const statement = state.data?.accountability;
  const metrics = state.data?.metrics;
  if (metrics?.figuresUnderReconciliation) {
    const cards = [...document.querySelectorAll('#campaignMetrics article')];
    [0, 1, 3].forEach((index) => {
      const card = cards[index];
      if (!card) return;
      const value = card.querySelector('strong');
      if (value) value.textContent = 'Under reconciliation';
      card.querySelector('.progress-track')?.remove();
      card.querySelector('.progress-track + p')?.remove();
    });
  }
  if (!statement) return;
  let section = document.querySelector('#campaignAccountability');
  if (!section) {
    section = document.createElement('section');
    section.id = 'campaignAccountability';
    section.className = 'max-w-7xl mx-auto px-6 pb-16 md:pb-24';
    document.querySelector('#campaignMetrics')?.parentElement?.insertAdjacentElement('afterend', section);
  }
  const unresolved = Boolean(statement.figuresUnderReconciliation);
  const accrued = unresolved ? 'Under reconciliation' : money(statement.supportAccrued);
  const outstanding = unresolved ? 'Under reconciliation' : money(statement.supportOutstanding);
  const reconciliationNotice = unresolved ? `<div class="border border-amber-400/30 bg-amber-400/5 rounded-2xl p-4 mb-6"><strong class="text-amber-300">Figures under reconciliation</strong><p class="text-muted text-sm mt-1">${escapeHtml(statement.reconciliationMessage || 'Payment activity is being reviewed before final campaign figures are published.')}</p></div>` : '';
  section.innerHTML = `<div class="border border-white/10 rounded-[2rem] bg-panel p-7 md:p-10"><div class="flex flex-col lg:flex-row justify-between gap-6 mb-8"><div><p class="text-gold text-xs tracking-[.17em] font-bold">MISSION ACCOUNTABILITY</p><h2 class="font-serif text-3xl md:text-4xl mt-3">How this campaign is serving its objective</h2></div><p class="text-muted max-w-xl leading-relaxed">These figures distinguish verified commerce, calculated support, recorded support payments, and Give One fulfillment. Unresolved payment activity is disclosed rather than estimated.</p></div>${reconciliationNotice}<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"><article class="border border-white/10 rounded-2xl p-5"><p class="text-xs text-muted font-bold tracking-[.12em]">SUPPORT ACCRUED</p><strong class="text-2xl block mt-2">${escapeHtml(accrued)}</strong></article><article class="border border-white/10 rounded-2xl p-5"><p class="text-xs text-muted font-bold tracking-[.12em]">SUPPORT PAID</p><strong class="text-2xl block mt-2">${money(statement.supportPaid)}</strong></article><article class="border border-white/10 rounded-2xl p-5"><p class="text-xs text-muted font-bold tracking-[.12em]">GIFTS FULFILLED</p><strong class="text-2xl block mt-2">${statement.giftsFulfilled ?? statement.fulfilledGifts ?? 0}</strong></article><article class="border border-white/10 rounded-2xl p-5"><p class="text-xs text-muted font-bold tracking-[.12em]">OPEN GIFT OBLIGATIONS</p><strong class="text-2xl block mt-2">${statement.openGiftObligations ?? ((statement.activeGiftObligations || 0) + (statement.pendingGiftFulfillment || 0))}</strong></article></div><p class="text-xs text-muted mt-5">Support outstanding: ${escapeHtml(outstanding)}. “Paid” reflects recorded append-only support-payment entries, not calculated support.</p></div>`;
};
