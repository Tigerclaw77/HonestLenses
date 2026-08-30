"use client";

import Link from "next/link";

const COPYRIGHT_YEAR = 2026;

export default function Footer({ variant = "default" }: { variant?: "default" | "home" }) {
  if (variant === "home") {
    return (
      <footer className="home-footer">
        <div className="home-footer-main">
          <div className="home-footer-brand">
            <Link href="/" className="home-footer-logo">HONEST <span>LENSES</span></Link>
            <p>Authentic contact lenses, straightforward pricing, and prescription verification.</p>
          </div>
          <nav aria-label="Shop">
            <h2>Shop</h2>
            <Link href="/browse">All contact lenses</Link>
            <Link href="/browse?category=daily">Daily lenses</Link>
            <Link href="/browse?category=astigmatism">Astigmatism lenses</Link>
            <Link href="/browse?category=multifocal">Multifocal lenses</Link>
          </nav>
          <nav aria-label="Help">
            <h2>Help</h2>
            <Link href="/verification">Prescription verification</Link>
            <Link href="/guides">Lens guides</Link>
            <Link href="/resume-order">Resume an order</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <nav aria-label="Company">
            <h2>Company</h2>
            <Link href="/about">About Honest Lenses</Link>
            <Link href="/shipping">Shipping</Link>
            <Link href="/returns">Returns</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>
        <div className="home-footer-bottom">
          <span>© {COPYRIGHT_YEAR} Honest Lenses</span>
          <div><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="site-footer">
      <div className="footer-left">
        © {COPYRIGHT_YEAR} Honest Lenses
      </div>

      <nav className="footer-right" aria-label="Footer navigation">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/returns">Returns</Link>
        <Link href="/guides">Guides</Link>
        <Link href="/verification">Prescription Verification</Link>
        <Link href="/resume-order">Resume an Order</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </footer>
  );
}
