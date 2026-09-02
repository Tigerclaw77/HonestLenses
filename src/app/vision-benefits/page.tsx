import type { Metadata } from "next";
import Link from "next/link";

import Footer from "@/components/Footer";
import Header from "@/components/Header";

import styles from "./visionBenefits.module.css";

export const metadata: Metadata = {
  title: "Contact Lenses with HSA/FSA and Vision Insurance",
  description:
    "Learn how to use HSA/FSA funds for eligible contact lenses and get itemized documentation for possible out-of-network vision reimbursement.",
  alternates: { canonical: "/vision-benefits" },
};

export default function VisionBenefitsPage() {
  return (
    <>
      <Header variant="content" />
      <main className={styles.shell}>
        <section className={styles.intro}>
          <p className={styles.eyebrow}>Payment and reimbursement</p>
          <h1>Vision Insurance &amp; HSA/FSA</h1>
          <p>
            Honest Lenses does not bill vision plans directly or verify your
            eligibility. Some customers may be able to request out-of-network
            reimbursement after purchasing prescribed contact lenses.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Out-of-network vision reimbursement</h2>
          <p>
            You can optionally identify your vision carrier during checkout.
            After payment is captured, your order page provides an itemized
            receipt and, when available, a link to the carrier&apos;s official
            reimbursement information.
          </p>
          <p>
            Allowances, filing deadlines, documentation requirements, and
            reimbursement decisions vary by plan. Confirm them with your
            insurer or plan administrator before relying on reimbursement.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Are contact lenses HSA/FSA eligible?</h2>
          <p>
            The IRS identifies contact lenses needed for medical reasons as a
            medical expense. Whether your purchase can be paid or reimbursed
            through a particular HSA or FSA still depends on your plan rules.
          </p>
          <p>
            You may enter an HSA/FSA card in Honest Lenses&apos; secure Stripe
            checkout. Card approval depends on the issuer, plan rules, and
            merchant eligibility, so acceptance cannot be guaranteed. If you
            pay another way, your itemized receipt may support a reimbursement
            request.
          </p>
          <a
            className={styles.sourceLink}
            href="https://www.irs.gov/publications/p502#en_US_2025_publink1000179016"
          >
            IRS Publication 502: Contact Lenses
          </a>
        </section>

        <section className={styles.section}>
          <h2>How to use your Honest Lenses documentation</h2>
          <ol className={styles.steps}>
            <li>
              <strong>Check your benefits first.</strong> Confirm card rules,
              allowance, filing deadline, and required documents with your plan.
            </li>
            <li>
              <strong>Place your order.</strong> At checkout, optionally select
              your vision carrier. This does not verify coverage or notify the
              carrier.
            </li>
            <li>
              <strong>Open your secure receipt.</strong> After payment is
              captured, the itemized receipt is available from your order page
              and confirmation-email link.
            </li>
            <li>
              <strong>Submit directly to your plan.</strong> Use your carrier&apos;s
              member portal or claim form. The plan decides eligibility and any
              reimbursement amount.
            </li>
          </ol>
        </section>

        <section className={styles.section}>
          <h2>What Honest Lenses does—and does not—do</h2>
          <ul className={styles.checklist}>
            <li>Provides a secure itemized receipt after payment capture.</li>
            <li>Keeps receipt access available from the customer order page.</li>
            <li>Provides carrier-specific official help links when available.</li>
            <li>Does not bill vision plans or submit claims for customers.</li>
            <li>Does not verify benefits or guarantee card or claim approval.</li>
          </ul>
        </section>

        <div className={styles.actions}>
          <Link href="/browse" className="primary-btn">
            Shop contact lenses
          </Link>
          <Link href="/resume-order" className={styles.secondaryLink}>
            Resume an order
          </Link>
          <Link href="/find-receipt" className={styles.secondaryLink}>
            Find a past receipt
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
