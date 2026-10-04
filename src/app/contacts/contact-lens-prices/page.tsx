import type { Metadata } from "next";
import Link from "next/link";

import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { getCatalogPriceProducts } from "@/lib/seo/catalogPriceIndex";
import { SITE_URL } from "@/lib/seo/contactSeoRoutes";

import PriceIndex from "./PriceIndex";
import styles from "./prices.module.css";

export const metadata: Metadata = {
  title: { absolute: "Contact Lens Prices | Current Box Prices | Honest Lenses" },
  description:
    "Find your exact prescribed contact lens and compare its current Honest Lenses box prices and pack sizes before ordering. Valid prescription required.",
  alternates: { canonical: `${SITE_URL}/contacts/contact-lens-prices` },
};

export default function ContactLensPricesPage() {
  const products = getCatalogPriceProducts();

  return (
    <>
      <Header variant="content" />
      <main className={styles.shell}>
        <section className={styles.intro}>
          <p className={styles.eyebrow}>Current catalog pricing</p>
          <h1>Contact Lens Prices</h1>
          <p>
            Find the exact lens named on your prescription, then see its current
            box prices and available pack sizes at Honest Lenses.
          </p>
        </section>

        <PriceIndex products={products} />

        <section className={styles.explainer}>
          <h2>About these prices</h2>
          <p>
            Prices shown are for one box from the Honest Lenses catalog. A
            per-lens figure appears only when the same exact product has more
            than one pack size; it is the box price divided by its lens count.
            Shipping, tax, and reusable-lens care supplies are separate. The
            cart shows your selected quantities and total before you order.
          </p>
          <p>
            Lens brands and designs are not interchangeable. Order only the
            product and parameters on your valid contact lens prescription.
            For quantity and cost planning over a longer period, see the{" "}
            <Link href="/contacts/annual-supply-contact-lenses">
              supply calculator
            </Link>.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
