import type { Metadata } from "next";

import CommercialContactPage from "../_commercial/CommercialContactPage";
import { commercialContactPages } from "../_commercial/commercialPages";

const page = commercialContactPages.annualSupplyContactLenses;

export const metadata: Metadata = {
  title: page.title,
  description: page.metaDescription,
  alternates: {
    canonical: page.canonicalUrl,
  },
};

export default function AnnualSupplyContactLensesPage() {
  return <CommercialContactPage page={page} />;
}
