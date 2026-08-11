'use strict';
(function installPaymentIntegrityAdmin(){
  const paymentMoney=(value)=>money(Number(value||0));
  let financeEnhancementsInstalled=false;
  let ledgerHandlerInstalled=false;
  let oldLedgerHandler=typeof p4SubmitLedger==='function'?p4SubmitLedger:null;

  function installSupportEligibilityControl(){
    if($('#productSupportEligible'))return;
    const give=$('#productGiveEligible');
    const row=give?.closest('.flex');
    if(!row)return;
    const wrapper=document.createElement('label');
    wrapper.className='min-w-[220px]';
    wrapper.innerHTML='<span class="label">MISSION SUPPORT ELIGIBILITY</span><select id="productSupportEligible" class="field"><option value="">Choose eligibility…</option><option value="true">Support eligible</option><option value="false">Not support eligible</option></select><p class="text-xs text-slate-500 mt-1">Separate from Give One eligibility. Saved into future order snapshots.</p>';
    row.insertBefore(wrapper,give.closest('label'));
  }

  installSupportEligibilityControl();
  if(typeof editProduct==='function'){
    const baseEditProduct=editProduct;
    editProduct=function paymentIntegrityEditProduct(id){
      baseEditProduct(id);
      installSupportEligibilityControl();
      const product=catalogData?.catalog?.products?.find((item)=>item.id===id);
      const select=$('#productSupportEligible');
      if(select)select.value=product&&typeof product.supportEligible==='boolean'?String(product.supportEligible):'';
    };
  }
  if(typeof collectProduct==='function'){
    const baseCollectProduct=collectProduct;
    collectProduct=function paymentIntegrityCollectProduct(){
      installSupportEligibilityControl();
      const selection=$('#productSupportEligible')?.value||'';
      if(!['true','false'].includes(selection))throw new Error('Select whether this product is eligible for mission support.');
      return{...baseCollectProduct(),supportEligible:selection==='true'};
    };
  }

  function paymentOrder(sessionId){return(priority4Data.finance?.paymentIntegrityOrders||[]).find((item)=>item.sessionId===sessionId)||null;}
  function reconciliationCount(){return Number(priority4Data.finance?.summary?.reconciliation?.unreconciledOrderCount||0);}
  function paymentBadge(label,value){return`<span class="inline-flex items-center gap-1 border border-white/10 rounded-full px-2 py-1 text-[11px]"><span class="text-slate-500">${escapeHtml(label)}</span><strong>${escapeHtml(humanStatus(value||'unknown'))}</strong></span>`;}
  function centsField(label,value){return`<div><span class="label">${escapeHtml(label)}</span><strong>${paymentMoney(value)}</strong><p class="text-[11px] text-slate-500">${Number(value||0)} cents</p></div>`;}

  function integrityTimeline(order){
    const rows=[];
    if(order.lastStripeEventAt)rows.push({at:order.lastStripeEventAt,text:'Latest verified Stripe event'});
    if(order.lastReconciledAt)rows.push({at:order.lastReconciledAt,text:'Last reconciled with Stripe'});
    for(const refund of order.refundReferences||[])rows.push({at:refund.createdAt||'',text:`Refund ${refund.id} · ${paymentMoney(refund.amount)} · ${humanStatus(refund.status||'recorded')}`});
    for(const dispute of order.disputeReferences||[])rows.push({at:dispute.createdAt||'',text:`Dispute ${dispute.id} · ${paymentMoney(dispute.amount)} · ${humanStatus(dispute.status||'recorded')}`});
    for(const allocation of order.refundAllocationHistory||[])rows.push({at:allocation.effectiveAt||allocation.createdAt||'',text:`Refund allocation ${allocation.kind}${allocation.reversalOf?` reversing ${allocation.reversalOf}`:''} · ${allocation.sourceRefundId||'review'}`});
    return rows.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).map((row)=>`<li class="border-l-2 border-white/10 pl-3 py-1"><strong>${escapeHtml(row.text)}</strong><p class="text-[11px] text-slate-500">${row.at?new Date(row.at).toLocaleString():'Timestamp unavailable'}</p></li>`).join('')||'<li class="text-slate-500">No payment timeline facts recorded yet.</li>';
  }

  if(typeof p4FinanceDetails==='function'){
    const baseFinanceDetails=p4FinanceDetails;
    p4FinanceDetails=function paymentIntegrityFinanceDetails(item){
      const base=baseFinanceDetails(item);
      const orders=(item.orderSummaries||[]).map((summary)=>paymentOrder(summary.sessionId)).filter(Boolean);
      const details=orders.map((order)=>{
        const amount=order.amounts||{};
        const allocationNeeded=order.refundStatus==='allocation_required'||order.reconciliationStatus==='allocation_required'||Number(amount.refundUnallocated||0)>0;
        return`<article class="border border-white/10 rounded-2xl p-4 mb-4"><div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3"><div><strong class="font-mono text-xs">${escapeHtml(order.sessionId)}</strong><div class="flex flex-wrap gap-2 mt-2">${paymentBadge('payment',order.paymentStatus)}${paymentBadge('refund',order.refundStatus)}${paymentBadge('dispute',order.disputeStatus)}${paymentBadge('reconciliation',order.reconciliationStatus)}</div></div><div class="flex flex-wrap gap-2"><button type="button" data-reconcile-order="${escapeHtml(order.sessionId)}" class="border border-amber-400 text-amber-300 rounded-lg px-3 py-2 font-bold text-xs">RECONCILE WITH STRIPE</button>${allocationNeeded?`<button type="button" data-allocate-refund="${escapeHtml(order.sessionId)}" class="border border-red-400 text-red-300 rounded-lg px-3 py-2 font-bold text-xs">ALLOCATE REFUND</button>`:''}</div></div><div class="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mt-4">${centsField('GROSS MERCHANDISE',amount.merchandiseGross)}${centsField('DISCOUNTS',amount.discountTotal)}${centsField('CHARGED',amount.totalCharged)}${centsField('REFUNDED',amount.totalRefunded)}${centsField('OPEN DISPUTE',amount.openDisputeAmount)}${centsField('HELD',amount.amountHeld)}${centsField('NET COLLECTED',amount.netCollected)}</div><details class="mt-4"><summary class="cursor-pointer font-bold text-sm">Line settlement and event timeline</summary><div class="grid xl:grid-cols-2 gap-4 mt-3"><div class="overflow-x-auto"><table class="text-xs w-full"><thead><tr class="text-left text-slate-400"><th class="py-2 pr-3">Line</th><th class="py-2 pr-3">Qty</th><th class="py-2 pr-3">Gross</th><th class="py-2 pr-3">Discount</th><th class="py-2 pr-3">Refund</th><th class="py-2">Eligibility</th></tr></thead><tbody>${(order.lineSettlements||[]).map((line)=>`<tr class="border-t border-white/5"><td class="py-2 pr-3"><strong>${escapeHtml(line.productName||line.productId)}</strong><p class="font-mono text-[10px] text-slate-500">${escapeHtml(line.lineId)}</p></td><td class="py-2 pr-3">${line.quantityPurchased}</td><td class="py-2 pr-3">${paymentMoney(line.grossMerchandiseAmount)}</td><td class="py-2 pr-3">${paymentMoney(line.allocatedDiscount)}</td><td class="py-2 pr-3">${paymentMoney(line.allocatedMerchandiseRefund)}</td><td class="py-2">${line.supportEligible?'Support':''}${line.supportEligible&&line.giveOneEligible?' · ':''}${line.giveOneEligible?'Give One':''||'—'}</td></tr>`).join('')||'<tr><td class="py-3 text-slate-500">Legacy order without immutable line settlement.</td></tr>'}</tbody></table></div><ul class="text-xs space-y-1">${integrityTimeline(order)}</ul></div></details></article>`;
      }).join('')||'<p class="text-slate-500">No privacy-minimized payment details are available for this campaign.</p>';
      return`${base}<div class="p-5 border-t border-white/10 bg-slate-950/50"><div class="flex justify-between gap-4 items-start mb-4"><div><h4 class="font-bold">Payment integrity & reconciliation</h4><p class="text-xs text-slate-400 mt-1">Verified Stripe facts, immutable line settlements, and local reconciliation state. No customer payment-method payloads are exposed here.</p></div><a href="/.netlify/functions/admin-finance-export?type=orders" class="text-amber-300 font-bold text-xs" target="_blank">EXPORT ORDERS CSV</a></div>${details}</div>`;
    };
  }

  function ensureFinanceIntegrityPanel(){
    if($('#paymentIntegrityPanel'))return;
    const panel=$('[data-tab-panel="accountability"]');
    if(!panel)return;
    const anchor=$('#financeFilterBar')||panel.firstElementChild;
    const wrapper=document.createElement('section');
    wrapper.id='paymentIntegrityPanel';
    wrapper.className='card p-5 mb-6';
    wrapper.innerHTML=`<div class="flex flex-col xl:flex-row xl:items-end justify-between gap-4"><div><p class="label">PAYMENT & RECONCILIATION</p><h3 class="text-xl font-bold">Integrity queue</h3><p class="text-sm text-slate-400 mt-1">Filter orders and exceptions by payment, refund, dispute, workflow, support, and reconciliation state.</p></div><div class="grid sm:grid-cols-2 gap-3"><select id="paymentIntegrityFilter" class="field"><option value="attention">Needs attention</option><option value="all">All payment records</option><option value="partial_refund">Partial refund</option><option value="full_refund">Full refund</option><option value="open_dispute">Open dispute</option><option value="lost_dispute">Lost dispute</option><option value="allocation_required">Allocation required</option><option value="index_missing">Index missing</option><option value="workflow_failed">Workflow failed</option><option value="support_held">Support held</option><option value="support_overpaid">Support overpaid</option><option value="give_one_exception">Give One exception</option><option value="legacy_unreconciled">Legacy unreconciled</option></select><button id="refreshPaymentIntegrity" type="button" class="border border-white/15 rounded-xl px-4 py-3 font-bold">REFRESH</button></div></div><div id="paymentIntegritySummary" class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-5"></div><div id="paymentIntegrityRows" class="space-y-3 mt-5"></div>`;
    anchor?.insertAdjacentElement('beforebegin',wrapper);
    $('#paymentIntegrityFilter')?.addEventListener('change',renderPaymentIntegrityPanel);
    $('#refreshPaymentIntegrity')?.addEventListener('click',async()=>{priority4Data.finance=await request('/.netlify/functions/admin-finance-data');renderFinance();});
  }

  function relatedTasks(order){return(priority4Data.finance?.reconciliationQueue||[]).filter((task)=>task.sessionId===order.sessionId||(!task.sessionId&&task.sourceId));}
  function campaignForOrder(order){return(priority4Data.finance?.campaigns||[]).find((item)=>item.campaignId===order.campaignId);}
  function matchesIntegrityFilter(order,filter){
    const amount=order.amounts||{};const tasks=relatedTasks(order);const campaign=campaignForOrder(order);
    if(filter==='all')return true;
    if(filter==='partial_refund')return order.refundStatus==='partial';
    if(filter==='full_refund')return order.refundStatus==='full';
    if(filter==='open_dispute')return order.disputeStatus==='open';
    if(filter==='lost_dispute')return order.disputeStatus==='lost';
    if(filter==='allocation_required')return order.refundStatus==='allocation_required'||order.reconciliationStatus==='allocation_required'||Number(amount.refundUnallocated||0)>0;
    if(filter==='index_missing')return order.reconciliationStatus==='index_repair_required'||tasks.some((task)=>task.type.includes('index'));
    if(filter==='workflow_failed')return tasks.some((task)=>task.type==='paid_order_workflow_failed'||task.type==='stale_lease');
    if(filter==='support_held')return Number(campaign?.supportHeld||0)>0||Number(amount.amountHeld||0)>0;
    if(filter==='support_overpaid')return Number(campaign?.supportOverpaid||0)>0;
    if(filter==='give_one_exception')return Number(campaign?.giftExceptionCount||0)>0||tasks.some((task)=>task.type.includes('give_one'));
    if(filter==='legacy_unreconciled')return['legacy_unreconciled','stripe_backfill_available','stripe_reference_missing'].includes(order.reconciliationStatus);
    return order.reconciliationStatus!=='reconciled'||order.refundStatus==='allocation_required'||order.disputeStatus==='open'||Number(amount.amountHeld||0)>0||tasks.length>0;
  }

  function renderPaymentIntegrityPanel(){
    ensureFinanceIntegrityPanel();
    if(!$('#paymentIntegrityRows'))return;
    const data=priority4Data.finance||{};const summary=data.summary||{};const rec=summary.reconciliation||{};
    $('#paymentIntegritySummary').innerHTML=`<div class="border border-white/10 rounded-xl p-3"><span class="label">DISCOUNTS</span><strong>${paymentMoney(summary.discountTotal)}</strong></div><div class="border border-white/10 rounded-xl p-3"><span class="label">REFUNDED</span><strong>${paymentMoney(summary.totalRefunded)}</strong></div><div class="border border-white/10 rounded-xl p-3"><span class="label">AMOUNT HELD</span><strong>${paymentMoney(summary.amountHeld)}</strong></div><div class="border border-white/10 rounded-xl p-3"><span class="label">SUPPORT OVERPAID</span><strong class="${Number(summary.supportOverpaid||0)>0?'text-red-300':''}">${paymentMoney(summary.supportOverpaid)}</strong></div><div class="border border-white/10 rounded-xl p-3"><span class="label">UNRECONCILED ORDERS</span><strong class="${Number(rec.unreconciledOrderCount||0)>0?'text-amber-300':''}">${Number(rec.unreconciledOrderCount||0)}</strong></div>`;
    const filter=$('#paymentIntegrityFilter')?.value||'attention';
    const rows=(data.paymentIntegrityOrders||[]).filter((order)=>matchesIntegrityFilter(order,filter));
    $('#paymentIntegrityRows').innerHTML=rows.map((order)=>{const amount=order.amounts||{};const tasks=relatedTasks(order);const allocationNeeded=order.refundStatus==='allocation_required'||order.reconciliationStatus==='allocation_required'||Number(amount.refundUnallocated||0)>0;return`<article class="border border-white/10 rounded-xl p-4"><div class="flex flex-col xl:flex-row justify-between gap-3"><div><strong class="font-mono text-xs">${escapeHtml(order.sessionId)}</strong><div class="flex flex-wrap gap-2 mt-2">${paymentBadge('payment',order.paymentStatus)}${paymentBadge('refund',order.refundStatus)}${paymentBadge('dispute',order.disputeStatus)}${paymentBadge('reconciliation',order.reconciliationStatus)}</div><p class="text-xs text-slate-400 mt-2">Charged ${paymentMoney(amount.totalCharged)} · Refunded ${paymentMoney(amount.totalRefunded)} · Held ${paymentMoney(amount.amountHeld)} · Net ${paymentMoney(amount.netCollected)}${tasks.length?` · ${tasks.length} open task${tasks.length===1?'':'s'}`:''}</p></div><div class="flex flex-wrap gap-2"><button type="button" data-reconcile-order="${escapeHtml(order.sessionId)}" class="border border-amber-400 text-amber-300 rounded-lg px-3 py-2 font-bold text-xs">RECONCILE</button>${allocationNeeded?`<button type="button" data-allocate-refund="${escapeHtml(order.sessionId)}" class="border border-red-400 text-red-300 rounded-lg px-3 py-2 font-bold text-xs">ALLOCATE REFUND</button>`:''}</div></div>${tasks.length?`<ul class="mt-3 text-xs text-amber-200">${tasks.map((task)=>`<li>• ${escapeHtml(humanStatus(task.type))}: ${escapeHtml(task.message||'Review required.')}</li>`).join('')}</ul>`:''}</article>`;}).join('')||'<div class="border border-white/10 rounded-xl p-6 text-slate-400">No payment records match this filter.</div>';
    bindIntegrityActions();
  }

  async function reconcileOrder(sessionId){
    try{
      const dry=await request('/.netlify/functions/admin-reconcile-payment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId})});
      const report=dry.report||{};const lines=(report.differences||[]).slice(0,20).map((item)=>`${item.field}: ${item.before} → ${item.after}`).join('\n');const repairs=(report.repairPlan||[]).map((item)=>`• ${humanStatus(item)}`).join('\n');
      const message=`Stripe reconciliation dry run for ${sessionId}\n\nRepairs:\n${repairs||'• No repairs required'}${lines?`\n\nDifferences:\n${lines}`:''}\n\nApply local repairs? Stripe will not be mutated.`;
      if(!confirm(message))return;
      await request('/.netlify/functions/admin-reconcile-payment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,apply:true,expectedUpdatedAt:report.expectedUpdatedAt||paymentOrder(sessionId)?.updatedAt||''})});
      priority4Data.finance=await request('/.netlify/functions/admin-finance-data');renderFinance();
    }catch(error){alert(error.message||'Reconciliation failed.');}
  }

  function dollarsPrompt(label,defaultValue='0'){
    const value=prompt(`${label} (dollars)`,defaultValue);if(value===null)return null;const number=Number(value);if(!Number.isFinite(number)||number<0)throw new Error(`${label} must be a non-negative dollar amount.`);return Math.round(number*100);
  }

  async function allocateRefund(sessionId){
    const order=paymentOrder(sessionId);if(!order)return;
    const refs=order.refundReferences||[];if(!refs.length)return alert('No verified Stripe refund reference is available for allocation. Reconcile with Stripe first.');
    try{
      const sourceRefundId=prompt('Verified Stripe refund ID to allocate:',refs.at(-1)?.id||'');if(!sourceRefundId)return;
      const lineAllocations=[];
      for(const line of order.lineSettlements||[]){
        const remaining=Math.max(0,Number(line.netMerchandiseBeforeRefunds||0)-Number(line.allocatedMerchandiseRefund||0));if(!remaining)continue;
        const amount=dollarsPrompt(`Refund allocated to ${line.productName||line.lineId}; remaining ${paymentMoney(remaining)}`,'0');if(amount===null)return;
        let wholeUnitIndexes=[];
        if(amount>0&&Number(line.quantityPurchased||0)>0){const raw=prompt(`Optional zero-based whole-unit indexes for ${line.productName||line.lineId}, comma separated. Leave blank for dollar-only allocation.`,'');if(raw===null)return;wholeUnitIndexes=raw.split(',').map((value)=>value.trim()).filter(Boolean).map(Number).filter(Number.isInteger);}
        if(amount>0)lineAllocations.push({lineId:line.lineId,amount,wholeUnitIndexes});
      }
      const shippingAmount=Number(order.amounts?.shippingCollected||0)>Number(order.amounts?.shippingRefunded||0)?dollarsPrompt('Shipping refund allocation','0'):0;if(shippingAmount===null)return;
      const taxAmount=Number(order.amounts?.taxCollected||0)>Number(order.amounts?.taxRefunded||0)?dollarsPrompt('Tax refund allocation','0'):0;if(taxAmount===null)return;
      const unallocatedAmount=dollarsPrompt('Amount intentionally left unallocated while review remains open','0');if(unallocatedAmount===null)return;
      const note=prompt('Administrator allocation note (required):','');if(!note)return alert('A note is required.');
      await request('/.netlify/functions/admin-allocate-refund',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,expectedUpdatedAt:order.updatedAt,allocation:{sourceRefundId,lineAllocations,shippingAmount,taxAmount,unallocatedAmount,note,effectiveAt:new Date().toISOString()}})});
      priority4Data.finance=await request('/.netlify/functions/admin-finance-data');renderFinance();
    }catch(error){alert(error.message||'Refund allocation failed.');}
  }

  function bindIntegrityActions(){
    $$('[data-reconcile-order]').forEach((button)=>{if(button.dataset.integrityBound)return;button.dataset.integrityBound='1';button.addEventListener('click',()=>reconcileOrder(button.dataset.reconcileOrder));});
    $$('[data-allocate-refund]').forEach((button)=>{if(button.dataset.integrityBound)return;button.dataset.integrityBound='1';button.addEventListener('click',()=>allocateRefund(button.dataset.allocateRefund));});
  }

  function installLedgerIdempotency(){
    if(ledgerHandlerInstalled)return;
    const form=$('#missionLedgerForm');if(!form||typeof p4SubmitLedger!=='function')return;
    const legacy=oldLedgerHandler||p4SubmitLedger;
    form.removeEventListener('submit',legacy,true);
    async function submitWithIdempotency(event){
      event.preventDefault();event.stopImmediatePropagation();
      const type=$('#ledgerType').value;const settlement=type==='campaign_settlement';const dollars=settlement?0:Number($('#ledgerAmount').value||0);const amount=Math.round(dollars*100);const campaignText=$('#ledgerCampaign').selectedOptions[0]?.textContent||'Organization-wide / general';const description=settlement?`${humanStatus($('#ledgerSettlementStatus').value)} settlement status`:`${money(amount)} ${humanStatus(type)}`;
      if(!settlement&&!Number.isFinite(dollars))return setMessage($('#ledgerMessage'),'Enter a valid dollar amount.');
      if(!confirm(`Record ${description} for ${campaignText}? Ledger entries are append-only.`))return;
      const idempotencyKey=form.dataset.idempotencyKey||(crypto.randomUUID?crypto.randomUUID():`ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`);form.dataset.idempotencyKey=idempotencyKey;
      try{
        await request('/.netlify/functions/admin-save-ledger-entry',{method:'POST',headers:{'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify({entry:{idempotencyKey,campaignId:$('#ledgerCampaign').value,type,amount,settlementStatus:settlement?$('#ledgerSettlementStatus').value:'',effectiveAt:$('#ledgerEffectiveAt').value?new Date(`${$('#ledgerEffectiveAt').value}T12:00:00`).toISOString():'',reference:$('#ledgerReference').value,relatedOrderId:$('#ledgerOrder').value,note:$('#ledgerNote').value}})});
        delete form.dataset.idempotencyKey;priority4Data.finance=await request('/.netlify/functions/admin-finance-data');renderFinance();form.reset();$('#ledgerEffectiveAt').value=new Date().toISOString().slice(0,10);setMessage($('#ledgerMessage'),'Ledger entry recorded.',true);
      }catch(error){setMessage($('#ledgerMessage'),error.message);}
    }
    form.addEventListener('submit',submitWithIdempotency,true);ledgerHandlerInstalled=true;
  }

  if(typeof renderFinance==='function'){
    const baseRenderFinance=renderFinance;
    renderFinance=function paymentIntegrityRenderFinance(){
      baseRenderFinance();ensureFinanceIntegrityPanel();renderPaymentIntegrityPanel();installLedgerIdempotency();bindIntegrityActions();
    };
  }
  ensureFinanceIntegrityPanel();renderPaymentIntegrityPanel();installLedgerIdempotency();bindIntegrityActions();
})();
