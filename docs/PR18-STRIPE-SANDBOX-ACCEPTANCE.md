# PR #18 Stripe sandbox acceptance

This document records the isolated acceptance environment used for PR #18.

- Stripe account: `acct_1Tt4SHGhBLEOPegp` (`IZHE Army sandbox`)
- Stripe mode: sandbox/test only (`livemode=false`)
- Netlify context: deploy preview for PR #18
- Preview webhook: `/.netlify/functions/stripe-webhook`
- Webhook event families: Checkout completion/failure/expiration, refunds, and disputes
- Catalog mirror: 28 active USD Prices matching catalog revision 52 lookup keys and integer-cent amounts
- Live Stripe configuration and live payment objects are outside this acceptance pass and must not be mutated.

The acceptance matrix and privacy-safe Stripe object references are recorded on the pull request after execution. No secret key, webhook signing secret, customer address, card data, or receipt URL belongs in this file.
