"use client";

import Link from "next/link";
import Header from "../../components/Header"; // adjust path if needed

export default function EnterPrescriptionPage() {
  return (
    <>
      <Header variant="shop" />

      <main>
        <section className="content-shell">
          <h1 className="upper content-title">Enter Prescription</h1>

          <p className="content-lead">
            This page will collect prescription details (OD/OS, BC, DIA, brand,
            prescriber info). For MVP, we’re wiring navigation first.
          </p>

          <div className="order-card">
            <p className="order-fineprint" style={{ marginTop: 0 }}>
              Manually entered prescriptions are verified prior to fulfillment.
            </p>

            <div className="order-actions">
              <Link href="/order" className="primary-btn">
                Back to Order Options
              </Link>
              <Link href="/" className="ghost-link">
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-left">© 2026 Honest Lenses</div>
        <div className="footer-right">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </footer>
    </>
  );
}
