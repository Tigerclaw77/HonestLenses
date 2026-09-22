import type { Metadata } from "next";
import FindOrderForm from "./FindOrderForm";

export const metadata: Metadata = {
  title: "Find Your Order | Honest Lenses",
  description: "Request a secure link to your Honest Lenses order.",
  robots: { index: false, follow: false },
};

export default async function FindOrderPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  return (
    <main style={{ minHeight: "70vh", padding: "54px 20px" }}>
      <section className="content-shell" style={{ maxWidth: 680 }}>
        <h1>Find your order</h1>
        {link === "unavailable" ? <p role="status" style={{ color: "#cbd5e1", lineHeight: 1.7 }}>
          This order link is unavailable or has expired. You can request a new secure link below.
        </p> : null}
        <p style={{ color: "#cbd5e1", lineHeight: 1.7 }}>
          Enter your order number and checkout email. For your privacy, we never display an order from this form. If the details match, we’ll email a secure link to the checkout address on the order.
        </p>
        <FindOrderForm />
        <style>{`
          .find-order-form{display:grid;gap:18px;margin-top:28px;padding:26px;background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.2);border-radius:16px}
          .find-order-form label{display:grid;gap:8px;font-weight:700}.find-order-form input{width:100%;padding:13px 14px;border-radius:9px;border:1px solid #64748b;background:#0f172a;color:#fff;font:inherit}
          .find-order-form button{justify-self:start;padding:13px 18px;border:0;border-radius:9px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer}.find-order-form button:disabled{opacity:.65}.find-order-form p{color:#cbd5e1;line-height:1.55;margin:0}
          @media(max-width:600px){.find-order-form{padding:20px 16px}.find-order-form button{width:100%}}
        `}</style>
      </section>
    </main>
  );
}
