import type { Metadata } from "next";

import { lenses } from "@/LensCore/data/lenses";
import {
  findLensBySlug,
  isPublicCatalogLens,
} from "@/lib/seo/contactSeoRoutes";

type Props = Readonly<{
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lens = findLensBySlug(lenses, slug);

  if (!lens || isPublicCatalogLens(lens)) return {};

  return { robots: { index: false, follow: true } };
}

export default function ContactLensLayout({ children }: Props) {
  return children;
}
