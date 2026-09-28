# Organic revenue sprint baseline — 2026-09-27

## Evidence and limits

- Search Console baseline supplied for September 20–26 versus September 13–19:
  37 versus 53 Google organic clicks, 133 versus 231 impressions, 27.8% versus
  22.9% CTR, and 9.2 versus 10.8 average position.
- The decline is primarily a discovery/impression problem, not a snippet CTR or
  average-position problem. The supplied query review also shows too much
  dependence on `honest lenses` / `honestlenses` branded demand.
- PostHog independently showed lower Google/mobile traffic and product
  engagement. No systemic checkout or payment outage was found.
- No live Search Console credential or PostHog management connection was
  available in this workspace, so this sprint does not invent query volumes or
  conversion counts. Public search retrieval did confirm that commercial and
  product pages are crawlable, and it exposed `www` URLs alongside apex URLs.

## Ranked non-branded opportunity set

Scores are relative (5 is strongest). Product priorities use the maintained
catalog popularity order, current catalog/price coverage, and public crawl
evidence—not unverified keyword-volume estimates.

| Rank | Query/job to satisfy | Intent | Ability | Catalog fit | Effort | Best existing destination |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 1 | ACUVUE OASYS MAX 1-Day price / 90-pack price | 5 | 5 | 5 | 1 | Product page |
| 2 | Dailies TOTAL1 price / 90-pack price | 5 | 5 | 5 | 1 | Product page |
| 3 | ACUVUE OASYS 1-Day price / annual cost | 5 | 5 | 5 | 1 | Product page |
| 4 | MyDay 90/180-pack price / annual cost | 5 | 4 | 5 | 1 | Product page |
| 5 | Biofinity price / annual supply cost | 5 | 4 | 5 | 1 | Product page |
| 6 | PRECISION1 90-pack price | 5 | 4 | 5 | 1 | Product page |
| 7 | annual supply contact lens cost | 4 | 4 | 5 | 1 | Annual-supply page + product calculators |
| 8 | order existing contact-lens prescription online | 5 | 4 | 5 | 1 | Online-ordering page |
| 9 | daily contact lens price comparison | 4 | 4 | 5 | 2 | Daily-lenses page + product links |
| 10 | real contact lens price without rebate/coupon math | 4 | 3 | 5 | 1 | Pricing guide + visible catalog prices |

## Content decision

No new landing pages were added. The top opportunities already have a single,
strong canonical product or commercial page; adding product-price doorway pages
would split relevance and create maintenance risk. Instead, the shared product
template now supplies concise, product-specific price, annual-supply, prescription,
and shipping answers in visible HTML and FAQ structured data. This improves the
top three opportunities immediately and applies the same factual standard across
the catalog.

## Measurement contract

Use one PostHog session funnel filtered to `traffic_channel = organic_search`:

1. `$pageview`, broken down by `landing_page_path`;
2. `viewed_product` or `product_modal_opened`;
3. `added_to_cart`;
4. `checkout_started`;
5. `payment_succeeded` and `order_success_viewed`.

Every client event carries the first session landing path, referrer host, UTM
fields, and traffic-channel classification. Compare weekly cohorts against the
September 20–26 baseline above, while watching non-branded Search Console
impressions/clicks separately from branded queries.

## Guardrails

- Do not claim lowest/cheapest pricing.
- Do not publish rebate, coupon, or urgency pages.
- Keep prices sourced from the maintained catalog and validate Product/Offer/FAQ
  structured data on every release.
- Keep retired thin parameter and alternative routes redirected or gone; do not
  re-add them to the sitemap.
