import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canAccessOrder,
  getServerOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
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
  isCustomerReceiptAvailable,
  type CustomerOrder,
} from "@/lib/orders/customerOrder";
import { getVisionCarrier } from "@/lib/visionBenefits";
import {
  ensureCustomerOrderNumber,
  issueReceiptAccessToken,
} from "@/lib/receipts/server";

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

  const access = await getServerOrderAccess();
  if (!hasOrderAccessContext(access)) return notFound();

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(CUSTOMER_ORDER_SELECT)
    .eq("id", orderId)
    .single<CustomerOrder>();

  if (error || !order || !canAccessOrder(access, order)) return notFound();

  const quantities = getCustomerOrderQuantities(order);
  const paymentStatus = getCustomerPaymentStatus(order);
  const verificationStatus = getCustomerVerificationStatus(order);
  const fulfillmentStatus = getCustomerFulfillmentStatus(order);
  const amount = formatCustomerMoney(
    getCustomerAmountCents(order),
    order.currency ?? "USD",
  );
  const receiptAvailable = isCustomerReceiptAvailable(order);
  const visionCarrier = getVisionCarrier(order.vision_insurance_carrier);
  const customerOrderNumber =
    order.customer_order_number || (await ensureCustomerOrderNumber(order.id));
  const receiptAccess = receiptAvailable
    ? await issueReceiptAccessToken(order.id, "order_status").catch(() => null)
    : null;

  return (
    <main style={{ padding: "40px 20px 64px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <header style={{ marginBottom: 30 }}>
          <p style={{ color: "#93c5fd", fontWeight: 700, marginBottom: 8 }}>
            HONEST LENSES
          </p>
          <h1 style={{ fontSize: 34, margin: 0 }}>Your Order</h1>
          <p style={{ color: "#94a3b8", overflowWrap: "anywhere" }}>
            Order {customerOrderNumber}
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
          <h2 style={{ fontSize: 20, marginTop: 0 }}>
            Using HSA/FSA funds or requesting reimbursement?
          </h2>
          <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
            {receiptAvailable
              ? "Download an itemized receipt for your records."
              : "Your itemized receipt will be available here after payment is successfully captured."}
          </p>
          {receiptAvailable && receiptAccess ? (
            <a className="primary-btn" href={`/receipt/${encodeURIComponent(receiptAccess.token)}`}>
              Download itemized receipt
            </a>
          ) : null}
          {receiptAvailable && visionCarrier && "helpUrl" in visionCarrier ? (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>
                Submit to {visionCarrier.label}
              </h3>
              <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
                {visionCarrier.helpText} Benefits vary by plan; check your member
                portal for your allowance and filing requirements.
              </p>
              <a
                href={visionCarrier.helpUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#93c5fd", fontWeight: 700 }}
              >
                Official {visionCarrier.label} reimbursement help
              </a>
            </div>
          ) : null}
          {receiptAvailable ? (
            <p style={{ color: "#94a3b8", marginTop: 22, lineHeight: 1.6 }}>
              Eligible contact lens purchases can generally be paid or reimbursed
              with HSA/FSA funds, subject to your plan rules. FSA deadlines and
              carryover rules vary by employer plan; HSA funds do not expire
              annually.
            </p>
          ) : null}
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
