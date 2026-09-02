import type { Metadata } from "next";
import FindReceiptForm from "./FindReceiptForm";

export const metadata: Metadata = {
  title: "Find Your Receipt | Honest Lenses",
  description: "Request a secure link to an Honest Lenses itemized receipt.",
};

export default function FindReceiptPage() {
  return (
    <main style={{ minHeight: "70vh", padding: "54px 20px" }}>
      <section className="content-shell" style={{ maxWidth: 680 }}>
        <h1>Find your receipt</h1>
        <p style={{ color: "#cbd5e1", lineHeight: 1.7 }}>
          Enter the order number and checkout email. For your privacy, we never
          display a receipt from this form. If the details match, we’ll email a
          secure, expiring access link to the checkout address on the order.
        </p>
        <p style={{ color: "#cbd5e1", lineHeight: 1.7 }}>
          The itemized receipt can be kept with HSA/FSA records or used as
          documentation for a possible out-of-network vision-plan claim.
          Eligibility and reimbursement depend on your plan.
        </p>
        <FindReceiptForm />
        <style>{`
          .find-receipt-form{display:grid;gap:18px;margin-top:28px;padding:26px;background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.2);border-radius:16px}
          .find-receipt-form label{display:grid;gap:8px;font-weight:700}.find-receipt-form input{width:100%;padding:13px 14px;border-radius:9px;border:1px solid #64748b;background:#0f172a;color:#fff;font:inherit}
          .find-receipt-form button{justify-self:start;padding:13px 18px;border:0;border-radius:9px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer}.find-receipt-form button:disabled{opacity:.65}.find-receipt-form p{color:#cbd5e1;line-height:1.55;margin:0}
          @media(max-width:600px){.find-receipt-form{padding:20px 16px}.find-receipt-form button{width:100%}}
        `}</style>
      </section>
    </main>
  );
}
