"use client";

import Link from "next/link";

const COPYRIGHT_YEAR = 2026;

export default function Footer() {
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
        <Link href="/contact">Contact</Link>
      </nav>
    </footer>
  );
}
