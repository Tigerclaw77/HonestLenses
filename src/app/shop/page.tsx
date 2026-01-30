"use client";

import Link from "next/link";
import Header from "../../components/Header";
import Footer from "../../components/Footer";

export default function ShopPage() {
  return (
    <>
      <Header variant="shop" />

      <main>
        {/* SHOP INTRO STRIP */}
        <section
          style={{
            padding: "2.25rem 1.75rem 1.25rem",
            maxWidth: "980px",
            margin: "0 auto",
          }}
        >
          <h1 className="upper" style={{ marginBottom: "0.75rem" }}>
            Shop
          </h1>

          <p style={{ color: "rgba(255,255,255,0.85)", maxWidth: 760 }}>
            Checking prices? You can browse first — no prescription entry needed.
            When you’re ready, we’ll collect or upload your prescription during checkout.
          </p>

          <div
            style={{
              marginTop: "1.25rem",
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Link href="/order" className="primary-btn">
              Have your Rx? Order Contacts
            </Link>

            <Link href="/about" style={{ color: "rgba(255,255,255,0.75)" }}>
              How Honest Lenses works →
            </Link>
          </div>
        </section>

        {/* MAIN SHOP AREA (placeholder) */}
        <section
          style={{
            padding: "2.5rem 1.75rem 5rem",
            maxWidth: "980px",
            margin: "0 auto",
          }}
        >
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "2rem",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <h2 className="upper" style={{ marginBottom: "0.75rem", fontSize: "1rem" }}>
              Price check is live. Full catalog is next.
            </h2>

            <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: "1.5rem" }}>
              We’re wiring the product list and filters now. This page will show
              brand pricing with a fast path to checkout.
            </p>

            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <Link href="/order" className="primary-btn">
                Order Contacts
              </Link>
              <Link href="/" className="primary-btn">
                Back to Home
              </Link>
            </div>
          </div>
        </section>

        {/* Optional sticky CTA just for Shop visitors */}
        <Link href="/order" className="sticky-order-cta">
          Order Contacts
        </Link>
      </main>

      <Footer />
    </>
  );
}
