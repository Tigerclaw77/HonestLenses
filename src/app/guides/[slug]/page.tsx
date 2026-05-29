import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Footer from "@/components/Footer";
import Header from "@/components/Header";

import GuideArticle from "../_components/GuideArticle";
import { getAbsoluteGuideUrl, getGuideBySlug, guides } from "../guides";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return guides.map((guide) => ({
    slug: guide.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide) return {};

  return {
    title: `${guide.title} | Honest Lenses`,
    description: guide.description,
    alternates: {
      canonical: getAbsoluteGuideUrl(guide.slug),
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide) return notFound();

  return (
    <>
      <Header variant="content" />
      <GuideArticle guide={guide} />
      <Footer />
    </>
  );
}
