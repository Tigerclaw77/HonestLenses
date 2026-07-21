import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import {
  CUSTOMER_ORDER_SELECT,
  formatCustomerMoney,
  getCustomerAmountCents,
  getCustomerFulfillmentStatus,
  getCustomerNextStep,
  getCustomerOrderQuantities,
  getCustomerPaymentStatus,
  getCustomerVerificationStatus,
  isCustomerOrderId,
  type CustomerOrder,
} from "@/lib/orders/customerOrder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Your Order | Honest Lenses",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrderPage({ params }: PageProps) {
  const { id: orderId } = await params;
  if (!isCustomerOrderId(orderId)) return notFound();

  // Existing email links use the random order UUID as their bearer credential.
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(CUSTOMER_ORDER_SELECT)
    .eq("id", orderId)
    .single<CustomerOrder>();

  if (error || !order) return notFound();

  const quantities = getCustomerOrderQuantities(order);
  const paymentStatus = getCustomerPaymentStatus(order);
  const verificationStatus = getCustomerVerificationStatus(order);
  const fulfillmentStatus = getCustomerFulfillmentStatus(order);
  const amount = formatCustomerMoney(
    getCustomerAmountCents(order),
    order.currency ?? "USD",
  );

  return (
    <main style={{ padding: "40px 20px 64px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <header style={{ marginBottom: 30 }}>
          <p style={{ color: "#93c5fd", fontWeight: 700, marginBottom: 8 }}>
            HONEST LENSES
          </p>
          <h1 style={{ fontSize: 34, margin: 0 }}>Your Order</h1>
          <p style={{ color: "#94a3b8", overflowWrap: "anywhere" }}>
            Order {order.id}
          </p>
        </header>

        <section className="order-card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, marginTop: 0 }}>Current status</h2>
          <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
            {getCustomerNextStep(order)}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
              marginTop: 22,
            }}
          >
            <StatusItem label="Payment" value={paymentStatus} />
            <StatusItem label="Prescription" value={verificationStatus} />
            <StatusItem label="Fulfillment" value={fulfillmentStatus} />
          </div>
        </section>

        <section className="order-card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, marginTop: 0 }}>Order summary</h2>
          <SummaryRow label="Lens" value={order.sku ?? "Contact lenses"} />
          <SummaryRow label="Right eye" value={`${quantities.right} boxes`} />
          <SummaryRow label="Left eye" value={`${quantities.left} boxes`} />
          <SummaryRow label="Total quantity" value={`${quantities.total} boxes`} />
          <SummaryRow label="Order amount" value={amount} strong />
        </section>

        <section className="order-card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, marginTop: 0 }}>Shipment</h2>
          <SummaryRow label="Status" value={fulfillmentStatus} />
          <SummaryRow label="Tracking" value="Not yet available" />
        </section>

        <section className="order-card">
          <h2 style={{ fontSize: 20, marginTop: 0 }}>Receipt</h2>
          <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
            View or download the receipt generated from your current order
            confirmation information.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a className="primary-btn" href={`/order/${order.id}/receipt`}>
              View receipt
            </a>
            <a
              className="primary-btn"
              href={`/order/${order.id}/receipt?download=1`}
              style={{
                background: "rgba(148, 163, 184, 0.16)",
                borderColor: "rgba(148, 163, 184, 0.32)",
                boxShadow: "none",
              }}
            >
              Download receipt
            </a>
          </div>
        </section>

        <p style={{ color: "#94a3b8", marginTop: 24, lineHeight: 1.6 }}>
          Questions about your order? Contact support@honestlenses.com.
        </p>
      </div>
    </main>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "#94a3b8", fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 20,
        padding: "12px 0",
        borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
      }}
    >
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 600, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}
