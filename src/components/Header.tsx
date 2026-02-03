"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type HeaderVariant = "home" | "shop" | "about" | "content";

type HeaderProps = {
  variant?: HeaderVariant;
  onShopIntent?: () => void;
};

export default function Header({
  variant = "home",
  onShopIntent,
}: HeaderProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);

  const isHome = variant === "home";
  const showShop = variant !== "shop";
  const showAbout = variant !== "about";
  const [hasItems, setHasItems] = useState(false);

  const handleOrderClick = () => {
    setIsNavOpen(false);
    window.location.href = "/upload-prescription";
  };

  const handleShopClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    setIsNavOpen(false);
    onShopIntent?.();
  };

  useEffect(() => {
    // TEMP: replace with API call or server-injected prop
    fetch("/api/cart/has-items")
      .then((res) => res.json())
      .then((data) => setHasItems(Boolean(data.hasItems)))
      .catch(() => setHasItems(false));
  }, []);

  return (
    <>
      <header className="header">
        <div className="header-inner">
          {/* LEFT: LOGO */}
          <Link href="/" className="logo-link">
            <div className="logo">
              <span className="logo-honest">HONEST</span>
              <span className="logo-lenses">LENSES</span>
            </div>
          </Link>

          {/* RIGHT GROUP (DO NOT REORDER) */}
          <div className="header-actions">
            {isHome && (
              <button className="nav-toggle" onClick={() => setIsNavOpen(true)}>
                ☰
              </button>
            )}

            {/* CTA STAYS WHERE IT WAS */}
            <button
              className="header-order-btn header-cta"
              onClick={handleOrderClick}
            >
              Order Contacts
            </button>

            <nav className="header-nav">
              {showShop && (
                <a href="/shop" onClick={handleShopClick}>
                  Shop
                </a>
              )}
              {showAbout && <Link href="/about">About</Link>}
            </nav>
            <Link
              href="/account"
              className="header-icon-btn"
              aria-label="Account"
            >
              <svg
                className="header-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
              </svg>
            </Link>

            <Link
              href={hasItems ? "/checkout" : "/shop"}
              className="header-icon-btn"
              aria-label="Cart"
            >
              <svg
                className="header-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
              </svg>

              {hasItems && <span className="header-cart-badge" />}
            </Link>
          </div>
        </div>
      </header>

      {isHome && isNavOpen && (
        <>
          <div className="nav-drawer open">
            <button
              className="drawer-close"
              onClick={() => setIsNavOpen(false)}
            >
              ✕
            </button>

            <nav className="drawer-nav">
              <a href="/shop" onClick={handleShopClick}>
                Shop
              </a>
              <Link href="/about">About</Link>
            </nav>

            <button className="drawer-cta" onClick={handleOrderClick}>
              Order Contacts
            </button>
          </div>

          <div
            className="drawer-backdrop"
            onClick={() => setIsNavOpen(false)}
          />
        </>
      )}
    </>
  );
}
