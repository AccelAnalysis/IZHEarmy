# Priority 3 — Church Campaigns

The IZHE website and operations dashboard now support church and ministry campaigns as first-class operational records.

## Church inquiry management

The public church form stores a structured inquiry in `izhe-church-inquiries`. Administrators can:

- Search inquiries
- Update inquiry status
- Assign a team member
- Set a follow-up date
- Add internal notes
- Convert an inquiry into a campaign

Inquiry statuses are:

- `new`
- `contacted`
- `discovery_scheduled`
- `plan_sent`
- `confirmed`
- `converted`
- `completed`
- `declined`

## Campaign records

Campaigns are stored in `izhe-campaigns` and include:

- Church or ministry organization
- Campaign and public-page titles
- Ministry objective
- Contact information
- Campaign type and lifecycle status
- Public-page publishing status
- Presentation and ordering dates
- Campaign-specific collections and products
- Fulfillment method
- Unit and revenue goals
- Ministry-support model and rate
- Public image, description, and call to action
- Internal and fulfillment notes

## Campaign-specific catalog and checkout

A campaign may expose entire collections, individual products, or both. The public campaign endpoint filters the central catalog to that assortment. Stripe Checkout validates the same campaign restrictions on the server before creating a Checkout Session.

Campaign attribution is stored on:

- Checkout drafts
- Stripe metadata
- Paid orders
- Give One codes
- Give One redemptions
- Production batches

This allows campaign reports to reconcile against actual transactions and fulfillment records.

## Landing pages and QR codes

Published campaigns receive a URL in this format:

```text
https://YOUR-DOMAIN/campaign/CAMPAIGN-SLUG
```

Each page includes:

- Church or ministry identity
- Campaign message and ministry objective
- Ordering dates and presentation date
- Campaign-specific products
- Campaign cart and Stripe Checkout
- Unit, sales, Give One, and ministry-support progress
- Share controls
- A downloadable SVG QR code

The Netlify rewrite keeps the public campaign URL in the browser while serving `campaign.html`.

## Batch fulfillment

Campaign batches use the Priority 2 production-batch workflow. A campaign batch:

- Includes only paid-order items and Give One redemptions attributed to that campaign
- Aggregates product, fit, size, color, SKU, and quantity
- Updates linked order and redemption statuses
- Remains linked to the campaign when edited through the general Production Batches workspace

Administrators can create a campaign fulfillment batch directly from the campaign editor.

## Campaign performance and ministry-support reports

Reports calculate:

- Orders
- Campaign sales
- Units purchased
- Give One codes issued
- Give One codes redeemed
- Give One claim rate
- Gift redemptions
- Pending fulfillment
- Production batches
- Open production batches
- Unit and revenue goal progress
- Ministry support generated

Supported ministry-support models are:

- Percentage of campaign sales
- Fixed amount per unit
- Fixed campaign amount

Campaign reports can be exported as CSV.

## Campaign alerts

The campaign dashboard surfaces:

- New inquiries waiting at least two days for contact
- Overdue inquiry follow-ups
- Active campaigns without a published landing page
- Campaigns whose start date has passed but remain scheduled
- Active campaigns without attributed orders after seven days
- Closed campaigns with open gift fulfillment

## Security and integrity

- Campaign and inquiry administration requires `IZHE_ADMIN_TOKEN`.
- Checkout independently validates campaign status, ordering dates, catalog restrictions, and Stripe prices.
- Campaign IDs persist through order, Give One, redemption, and batch records.
- Campaign and inquiry writes use Netlify Blob conditional updates to prevent silent concurrent overwrites.
