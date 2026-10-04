import type { Metadata } from "next";
import Link from "next/link";

import { lenses } from "@/LensCore/data/lenses";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getPackSizeFromSku } from "@/lib/pricing/getPackSize";
import { getPricePerBox } from "@/lib/pricing/getPricePerBox";
import { getLensSlug } from "@/lib/seo/contactSeoRoutes";
import { getSupplyEstimate } from "@/lib/seo/productEconomics";
import { getCatalogPriceProducts } from "@/lib/seo/catalogPriceIndex";
import CommercialContactPage from "../_commercial/CommercialContactPage";
import { commercialContactPages } from "../_commercial/commercialPages";
import styles from "./annualSupplyComparison.module.css";
import SupplyCalculator from "./SupplyCalculator";

const page = commercialContactPages.annualSupplyContactLenses;

export const metadata: Metadata = {
  title: { absolute: page.title },
  description: page.metaDescription,
  alternates: {
    canonical: page.canonicalUrl,
  },
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function AnnualSupplyComparison() {
  const rows = page.productCoreIds.flatMap((coreId) => {
    const lens = lenses.find((item) => item.coreId === coreId);
    if (!lens) return [];

    const options = getLensSkus(lens).flatMap((sku) => {
      const boxSize = getPackSizeFromSku(sku);
      const boxPriceCents = getPricePerBox(sku);
      if (!boxSize || boxPriceCents === null) return [];

      const estimate = getSupplyEstimate({
        durationMonths: 12,
        boxSize,
        replacement: lens.replacement,
        pricePerBoxCents: boxPriceCents,
        eyeMode: "both-different",
      });
      return [{ sku, boxSize, boxPriceCents, estimate }];
    });

    const best = options.sort(
      (a, b) =>
        a.estimate.totalPriceCents - b.estimate.totalPriceCents ||
        b.boxSize - a.boxSize,
    )[0];
    return best ? [{ lens, ...best }] : [];
  });

  if (!rows.length) return null;

  return (
    <section className={styles.section} aria-labelledby="annual-supply-comparison">
      <h2 id="annual-supply-comparison">Compare a 12-month supply</h2>
      <p>
        Current catalog prices and estimated quantities for two eyes using the
        same prescribed product. Each row uses the pack size with the lowest
        calculated 12-month product cost among available options.
        For all available pack prices, use the{" "}
        <Link href="/contacts/contact-lens-prices">exact-lens price index</Link>.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Pack size</th>
              <th scope="col">Box price</th>
              <th scope="col">12-month boxes</th>
              <th scope="col">Estimated product cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lens, sku, boxSize, boxPriceCents, estimate }) => (
              <tr key={sku}>
                <th scope="row">
                  <Link href={`/contacts/${getLensSlug(lens)}#annual-supply-estimate`}>
                    {lens.displayName}
                  </Link>
                </th>
                <td>{boxSize} lenses</td>
                <td>{formatCurrency(boxPriceCents)}</td>
                <td>{estimate.totalBoxes} ({estimate.boxesPerEye} per eye)</td>
                <td>{formatCurrency(estimate.totalPriceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        Estimates assume continuous use for roughly 12 months. Shipping, tax,
        lens care supplies, prescription expiration, and different lenses for
        each eye can change the order. Open a product to adjust its estimate.
      </p>
    </section>
  );
}

export default function AnnualSupplyContactLensesPage() {
  return (
    <CommercialContactPage page={page}>
      <SupplyCalculator products={getCatalogPriceProducts()} />
      <AnnualSupplyComparison />
    </CommercialContactPage>
  );
}
