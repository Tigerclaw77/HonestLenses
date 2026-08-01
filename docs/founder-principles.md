# Honest Lenses Founder Principles

## General operating rules

- Keep recommendations practical and concise.
- Do not add process unless it clearly reduces a specific real risk.
- Explain the business value of any substantial recommendation in one or two sentences.
- Prefer focused implementation over broad audits.
- Do not reopen resolved issues without concrete new evidence.
- Do not redesign existing workflows unless explicitly authorized.
- Preserve useful interaction patterns when simplifying.
- More information is not automatically better information.
- Optimize for clarity, founder throughput, customer conversion, and near-term revenue.
- Make narrow, reviewable commits.
- Never mix unrelated changes into one release.
- Never claim a UI fix is complete without checking the actual rendered route.

## Honest Lenses dashboard

- The admin dashboard is a work queue, not an order database.
- It should answer: “What do I need to do now?”
- Primary queues are:
  - Awaiting Verification
  - Ready to Order
  - Resolve Exception
- Ordered, shipped, delivered, completed, and supplier-managed orders should not clutter the active queue.
- Armory owns supplier lifecycle after supplier placement.
- Armory should return an order to Resolve Exception only when founder action is truly required.
- Routine processing should occur inside the expandable work-queue card.
- Order Details is for infrequently needed record information.
- Do not replace routine expandable workflows with modals unless explicitly requested.
- Preserve one-click copy controls for operational fields.
- Reserve badges for meaningful exceptions such as Express, Hold, Manual Review, Supplier Exception, Quantity Adjusted, and Refund Pending.
- Founder-facing timestamps should display in America/Chicago while remaining stored in UTC.

## Honest Lenses SEO

- Do not perform generic SEO work.
- Build topical authority one excellent page at a time.
- Each SEO session should identify one highest-value topic Honest Lenses can realistically become one of the best resources for.
- Favor topics where Honest Lenses has genuine expertise or trust advantages.
- Strong topic areas include:
  - contact lens prescription verification
  - buying contact lenses online
  - verification delays and prescriber response
  - valid versus invalid prescriptions
  - contact lens pricing transparency
  - annual-supply purchasing
  - shipping and fulfillment expectations
  - contact lens materials and replacement schedules
- Do not choose topics based on search volume alone.
- Evaluate:
  - customer intent
  - competition
  - business value
  - ranking feasibility
  - topical-authority value
  - internal-link opportunities
- Prefer one exceptional page over many average pages.
- Do not create a broad content calendar unless explicitly requested.
- Every new page should:
  - solve a real customer question
  - have a clear search intent
  - support trust or revenue
  - link naturally into the existing Honest Lenses site
  - avoid filler
- After one page is completed and integrated, stop.

## SEO session workflow

1. Research the strongest current opportunity.
2. Recommend one topic only.
3. Explain:
   - why it was selected
   - what customer problem it solves
   - why Honest Lenses can realistically rank
   - how it supports revenue or trust
4. After approval, create:
   - title
   - slug
   - H1
   - outline
   - complete article
   - FAQ
   - schema recommendations
   - internal links
   - authoritative outbound references
5. Integrate the page into the site.
6. Stop.

## Release discipline

- Customer purchasing, payment integrity, security, fulfillment, and production-data safety outrank cosmetic work.
- Verify complete customer workflows, not just isolated components.
- A deployment is not complete until the main customer purchase path and founder fulfillment path work in production.
- Keep Commerce v2 disabled unless explicitly authorized.
- Preserve the canonical production branch and migration history.
- Generated logs must not be committed.
