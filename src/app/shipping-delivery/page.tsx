import type { Metadata } from "next";
import Link from "next/link";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import styles from "./shipping-delivery.module.css";

export const metadata: Metadata = {
  title: { absolute: "Shipping & Delivery | Honest Lenses" },
  description:
    "Learn about Honest Lenses shipping options, including free standard shipping on qualifying annual supplies, flat-rate shipping, and available express delivery options.",
  alternates: { canonical: "/shipping-delivery" },
};

export default function ShippingDeliveryPage() {
  return (
    <>
      <Header variant="content" />
      <main className={styles.page}>
        <div className={styles.content}>
          <h1>Shipping &amp; Delivery</h1>
          <p className={styles.lead}>
            We believe shipping costs should be clear before you order. Qualifying annual supplies receive free standard shipping, smaller orders have flat-rate standard shipping, and express options are shown at checkout.
          </p>

          <section aria-labelledby="standard-shipping">
            <h2 id="standard-shipping">Standard Shipping</h2>
            <p>Qualifying annual supplies receive free standard shipping. For smaller orders, a flat standard shipping charge is calculated for your order and shown in the cart before payment.</p>
          </section>

          <section aria-labelledby="annual-supply">
            <h2 id="annual-supply">What Qualifies as an Annual Supply?</h2>
            <p>A qualifying annual supply covers at least twelve months of the prescribed lens. The quantity depends on its replacement schedule and pack size, and on the boxes needed for each eye. There is no universal box count. Free shipping applies to standard shipping only.</p>
            <p>Learn more about <Link href="/contacts/annual-supply-contact-lenses">annual supply quantities</Link>.</p>
          </section>

          <section aria-labelledby="express-shipping">
            <h2 id="express-shipping">Express Shipping Options</h2>
            <p>Express shipping is a paid delivery option when offered for your order. The available method and charge are shown at checkout. It applies to the delivery service and does not guarantee immediate processing or bypass prescription verification.</p>
          </section>

          <section aria-labelledby="processing-delivery">
            <h2 id="processing-delivery">Processing &amp; Delivery Expectations</h2>
            <p>Orders are processed after the required prescription verification steps are completed. Manufacturer processing and carrier transit are separate stages, and delivery timing may vary. A shipping upgrade does not eliminate verification.</p>
          </section>

          <section aria-labelledby="shipping-questions">
            <h2 id="shipping-questions">Questions About Your Order?</h2>
            <p>If you have questions about shipping options or an existing order, we’re happy to help. <Link href="/contact">Contact Honest Lenses</Link>.</p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
