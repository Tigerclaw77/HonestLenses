"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-left">
        © {new Date().getFullYear()} Honest Lenses
      </div>

      <nav className="footer-right" aria-label="Footer navigation">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/returns">Returns</Link>
        <Link href="/verification">Prescription Verification</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </footer>
  );
}
