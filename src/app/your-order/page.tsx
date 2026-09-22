import type { Metadata } from "next";
import { redirect } from "next/navigation";
import OrderPage from "@/app/order/[id]/page";
import { cookies } from "next/headers";
import { ORDER_STATUS_COOKIE_NAME, readOrderStatusSession } from "@/lib/orders/orderStatusSession";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Your Order | Honest Lenses",
  robots: { index: false, follow: false },
};

export default async function YourOrderPage() {
  const cookieStore = await cookies();
  const orderId = readOrderStatusSession(cookieStore.get(ORDER_STATUS_COOKIE_NAME)?.value);
  if (!orderId) redirect("/find-order?link=unavailable");
  return OrderPage({ params: Promise.resolve({ id: orderId }) });
}
