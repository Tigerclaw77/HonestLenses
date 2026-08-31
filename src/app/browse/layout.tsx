import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Contact Lenses",
  description:
    "Browse contact lens families, pack sizes, and pricing before starting prescription verification with Honest Lenses.",
  alternates: {
    canonical: "/browse",
  },
};

export default function BrowseLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
