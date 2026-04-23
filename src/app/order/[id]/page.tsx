import { supabaseServer } from "@/lib/supabase-server";
import { notFound } from "next/navigation";

type PageProps = {
  params: {
    id: string;
  };
};

function formatMoney(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatStatus(status: string) {
  if (status === "captured") return "Processing";
  if (status === "authorized") return "Verification Required";
  return status;
}

function formatVerification(v: string) {
  if (v === "auto_verified") return "Verified";
  if (v === "pending") return "Pending";
  return v;
}

export default async function OrderPage({ params }: PageProps) {
  const orderId = params.id;

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (error || !order) return notFound();

  const status = order.status;
  const verificationStatus = order.verification_status;

  const isCaptured = status === "captured";
  const isAuthorized = status === "authorized";
  const isVerified = verificationStatus === "auto_verified";

  let headline = "Order Received";
  let message = "Your order is being processed.";

  if (isCaptured && isVerified) {
    headline = "Order Confirmed";
    message =
      "Your prescription has been verified and your order is being prepared for shipment.";
  }

  if (isAuthorized) {
    headline = "Verification In Progress";
    message =
      "We are verifying your prescription before shipment. Most verifications complete within 8 business hours.";
  }

  return (
    <main style={{ padding: "40px 20px" }}>
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          background: "rgba(15, 23, 42, 0.75)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          borderRadius: 18,
          padding: 28,
        }}
      >
        <h1 style={{ fontSize: 30, fontWeight: 900, marginBottom: 10 }}>
          {headline}
        </h1>

        <p style={{ color: "#cbd5e1", marginBottom: 24 }}>{message}</p>

        {/* Status pills */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <span
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              background: "#1d4ed8",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {formatStatus(status)}
          </span>

          <span
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              background: "rgba(148,163,184,0.2)",
              color: "#e2e8f0",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {formatVerification(verificationStatus)}
          </span>
        </div>

        <hr style={{ opacity: 0.2, margin: "20px 0" }} />

        {/* Order Info */}
        <p><strong>Order ID:</strong> {order.id}</p>
        <p><strong>Lens:</strong> {order.sku ?? "—"}</p>
        <p><strong>Total:</strong> {formatMoney(order.total_amount_cents)}</p>

        <hr style={{ opacity: 0.2, margin: "20px 0" }} />

        {/* Shipping */}
        <h3 style={{ marginBottom: 10 }}>Shipping</h3>
        <p>{order.shipping_first_name} {order.shipping_last_name}</p>
        <p>{order.shipping_address1}</p>
        {order.shipping_address2 && <p>{order.shipping_address2}</p>}
        <p>
          {order.shipping_city}, {order.shipping_state} {order.shipping_zip}
        </p>

        <hr style={{ opacity: 0.2, margin: "20px 0" }} />

        {/* Next Steps */}
        <h3 style={{ marginBottom: 10 }}>What happens next</h3>

        {isCaptured && isVerified && (
          <ul>
            <li>Your order is being prepared for shipment</li>
            <li>You’ll receive tracking once it ships</li>
          </ul>
        )}

        {isAuthorized && (
          <ul>
            <li>We are verifying your prescription with your doctor</li>
            <li>Most verifications complete within 8 business hours</li>
            <li>We’ll notify you once it’s complete</li>
          </ul>
        )}
      </div>
    </main>
  );
}