# Priority 2 — Expanded Operations

The IZHE administrator dashboard supports the operational lifecycle after a customer pays or a Give One recipient redeems a code.

## Operations workspaces

### Orders

The paid-order table supports search across order IDs, customers, email, phone, products, addresses, Give One codes, and church pickup codes; status/date filtering; item/history detail; direct-shipping tracking/provider fields; internal notes; and CSV export. Church-pickup orders display their immutable pickup location/instructions and use the protected pickup-handoff action instead of shipping controls for completion.

### Give One

Existing manual code generation, status/product filtering, cancel/reactivate/expiration/transfer/reissue/note behavior and exports remain unchanged. Give One recipients continue to provide their own U.S. fulfillment address.

### Fulfillment

Gift redemptions continue using `pending_fulfillment`, `approved`, `allocated`, `in_production`, `ready_to_ship`, `shipped`, `delivered`, `fulfilled`, `on_hold`, `cancelled`, and `exception`.

Paid church-pickup orders use a distinct fulfillment state machine: `awaiting_batch → allocated → in_production → ready_for_pickup → picked_up`, with explicit exception/no-show/cancelled states as required. `ready_for_pickup` is intentionally not mapped to `ready_to_ship`.

### Production batches

Production batches continue storing batch ID/name, vendor, status, due date, tracking/reference, notes, selected source items, production summary, and status history.

`campaign_church_pickup` batches additionally store campaign identity and a church pickup/delivery destination snapshot, vendor-to-church tracking, received date, and received-by data. Batch receipt/completion sets linked church-pickup orders to `ready_for_pickup`; it does not prove purchaser handoff.

The automatic campaign pickup assembler includes paid order line items only. Give One redemptions remain eligible for separate manual batches.

### Pickup roster and handoff

The campaign pickup roster is administrator-only and exportable as CSV. It contains pickup code, order/purchaser contact, exact item/variant details, amount paid, fulfillment/batch status, pickup location/window, pickup timestamp, released by, recipient, and exception note.

Only `ready_for_pickup` orders may normally be marked picked up. Duplicate handoff is rejected. A reversal requires an explicit corrective note and is retained in handoff history.

### Operational alerts

Existing alerts for payment/fulfillment aging, tracking, codes, and overdue/invalid batches remain. Church-pickup orders are not falsely flagged for a missing shipping address. Refund/cancellation/refund-review after a pickup batch has been submitted or entered production creates a critical reconciliation alert containing order, batch, campaign, and quantity context.

## Data stores and concurrency

The existing `izhe-orders`, `izhe-redemptions`, `izhe-give-codes`, and `izhe-production-batches` stores remain authoritative. Checkout drafts in `izhe-checkout-drafts` preserve the fulfillment snapshot before Stripe payment. Administrative mutations retain the existing `IZHE_ADMIN_TOKEN` model and conditional writes/ETags where applicable.

See [CHURCH-BATCH-FULFILLMENT.md](./CHURCH-BATCH-FULFILLMENT.md) for the complete church-pickup operating model, Stripe differences, Give One boundary, tax caveat, and acceptance checklist.
