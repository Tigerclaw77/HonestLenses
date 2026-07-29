import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getServerUser, isAdminUser } from "@/lib/auth/authorization";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/orders");
  if (!isAdminUser(user)) notFound();
  return children;
}
