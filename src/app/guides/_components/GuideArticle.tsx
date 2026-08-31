import Link from "next/link";

import styles from "../guide.module.css";
import type { GuidePage } from "../guides";
import { getGuideUrl, guides } from "../guides";
import { serializeJsonLd } from "@/lib/seo/jsonLd";

function getSectionId(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function FaqJsonLd({ guide }: { guide: GuidePage }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}

function PillarJsonLd({ guide }: { guide: GuidePage }) {
  if (!guide.includeArticleSchema) return null;

  const url = `https://honestlenses.com${getGuideUrl(guide.slug)}`;
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.h1 ?? guide.title,
    description: guide.description,
    url,
    mainEntityOfPage: url,
    author: {
      "@type": "Organization",
      name: "Honest Lenses",
      url: "https://honestlenses.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Honest Lenses",
      url: "https://honestlenses.com",
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://honestlenses.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Guides",
        item: "https://honestlenses.com/guides",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: guide.title,
        item: url,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(article) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
      />
    </>
  );
}

export default function GuideArticle({ guide }: { guide: GuidePage }) {
  const relatedGuides = guides.filter((item) => item.slug !== guide.slug);

  return (
    <>
      <FaqJsonLd guide={guide} />
      <PillarJsonLd guide={guide} />

      <main className={styles.guideShell}>
        <div className={styles.guideWrap}>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span>/</span>
            <Link href="/guides">Guides</Link>
            {guide.includeArticleSchema && (
              <>
                <span>/</span>
                <span aria-current="page">{guide.title}</span>
              </>
            )}
          </nav>

          <header className={styles.articleHeader}>
            <p className={styles.eyebrow}>Honest Lenses Guide</p>
            <h1>{guide.h1 ?? guide.title}</h1>
            <p className={styles.articleIntro}>{guide.intro}</p>
          </header>

          <div className={styles.articleGrid}>
            <article className={styles.articleBody}>
              {guide.lead}

              {guide.sections.map((section) => {
                const id = getSectionId(section.heading);

                return (
                  <section
                    key={section.heading}
                    id={id}
                    className={styles.articleSection}
                  >
                    <h2>{section.heading}</h2>
                    {section.content}
                  </section>
                );
              })}

              <section className={styles.faq} id="faq">
                <h2>FAQ</h2>
                {guide.faqs.map((faq) => (
                  <div key={faq.question} className={styles.faqItem}>
                    <h3>{faq.question}</h3>
                    <p>{faq.answer}</p>
                  </div>
                ))}
              </section>

              {guide.postFaqSections?.map((section) => {
                const id = getSectionId(section.heading);

                return (
                  <section
                    key={section.heading}
                    id={id}
                    className={styles.articleSection}
                  >
                    <h2>{section.heading}</h2>
                    {section.content}
                  </section>
                );
              })}

              <div className={styles.trustBlock}>
                <p>Written and reviewed by Honest Lenses.</p>
                <p>
                  This guide is general educational information for contact
                  lens customers. It is not a medical exam, diagnosis, or
                  treatment plan.
                </p>
              </div>
            </article>

            <aside className={styles.sideNav} aria-label="Guide navigation">
              <p className={styles.sideNavTitle}>On This Page</p>
              {guide.sections.map((section) => (
                <a key={section.heading} href={`#${getSectionId(section.heading)}`}>
                  {section.heading}
                </a>
              ))}
              <a href="#faq">FAQ</a>
              {guide.postFaqSections?.map((section) => (
                <a key={section.heading} href={`#${getSectionId(section.heading)}`}>
                  {section.heading}
                </a>
              ))}

              <p className={styles.sideNavTitle} style={{ marginTop: "1.4rem" }}>
                More Guides
              </p>
              {relatedGuides.slice(0, 3).map((item) => (
                <Link key={item.slug} href={getGuideUrl(item.slug)}>
                  {item.title}
                </Link>
              ))}
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
