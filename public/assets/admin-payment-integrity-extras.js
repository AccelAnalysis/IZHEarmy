'use strict';
(function installPaymentIntegrityExtras(){
  const cash=(value)=>money(Number(value||0));

  function activeRefundAllocations(order){
    const history=order?.refundAllocationHistory||[];
    const reversed=new Set(history.filter((entry)=>entry.kind==='reversal'&&entry.reversalOf).map((entry)=>entry.reversalOf));
    return history.filter((entry)=>entry.kind==='allocation'&&!reversed.has(entry.id));
  }

  function installProductReset(){
    const form=$('#productForm');
    if(!form||form.dataset.supportResetBound)return;
    form.dataset.supportResetBound='1';
    form.addEventListener('reset',()=>setTimeout(()=>{const select=$('#productSupportEligible');if(select)select.value='';},0));
  }

  function installCampaignSupportPolicyNotice(){
    if($('#campaignSupportPolicyNotice'))return;
    const anchor=$('#campaignSupportRate')||document.querySelector('[name="supportRate"]')||$('#campaignSupportModel')||document.querySelector('[name="supportModel"]');
    const container=anchor?.closest('label')||anchor?.parentElement;
    if(!container)return;
    const notice=document.createElement('div');
    notice.id='campaignSupportPolicyNotice';
    notice.className='border border-amber-400/20 bg-amber-400/5 rounded-xl p-3 mt-3 text-xs text-slate-300';
    notice.innerHTML='<strong class="text-amber-300">Historical support policy is locked prospectively.</strong><p class="mt-1">After qualifying support-eligible commerce begins, changing this formula creates a new prospective policy version. Earlier paid orders keep the policy captured when their Checkout Session was created.</p>';
    container.insertAdjacentElement('afterend',notice);
  }

  if(typeof editCampaign==='function'){
    const baseEditCampaign=editCampaign;
    editCampaign=function paymentIntegrityEditCampaign(id){baseEditCampaign(id);installCampaignSupportPolicyNotice();};
  }

  function campaignIntegrityTable(){
    const campaigns=priority4Data.finance?.campaigns||[];
    return`<div class="mt-5 overflow-x-auto"><table class="w-full text-xs min-w-[1180px]"><thead><tr class="text-left text-slate-400 border-b border-white/10"><th class="py-2 pr-3">Campaign</th><th class="py-2 pr-3">Gross merchandise</th><th class="py-2 pr-3">Discount</th><th class="py-2 pr-3">Merchandise refunded</th><th class="py-2 pr-3">Net recognized</th><th class="py-2 pr-3">Support calculated</th><th class="py-2 pr-3">Support held</th><th class="py-2 pr-3">Support paid</th><th class="py-2 pr-3">Outstanding</th><th class="py-2 pr-3">Overpaid</th><th class="py-2">Reconciliation</th></tr></thead><tbody>${campaigns.map((item)=>`<tr class="border-b border-white/5"><td class="py-3 pr-3"><strong>${escapeHtml(item.title||item.campaignId)}</strong><p class="text-[10px] text-slate-500">${escapeHtml(item.campaignId||'')}</p></td><td class="py-3 pr-3">${cash(item.merchandiseGross)}</td><td class="py-3 pr-3">${cash(item.discountTotal)}</td><td class="py-3 pr-3">${cash(item.merchandiseRefunded)}</td><td class="py-3 pr-3">${cash(item.netRecognizedMerchandiseRevenue)}</td><td class="py-3 pr-3">${cash(item.supportCalculated)}</td><td class="py-3 pr-3 ${Number(item.supportHeld||0)>0?'text-amber-300':''}">${cash(item.supportHeld)}</td><td class="py-3 pr-3">${cash(item.supportPaid)}</td><td class="py-3 pr-3">${cash(item.supportOutstanding)}</td><td class="py-3 pr-3 ${Number(item.supportOverpaid||0)>0?'text-red-300':''}">${cash(item.supportOverpaid)}</td><td class="py-3"><span class="${item.underReconciliation?'text-amber-300':'text-emerald-300'} font-bold">${item.underReconciliation?'Under reconciliation':'Reconciled'}</span></td></tr>`).join('')||'<tr><td colspan="11" class="py-4 text-slate-500">No campaigns are available.</td></tr>'}</tbody></table></div>`;
  }

  function definitions(){
    return`<details id="paymentIntegrityDefinitions" class="mt-5 border border-white/10 rounded-xl p-4 text-xs"><summary class="cursor-pointer font-bold">Accountability field definitions</summary><div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4 text-slate-300"><p><strong>Gross merchandise</strong><br>Immutable merchandise subtotal before discount, shipping, tax, or reversals.</p><p><strong>Net recognized merchandise</strong><br>Merchandise after allocated discount and settled allocated merchandise reversals.</p><p><strong>Amount held</strong><br>Verified funds that are not currently available because a dispute or unresolved allocation requires review.</p><p><strong>Support calculated</strong><br>Mission support produced by the policy version stored with qualifying settled eligible commerce.</p><p><strong>Support held / available</strong><br>Held support is not payable yet; available support is accrued support after holds.</p><p><strong>Support paid</strong><br>Only append-only support-payment ledger entries count as paid.</p><p><strong>Support overpaid</strong><br>Recorded support payments above the currently available amount after verified reversals; recovery/review is required.</p><p><strong>Give One claim rate</strong><br>Redeemed, in-fulfillment, or fulfilled deterministic obligations divided by all obligations issued for the campaign.</p><p><strong>Under reconciliation</strong><br>A material payment, refund allocation, dispute, index, legacy-proof, workflow, or Give One exception prevents a final representation.</p></div></details>`;
  }

  function renderCampaignIntegrityExtras(){
    const panel=$('#paymentIntegrityPanel');
    if(!panel)return;
    let section=$('#campaignIntegrityColumns');
    if(!section){section=document.createElement('div');section.id='campaignIntegrityColumns';section.className='mt-6 border-t border-white/10 pt-5';panel.append(section);}
    section.innerHTML=`<div class="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><p class="label">CAMPAIGN ACCOUNTABILITY</p><h4 class="font-bold text-lg">Settlement and mission-support columns</h4></div><p class="text-xs text-slate-500 max-w-xl">Source cents come from canonical payment facts and immutable order settlement; support payment comes only from the append-only mission ledger.</p></div>${campaignIntegrityTable()}${definitions()}`;
  }

  async function reverseRefundAllocation(sessionId){
    const order=(priority4Data.finance?.paymentIntegrityOrders||[]).find((item)=>item.sessionId===sessionId);
    const active=activeRefundAllocations(order);
    if(!active.length)return alert('There is no active refund allocation to reverse.');
    const options=active.map((entry)=>`${entry.id} · ${entry.sourceRefundId||'refund'} · ${entry.note||'no note'}`).join('\n');
    const reversalOf=prompt(`Active allocation IDs:\n${options}\n\nEnter the allocation ID to reverse:`,active.at(-1).id);
    if(!reversalOf)return;
    if(!active.some((entry)=>entry.id===reversalOf))return alert('Select an active allocation ID shown in the list.');
    const note=prompt('Why is this allocation being reversed? A new history record will be appended.','');
    if(!note)return alert('A reversal note is required.');
    try{
      await request('/.netlify/functions/admin-allocate-refund',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,expectedUpdatedAt:order.updatedAt,allocation:{reversalOf,note,effectiveAt:new Date().toISOString()}})});
      priority4Data.finance=await request('/.netlify/functions/admin-finance-data');
      renderFinance();
    }catch(error){alert(error.message||'Refund allocation reversal failed.');}
  }

  function installReversalButtons(){
    for(const order of priority4Data.finance?.paymentIntegrityOrders||[]){
      if(!activeRefundAllocations(order).length)continue;
      const existing=document.querySelector(`[data-reverse-refund="${CSS.escape(order.sessionId)}"]`);
      if(existing)continue;
      const allocate=document.querySelector(`[data-allocate-refund="${CSS.escape(order.sessionId)}"]`);
      const reconcile=document.querySelector(`[data-reconcile-order="${CSS.escape(order.sessionId)}"]`);
      const anchor=allocate||reconcile;
      if(!anchor)continue;
      const button=document.createElement('button');
      button.type='button';
      button.dataset.reverseRefund=order.sessionId;
      button.className='border border-white/20 text-slate-200 rounded-lg px-3 py-2 font-bold text-xs';
      button.textContent='REVERSE ALLOCATION';
      button.addEventListener('click',()=>reverseRefundAllocation(order.sessionId));
      anchor.insertAdjacentElement('afterend',button);
    }
  }

  function addCurrentStateWarnings(){
    for(const order of priority4Data.finance?.paymentIntegrityOrders||[]){
      const button=document.querySelector(`[data-reconcile-order="${CSS.escape(order.sessionId)}"]`);
      const article=button?.closest('article');
      if(!article||article.querySelector('[data-integrity-state-warning]'))continue;
      const warnings=[];
      if(order.indexHealth?.warnings?.length)warnings.push(`Missing/wrong indexes: ${order.indexHealth.warnings.map(humanStatus).join(', ')}`);
      if(order.giveOneHealth?.mismatch)warnings.push(`Give One count mismatch: expected ${order.giveOneHealth.expectedCount}, stored ${order.giveOneHealth.storedCount}`);
      if(!warnings.length)continue;
      const box=document.createElement('div');
      box.dataset.integrityStateWarning='1';
      box.className='mt-3 border border-amber-400/20 bg-amber-400/5 rounded-lg p-3 text-xs text-amber-200';
      box.innerHTML=warnings.map((warning)=>`<p>• ${escapeHtml(warning)}</p>`).join('');
      article.append(box);
    }
  }

  function refreshExtras(){
    installProductReset();
    installCampaignSupportPolicyNotice();
    renderCampaignIntegrityExtras();
    installReversalButtons();
    addCurrentStateWarnings();
  }

  if(typeof renderFinance==='function'){
    const baseRenderFinance=renderFinance;
    renderFinance=function paymentIntegrityExtraRenderFinance(){baseRenderFinance();refreshExtras();};
  }
  refreshExtras();
})();
