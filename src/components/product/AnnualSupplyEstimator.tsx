"use client";

import { useMemo, useState } from "react";

import { getSupplyEstimate } from "@/lib/seo/productEconomics";

import styles from "./AnnualSupplyEstimator.module.css";

export type SupplyPriceOption = {
  sku: string;
  boxSize: number;
  pricePerBoxCents: number;
};

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function AnnualSupplyEstimator({
  options,
  replacement,
}: {
  options: SupplyPriceOption[];
  replacement: string;
}) {
  const [sku, setSku] = useState(options[0]?.sku ?? "");
  const [eyeCount, setEyeCount] = useState<1 | 2>(2);
  const selected = options.find((option) => option.sku === sku) ?? options[0];
  const estimate = useMemo(
    () =>
      selected
        ? getSupplyEstimate({
            durationMonths: 12,
            boxSize: selected.boxSize,
            replacement,
            pricePerBoxCents: selected.pricePerBoxCents,
            eyeMode: eyeCount === 1 ? "one" : "both-different",
          })
        : null,
    [eyeCount, replacement, selected],
  );

  if (!selected || !estimate) return null;

  return (
    <div className={styles.estimator}>
      <div className={styles.controls}>
        <label>
          Pack size
          <select value={selected.sku} onChange={(event) => setSku(event.target.value)}>
            {options.map((option) => (
              <option key={option.sku} value={option.sku}>
                {option.boxSize} lenses — {currency(option.pricePerBoxCents)} per box
              </option>
            ))}
          </select>
        </label>
        <label>
          Eyes using this exact product
          <select
            value={eyeCount}
            onChange={(event) => setEyeCount(Number(event.target.value) as 1 | 2)}
          >
            <option value={1}>One eye</option>
            <option value={2}>Both eyes</option>
          </select>
        </label>
      </div>
      <p className={styles.result} aria-live="polite">
        <strong>{estimate.totalBoxes} boxes total</strong> ({estimate.boxesPerEye} per eye) — estimated product cost {currency(estimate.totalPriceCents)}.
      </p>
      <p className={styles.assumption}>
        Estimate uses twelve 30-day months at this product&apos;s catalog replacement schedule, with whole boxes allocated separately to each eye. It excludes shipping, taxes, and reusable-lens care supplies. If your eyes have identical prescription values, boxes may be shared; if they use different products, calculate each product separately. Follow your prescription and intended wear schedule.
      </p>
    </div>
  );
}
