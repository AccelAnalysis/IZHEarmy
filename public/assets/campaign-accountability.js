'use strict';
const baseCampaignRenderWithAccountability = renderCampaign;
renderCampaign = function renderCampaignWithAccountability() {
  baseCampaignRenderWithAccountability();
  const statement = state.data?.accountability;
  if (!statement) return;
  let section = document.querySelector('#campaignAccountability');
  if (!section) {
    section = document.createElement('section');
    section.id = 'campaignAccountability';
    section.className = 'max-w-7xl mx-auto px-6 pb-16 md:pb-24';
    document.querySelector('#campaignMetrics')?.parentElement?.insertAdjacentElement('afterend', section);
  }
  section.innerHTML = `<div class="border border-white/10 rounded-[2rem] bg-panel p-7 md:p-10"><div class="flex flex-col lg:flex-row justify-between gap-6 mb-8"><div><p class="text-gold text-xs tracking-[.17em] font-bold">MISSION ACCOUNTABILITY</p><h2 class="font-serif text-3xl md:text-4xl mt-3">How this campaign is serving its objective</h2></div><p class="text-muted max-w-xl leading-relaxed">These figures are calculated from attributed campaign orders, Give One records, fulfillment activity, and recorded ministry-support payments.</p></div><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"><article class="border border-white/10 rounded-2xl p-5"><p class="text-xs text-muted font-bold tracking-[.12em]">SUPPORT ACCRUED</p><strong class="text-2xl block mt-2">${money(statement.supportAccrued)}</strong></article><article class="border border-white/10 rounded-2xl p-5"><p class="text-xs text-muted font-bold tracking-[.12em]">SUPPORT PAID</p><strong class="text-2xl block mt-2">${money(statement.supportPaid)}</strong></article><article class="border border-white/10 rounded-2xl p-5"><p class="text-xs text-muted font-bold tracking-[.12em]">GIFTS FULFILLED</p><strong class="text-2xl block mt-2">${statement.fulfilledGifts}</strong></article><article class="border border-white/10 rounded-2xl p-5"><p class="text-xs text-muted font-bold tracking-[.12em]">OPEN GIFT OBLIGATIONS</p><strong class="text-2xl block mt-2">${statement.activeGiftObligations + statement.pendingGiftFulfillment}</strong></article></div></div>`;
};
