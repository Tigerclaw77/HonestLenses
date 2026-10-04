"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { CatalogPriceProduct } from "@/lib/seo/catalogPriceIndex";
import { getSupplyEstimate, type SupplyEyeMode } from "@/lib/seo/productEconomics";

import styles from "./annualSupplyComparison.module.css";

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function SupplyCalculator({ products }: { products: CatalogPriceProduct[] }) {
  const [search, setSearch] = useState("");
  const [coreId, setCoreId] = useState("");
  const [sku, setSku] = useState("");
  const [durationMonths, setDurationMonths] = useState<1 | 3 | 6 | 12>(12);
  const [eyeMode, setEyeMode] = useState<SupplyEyeMode>("both-different");

  const matchingProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? products.filter((product) =>
          `${product.name} ${product.manufacturer}`.toLocaleLowerCase().includes(query),
        )
      : products;
  }, [products, search]);
  const selectedProduct = products.find((product) => product.coreId === coreId);
  const selectedOption = selectedProduct?.options.find((option) => option.sku === sku)
    ?? selectedProduct?.options[0];
  const estimate = selectedProduct && selectedOption
    ? getSupplyEstimate({
        durationMonths,
        boxSize: selectedOption.boxSize,
        replacement: selectedProduct.replacement,
        pricePerBoxCents: selectedOption.pricePerBoxCents,
        eyeMode,
      })
    : null;

  return (
    <section className={styles.calculator} aria-labelledby="supply-calculator-title">
      <h2 id="supply-calculator-title">Calculate boxes for your prescribed lens</h2>
      <p>
        Choose the exact product on your prescription and a pack size, then plan
        one, three, six, or twelve months of continuous use.
      </p>
      <div className={styles.controls}>
        <label>
          Find a product
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCoreId("");
              setSku("");
            }}
            placeholder="Search by product name"
          />
        </label>
        <label>
          Exact prescribed product
          <select
            value={coreId}
            onChange={(event) => {
              setCoreId(event.target.value);
              setSku("");
            }}
          >
            <option value="">Choose a product</option>
            {matchingProducts.map((product) => (
              <option key={product.coreId} value={product.coreId}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pack size
          <select
            value={selectedOption?.sku ?? ""}
            disabled={!selectedProduct}
            onChange={(event) => setSku(event.target.value)}
          >
            {!selectedProduct ? <option value="">Choose a product first</option> : null}
            {selectedProduct?.options.map((option) => (
              <option key={option.sku} value={option.sku}>
                {option.boxSize} lenses — {currency(option.pricePerBoxCents)} per box
              </option>
            ))}
          </select>
        </label>
        <label>
          Supply duration
          <select
            value={durationMonths}
            onChange={(event) => setDurationMonths(Number(event.target.value) as 1 | 3 | 6 | 12)}
          >
            {[1, 3, 6, 12].map((months) => (
              <option key={months} value={months}>
                {months} {months === 1 ? "month" : "months"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Eyes and prescription values
          <select
            value={eyeMode}
            onChange={(event) => setEyeMode(event.target.value as SupplyEyeMode)}
          >
            <option value="one">One eye uses this product</option>
            <option value="both-same">Both eyes, identical prescription values</option>
            <option value="both-different">Both eyes, different prescription values</option>
          </select>
        </label>
      </div>
      {estimate && selectedProduct ? (
        <div className={styles.calculatorResult} aria-live="polite">
          <strong>{estimate.totalBoxes} {estimate.totalBoxes === 1 ? "box" : "boxes"} estimated</strong>
          <span>
            {estimate.lensesPerEye} lenses needed {eyeMode === "one" ? "for this eye" : "per eye"}.
            {eyeMode === "both-same"
              ? " Boxes can be shared across identical prescription values."
              : eyeMode === "both-different"
                ? ` ${estimate.boxesPerEye} whole ${estimate.boxesPerEye === 1 ? "box" : "boxes"} per eye for different prescription values.`
                : ""}
            {" "}Estimated lens cost: {currency(estimate.totalPriceCents)}.
          </span>
          <Link href={selectedProduct.href}>View {selectedProduct.name} to order</Link>
        </div>
      ) : null}
      <p className={styles.note}>
        Planning uses 30-day months and the catalog replacement interval, then
        rounds lenses and boxes upward. Identical eye values can share boxes;
        different values are rounded to whole boxes separately. If your eyes
        use different products, calculate each product as one eye. Daily lenses
        worn only on some days may require fewer boxes. Estimates exclude
        shipping, tax, and reusable-lens care supplies; follow your valid
        prescription and actual wear schedule.
      </p>
    </section>
  );
}
