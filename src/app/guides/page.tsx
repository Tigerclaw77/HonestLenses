import type { Metadata } from "next";
import Link from "next/link";

import Footer from "@/components/Footer";
import Header from "@/components/Header";

import styles from "./guide.module.css";
import { getAbsoluteGuideUrl, getGuideUrl, guides } from "./guides";

export const metadata: Metadata = {
  title: "Contact Lens Guides",
  description:
    "Practical contact lens ordering guides from Honest Lenses covering prescription verification, expired prescriptions, order delays, and online pricing.",
  alternates: {
    canonical: "https://honestlenses.com/guides",
  },
};

function GuidesItemListJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: guides.map((guide, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: guide.title,
      url: getAbsoluteGuideUrl(guide.slug),
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function GuidesIndexPage() {
  return (
    <>
      <GuidesItemListJsonLd />
      <Header variant="content" />

      <main className={styles.guideShell}>
        <div className={styles.guideWrap}>
          <section className={styles.indexHero}>
            <p className={styles.eyebrow}>Contact Lens Guides</p>
            <h1>Clear Answers for Contact Lens Orders</h1>
            <p>
              Practical, compliance-aware guides for common questions about
              prescription verification, order timing, expired prescriptions,
              and online contact lens pricing.
            </p>
          </section>

          <section className={styles.guideGrid} aria-label="Guide pages">
            {guides.map((guide) => (
              <Link
                key={guide.slug}
                href={getGuideUrl(guide.slug)}
                className={styles.guideCard}
              >
                <h2>{guide.title}</h2>
                <p>{guide.summary}</p>
                <span className={styles.cardMeta}>Read guide</span>
              </Link>
            ))}
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
