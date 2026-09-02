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
import AnnualSupplyEstimator from "@/components/product/AnnualSupplyEstimator";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { getLensImage } from "@/lib/display/getLensImage";
import {
  formatAxis,
  formatBaseCurve,
  formatCylinder,
  formatDiameter,
  formatSphere,
} from "@/lib/formatters/rxFormat";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getPackSizeFromSku } from "@/lib/pricing/getPackSize";
import { getPrice } from "@/lib/pricing/getPrice";
import { getSkuBoxDurationMonths } from "@/lib/pricing/skuDefaults";
import {
  findLensBySlug,
  getLensSlug,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";
import { serializeJsonLd } from "@/lib/seo/jsonLd";
import {
  getPricePerLensCents,
  getPricePerWearingDayCents,
} from "@/lib/seo/productEconomics";

import styles from "./productPage.module.css";

type Props = {
  params: Promise<{ slug: string }>;
};

type PriceOption = {
  sku: string;
  boxSize: number;
  pricePerBoxCents: number;
  monthsPerBox: number;
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
          monthsPerBox: getSkuBoxDurationMonths(sku),
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

function brandLabel(manufacturer: string) {
  if (manufacturer === "VISTAKON") return "ACUVUE";
  if (manufacturer === "BAUSCH + LOMB") return "Bausch + Lomb";
  if (manufacturer === "COOPERVISION") return "CooperVision";
  if (manufacturer === "ALCON") return "Alcon";
  return manufacturer;
}

function getCategory(lens: LensCore) {
  if (lens.type.multifocal) {
    return {
      name: "Multifocal contact lenses",
      url: "/contacts/multifocal-contact-lenses",
    };
  }
  if (lens.type.toric) {
    return {
      name: "Toric contact lenses",
      url: "/contacts/toric-contact-lenses",
    };
  }
  if (lens.replacement === "DD") {
    return {
      name: "Daily contact lenses",
      url: "/contacts/daily-contact-lenses",
    };
  }
  return { name: "Contact lenses", url: "/contacts" };
}

function uniqueNumbers(values: readonly number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function getParameterRows(lens: LensCore) {
  const sphereSpecs = [
    ...(lens.parameters.sphere ? [lens.parameters.sphere] : []),
    ...(lens.parameters.sphereByBaseCurve ?? []).map((entry) => entry.spec),
  ];
  const sphereRanges = sphereSpecs.flatMap((spec) =>
    spec.segments.map(
      (segment) => `${formatSphere(segment.min)} to ${formatSphere(segment.max)}`,
    ),
  );
  const toricGroups = lens.parameters.toric?.groups ?? [];
  const cylinders = uniqueNumbers(toricGroups.flatMap((group) => group.cylinders));
  const axes = uniqueNumbers(
    toricGroups.flatMap((group) =>
      group.axis
        ? [...group.axis]
        : group.sphereAxisRules.flatMap((rule) => [...rule.axis]),
    ),
  );
  const multifocal = lens.parameters.multifocal;
  const adds = [
    ...(multifocal?.adds ?? []),
    ...(multifocal?.xrAdds ?? []),
    ...(multifocal?.groups ?? []).flatMap((group) => [...group.adds]),
  ];

  return [
    sphereRanges.length
      ? { label: "Sphere range", value: [...new Set(sphereRanges)].join(", ") }
      : null,
    lens.parameters.baseCurve?.length
      ? {
          label: "Base curve",
          value: uniqueNumbers(lens.parameters.baseCurve)
            .map(formatBaseCurve)
            .join(", "),
        }
      : null,
    lens.parameters.diameter?.length
      ? {
          label: "Diameter",
          value: uniqueNumbers(lens.parameters.diameter)
            .map(formatDiameter)
            .join(", "),
        }
      : null,
    cylinders.length
      ? { label: "Cylinder", value: cylinders.map(formatCylinder).join(", ") }
      : null,
    axes.length
      ? { label: "Axis", value: axes.map(formatAxis).join(", ") }
      : null,
    adds.length
      ? { label: "Add", value: [...new Set(adds)].join(", ") }
      : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row));
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
  const category = getCategory(lens);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${lens.displayName} Contact Lenses`,
    description: `${lens.displayName} contact lenses by ${lens.manufacturer}. ${replacementLabel(lens.replacement)} replacement. A valid contact lens prescription is required.`,
    url: canonicalUrl,
    ...(imageUrl ? { image: `${SITE_URL}${imageUrl}` } : {}),
    brand: {
      "@type": "Brand",
      name: brandLabel(lens.manufacturer),
    },
    manufacturer: {
      "@type": "Organization",
      name: lens.manufacturer,
    },
    category: category.name,
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
    ...(priceOptions.length
      ? {
          offers: priceOptions.map((option) => ({
            "@type": "Offer",
            name: `${option.boxSize}-lens box`,
            sku: option.sku,
            priceCurrency: "USD",
            price: (option.pricePerBoxCents / 100).toFixed(2),
            url: canonicalUrl,
            seller: {
              "@type": "Organization",
              name: "Honest Lenses",
            },
          })),
        }
      : {}),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: category.name,
        item: `${SITE_URL}${category.url}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: lens.displayName,
        item: canonicalUrl,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd([schema, breadcrumb]) }}
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
    description: `Shop ${lens.displayName} contact lenses with verified catalog pricing and prescription verification. ${replacementLabel(lens.replacement)} product from ${lens.manufacturer}.`,
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
  const category = getCategory(lens);
  const parameterRows = getParameterRows(lens);
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

        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href={category.url}>{category.name}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{lens.displayName}</span>
        </nav>

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
            <p className={styles.manufacturer}>
              {brandLabel(lens.manufacturer)} · {lens.manufacturer}
            </p>
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
                      <span>
                        <strong>{option.boxSize}-lens box</strong>
                        <small>
                          {formatCurrency(
                            getPricePerLensCents(
                              option.pricePerBoxCents,
                              option.boxSize,
                            ),
                          )} per lens
                          {getPricePerWearingDayCents({
                            pricePerBoxCents: option.pricePerBoxCents,
                            boxSize: option.boxSize,
                            replacement: lens.replacement,
                          }) !== null
                            ? ` · ${formatCurrency(
                                getPricePerWearingDayCents({
                                  pricePerBoxCents: option.pricePerBoxCents,
                                  boxSize: option.boxSize,
                                  replacement: lens.replacement,
                                })!,
                              )} per wearing day for one eye`
                            : ""}
                        </small>
                      </span>
                      <strong>{formatCurrency(option.pricePerBoxCents)} per box</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Pricing is unavailable for this product configuration.</p>
              )}
              <p className={styles.finePrint}>
                Per-lens and per-wearing-day figures divide the displayed box
                price by pack size and the catalog replacement interval. They
                exclude shipping, tax, and reusable-lens care supplies. Your cart
                confirms the selected prescription, quantities, and total.
              </p>
            </section>

            {priceOptions.length ? (
              <section aria-labelledby="annual-supply-estimate">
                <h2 id="annual-supply-estimate">Estimate a 12-month supply</h2>
                <AnnualSupplyEstimator options={priceOptions} />
              </section>
            ) : null}

            {parameterRows.length ? (
              <section aria-labelledby="product-parameters">
                <h2 id="product-parameters">Available prescription parameters</h2>
                <dl className={styles.parameterList}>
                  {parameterRows.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className={styles.finePrint}>
                  Catalog availability can depend on combinations of values.
                  Your order must match the exact product and eye-specific
                  parameters on a valid contact lens prescription.
                </p>
              </section>
            ) : null}

            <section aria-labelledby="product-description">
              <h2 id="product-description">About this lens</h2>
              <p>
                {lens.displayName} is a contact lens manufactured by{" "}
                {lens.manufacturer} with a {replacementLabel(lens.replacement).toLowerCase()}{" "}
                schedule. It must be dispensed according to a valid contact lens
                prescription.
              </p>
              <p>
                Honest Lenses does not perform an eye examination, issue or renew
                prescriptions, independently select a lens, or substitute another
                product for the one prescribed.
              </p>
            </section>

            <section aria-labelledby="verification-timeline">
              <h2 id="verification-timeline">Prescription verification</h2>
              <p>
                <strong>Federal requirement:</strong> a seller must obtain a copy
                of the contact lens prescription or verify it with the prescriber
                before providing lenses. When a complete verification request is
                sent, the federal passive-verification response period is eight
                business hours after the prescriber receives it.
              </p>
              <p>
                <strong>Honest Lenses process:</strong> you can upload a current
                prescription or provide the information needed for prescriber
                verification. Missing, expired, unreadable, or mismatched
                information can extend the total time from checkout.
              </p>
              <p className={styles.resourceLinks}>
                <a href="https://www.ftc.gov/business-guidance/resources/contact-lens-rule-guide-prescribers-sellers">
                  FTC Contact Lens Rule guide
                </a>
                <a href="https://www.fda.gov/medical-devices/contact-lenses/buying-contact-lenses">
                  FDA buying guidance
                </a>
              </p>
            </section>

            <section aria-labelledby="ordering-resources">
              <h2 id="ordering-resources">Ordering and delivery resources</h2>
              <p>
                Verification, product processing, and carrier transit are
                separate stages. Shipping method and cost are confirmed in the
                cart; delivery timing can also depend on product sourcing and the
                carrier.
              </p>
              <p className={styles.resourceLinks}>
                <Link href="/guides/buying-contact-lenses-online">Buying contact lenses online</Link>
                <Link href="/guides/how-contact-lens-prescription-verification-works">How verification works</Link>
                <Link href="/guides/why-are-contact-lenses-cheaper-online">Pricing transparency</Link>
                <Link href="/guides/why-is-my-contact-lens-order-delayed">Shipping expectations</Link>
                <Link href="/returns">Returns and refunds</Link>
              </p>
            </section>

            <section
              className={styles.benefitsCallout}
              aria-labelledby="benefits-documentation"
            >
              <p className={styles.benefitsEyebrow}>Benefits and receipts</p>
              <h2 id="benefits-documentation">
                Paying with HSA/FSA funds or using vision benefits?
              </h2>
              <p>
                After payment is captured, Honest Lenses provides a secure
                itemized receipt for your records. Benefits-card approval and
                out-of-network reimbursement depend on your plan and card
                issuer; reimbursement is not guaranteed.
              </p>
              <Link href="/vision-benefits">See how benefits documentation works</Link>
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
            <Link href={category.url} className={styles.secondaryLink}>
              Browse {category.name.toLowerCase()}
            </Link>
          </aside>
        </section>
      </main>

      <Footer />
    </>
  );
}
