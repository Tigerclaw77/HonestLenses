import Link from "next/link";

import styles from "../guide.module.css";
import type { GuidePage } from "../guides";
import { getGuideUrl, guides } from "../guides";

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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function GuideArticle({ guide }: { guide: GuidePage }) {
  const relatedGuides = guides.filter((item) => item.slug !== guide.slug);

  return (
    <>
      <FaqJsonLd guide={guide} />

      <main className={styles.guideShell}>
        <div className={styles.guideWrap}>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span>/</span>
            <Link href="/guides">Guides</Link>
          </nav>

          <header className={styles.articleHeader}>
            <p className={styles.eyebrow}>Honest Lenses Guide</p>
            <h1>{guide.title}</h1>
            <p className={styles.articleIntro}>{guide.intro}</p>
          </header>

          <div className={styles.articleGrid}>
            <article className={styles.articleBody}>
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

              <div className={styles.trustBlock}>
                <p>Written for Honest Lenses by Dr. Paul Driggers, OD.</p>
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
