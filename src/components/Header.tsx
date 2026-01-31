"use client";

import { useState } from "react";
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

  const handleShopClick = (
    e: React.MouseEvent<HTMLElement>
  ) => {
    e.preventDefault();
    setIsNavOpen(false);
    onShopIntent?.();
  };

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link href="/" className="logo-link">
            <div className="logo">
              <span className="logo-honest">HONEST</span>
              <span className="logo-lenses">LENSES</span>
            </div>
          </Link>

          <div style={{ display: "flex", gap: 16 }}>
            {isHome && (
              <button
                className="nav-toggle"
                onClick={() => setIsNavOpen(true)}
              >
                ☰
              </button>
            )}

            <button
              className="header-order-btn header-cta"
              onClick={handleShopClick}
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

            <button
              className="drawer-cta"
              onClick={handleShopClick}
            >
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
