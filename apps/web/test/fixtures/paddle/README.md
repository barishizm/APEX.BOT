# Paddle webhook fixtures

Real Paddle Billing sandbox events, unchanged, as published in Paddle's webhook reference
(`https://developer.paddle.com/webhooks/<entity>/<event>.md`, fetched 2026-10-20). They come from Paddle's
demo seller (the "AeroEdit" catalog), so the price ids are Paddle's, not ours; the tests map
`pri_01gsz8x8sawmvhz1pv30nge1ke` ("Monthly (per seat)") to Pro monthly. `custom_data` is `null` in every
one; tests that need our signed `organization_id` (`organizationData`) or a downgrade marker add it to a copy.

Once our own sandbox is set up, add events captured from `app.billing_events` next to these rather than
replacing them.
