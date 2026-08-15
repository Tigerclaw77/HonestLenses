"use client";

import { useEffect } from "react";

import { getHonestPriceComparison } from "@/lib/honestPrice";
import { POSTHOG_EVENTS, track } from "@/lib/posthog/client";

import styles from "./conversion.module.css";

type ProductReference = {
  coreId: string;
  sku?: string | null;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function HonestPricePromise() {
  return (
    <section className={styles.honestPricePromise} aria-labelledby="honest-price-title">
      <p className={styles.eyebrow}>The Honest Price</p>
      <h2 id="honest-price-title">What you actually pay matters more than the advertised price.</h2>
      <p>
        Genuine branded contacts, straightforward pricing, and no rebate math
        required to understand your order.
      </p>
    </section>
  );
}

export function HonestPriceComparison({ product }: { product: ProductReference }) {
  const comparison = getHonestPriceComparison(product);

  useEffect(() => {
    if (!comparison) return;

    track(POSTHOG_EVENTS.HONEST_PRICE_VIEWED, {
      core_id: comparison.coreId,
      sku: comparison.sku,
      normalized_box_count: comparison.normalizedBoxCount,
    });
  }, [comparison]);

  if (!comparison) return null;

  const savings =
    comparison.competitor.immediateTotalCents -
    comparison.honestLenses.immediateTotalCents;
  const checkedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(comparison.checkedAt));

  return (
    <section className={styles.comparison} aria-label="Honest Price comparison">
      <p className={styles.eyebrow}>The Honest Price</p>
      <div className={styles.comparisonRows}>
        <div>
          <span>Honest Lenses</span>
          <strong>{formatCurrency(comparison.honestLenses.immediateTotalCents)}</strong>
        </div>
        <div>
          <span>{comparison.competitor.name}</span>
          <strong>{formatCurrency(comparison.competitor.immediateTotalCents)}</strong>
        </div>
      </div>
      <p className={styles.savings}>You save {formatCurrency(savings)}</p>
      <p className={styles.comparisonNote}>
        Same lenses. Same {comparison.boxSize}-lens box. Same quantity. No rebate math.
      </p>
      {comparison.competitor.conditionalTerms?.length ? (
        <p className={styles.conditionalTerms}>
          Other price conditions: {comparison.competitor.conditionalTerms.join(" ")}
        </p>
      ) : null}
      <p className={styles.checkedDate}>Price checked {checkedDate}.</p>
      <details
        className={styles.details}
        onToggle={(event) => {
          const isOpen = event.currentTarget.open;
          if (isOpen) {
            track(POSTHOG_EVENTS.HONEST_PRICE_DETAILS_OPENED, {
              core_id: comparison.coreId,
              sku: comparison.sku,
            });
          }
        }}
      >
        <summary>How we compare</summary>
        <p>
          We show only curated comparisons for the same exact product, box size,
          and normalized quantity. Immediate purchase totals are compared, and
          any rebate, subscription, or annual-supply condition is called out.
        </p>
      </details>
    </section>
  );
}
