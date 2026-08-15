import { existsSync } from "node:fs";
import path from "node:path";

import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { lenses } from "@/LensCore/data/lenses";
import type { LensCore } from "@/LensCore/types";
import ProductTelemetry from "@/components/analytics/ProductTelemetry";
import { HonestPricePromise } from "@/components/conversion/HonestPrice";
import PurchaseTrust from "@/components/conversion/PurchaseTrust";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { getLensImage } from "@/lib/display/getLensImage";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getPackSizeFromSku } from "@/lib/pricing/getPackSize";
import { getPrice } from "@/lib/pricing/getPrice";
import {
  findLensBySlug,
  getLensSlug,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";

import styles from "./productPage.module.css";

type Props = {
  params: Promise<{ slug: string }>;
};

type PriceOption = {
  sku: string;
  boxSize: number;
  pricePerBoxCents: number;
};

function getPriceOptions(lens: LensCore): PriceOption[] {
  return getLensSkus(lens)
    .map((sku) => {
      const boxSize = getPackSizeFromSku(sku);
      if (!boxSize) return null;

      try {
        return {
          sku,
          boxSize,
          pricePerBoxCents: getPrice({ sku, box_count: 1 }).price_per_box_cents,
        };
      } catch {
        return null;
      }
    })
    .filter((option): option is PriceOption => Boolean(option))
    .sort(
      (a, b) =>
        a.boxSize - b.boxSize || a.pricePerBoxCents - b.pricePerBoxCents,
    );
}

function getVerifiedProductImage(lens: LensCore) {
  const imageUrl = getLensImage(lens.coreId);
  const publicPath = imageUrl.replace(/^\//, "");

  return existsSync(path.join(process.cwd(), "public", publicPath))
    ? imageUrl
    : null;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function replacementLabel(code: string) {
  if (code === "DD") return "Daily disposable";
  if (code === "1W") return "Weekly replacement";
  if (code === "2W") return "Two-week replacement";
  if (code === "1M") return "Monthly replacement";
  return `${code} replacement`;
}

function ProductJsonLd({
  lens,
  slug,
  imageUrl,
  priceOptions,
}: {
  lens: LensCore;
  slug: string;
  imageUrl: string | null;
  priceOptions: PriceOption[];
}) {
  const canonicalUrl = `${SITE_URL}/contacts/${slug}`;
  const prices = priceOptions.map((option) => option.pricePerBoxCents);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${lens.displayName} Contact Lenses`,
    description: `${lens.displayName} contact lenses by ${lens.manufacturer}. ${replacementLabel(lens.replacement)} replacement. A valid contact lens prescription is required.`,
    url: canonicalUrl,
    ...(imageUrl ? { image: `${SITE_URL}${imageUrl}` } : {}),
    brand: {
      "@type": "Brand",
      name: lens.manufacturer,
    },
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Replacement schedule",
        value: replacementLabel(lens.replacement),
      },
      ...(priceOptions.length
        ? [
            {
              "@type": "PropertyValue",
              name: "Available box sizes",
              value: priceOptions
                .map((option) => `${option.boxSize} lenses`)
                .join(", "),
            },
          ]
        : []),
    ],
    ...(prices.length
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "USD",
            lowPrice: Math.min(...prices) / 100,
            highPrice: Math.max(...prices) / 100,
            offerCount: priceOptions.length,
            url: canonicalUrl,
          },
        }
      : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function generateStaticParams() {
  return lenses.map((lens) => ({
    slug: getLensSlug(lens),
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lens = findLensBySlug(lenses, slug);

  if (!lens) return {};

  return {
    title: `${lens.displayName} Contact Lenses`,
    description: `Shop ${lens.displayName} contact lenses with prescription verification and manufacturer-direct fulfillment from Honest Lenses. ${lens.displayName} is manufactured by ${lens.manufacturer} and designed for ${lens.replacement} replacement.`,
    alternates: {
      canonical: `${SITE_URL}/contacts/${slug}`,
    },
  };
}

export default async function LensPage({ params }: Props) {
  const { slug } = await params;
  const lens = findLensBySlug(lenses, slug);

  if (!lens) return notFound();

  const priceOptions = getPriceOptions(lens);
  const imageUrl = getVerifiedProductImage(lens);
  const lowestPrice = priceOptions.length
    ? Math.min(...priceOptions.map((option) => option.pricePerBoxCents))
    : null;

  return (
    <>
      <ProductJsonLd
        lens={lens}
        slug={slug}
        imageUrl={imageUrl}
        priceOptions={priceOptions}
      />
      <Header variant="shop" />

      <main className={styles.shell}>
        <ProductTelemetry coreId={lens.coreId} source="product_page" />

        <section className={styles.hero}>
          <div className={styles.productVisual}>
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={`${lens.displayName} contact lenses`}
                width={420}
                height={280}
                priority
                className={styles.productImage}
              />
            ) : (
              <div className={styles.imageUnavailable}>
                Product image coming soon
              </div>
            )}
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.manufacturer}>{lens.manufacturer}</p>
            <h1>{lens.displayName} Contact Lenses</h1>
            <p className={styles.summary}>
              {replacementLabel(lens.replacement)} contact lenses from{" "}
              {lens.manufacturer}. Order the exact product named on your valid
              prescription.
            </p>
            <p className={styles.startingPrice}>
              {lowestPrice === null
                ? "Pricing is confirmed during ordering."
                : `From ${formatCurrency(lowestPrice)} per box`}
            </p>
            <Link
              href={`/enter-prescription?right=${encodeURIComponent(lens.coreId)}&left=${encodeURIComponent(lens.coreId)}`}
              className="primary-btn"
            >
              Order {lens.displayName}
            </Link>
          </div>
        </section>

        <section className={styles.contentGrid}>
          <div className={styles.productDetails}>
            <section aria-labelledby="product-pricing">
              <h2 id="product-pricing">Available box sizes and pricing</h2>
              {priceOptions.length ? (
                <ul className={styles.priceList}>
                  {priceOptions.map((option) => (
                    <li key={option.sku}>
                      <span>{option.boxSize}-lens box</span>
                      <strong>
                        {formatCurrency(option.pricePerBoxCents)} per box
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Pricing is unavailable for this product configuration.</p>
              )}
              <p className={styles.finePrint}>
                Listed prices are per box before shipping. Your cart confirms
                the selected prescription, quantity, shipping method, and total
                before checkout.
              </p>
            </section>

            <section aria-labelledby="product-description">
              <h2 id="product-description">About this lens</h2>
              <p>
                {lens.displayName} is a contact lens manufactured by{" "}
                {lens.manufacturer} and designed for {lens.replacement}{" "}
                replacement. It must be dispensed according to a valid contact
                lens prescription.
              </p>
              <p>
                Honest Lenses verifies prescriptions through normal direct
                verification or prescriber confirmation before fulfillment.
              </p>
            </section>

            <HonestPricePromise />
            <PurchaseTrust />
          </div>

          <aside className={styles.orderPanel}>
            <h2>Order with your prescription</h2>
            <p>
              We match the exact product and parameters on your prescription
              before normal verification and fulfillment.
            </p>
            <Link
              href={`/enter-prescription?right=${encodeURIComponent(lens.coreId)}&left=${encodeURIComponent(lens.coreId)}`}
              className="primary-btn"
            >
              Start your order
            </Link>
            <Link
              href={`/contacts/${slug}/parameters`}
              className={styles.secondaryLink}
            >
              View parameter availability
            </Link>
            <Link
              href={`/contacts/${slug}/alternatives`}
              className={styles.secondaryLink}
            >
              Explore similar options
            </Link>
          </aside>
        </section>
      </main>

      <Footer />
    </>
  );
}
