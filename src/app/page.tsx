"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Header from "../components/Header";
import Footer from "../components/Footer";
import FindDoctorModal from "../components/FindDoctorModal";
import OrderRecoveryBanner from "../components/OrderRecoveryBanner";
import ShopIntentModal from "../components/ShopIntentModal";
import { POSTHOG_EVENTS } from "@/lib/posthog/client";
import { recordRecentUserAction } from "@/lib/telemetry/clientErrors";
import { trackFunnelEvent } from "@/lib/telemetry/funnel";
import { lenses } from "@/LensCore/data/lenses";
import type { LensCore } from "@/LensCore/types";
import { getLensImage } from "@/lib/display/getLensImage";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getLowestPrice } from "@/lib/pricing/getLowestPrice";
import { getPackSizeFromSku } from "@/lib/pricing/getPackSize";
import { getLensSlug } from "@/lib/seo/contactSeoRoutes";

const FEATURED_PRODUCT_IDS = [
  "OASYS_MAX_1D",
  "DT1",
  "MYDAY",
  "INFUSE_1D",
] as const;

const FEATURED_LENSES = FEATURED_PRODUCT_IDS
  .map((coreId) => lenses.find((lens) => lens.coreId === coreId))
  .filter((lens): lens is LensCore => Boolean(lens))
  .filter((lens) => getLensSkus(lens).length > 0);

const MANUFACTURER_LABELS: Record<string, string> = {
  VISTAKON: "ACUVUE",
  ALCON: "Alcon",
  COOPERVISION: "CooperVision",
  "BAUSCH + LOMB": "Bausch + Lomb",
};

function getPackLabel(lens: LensCore) {
  const packSizes = [...new Set(getLensSkus(lens).map(getPackSizeFromSku))]
    .filter((size): size is number => size !== null)
    .sort((a, b) => a - b);

  if (!packSizes.length) return "Available pack sizes vary";
  if (packSizes.length === 1) return `${packSizes[0]} lenses per box`;
  return `${packSizes.join(" or ")} lenses per box`;
}

