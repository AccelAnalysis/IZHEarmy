# Priority 3 — Church Campaigns

The IZHE website and operations dashboard support church and ministry campaigns as first-class operational records.

## Church inquiry management

The public church form stores a structured inquiry in `izhe-church-inquiries`. Administrators can search inquiries, update status, assign a team member, set follow-up dates, add internal notes, and convert an inquiry into a campaign.

Inquiry statuses are `new`, `contacted`, `discovery_scheduled`, `plan_sent`, `confirmed`, `converted`, `completed`, and `declined`.

## Campaign records and versioned support policy

Campaigns are stored in `izhe-campaigns` and include organization, campaign/public titles, ministry objective, contact information, lifecycle/publication status, presentation/ordering dates, campaign assortment, fulfillment method, goals, support model, public content, and internal notes.

For `church_batch` and `hybrid`, the campaign also stores the structured church-pickup snapshot defined in [CHURCH-BATCH-FULFILLMENT.md](./CHURCH-BATCH-FULFILLMENT.md). A published scheduled/active pickup-capable campaign is not purchasable until required pickup fields are complete. `individual_shipping` remains compatible without them.

Campaign ministry support is no longer treated as one mutable historical formula. The active campaign now carries versioned support policy containing model, rate, currency, explicit eligibility basis, calculation-policy version, effective time, creator/source, and lock time.

The policy active when Checkout is created is copied into the Checkout draft/order snapshot. Once qualifying support-eligible paid commerce exists, changing the campaign support formula creates a prospective policy version; prior paid orders remain governed by their original policy.

## Campaign-specific catalog and Checkout

A campaign may expose entire collections, individual products, or both. The public campaign endpoint filters the central catalog to that assortment. Stripe Checkout validates the same campaign restrictions server-side.

Campaign attribution remains stored on checkout drafts, Stripe metadata, paid orders, Give One obligations/codes/redemptions, and production batches.

Checkout also snapshots:

- product/variant identity and cents price;
- explicit `supportEligible`;
- Give One eligibility/units;
- campaign support-policy version;
- server-authoritative fulfillment mode and pickup/direct-shipping snapshot.

Fulfillment remains server-authoritative:

- `individual_shipping` uses the direct-shipping Checkout path;
- `church_batch` omits individual shipping address/rate and saves a church-pickup snapshot;
- `hybrid` requires a purchaser choice and permits one fulfillment mode per Checkout Session.

## Landing pages and QR codes

Published campaigns receive `/campaign/CAMPAIGN-SLUG`. The page retains campaign identity/message, dates, products/cart, metrics, sharing/QR controls, and a public-safe fulfillment promise. Hybrid campaigns require an accessible fulfillment selection before checkout.

Public financial figures are not presented with false precision. If a material refund allocation, dispute, unmatched Stripe event, legacy proof gap, or Give One exception prevents a defensible final number, the page shows **Figures under reconciliation** and withholds provisional exact financial values while retaining independently proven facts such as recorded support payments and fulfilled gifts.

## Church-pickup batch fulfillment

The campaign editor exposes **Build or Refresh Church Pickup Batch**. Automatic pickup batches:

- include captured paid order line items only;
- include only the selected campaign and saved `church_batch` mode;
- exclude direct-shipping orders and Give One redemptions;
- exclude fully refunded/cancelled orders, open disputes, and ambiguous reversal allocations;
- remove only objectively proven refunded whole units from editable source quantity;
- preserve exact product/variant/SKU and canonical payment-line identity;
- prevent duplicate allocation;
- store a church destination snapshot and `batchType: "campaign_church_pickup"`;
- refresh only `draft`/`ready` batches; submitted/later production remains historical and later orders create supplemental batches.

Give One recipient fulfillment remains the separate individual-address path.

## Pickup completion

Pickup batch `received`/`completed` means production reached the church. It moves linked paid pickup orders to `ready_for_pickup`, never directly to customer completion. Administrators then record individual handoff. The campaign pickup roster remains exportable.

## Campaign performance and mission-support reports

Campaign commerce reporting distinguishes gross merchandise, discounts, net merchandise, actual refund components, shipping, tax, total charged/refunded, disputes, net collected, and held amounts.

Mission support reporting distinguishes calculated, adjustments, held, accrued, available, paid, outstanding, overpaid/recovery, and settlement state.

Support formulas use immutable order settlement:

- percentage support uses net recognized support-eligible merchandise after allocated discounts/refunds, excluding shipping/tax/noneligible merchandise;
- per-unit support uses settled whole support-eligible units and does not assume books/other products are eligible;
- fixed support is zero without qualifying activity and accrues once per policy version after qualifying settled commerce.

Give One counts use deterministic obligation states rather than assuming every public code is simply active/redeemed.

## Campaign alerts and integrity

Pickup configuration health continues to protect Checkout. Payment/accountability integrity additionally flags unmatched Stripe events, refund allocation review, disputes, support overpayment, failed paid-order workflow stages, Give One exceptions, and reversals after production commitment.

A post-submission reversal does not rewrite production history. It creates a critical reconciliation condition so order/campaign/batch/quantity/cost consequences can be resolved explicitly.

Campaign/inquiry administration continues to require `IZHE_ADMIN_TOKEN`; checkout continues to validate campaign status, dates, assortment, fulfillment, and Stripe price authority server-side.

See [PAYMENT-ACCOUNTABILITY-INTEGRITY.md](./PAYMENT-ACCOUNTABILITY-INTEGRITY.md) for the governing financial source hierarchy, Stripe event lifecycle, allocation policies, support formulas, reconciliation workflow, and release checklist.
