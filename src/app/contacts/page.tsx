import type { Metadata } from "next";
import Link from "next/link"
import { commercialContactPageList } from "@/app/contacts/_commercial/commercialPages";
import { lenses } from "@/LensCore/data/lenses"
import {
  getLensSlug,
  isPublicCatalogLens,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes"

export const metadata: Metadata = {
  title: "Shop Contact Lenses",
  description:
    "Browse contact lenses available through Honest Lenses with prescription verification and manufacturer-direct fulfillment.",
  alternates: {
    canonical: `${SITE_URL}/contacts`,
  },
};

export default function ContactsPage() {
  return (
    <div style={{ padding: 40, maxWidth: 1100 }}>
      <h1>Shop Contact Lenses</h1>

      <section style={{ margin: "24px 0 36px" }}>
        <h2>Shop by Need</h2>
        <ul>
          {commercialContactPageList.map((page) => (
            <li key={page.slug}>
              <Link href={`/contacts/${page.slug}`}>{page.h1}</Link>
            </li>
          ))}
        </ul>
      </section>

      <h2>All Contact Lenses</h2>
      <ul>
        {lenses.filter(isPublicCatalogLens).map((lens) => (
          <li key={lens.coreId}>
            <Link href={`/contacts/${getLensSlug(lens)}`}>
              {lens.displayName}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function generateStaticParams() {
  return lenses.map((lens) => ({
    slug: getLensSlug(lens),
  }));
}
