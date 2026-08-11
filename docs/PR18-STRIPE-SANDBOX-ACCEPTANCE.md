# PR #18 Stripe sandbox acceptance

This document records the isolated acceptance environment and completed A–N release matrix for PR #18.

## Environment

- Stripe account: `acct_1Tt4SHGhBLEOPegp` (`IZHE Army sandbox`)
- Stripe mode: sandbox/test only (`livemode=false`)
- Netlify context: deploy preview for PR #18
- Preview webhook: `/.netlify/functions/stripe-webhook`
- Webhook event families: Checkout completion/failure/expiration, refunds, and disputes
- Catalog mirror: 28 active USD Prices matching catalog revision 52 lookup keys and integer-cent amounts
- Coupon/promotion fixture: 10% sandbox-only promotion, deactivated after acceptance
- Campaign fixture: `CAM-ACCEPT-PR18`, archived after acceptance

No live Stripe object or live Netlify deployment was used or mutated. No secret, customer address, card data, claim code, or receipt URL is recorded here.

## Acceptance matrix

| Scenario | Privacy-safe evidence | Expected cents | Result |
|---|---|---:|---|
| A. Direct shipping, no discount | Session `cs_test_b1yOvZXLlzPqGYwcxv4wWQpFR3OnsdkB57JOC3IZkMhSvbups4Dav0zeKN`; PaymentIntent `pi_3U3APmGhBLEOPegp15b2hj1T`; Charge `ch_3U3APmGhBLEOPegp1ghlQ3Wd` | merchandise 3,700 + shipping 699 = total 4,399 | Pass |
| B. Direct shipping with promotion | Session `cs_test_b19q2q43sbAHnJVLAocGew7ERSCX12OcTTVEcKUSR60ht0eLAKYzj0RPZQ`; PaymentIntent `pi_3U3AVDGhBLEOPegp0I95M6Yy`; Charge `ch_3U3AVDGhBLEOPegp0cojfYtC` | gross 6,400 - discount 640 + shipping 699 = total 6,459 | Pass |
| C. Church pickup | Session `cs_test_b1xVfcZztsN2uj32XL8E41BC2CkgdUY6rcOyUj6sd9J5Pe7CVG4hO3Cvan`; PaymentIntent `pi_3U3AWaGhBLEOPegp1bFc1RMc`; Charge `ch_3U3AWaGhBLEOPegp1yTZ1wkF` | merchandise/total 3,700; shipping 0 | Pass |
| D. Webhook replay | Events `evt_pr18_accept_direct_20260811`, `evt_pr18_accept_promo_20260811`, and `evt_pr18_accept_church_20260811`; direct event delivered twice | four deliveries produced three receipts and three orders | Pass |
| E. Forced partial workflow failure and resume | Session `cs_test_b1unW2aZQ7NA8SknNKx5KOgTMIQme2faOzLuhKzHx12Lz44jFoLsWFglp5`; event `evt_pr18_accept_forced_resume_20260811` | unpaid attempt returned 500/`failed_retryable`; paid replay returned 200; total 4,399; failed-retryable receipt count returned to 0 | Pass |
| F. Proven partial merchandise/unit refund | Refund `re_3U3AVDGhBLEOPegp0OwjFXNY` | 2,430 allocated to one complete discounted kids unit | Pass |
| G. Ambiguous partial refund | Refund `re_3U3APmGhBLEOPegp1xrxkcZN` | 500 retained as unallocated; reconciliation remains required | Pass |
| H. Shipping-only refund | Refund `re_3U3APmGhBLEOPegp1ArHG10e` | 699 allocated to shipping; earlier 500 remains unallocated | Pass |
| I. Full refund before batching | Refund `re_3U3AWaGhBLEOPegp1D93RJWV` | 3,700 fully reversed; refunded unit excluded from a later batch | Pass |
| J. Refund after batch submission | Session `cs_test_b1g3cIIdEBZEiw3AdooUKgVplUC81PQbtd3HBrt1AnP8PILCAJT61GLlxP`; PaymentIntent `pi_3U3AnfGhBLEOPegp1icNwsMY`; batch `BATCH-20260811-JCON`; refund `re_3U3AnfGhBLEOPegp1gsWqUN5` | 3,700 refund after submission; production history preserved; critical post-production tasks opened | Pass |
| K. Refund after Give One redemption | Refund `re_3U3AVDGhBLEOPegp0EbcpcAw` | 3,330 allocated to the complete discounted adult unit after redemption; the claim remained terminal and a second claim attempt returned 409 | Pass |
| L. Dispute lifecycle | Won: Session `cs_test_b1K32SwUGDTNnvLYGYCvPmCXpVGve4AsLEUulL6WXLSpT64qVIr0KqjnrP`, dispute `du_1U3AzZGhBLEOPegp6ZSb75Jh`. Lost: Session `cs_test_b1DGMeIP5p2os3nahsEdy9zHX3WWaTm3LLvaRowX6CtpEmbChnE3XOLLTY`, dispute `du_1U3B0eGhBLEOPegpnOh2rw8p` | open holds 4,399/3,399; won releases 4,399; lost removes 3,399 from available funds | Pass |
| M. Missing-index reconciliation repair | Session `cs_test_b18VvLfIUB7ceUO5tInrAuoRd3TDMTBGhWfp6lJUq0nz2aOV0VHcxXMm9w`; PaymentIntent `pi_3U3ArFGhBLEOPegp18XlrELI`; Charge `ch_3U3ArFGhBLEOPegp1571Bisu` | dry run found missing Checkout Session/Charge indexes and one obligation; apply repaired indexes and obligation; follow-up dry run had an empty repair plan | Pass |
| N. Administrator/public reports and CSV agreement | Campaign `CAM-ACCEPT-PR18` | admin and CSV: gross 7,400, refunds 7,400, net 0, two refunded units; public values withheld while three post-production tasks remain open | Pass after fixing the public withholding gate |

## Acceptance correction found during execution

Scenario N exposed a release defect: open post-production reversal tasks were counted operationally but did not set the campaign’s `underReconciliation` flag. The branch now includes a regression fix so the administrator report and campaign CSV mark the campaign under reconciliation, while the public endpoint returns `Figures are under reconciliation` and nulls provisional exact values. The resumable workflow also resolves its matching historical failure task after a successful retry.

## Release boundary

This acceptance establishes sandbox behavior only. Production Stripe credentials, live webhook subscriptions, live tax/shipping configuration, and any production-wide legacy migration remain separate release-time checks.
