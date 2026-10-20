"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase-client";
import type {
  InvestigationMode, InvestigationOrder, InvestigationPayment, InvestigationResult,
} from "@/lib/admin/investigationModel";
import { orderPrimaryAmount } from "@/lib/admin/investigationModel";

const ACTIONS: { mode: InvestigationMode; label: string; hint: string }[] = [
  { mode: "payment", label: "Find Stripe payment", hint: "Payment ID, invoice ID, or amount" },
  { mode: "history", label: "Customer history", hint: "Name or email" },
  { mode: "unmatched", label: "Payments to review", hint: "Recent 30 days" },
  { mode: "date", label: "Activity by date", hint: "YYYY-MM-DD" },
];

function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() })
    .format(cents / 100);
}
function when(value: string | null) {
  return value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Date unavailable";
}
function Timeline({ events }: { events: InvestigationOrder["timeline"] }) {
  return <ol className="investigateTimeline">{events.map((event, index) =>
    <li key={`${event.label}-${event.at}-${index}`}>
      <span>{event.label}</span><time>{when(event.at)}</time><small>{event.source}</small>
    </li>)}</ol>;
}
function OrderCard({ order }: { order: InvestigationOrder }) {
  return <article className="investigateCard" id={`order-${order.id}`}>
    <div className="investigateCardTop">
      <div><span className="investigateEyebrow">Storefront order</span>
        <h3>{order.customer} <small>{order.number ?? order.id.slice(0, 8)}</small></h3></div>
      <strong>{order.capturedCents !== null ?
        `${(order.refundedCents ?? 0) > 0 ? "CAPTURED" : "PAID"}: ${money(orderPrimaryAmount(order)!)}` :
        orderPrimaryAmount(order) === null ? "Captured amount unavailable" :
          `Order total: ${money(order.amountCents)}`}</strong>
    </div>
    <p>{order.status} · {order.fulfillment ?? "Fulfillment unknown"} · {order.quantity}</p>
    <p>Prescription: {order.verificationStatus ?? "Status unavailable"}</p>
    {order.capturedCents !== null && <p>Captured {money(order.capturedCents)} · Refunded {money(order.refundedCents ?? 0)} · Net paid {money(order.netPaidCents ?? order.capturedCents)}
      {order.authorizedCents !== null && order.authorizedCents !== order.capturedCents &&
        <> · Originally authorized {money(order.authorizedCents)}</>}</p>}
    <p>{order.email ?? "No email"} · Patient: {order.patient ?? "Not recorded"}</p>
    <details><summary>Timeline and record details</summary>
      <Timeline events={order.timeline} />
      <dl className="investigateDetails">
        <dt>Order ID</dt><dd>{order.id}</dd>
        <dt>PaymentIntent</dt><dd>{order.paymentIntentId ?? "None recorded"}</dd>
        <dt>Lens SKU</dt><dd>{order.sku ?? "Not recorded"}</dd>
        <dt>Shipping</dt><dd>{order.shipping ?? "Not recorded"}</dd>
      </dl>
    </details>
    <a href={order.url} referrerPolicy="no-referrer">Open this order ↗</a>
  </article>;
}
function PaymentCard({ payment, hasOrder }: { payment: InvestigationPayment; hasOrder: boolean }) {
  return <article className="investigateCard">
    <div className="investigateCardTop">
      <div><span className="investigateEyebrow">Stripe {payment.kind}</span>
        <h3>{payment.id}</h3></div>
      <strong>{payment.capturedCents !== null ? `CAPTURED: ${money(payment.capturedCents, payment.currency)}` :
        `Amount: ${money(payment.amountCents, payment.currency)}`}</strong>
    </div>
    <div className="investigateBadges"><span>{payment.status}</span>
      <span className={`investigateConfidence category${payment.category.replaceAll(" ", "")}`}>{payment.category}</span>
    </div>
    <p>{payment.category === "LINKED TO ORDER" ? "Confirmed payment linked to a storefront order." :
      payment.category === "MANUAL STRIPE PAYMENT" ?
        "Stripe invoice payment without a confirmed storefront order." :
        "Payment origin or storefront relationship needs investigation."}
      {payment.orderId ? ` · ${payment.confidence === "Probable" ? "Possible" : "Confirmed"} order ${payment.orderId.slice(0, 8)}` : ""}</p>
    {payment.capturedCents !== null && <p>Refunded {money(payment.refundedCents, payment.currency)} · Net paid {money(payment.netPaidCents ?? 0, payment.currency)}
      {payment.authorizedCents !== null && payment.authorizedCents !== payment.capturedCents &&
        <> · Authorized {money(payment.authorizedCents, payment.currency)}</>}</p>}
    <p>Created {when(payment.createdAt)} · {payment.paidAt ? `Payment activity ${when(payment.paidAt)}` : "Capture date unavailable"}</p>
    <details><summary>Timeline and identifiers</summary>
      <Timeline events={payment.timeline} />
      <dl className="investigateDetails">
        <dt>PaymentIntent</dt><dd>{payment.relatedIntentIds.join(", ") || payment.intentId || "None"}</dd>
        <dt>Charge</dt><dd>{payment.relatedChargeIds.join(", ") || payment.chargeId || "None"}</dd>
        <dt>Invoice</dt><dd>{payment.invoiceId ?? "None"}</dd>
        <dt>Email</dt><dd>{payment.email ?? "Not provided"}</dd>
        <dt>Refunded</dt><dd>{money(payment.refundedCents, payment.currency)}</dd>
        <dt>Match evidence</dt><dd>{payment.confidence}</dd>
        <dt>Match reason</dt><dd>{payment.reason}</dd>
      </dl>
    </details>
    <a href={payment.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
      Open in Stripe ↗</a>
    {hasOrder && payment.orderId && <a href={`#order-${payment.orderId}`} className="investigateOrderLink">
      View storefront record ↗</a>}
  </article>;
}

export default function InvestigatePage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<InvestigationMode>("search");
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (nextMode: InvestigationMode, nextQuery: string) => {
    setMode(nextMode); setBusy(true); setError(null); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again to investigate.");
      const params = new URLSearchParams({ mode: nextMode, q: nextQuery.trim() });
      const response = await fetch(`/api/admin/investigate?${params}`, {
        cache: "no-store", headers: { authorization: `Bearer ${session.access_token}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Investigation failed.");
      setResult(body as InvestigationResult);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Investigation failed."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("order");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      setQuery(id);
      void run("search", id);
    }
  }, [run]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void run(mode, query); }
  return <main className="investigate">
    <header className="investigateHeader">
      <div><a href="/admin/orders" className="investigateBack">← Orders</a>
        <h1>Investigate</h1><p>Find records across Honest Lenses and Stripe.</p></div>
      <span className="investigateReadOnly">Read only</span>
    </header>
    <form onSubmit={submit} className="investigateSearch">
      <label htmlFor="investigate-query">Name, email, order or payment ID, amount, or date</label>
      <div><input id="investigate-query" value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search customers, orders, payments..." maxLength={120} />
        <button type="submit" disabled={busy}>Search</button></div>
    </form>
    <nav className="investigateActions" aria-label="Investigation shortcuts">
      {ACTIONS.map(action => <button key={action.mode} type="button" disabled={busy}
        onClick={() => void run(action.mode, query)}>
        <strong>{action.label}</strong><small>{action.hint}</small></button>)}
    </nav>
    {busy && <p role="status">Searching order history and Stripe…</p>}
    {error && <p role="alert" className="investigateError">{error}</p>}
    {result && <section aria-live="polite" className="investigateResults">
      <div className="investigateCounts"><h2>Results</h2>
        <span>{result.orders.length} storefront orders · {result.payments.length} Stripe transactions</span></div>
      {result.notice.map(note => <p className="investigateNotice" key={note}>{note}</p>)}
      {!result.orders.length && !result.payments.length && <p>No records found in this search window.</p>}
      {!!result.orders.length && <><h2>Storefront orders</h2><div className="investigateGrid">
        {result.orders.map(order => <OrderCard key={order.id} order={order} />)}</div></>}
      {!!result.payments.length && <><h2>Stripe transactions</h2><div className="investigateGrid">
        {result.payments.map(payment => <PaymentCard key={payment.id} payment={payment}
          hasOrder={result.orders.some(order => order.id === payment.orderId)} />)}</div></>}
    </section>}
    <style jsx global>{`
      .investigate{max-width:1120px;margin:0 auto;padding:32px 22px 80px;color:#f8fafc;font-family:inherit}
      .investigateHeader,.investigateCardTop,.investigateCounts{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
      .investigateHeader{border-bottom:1px solid #475569;padding-bottom:20px}.investigateHeader h1{font-size:32px;margin:12px 0 4px}
      .investigateHeader p{margin:0;color:#cbd5e1}.investigateBack{color:#bae6fd}
      .investigateReadOnly{border:1px solid #c6d8c8;background:#f1f8f1;color:#286536;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700}
      .investigateSearch{margin:24px 0}.investigateSearch label{display:block;font-weight:700;margin-bottom:8px}
      .investigateSearch>div{display:flex;gap:8px}.investigateSearch input{flex:1;min-width:0;padding:13px;border:1px solid #94a3b8;border-radius:8px;font:inherit;background:#fff;color:#0f172a}
      .investigateSearch input::placeholder{color:#475569}.investigate button{cursor:pointer;font:inherit}.investigateSearch button{border:0;border-radius:8px;background:#6d5db4;color:#fff;padding:0 22px;font-weight:700}
      .investigate button:disabled{opacity:.65;cursor:wait}.investigateActions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .investigateActions button{text-align:left;border:1px solid #475569;border-radius:10px;padding:14px;background:#1e293b;color:#f8fafc}
      .investigateActions button:hover{border-color:#c4b5fd;background:#334155}.investigateActions strong,.investigateActions small{display:block}
      .investigateActions small{color:#cbd5e1;margin-top:4px}.investigateResults{margin-top:30px}.investigateResults h2{font-size:19px;margin:22px 0 10px}
      .investigateCounts{align-items:baseline;border-top:1px solid #475569}.investigateCounts span,.investigateNotice{color:#cbd5e1;font-size:13px}
      .investigateGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.investigateCard{border:1px solid #475569;border-radius:12px;padding:18px;background:#1e293b;color:#f8fafc;min-width:0}
      .investigateCard h3{font-size:17px;margin:4px 0 0;overflow-wrap:anywhere}.investigateCard h3 small{font-weight:400;color:#cbd5e1}
      .investigateCard p{font-size:13px;color:#dbeafe;margin:9px 0;overflow-wrap:anywhere}.investigateCard strong{overflow-wrap:anywhere;text-align:right}
      .investigateEyebrow{text-transform:uppercase;font-size:10px;letter-spacing:.08em;color:#cbd5e1;font-weight:800}
      .investigateBadges{display:flex;flex-wrap:wrap;gap:7px;margin:11px 0}.investigateBadges span{font-size:11px;border-radius:999px;padding:4px 8px;background:#334155;color:#f8fafc}
      .investigateBadges .categoryLINKEDTOORDER{background:#dcfce7;color:#166534}.investigateBadges .categoryMANUALSTRIPEPAYMENT{background:#dbeafe;color:#1e40af}
      .investigateBadges .categoryNEEDSINVESTIGATION{background:#fef3c7;color:#78350f}.investigateCard details{margin:12px 0;font-size:13px}
      .investigateCard summary{cursor:pointer;color:#c4b5fd;font-weight:700}.investigateCard a{color:#bae6fd;font-weight:700;font-size:13px}
      .investigateOrderLink{margin-left:16px}
      .investigateTimeline{padding-left:20px}.investigateTimeline li{margin:8px 0}.investigateTimeline time,.investigateTimeline small{display:block;color:#cbd5e1}
      .investigateDetails{display:grid;grid-template-columns:105px minmax(0,1fr);gap:6px 10px;overflow-wrap:anywhere}.investigateDetails dt{font-weight:700}.investigateDetails dd{margin:0}
      .investigateError{color:#952b2b;background:#fff1f1;padding:12px;border-radius:8px}
      .investigate :is(a,button,input,summary):focus-visible{outline:3px solid #facc15;outline-offset:3px}
      @media(max-width:800px){.investigateActions{grid-template-columns:repeat(2,minmax(0,1fr))}.investigateGrid{grid-template-columns:1fr}}
      @media(max-width:480px){.investigate{padding:20px 14px 60px}.investigateHeader h1{font-size:27px}.investigateActions{grid-template-columns:1fr 1fr}.investigateSearch>div{flex-direction:column}.investigateSearch button{padding:12px}.investigateCardTop{flex-direction:column;gap:7px}}
    `}</style>
  </main>;
}
