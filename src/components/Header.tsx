"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import type { User } from "@supabase/supabase-js";

type HeaderVariant = "home" | "shop" | "about" | "content";

type HeaderProps = {
  variant?: HeaderVariant;
  onShopIntent?: () => void;
};

export default function Header({
  variant = "home",
  onShopIntent,
}: HeaderProps) {
  const router = useRouter();

  const [isNavOpen, setIsNavOpen] = useState(false);
  const [hasItems, setHasItems] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const isHome = variant === "home";
  const showShop = variant !== "shop";
  const showAbout = variant !== "about";

  const handleOrderClick = () => {
    setIsNavOpen(false);
    router.push("/upload-prescription");
  };

  const handleShopClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    setIsNavOpen(false);
    onShopIntent?.();
  };

  // Load cart badge
  useEffect(() => {
    fetch("/api/cart/has-items")
      .then((res) => res.json())
      .then((data) => setHasItems(Boolean(data.hasItems)))
      .catch(() => setHasItems(false));
  }, []);

  // Load user session
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        accountRef.current &&
        !accountRef.current.contains(event.target as Node)
      ) {
        setAccountOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    localStorage.removeItem("manualRxDraft");
    localStorage.removeItem("rxUploadDraft");
    localStorage.removeItem("rx_upload_order_d");

    await supabase.auth.signOut();
    setAccountOpen(false);
    router.refresh();
  }

  return (
    <>
      <header className="header">
        <div className="header-inner">
          {/* LOGO */}
          <Link href="/" className="logo-link">
            <div className="logo">
              <span className="logo-honest">HONEST</span>
              <span className="logo-lenses">LENSES</span>
            </div>
          </Link>

          <div className="header-actions">
            {isHome && (
              <button className="nav-toggle" onClick={() => setIsNavOpen(true)}>
                ☰
              </button>
            )}

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

            {/* ACCOUNT */}
            <div className="account-wrapper" ref={accountRef}>
              <button
                className="header-icon-btn"
                aria-label="Account"
                onClick={() => {
                  if (!user) {
                    router.push("/login"); // Magic Link page
                  } else {
                    setAccountOpen((v) => !v);
                  }
                }}
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
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                </svg>
              </button>

              {user && accountOpen && (
                <button className="account-popover" onClick={handleLogout}>
                  Log out
                </button>
              )}
            </div>

            {/* CART */}
            <div className="cart-wrapper">
              <Link href="/cart" className="header-icon-btn" aria-label="Cart">
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
                >
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
                </svg>

                {hasItems && <span className="header-cart-badge" />}
              </Link>
            </div>
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