export default function HomePage() {
  const router = useRouter();

  const [isFindDoctorOpen, setIsFindDoctorOpen] = useState(false);
  const [isShopIntentOpen, setIsShopIntentOpen] = useState(false);
  const [lensSearch, setLensSearch] = useState("");

  // Lock body scroll when ANY modal is open
  useEffect(() => {
    const shouldLock = isFindDoctorOpen || isShopIntentOpen;
    document.body.style.overflow = shouldLock ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isFindDoctorOpen, isShopIntentOpen]);

  useEffect(() => {
    void trackFunnelEvent(POSTHOG_EVENTS.HOMEPAGE_VIEWED, {
      source: "homepage",
    });
  }, []);

  return (
    <main>
      {/* HEADER */}
      <Header variant="home" onShopIntent={() => setIsShopIntentOpen(true)} />
      <OrderRecoveryBanner />

      {/* ==================================================
          HERO
      ================================================== */}
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-inner">
          <div className="home-hero-copy">
            <p className="home-eyebrow">
              Honest pricing. Honest sourcing. Honest Lenses.
            </p>
            <h1 id="home-hero-title">
              Contact lenses.
              <span>Honestly done.</span>
            </h1>
            <p className="home-hero-lede">
              Shop authentic contact lenses with straightforward per-box
              pricing and prescription verification built into your order.
            </p>
            <div className="home-hero-actions">
              <button
                className="home-primary-button"
                onClick={() => {
                  recordRecentUserAction("homepage_shop_now_click");
                  setIsShopIntentOpen(true);
                }}
              >
                Shop contact lenses
              </button>
              <Link href="/browse" className="home-secondary-button">
                Browse all brands
              </Link>
            </div>
            <form
              className="home-lens-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const query = lensSearch.trim();
                router.push(query ? `/browse?search=${encodeURIComponent(query)}` : "/browse");
              }}
            >
              <label htmlFor="home-lens-search">Find your prescribed lens</label>
              <div>
                <input
                  id="home-lens-search"
                  value={lensSearch}
                  onChange={(event) => setLensSearch(event.target.value)}
                  placeholder="Search by lens name"
                />
                <button type="submit">Search</button>
              </div>
            </form>
          </div>
          <div
            className="home-hero-visual"
            aria-label="Featured premium daily contact lenses"
          >
            {FEATURED_LENSES.map((lens, index) => (
              <Link
                className={`home-hero-product home-hero-product-${index + 1}`}
                href={`/contacts/${getLensSlug(lens)}`}
                key={lens.coreId}
              >
                <span className="home-hero-product-image">
                  <Image
                    src={getLensImage(lens.coreId)}
                    alt={`${lens.displayName} contact lens box`}
                    fill
                    loading="eager"
                    sizes="(max-width: 760px) 42vw, (max-width: 1100px) 24vw, 22vw"
                  />
                </span>
                <span className="home-hero-product-label">{lens.displayName}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="home-assurance" aria-label="Ordering assurances">
        <div className="home-assurance-inner">
          <div><span aria-hidden="true">✓</span><p><strong>Authentic lenses</strong><small>Genuine manufacturer products</small></p></div>
          <div><span aria-hidden="true">✓</span><p><strong>Valid prescription required</strong><small>Verification included</small></p></div>
          <div><span aria-hidden="true">$</span><p><strong>Clear per-box pricing</strong><small>See the price before ordering</small></p></div>
          <div><span aria-hidden="true">◆</span><p><strong>Secure checkout</strong><small>Your order details stay protected</small></p></div>
        </div>
      </section>

      <section className="home-section home-brands" aria-labelledby="brands-title">
        <div className="home-section-heading">
          <p>Find the lenses you already wear</p>
          <h2 id="brands-title">Shop by brand</h2>
          <Link href="/browse">View all lenses <span aria-hidden="true">→</span></Link>
        </div>
        <div className="home-brand-grid">
          <Link href={{ pathname: "/browse", query: { manufacturer: "VISTAKON" } }}><strong>ACUVUE</strong><span>Shop ACUVUE lenses</span></Link>
          <Link href={{ pathname: "/browse", query: { manufacturer: "ALCON" } }}><strong>Alcon</strong><span>Shop Alcon lenses</span></Link>
          <Link href={{ pathname: "/browse", query: { manufacturer: "COOPERVISION" } }}><strong>CooperVision</strong><span>Shop CooperVision lenses</span></Link>
          <Link href={{ pathname: "/browse", query: { manufacturer: "BAUSCH + LOMB" } }}><strong>Bausch + Lomb</strong><span>Shop Bausch + Lomb lenses</span></Link>
        </div>
      </section>

      <section className="home-section home-products" aria-labelledby="products-title">
        <div className="home-section-heading">
          <p>Frequently chosen</p>
          <h2 id="products-title">Popular contact lenses</h2>
          <Link href="/browse">Browse the full catalog <span aria-hidden="true">→</span></Link>
        </div>
        <div className="home-product-grid">
          {FEATURED_LENSES.map((lens) => {
            const lowestPrice = getLowestPrice(getLensSkus(lens));
            return (
              <Link
                className="home-product-card"
                href={`/contacts/${getLensSlug(lens)}`}
                key={lens.coreId}
              >
                <span className="home-product-image">
                  <Image
                    src={getLensImage(lens.coreId)}
                    alt={`${lens.displayName} contact lens box`}
                    width={360}
                    height={220}
                    loading="eager"
                    sizes="(max-width: 560px) 72vw, (max-width: 900px) 42vw, 270px"
                  />
                </span>
                <div className="home-product-copy">
                  <p>{MANUFACTURER_LABELS[lens.manufacturer] ?? lens.manufacturer}</p>
                  <h3>{lens.displayName}</h3>
                  <span>{getPackLabel(lens)}</span>
                  {lowestPrice !== null && (
                    <strong>From ${(lowestPrice / 100).toFixed(2)} <small>/ box</small></strong>
                  )}
                  <span className="home-product-link">
                    View lens <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="home-process" aria-labelledby="process-title">
        <div className="home-process-inner">
          <div className="home-process-heading">
            <p>Simple from prescription to order</p>
            <h2 id="process-title">How Honest Lenses works</h2>
            <span>A clear process, without unnecessary surprises.</span>
          </div>
          <ol className="home-process-steps">
            <li><span>01</span><div><h3>Choose your lenses</h3><p>Browse by brand or search for the exact contact lens on your prescription.</p></div></li>
            <li><span>02</span><div><h3>Share your prescription</h3><p>Upload your current prescription or enter the details during your order.</p></div></li>
            <li><span>03</span><div><h3>We verify before fulfillment</h3><p>Your prescription is reviewed as required before your lenses are fulfilled.</p></div></li>
          </ol>
        </div>
      </section>

      <section className="home-value" aria-labelledby="value-title">
        <div className="home-value-inner">
          <div>
            <p>Pricing you can understand</p>
            <h2 id="value-title">The honest price is the price you can see.</h2>
            <span>Each product shows its current per-box price from our live catalog, with available pack sizes clearly identified.</span>
          </div>
          <ul>
            <li><span aria-hidden="true">✓</span>Current catalog pricing</li>
            <li><span aria-hidden="true">✓</span>Pack sizes shown before you order</li>
            <li><span aria-hidden="true">✓</span>Prescription verification built in</li>
          </ul>
          <Link href="/browse" className="home-value-button">Compare lenses</Link>
        </div>
      </section>

      <section className="home-help" aria-labelledby="help-title">
        <div>
          <p>Prescription support</p>
          <h2 id="help-title">Have questions before you order?</h2>
          <span>Understand the verification process, or find an eye care professional if you need a current contact lens prescription.</span>
        </div>
        <div className="home-help-links">
          <Link href="/guides/what-happens-if-my-eye-doctor-does-not-respond">How verification works</Link>
          <button onClick={() => setIsFindDoctorOpen(true)}>Find a doctor</button>
        </div>
      </section>

      <Footer variant="home" />

      {/* ==================================================
          MODALS
      ================================================== */}
      <FindDoctorModal
        isOpen={isFindDoctorOpen}
        onClose={() => setIsFindDoctorOpen(false)}
      />

      <ShopIntentModal
        isOpen={isShopIntentOpen}
        onClose={() => setIsShopIntentOpen(false)}
        onJustLooking={() => {
          recordRecentUserAction("shop_intent_browse_click");
          setIsShopIntentOpen(false);
          router.push("/browse");
        }}
        onHasPrescription={() => {
          recordRecentUserAction("shop_intent_upload_click");
          setIsShopIntentOpen(false);
          router.push("/upload-prescription");
        }}
      />
    </main>
  );
}
