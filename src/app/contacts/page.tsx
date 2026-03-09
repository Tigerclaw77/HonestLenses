import Link from "next/link"
import { lenses } from "@/LensCore/data/lenses"
import { slugifyLens } from "@/lib/seo/slugifyLens"

export default function ContactsPage() {
  return (
    <div style={{ padding: 40 }}>
      <h1>Shop Contact Lenses</h1>

      <ul>
        {lenses.map((lens) => (
          <li key={lens.coreId}>
            <Link href={`/contacts/${slugifyLens(lens.displayName)}`}>
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
    slug: slugifyLens(lens.displayName),
  }));
}