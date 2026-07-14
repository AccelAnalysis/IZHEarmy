# Priority 4 — Content, Teaching, and Mission Accountability

This implementation covers only the three approved Priority 4 areas:

1. Structured website content
2. Book and teaching resources
3. Financial and mission-accountability reporting

Named administrator accounts, roles and permissions, and a platform-wide audit-history system are intentionally deferred. The existing `IZHE_ADMIN_TOKEN` continues to protect administrative functions during this phase.

## Structured website content

Website content is stored in the `izhe-content` Netlify Blobs store as versioned, structured records rather than free-form HTML.

Initial content sections are:

- Site SEO and social-sharing metadata
- Home hero
- Home story
- Home book feature
- Give One section
- Churches and ministries section
- Site announcement

Each record supports:

- Draft, in-review, approved, scheduled, published, hidden, and archived states
- Publish and unpublish dates
- Section-specific fields
- Revision numbers
- Concurrency protection through the library revision and Blob ETag
- Administrator preview without exposing drafts publicly

The public site loads published content through `public-content`. If the content service is unavailable, the existing static HTML remains visible as a safe fallback.

## Book and teaching resources

Teaching content is stored in `izhe-teaching` and includes books, chapters, and resources.

The seeded library includes:

- *Who Is God to You? — Discovering God Through His Names*
- Twelve Collection 1 chapters
- Names/titles of God, IZHE questions, and core Scriptures
- A public Collection 1 teaching overview resource

Book records support collection and product relationships, cover art, sample links, publication dates, and status.

Chapter records support:

- Divine name or title
- IZHE question
- Core and supporting Scriptures
- Teaching summary and main lesson
- Reflection
- Discussion questions
- Prayer or declaration
- Practical application
- Youth adaptation
- Leader notes
- Related products

Resource records support:

- Teaching outlines
- Discussion guides
- Youth guides
- Presentations
- Speaker notes
- Handouts
- Video and audio
- Book excerpts
- Images and other resources

Resource access levels are stored as public, campaign participants, church leaders, presenters, or administrator only. Until named accounts and permissions are added, only public resources are delivered by the public teaching endpoint.

The public teaching library is available at:

```text
/learn/
```

## Financial and mission accountability

The accountability layer calculates from the existing operational records:

- Paid orders
- Attributed campaign line items
- Give One codes
- Redemptions
- Production batches
- Campaign support formulas
- Mission-support ledger entries

It separates:

- Merchandise revenue
- Gross collected
- Support calculated by the campaign formula
- Support adjustments
- Support accrued
- Support paid
- Support outstanding
- Recorded campaign costs
- Active Give One codes
- Pending gift fulfillment
- Fulfilled gifts

Merchandise revenue excludes shipping and tax because it is calculated from line items. Refunded, cancelled, disputed, and review-required orders do not contribute to accountability revenue.

## Append-only mission ledger

Ledger entries are stored individually in `izhe-mission-ledger`. Existing entries cannot be edited through the dashboard. Corrections are recorded as new adjustment or reversal entries.

Supported entry types are:

- Support adjustment
- Support payment
- Payment reversal
- Campaign cost
- Cost reversal
- Refund adjustment
- Accountability note

Every entry contains an effective date, campaign association, amount, reference, optional order reference, explanation, creation date, and source.

## Reports and exports

The Accountability workspace provides:

- Organization-wide financial and mission summary
- Campaign-by-campaign accountability table
- Mission-support ledger
- Campaign accountability CSV export
- Ledger CSV export

Published campaign pages also display a public accountability statement containing support accrued, support paid, gifts fulfilled, and open gift obligations.

## Deferred governance work

This phase does not add:

- Named administrator accounts
- Multifactor authentication
- Role-based permissions
- Approval separation of duties
- Reporting-period locks
- A full immutable platform audit log

Those controls should be implemented before the administrative team expands or financial approval authority is delegated beyond the current owner-operated workflow.
