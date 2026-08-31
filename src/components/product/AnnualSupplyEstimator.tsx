"use client";

import { useMemo, useState } from "react";

import { getAnnualSupplyEstimate } from "@/lib/seo/productEconomics";

import styles from "./AnnualSupplyEstimator.module.css";

export type SupplyPriceOption = {
  sku: string;
  boxSize: number;
  pricePerBoxCents: number;
  monthsPerBox: number;
};

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function AnnualSupplyEstimator({
  options,
}: {
  options: SupplyPriceOption[];
}) {
  const [sku, setSku] = useState(options[0]?.sku ?? "");
  const [eyeCount, setEyeCount] = useState<1 | 2>(2);
  const selected = options.find((option) => option.sku === sku) ?? options[0];
  const estimate = useMemo(
    () =>
      selected
        ? getAnnualSupplyEstimate({
            monthsPerBox: selected.monthsPerBox,
            pricePerBoxCents: selected.pricePerBoxCents,
            eyeCount,
          })
        : null,
    [eyeCount, selected],
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
        Estimate assumes continuous use for approximately 12 months at this product&apos;s catalog replacement schedule. It excludes shipping and taxes. Your actual order can use different products or quantities for each eye; follow your prescription and intended wear schedule.
      </p>
    </div>
  );
}
