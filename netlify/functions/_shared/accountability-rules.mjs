import { computeCampaignMetrics } from './campaign-rules.mjs';
import { effectiveCodeStatus } from './operations-rules.mjs';

export const LEDGER_TYPES = [
  'support_adjustment',
  'support_payment',
  'payment_reversal',
  'campaign_cost',
  'cost_reversal',
  'refund_adjustment',
  'accountability_note',
  'campaign_settlement'
];

export const SETTLEMENT_STATUSES = ['open', 'ready_for_review', 'reconciled', 'support_approved', 'payment_scheduled', 'paid', 'closed'];

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

export function validateLedgerEntry(input, campaigns = []) {
  const type = LEDGER_TYPES.includes(input?.type) ? input.type : '';
  const campaignId = clean(input?.campaignId, 100);
  if (!type) throw new Error('Select a valid ledger entry type.');
  if (campaignId && !campaigns.some((campaign) => campaign.id === campaignId)) throw new Error('Select a valid campaign.');
  if (type === 'campaign_settlement' && !campaignId) throw new Error('Settlement status must be assigned to a campaign.');
  const settlementStatus = type === 'campaign_settlement' && SETTLEMENT_STATUSES.includes(input?.settlementStatus) ? input.settlementStatus : '';
  if (type === 'campaign_settlement' && !settlementStatus) throw new Error('Select a valid settlement status.');
  const amount = Math.round(Number(input?.amount || 0));
  if (!Number.isFinite(amount) || Math.abs(amount) > 1000000000) throw new Error('Enter a valid amount.');
  if (!['accountability_note', 'campaign_settlement'].includes(type) && amount === 0) throw new Error('A financial ledger entry requires a non-zero amount.');
  if (['support_payment', 'payment_reversal', 'campaign_cost', 'cost_reversal'].includes(type) && amount < 0) throw new Error('Payments, reversals, and costs must be entered as positive amounts.');
  if (['support_adjustment', 'refund_adjustment'].includes(type) && !clean(input?.note, 3000)) throw new Error('Adjustments require an explanation.');
  if (['payment_reversal', 'cost_reversal'].includes(type) && !clean(input?.note, 3000)) throw new Error('Reversals require an explanation.');
  const now = new Date().toISOString();
  return {
    id: clean(input?.id, 120) || `LEDGER-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    campaignId,
    type,
    amount,
    settlementStatus,
    reference: clean(input?.reference, 240),
    note: clean(input?.note, 3000),
    relatedOrderId: clean(input?.relatedOrderId, 180),
    effectiveAt: input?.effectiveAt ? new Date(input.effectiveAt).toISOString() : now,
    createdAt: now,
    source: 'admin'
  };
}

export function ledgerTotals(entries) {
  const sum = (type) => entries.filter((entry) => entry.type === type).reduce((total, entry) => total + Number(entry.amount || 0), 0);
  return {
    supportAdjustments: sum('support_adjustment') + sum('refund_adjustment'),
    supportPayments: sum('support_payment') - sum('payment_reversal'),
    campaignCosts: sum('campaign_cost') - sum('cost_reversal')
  };
}

function merchandiseForOrder(order) {
  return (order.items || []).reduce((total, item) => total + Number(item.unitAmount || 0) * Number(item.quantity || 0), 0);
}

export function campaignAccountability(campaign, records, ledger = []) {
  const campaignOrders = (records.orders || []).filter((order) => order.campaignId === campaign.id);
  const accountabilityRecords = { ...records, orders: (records.orders || []).filter((order) => order.status !== 'refund_requires_review') };
  const metrics = computeCampaignMetrics(campaign, accountabilityRecords);
  const entries = ledger.filter((entry) => entry.campaignId === campaign.id).sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt));
  const totals = ledgerTotals(entries);
  const supportAccrued = metrics.supportAmount + totals.supportAdjustments;
  const supportPaid = totals.supportPayments;
  const supportOutstanding = supportAccrued - supportPaid;
  const campaignCodes = (records.codes || []).filter((item) => item.campaignId === campaign.id);
  const campaignRedemptions = (records.redemptions || []).filter((item) => item.campaignId === campaign.id);
  const campaignBatches = (records.batches || []).filter((item) => item.campaignId === campaign.id);
  const activeGiftObligations = campaignCodes.filter((code) => effectiveCodeStatus(code) === 'active').length;
  const pendingGiftFulfillment = campaignRedemptions.filter((item) => !['fulfilled', 'cancelled'].includes(item.status)).length;
  const fulfilledGifts = campaignRedemptions.filter((item) => item.status === 'fulfilled').length;
  const latestSettlement = entries.find((entry) => entry.type === 'campaign_settlement');
  return {
    campaignId: campaign.id,
    organization: campaign.organization,
    title: campaign.title,
    status: campaign.status,
    startAt: campaign.startAt || '',
    endAt: campaign.endAt || '',
    settlementStatus: latestSettlement?.settlementStatus || 'open',
    settlementUpdatedAt: latestSettlement?.effectiveAt || '',
    merchandiseRevenue: metrics.revenue,
    grossCollected: metrics.grossCollected,
    orderCount: metrics.orderCount,
    soldUnits: metrics.soldUnits,
    refundsAndDisputes: campaignOrders.filter((order) => ['refunded_or_disputed', 'refund_requires_review'].includes(order.status)).reduce((total, order) => total + Number(order.amountTotal || 0), 0),
    supportCalculated: metrics.supportAmount,
    supportAdjustments: totals.supportAdjustments,
    supportAccrued,
    supportPaid,
    supportOutstanding,
    campaignCosts: totals.campaignCosts,
    giveCodesIssued: metrics.codeCount,
    giveCodesRedeemed: metrics.redeemedCodeCount,
    activeGiftObligations,
    pendingGiftFulfillment,
    fulfilledGifts,
    claimRate: metrics.claimRate,
    entries,
    orderSummaries: campaignOrders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map((order) => ({ sessionId: order.sessionId, createdAt: order.createdAt, status: order.status, merchandiseRevenue: merchandiseForOrder(order), grossCollected: Number(order.amountTotal || 0), units: (order.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0) })),
    batchSummaries: campaignBatches.map((batch) => ({ id: batch.id, name: batch.name, status: batch.status, dueDate: batch.dueDate || '', tracking: batch.tracking || '', itemCount: (batch.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0) }))
  };
}

export function organizationAccountability(campaigns, records, ledger = []) {
  const campaignReports = campaigns.map((campaign) => campaignAccountability(campaign, records, ledger));
  const generalOrders = (records.orders || []).filter((order) => !order.campaignId && !['cancelled', 'refunded_or_disputed', 'refund_requires_review'].includes(order.status));
  const generalMerchandiseRevenue = generalOrders.reduce((sum, order) => sum + merchandiseForOrder(order), 0);
  const generalGrossCollected = generalOrders.reduce((sum, order) => sum + Number(order.amountTotal || 0), 0);
  const generalEntries = ledger.filter((entry) => !entry.campaignId);
  const generalTotals = ledgerTotals(generalEntries);
  const generalSupportAccrued = generalTotals.supportAdjustments;
  const generalSupportPaid = generalTotals.supportPayments;
  const generalSupportOutstanding = generalSupportAccrued - generalSupportPaid;
  const total = (key) => campaignReports.reduce((sum, report) => sum + Number(report[key] || 0), 0);
  const allActiveCodes = (records.codes || []).filter((code) => effectiveCodeStatus(code) === 'active').length;
  const allPendingGifts = (records.redemptions || []).filter((item) => !['fulfilled', 'cancelled'].includes(item.status)).length;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      merchandiseRevenue: total('merchandiseRevenue') + generalMerchandiseRevenue,
      grossCollected: total('grossCollected') + generalGrossCollected,
      campaignMerchandiseRevenue: total('merchandiseRevenue'),
      supportAccrued: total('supportAccrued') + generalSupportAccrued,
      supportPaid: total('supportPaid') + generalSupportPaid,
      supportOutstanding: total('supportOutstanding') + generalSupportOutstanding,
      campaignCosts: total('campaignCosts') + generalTotals.campaignCosts,
      activeGiftObligations: allActiveCodes,
      pendingGiftFulfillment: allPendingGifts,
      campaignCount: campaigns.length,
      openCampaignCount: campaigns.filter((campaign) => !['fulfilled', 'cancelled'].includes(campaign.status)).length
    },
    general: {
      merchandiseRevenue: generalMerchandiseRevenue,
      grossCollected: generalGrossCollected,
      supportAdjustments: generalTotals.supportAdjustments,
      supportAccrued: generalSupportAccrued,
      supportPaid: generalSupportPaid,
      supportOutstanding: generalSupportOutstanding,
      campaignCosts: generalTotals.campaignCosts,
      entries: generalEntries.sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt))
    },
    campaigns: campaignReports.sort((a, b) => b.merchandiseRevenue - a.merchandiseRevenue),
    ledger: [...ledger].sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt))
  };
}
