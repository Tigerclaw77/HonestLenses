import type { Metadata } from "next";

import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: { absolute: "Contact Lenses Online | Clear Per-Box Prices | Honest Lenses" },
  description:
    "Shop authentic contact lenses with current per-box prices and pack sizes shown before checkout. Valid prescription verification is included.",
};

export default function HomePage() {
  return <HomeClient />;
}
