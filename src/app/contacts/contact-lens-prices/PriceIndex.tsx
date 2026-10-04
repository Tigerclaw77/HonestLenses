"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { CatalogPriceProduct } from "@/lib/seo/catalogPriceIndex";

import styles from "./prices.module.css";

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function PriceIndex({ products }: { products: CatalogPriceProduct[] }) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? products.filter((product) =>
          `${product.name} ${product.manufacturer}`.toLocaleLowerCase().includes(query),
        )
      : products;
  }, [products, search]);

  return (
    <section className={styles.index} aria-labelledby="price-index-title">
      <div className={styles.indexHeader}>
        <div>
          <h2 id="price-index-title">Find your prescribed lens</h2>
          <p>Search by its complete product name or manufacturer.</p>
        </div>
        <label className={styles.searchLabel}>
          Product or manufacturer
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="For example, ACUVUE OASYS MAX 1-Day"
          />
        </label>
      </div>
      <p className={styles.count} aria-live="polite">
        {matches.length} matching {matches.length === 1 ? "product" : "products"}
      </p>
      {matches.length ? (
        <div className={styles.list}>
          {matches.map((product) => (
            <article key={product.coreId} className={styles.product}>
              <div className={styles.productHeader}>
                <div>
                  <p className={styles.manufacturer}>{product.manufacturer}</p>
                  <h3>{product.name}</h3>
                </div>
                <Link href={product.href} className={styles.productLink}>
                  View this product
                </Link>
              </div>
              <div className={styles.packs}>
                {product.options.map((option) => (
                  <div key={option.sku} className={styles.pack}>
                    <span>{option.boxSize}-lens box</span>
                    <strong>{currency(option.pricePerBoxCents)} per box</strong>
                    {product.options.length > 1 ? (
                      <small>
                        {currency(option.pricePerBoxCents / option.boxSize)} per lens
                      </small>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>
          No matching catalog product. Check the exact name on your prescription
          or <Link href="/browse">browse all lenses</Link>.
        </p>
      )}
    </section>
  );
}
