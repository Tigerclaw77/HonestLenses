import type { Metadata } from "next";
import Link from "next/link";

import Footer from "@/components/Footer";
import Header from "@/components/Header";

import styles from "./visionBenefits.module.css";

export const metadata: Metadata = {
  title: "Vision Insurance and HSA/FSA",
  description:
    "Learn how Honest Lenses supports out-of-network vision reimbursement and itemized HSA/FSA receipts.",
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
          <h2>HSA and FSA funds</h2>
          <p>
            Eligible contact lens purchases can generally be paid or reimbursed
            with HSA/FSA funds, subject to your plan rules. Honest Lenses uses
            the ordinary secure Stripe checkout and does not guarantee that a
            particular benefits card or reimbursement request will be approved.
          </p>
          <p>
            Your itemized receipt remains available from your customer order
            page. FSA deadlines and carryover rules vary by employer plan; HSA
            funds do not expire annually.
          </p>
        </section>

        <div className={styles.actions}>
          <Link href="/browse" className="primary-btn">
            Shop contact lenses
          </Link>
          <Link href="/resume-order" className={styles.secondaryLink}>
            Resume an order
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
