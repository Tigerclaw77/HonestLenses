import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReceiptByToken } from "@/lib/receipts/server";
import PrintReceiptButton from "./PrintReceiptButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Itemized Receipt | Honest Lenses",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const access = await getReceiptByToken(token);
  if (!access) return notFound();

  if (!access.snapshot) {
    const pendingPayment = access.availability === "pending_payment";
    return (
      <main className="receipt-shell">
        <section className="receipt-paper receipt-unavailable">
          <p className="receipt-brand">HONEST LENSES</p>
          <h1>{pendingPayment ? "Receipt available after payment" : "Receipt unavailable"}</h1>
          <p>
            {pendingPayment
              ? "Your itemized paid receipt will be available from this secure link after payment is successfully captured."
              : "We could not reconstruct a trustworthy itemized receipt from the available historical records. We will not estimate or fabricate receipt details."}
          </p>
          {!pendingPayment ? <p>
            Contact <a href="mailto:support@honestlenses.com">support@honestlenses.com</a>
            {" "}for help.
          </p> : null}
        </section>
      </main>
    );
  }

  const receipt = access.snapshot;
  const paymentDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(receipt.paymentDate));

  return (
    <main className="receipt-shell">
      <article className="receipt-paper">
        <header className="receipt-header">
          <div>
            <p className="receipt-brand">HONEST LENSES</p>
            <h1>{receipt.documentTitle}</h1>
            <p>{receipt.eligibilityLabel}</p>
          </div>
          <div className="receipt-actions"><PrintReceiptButton /></div>
        </header>

        <section className="receipt-meta">
          <div><span>Merchant</span><strong>{receipt.merchantName}</strong></div>
          <div><span>Support</span><strong>{receipt.supportEmail}</strong></div>
          <div><span>Order number</span><strong>{receipt.orderNumber}</strong></div>
          <div><span>Payment date</span><strong>{paymentDate}</strong></div>
          {receipt.customerName ? (
            <div><span>Customer/patient</span><strong>{receipt.customerName}</strong></div>
          ) : null}
          <div><span>Payment status</span><strong>{receipt.paymentStatus}</strong></div>
          {receipt.cardBrand && receipt.cardLast4 ? (
            <div>
              <span>Payment method</span>
              <strong>{receipt.cardBrand.toUpperCase()} ending in {receipt.cardLast4}</strong>
            </div>
          ) : null}
        </section>

        <div className="receipt-table-wrap">
          <table>
            <thead>
              <tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{receipt.line.description}</strong>
                  {receipt.line.packSize ? <small>{receipt.line.packSize} lenses per box</small> : null}
                </td>
                <td>
                  Right: {receipt.line.rightBoxes} box{receipt.line.rightBoxes === 1 ? "" : "es"}<br />
                  Left: {receipt.line.leftBoxes} box{receipt.line.leftBoxes === 1 ? "" : "es"}<br />
                  Total: {receipt.line.totalBoxes} boxes
                </td>
                <td>{formatMoney(receipt.line.unitPriceCents, receipt.currency)}</td>
                <td>{formatMoney(receipt.line.lineTotalCents, receipt.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <section className="receipt-totals">
          {receipt.adjustmentCents !== 0 ? (
            <div><span>Discount or capture adjustment</span><strong>{formatMoney(receipt.adjustmentCents, receipt.currency)}</strong></div>
          ) : null}
          <div><span>{receipt.shippingMethod}</span><strong>{formatMoney(receipt.shippingCents, receipt.currency)}</strong></div>
          <div><span>Tax</span><strong>{formatMoney(receipt.taxCents, receipt.currency)}</strong></div>
          <div className="receipt-grand-total"><span>Final amount paid</span><strong>{formatMoney(receipt.amountPaidCents, receipt.currency)}</strong></div>
        </section>

        <footer className="receipt-disclaimer">{receipt.disclaimer}</footer>
      </article>
      <style>{`
        .receipt-shell{min-height:100vh;background:#eef2f7;padding:32px 16px;color:#172033;font-family:Arial,sans-serif}
        .receipt-paper{max-width:860px;margin:0 auto;background:#fff;border:1px solid #d9dee8;border-radius:16px;padding:42px;box-shadow:0 18px 50px rgba(15,23,42,.12)}
        .receipt-header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #172033;padding-bottom:24px}
        .receipt-header h1{font-size:28px;margin:6px 0}.receipt-brand{font-weight:900;letter-spacing:.12em;color:#1d4ed8;margin:0}
        .receipt-print-button{border:0;border-radius:9px;background:#1d4ed8;color:#fff;padding:12px 16px;font-weight:700;cursor:pointer}
        .receipt-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 28px;padding:26px 0}
        .receipt-meta div{display:flex;flex-direction:column;gap:5px}.receipt-meta span{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:#64748b}
        .receipt-table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:14px 10px;border-bottom:1px solid #d9dee8}th{font-size:12px;text-transform:uppercase;color:#475569}td:last-child,th:last-child{text-align:right}td small{display:block;color:#64748b;margin-top:5px}
        .receipt-totals{margin:24px 0 0 auto;max-width:420px}.receipt-totals div{display:flex;justify-content:space-between;gap:20px;padding:9px 0}.receipt-grand-total{font-size:20px;border-top:2px solid #172033;margin-top:8px;padding-top:15px!important}
        .receipt-disclaimer{border-top:1px solid #d9dee8;margin-top:32px;padding-top:20px;color:#5d6677;line-height:1.5}.receipt-unavailable{line-height:1.6}
        @media(max-width:640px){.receipt-paper{padding:24px 18px;border-radius:10px}.receipt-header{display:block}.receipt-actions{margin-top:18px}.receipt-meta{grid-template-columns:1fr}th,td{min-width:120px}.receipt-shell{padding:14px 8px}}
        @media print{.receipt-shell{background:#fff;padding:0}.receipt-paper{max-width:none;border:0;border-radius:0;box-shadow:none;padding:0}.receipt-actions{display:none}@page{size:auto;margin:15mm}}
      `}</style>
    </main>
  );
}
