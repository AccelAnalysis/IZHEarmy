# Priority 2 — Expanded Operations

The IZHE administrator dashboard now supports the operational lifecycle after a customer pays or a Give One recipient redeems a code.

## Operations workspaces

### Orders

- Complete paid-order table with customer, item, amount, shipping, Give One, batch, and status data
- Search across order IDs, customers, emails, products, addresses, and codes
- Status and date filtering
- Order detail drawer with item and status history
- Tracking, shipping provider, internal notes, and operational status updates
- Filtered CSV export

### Give One

- Search and status/product filtering
- Manual code generation
- Cancel unused codes
- Reactivate eligible cancelled or expired codes
- Set or extend expiration dates
- Transfer active codes to another Give One eligible product
- Reissue a code while preserving the replacement chain
- Add administrator notes
- Filtered CSV export

Expired codes are enforced by both validation and redemption endpoints.

### Fulfillment

Gift redemptions support these statuses:

- `pending_fulfillment`
- `approved`
- `allocated`
- `in_production`
- `ready_to_ship`
- `shipped`
- `delivered`
- `fulfilled`
- `on_hold`
- `cancelled`
- `exception`

Administrators can search, filter, add notes, save shipment data, and review status history.

### Production batches

Production batches group paid-order items and Give One redemptions into vendor production runs. Each batch stores:

- Batch ID and name
- Vendor
- Status
- Due date
- Tracking or receipt reference
- Internal notes
- Selected source items
- Aggregated production quantities by product, fit, size, color, and SKU
- Status history

Batch status changes synchronize linked source records. Production completion moves linked items to `ready_to_ship`; shipment and delivery remain separate fulfillment actions.

### Operational alerts

The server computes alerts for:

- Refunds or disputes requiring review
- Missing shipping details
- Paid orders awaiting allocation for three or more days
- Gift redemptions awaiting allocation for three or more days
- Missing tracking on shipped records
- Give One codes unclaimed for 30 or more days
- Expired Give One codes
- Codes missing source references
- Overdue production batches
- Submitted or active production batches with no items

## Data stores

- `izhe-orders`
- `izhe-redemptions`
- `izhe-give-codes`
- `izhe-production-batches`

All administrative mutations use the existing `IZHE_ADMIN_TOKEN` authorization model. Order, redemption, and batch writes use Netlify Blob ETag checks to prevent silent concurrent overwrites.

## CSV exports

The `admin-export` function generates filtered exports for:

- Orders
- Give One codes
- Redemptions
- Production batches

Exports use the same search, status, and date criteria shown in the dashboard.
