"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase-client";
import type {
  InvestigationMode, InvestigationOrder, InvestigationPayment, InvestigationResult,
} from "@/lib/admin/investigationModel";

const ACTIONS: { mode: InvestigationMode; label: string; hint: string }[] = [
  { mode: "payment", label: "Find Stripe payment", hint: "Payment ID, invoice ID, or amount" },
  { mode: "history", label: "Customer history", hint: "Name or email" },
  { mode: "unmatched", label: "Unmatched payments", hint: "Recent 30 days" },
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
      <strong>{money(order.amountCents)}</strong>
    </div>
    <p>{order.status} · {order.fulfillment ?? "Fulfillment unknown"} · {order.quantity}</p>
    <p>Prescription: {order.verificationStatus ?? "Status unavailable"}</p>
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
      <strong>{money(payment.amountCents, payment.currency)}</strong>
    </div>
    <div className="investigateBadges"><span>{payment.status}</span>
      <span className={`investigateConfidence confidence${payment.confidence}`}>{payment.confidence}</span>
    </div>
    <p>{payment.reason}{payment.orderId ? ` · Order ${payment.orderId.slice(0, 8)}` : ""}</p>
    <p>Created {when(payment.createdAt)} · {payment.paidAt ? `Payment activity ${when(payment.paidAt)}` : "Capture date unavailable"}</p>
    <details><summary>Timeline and identifiers</summary>
      <Timeline events={payment.timeline} />
      <dl className="investigateDetails">
        <dt>PaymentIntent</dt><dd>{payment.intentId ?? "None"}</dd>
        <dt>Charge</dt><dd>{payment.chargeId ?? "None"}</dd>
        <dt>Invoice</dt><dd>{payment.invoiceId ?? "None"}</dd>
        <dt>Email</dt><dd>{payment.email ?? "Not provided"}</dd>
        <dt>Refunded</dt><dd>{money(payment.refundedCents, payment.currency)}</dd>
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
        placeholder="Victoria West, pi_…, $101.99, 2026-10-18" maxLength={120} />
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
        <span>{result.orders.length} storefront orders · {result.payments.length} Stripe records</span></div>
      {result.notice.map(note => <p className="investigateNotice" key={note}>{note}</p>)}
      {!result.orders.length && !result.payments.length && <p>No records found in this search window.</p>}
      {!!result.orders.length && <><h2>Storefront orders</h2><div className="investigateGrid">
        {result.orders.map(order => <OrderCard key={order.id} order={order} />)}</div></>}
      {!!result.payments.length && <><h2>Stripe records</h2><div className="investigateGrid">
        {result.payments.map(payment => <PaymentCard key={payment.id} payment={payment}
          hasOrder={result.orders.some(order => order.id === payment.orderId)} />)}</div></>}
    </section>}
    <style jsx global>{`
      .investigate{max-width:1120px;margin:0 auto;padding:32px 22px 80px;color:#17243a;font-family:inherit}
      .investigateHeader,.investigateCardTop,.investigateCounts{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
      .investigateHeader{border-bottom:1px solid #dbe1ec;padding-bottom:20px}.investigateHeader h1{font-size:32px;margin:12px 0 4px}
      .investigateHeader p{margin:0;color:#5b6578}.investigateBack{color:#3f347d}
      .investigateReadOnly{border:1px solid #c6d8c8;background:#f1f8f1;color:#286536;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700}
      .investigateSearch{margin:24px 0}.investigateSearch label{display:block;font-weight:700;margin-bottom:8px}
      .investigateSearch>div{display:flex;gap:8px}.investigateSearch input{flex:1;min-width:0;padding:13px;border:1px solid #aeb8ca;border-radius:8px;font:inherit}
      .investigate button{cursor:pointer;font:inherit}.investigateSearch button{border:0;border-radius:8px;background:#514596;color:#fff;padding:0 22px;font-weight:700}
      .investigate button:disabled{opacity:.55;cursor:wait}.investigateActions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .investigateActions button{text-align:left;border:1px solid #d8deea;border-radius:10px;padding:14px;background:#fff;color:#1b2941}
      .investigateActions button:hover{border-color:#514596;background:#faf9ff}.investigateActions strong,.investigateActions small{display:block}
      .investigateActions small{color:#647084;margin-top:4px}.investigateResults{margin-top:30px}.investigateResults h2{font-size:19px;margin:22px 0 10px}
      .investigateCounts{align-items:baseline;border-top:1px solid #dbe1ec}.investigateCounts span,.investigateNotice{color:#5c687a;font-size:13px}
      .investigateGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.investigateCard{border:1px solid #dbe1ec;border-radius:12px;padding:18px;background:#fff;min-width:0}
      .investigateCard h3{font-size:17px;margin:4px 0 0;overflow-wrap:anywhere}.investigateCard h3 small{font-weight:400;color:#697388}
      .investigateCard p{font-size:13px;color:#49576c;margin:9px 0;overflow-wrap:anywhere}.investigateCard strong{white-space:nowrap}
      .investigateEyebrow{text-transform:uppercase;font-size:10px;letter-spacing:.08em;color:#66728a;font-weight:800}
      .investigateBadges{display:flex;gap:7px;margin:11px 0}.investigateBadges span{font-size:11px;border-radius:999px;padding:4px 8px;background:#edf1f7}
      .investigateBadges .confidenceConfirmed{background:#e7f6e8;color:#216334}.investigateBadges .confidenceProbable{background:#fff3dc;color:#855700}
      .investigateBadges .confidenceUnmatched{background:#fdeaea;color:#903333}.investigateCard details{margin:12px 0;font-size:13px}
      .investigateCard summary{cursor:pointer;color:#514596;font-weight:700}.investigateCard a{color:#514596;font-weight:700;font-size:13px}
      .investigateOrderLink{margin-left:16px}
      .investigateTimeline{padding-left:20px}.investigateTimeline li{margin:8px 0}.investigateTimeline time,.investigateTimeline small{display:block;color:#66728a}
      .investigateDetails{display:grid;grid-template-columns:105px minmax(0,1fr);gap:6px 10px;overflow-wrap:anywhere}.investigateDetails dt{font-weight:700}.investigateDetails dd{margin:0}
      .investigateError{color:#952b2b;background:#fff1f1;padding:12px;border-radius:8px}
      @media(max-width:800px){.investigateActions{grid-template-columns:repeat(2,minmax(0,1fr))}.investigateGrid{grid-template-columns:1fr}}
      @media(max-width:480px){.investigate{padding:20px 14px 60px}.investigateHeader h1{font-size:27px}.investigateActions{grid-template-columns:1fr 1fr}.investigateSearch>div{flex-direction:column}.investigateSearch button{padding:12px}.investigateCardTop{flex-direction:column;gap:7px}}
    `}</style>
  </main>;
}
