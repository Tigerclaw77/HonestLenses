import Image from "next/image";
import Link from "next/link";

import { lenses } from "@/LensCore/data/lenses";
import type { LensCore } from "@/LensCore/types";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { getPopularityRank } from "@/data/lensPopularityTiers";
import { getLensImage } from "@/lib/display/getLensImage";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getLowestPrice } from "@/lib/pricing/getLowestPrice";
import { getLensSlug, SITE_URL } from "@/lib/seo/contactSeoRoutes";
import { serializeJsonLd } from "@/lib/seo/jsonLd";

import styles from "./commercialContactPage.module.css";
import type { CommercialContactPageConfig } from "./commercialPages";

type Props = {
  page: CommercialContactPageConfig;
};

function replacementLabel(code: string) {
  if (code === "DD") return "Daily disposable";
  if (code === "1W") return "Weekly replacement";
  if (code === "2W") return "Two-week replacement";
  if (code === "1M") return "Monthly replacement";
  return `${code} replacement`;
}

function findSelectedProducts(coreIds: string[]) {
  const byCoreId = new Map(lenses.map((lens) => [lens.coreId, lens]));

  return coreIds
    .map((coreId) => byCoreId.get(coreId))
    .filter((lens): lens is LensCore => Boolean(lens));
}

function productTags(lens: LensCore) {
  return [
    replacementLabel(lens.replacement),
    lens.type.toric ? "Toric" : null,
    lens.type.multifocal ? "Multifocal" : null,
  ].filter((tag): tag is string => Boolean(tag));
}

function priceLabel(lens: LensCore) {
  const lowest = getLowestPrice(getLensSkus(lens));

  if (!lowest) return "Price shown during order";

  return `from $${(lowest / 100).toFixed(2)} / box`;
}

function ProductItemListJsonLd({
  page,
  products,
}: {
  page: CommercialContactPageConfig;
  products: LensCore[];
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${page.h1} options`,
    description: page.metaDescription,
    itemListElement: products.map((lens, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: lens.displayName,
      url: `${SITE_URL}/contacts/${getLensSlug(lens)}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}

function ProductCard({ lens }: { lens: LensCore }) {
  const slug = getLensSlug(lens);

  return (
    <article className={styles.productCard}>
      <Link href={`/contacts/${slug}`} className={styles.productImageLink}>
        <Image
          src={getLensImage(lens.coreId)}
          alt={`${lens.displayName} contact lenses`}
          width={176}
          height={116}
          className={styles.productImage}
        />
      </Link>

      <div className={styles.productCopy}>
        <p className={styles.manufacturer}>{lens.manufacturer}</p>
        <h3>
          <Link href={`/contacts/${slug}`}>{lens.displayName}</Link>
        </h3>
        <p className={styles.price}>{priceLabel(lens)}</p>
        <div className={styles.tagRow}>
          {productTags(lens).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function CommercialContactPage({ page }: Props) {
  const products = findSelectedProducts(page.productCoreIds).sort(
    (a, b) =>
      page.productCoreIds.indexOf(a.coreId) -
      page.productCoreIds.indexOf(b.coreId),
  );
  const fallbackProducts = [...lenses]
    .sort((a, b) => getPopularityRank(a.coreId) - getPopularityRank(b.coreId))
    .slice(0, 6);
  const visibleProducts = products.length ? products : fallbackProducts;

  return (
    <>
      <ProductItemListJsonLd page={page} products={visibleProducts} />
      <Header variant="commercial" />

      <main className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{page.eyebrow}</p>
          <h1>{page.h1}</h1>
          <p className={styles.intro}>{page.intro}</p>

          <div className={styles.ctaRow}>
            <Link href={page.primaryCta.href} className="primary-btn">
              {page.primaryCta.label}
            </Link>
            <Link href={page.secondaryCta.href} className={styles.secondaryCta}>
              {page.secondaryCta.label}
            </Link>
          </div>
        </section>

        <section className={styles.assuranceStrip} aria-label="Ordering standards">
          <span>Valid prescription required</span>
          <span>Exact product matching</span>
          <span>Manufacturer-direct fulfillment</span>
        </section>

        <section className={styles.sectionStack}>
          {page.sections.map((section) => (
            <section key={section.heading} className={styles.copySection}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </section>

        <section className={styles.productsSection}>
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>Product Options</p>
            <h2>Start with the lens named on your prescription</h2>
            <p>{page.productSelectionLogic}</p>
          </div>

          <div className={styles.productGrid}>
            {visibleProducts.map((lens) => (
              <ProductCard key={lens.coreId} lens={lens} />
            ))}
          </div>
        </section>

        <section className={styles.relatedGrid} aria-label="Related resources">
          <div>
            <h2>Related shopping pages</h2>
            <ul>
              {page.relatedPages.map((relatedPage) => (
                <li key={relatedPage.href}>
                  <Link href={relatedPage.href}>{relatedPage.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2>Related prescription guides</h2>
            <ul>
              {page.relatedGuides.map((guide) => (
                <li key={guide.href}>
                  <Link href={guide.href}>{guide.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
