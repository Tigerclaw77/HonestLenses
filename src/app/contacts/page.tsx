import type { Metadata } from "next";
import Link from "next/link"
import { lenses } from "@/LensCore/data/lenses"
import { getLensSlug, SITE_URL } from "@/lib/seo/contactSeoRoutes"

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
    <div style={{ padding: 40 }}>
      <h1>Shop Contact Lenses</h1>

      <ul>
        {lenses.map((lens) => (
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
