"use client";

import { useState } from "react";
import Link from "next/link";

type HeaderVariant = "home" | "shop" | "about" | "content";

type HeaderProps = {
  variant?: HeaderVariant;
};

export default function Header({ variant = "home" }: HeaderProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);

  const isHome = variant === "home";

  // Desktop links (>= 900px, because .header-nav is hidden under that)
  const showShop = variant !== "shop";
  const showAbout = variant !== "about";

  return (
    <>
      <header className="header">
        <div className="header-inner">
          {/* Logo */}
          <Link href="/" className="logo-link" aria-label="Go to homepage">
            <div className="logo">
              <div>
                <span className="logo-honest">HONEST</span>
                <span className="logo-lenses">LENSES</span>
              </div>
              <div className="logo-tagline upper">See clearly. Pay fairly.</div>
            </div>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* Hamburger ONLY on home (mobile nav drawer behavior) */}
            {isHome && (
              <button
                className="nav-toggle"
                aria-label="Open menu"
                aria-expanded={isNavOpen}
                onClick={() => setIsNavOpen(true)}
              >
                ☰
              </button>
            )}

            {/* Always-visible CTA (important for mobile on non-home pages) */}
            <Link href="/order" className="header-order-btn header-cta">
              Order Contacts
            </Link>

            {/* Desktop nav (hidden on mobile via your CSS) */}
            <nav className="header-nav" aria-label="Primary navigation">
              {showShop && <Link href="/shop">Shop</Link>}
              {showAbout && <Link href="/about">About</Link>}
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile drawer — home only */}
      {isHome && (
        <>
          <div className={`nav-drawer ${isNavOpen ? "open" : ""}`}>
            <button
              className="drawer-close"
              aria-label="Close menu"
              onClick={() => setIsNavOpen(false)}
            >
              ✕
            </button>

            <nav className="drawer-nav" aria-label="Mobile navigation">
              <Link href="/shop" onClick={() => setIsNavOpen(false)}>
                Shop
              </Link>
              <Link href="/about" onClick={() => setIsNavOpen(false)}>
                About
              </Link>
            </nav>

            <div className="drawer-spacer" />

            <Link
              href="/order"
              className="drawer-cta"
              onClick={() => setIsNavOpen(false)}
            >
              Order Contacts
            </Link>
          </div>

          {isNavOpen && (
            <div
              className="drawer-backdrop"
              onClick={() => setIsNavOpen(false)}
            />
          )}
        </>
      )}
    </>
  );
}
