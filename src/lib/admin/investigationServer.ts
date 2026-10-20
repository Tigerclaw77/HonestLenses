import "server-only";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import {
  centralDayBounds, linkPaymentToOrder, type InvestigationEvent, type InvestigationInput,
  type InvestigationOrder, type InvestigationPayment, type InvestigationResult,
} from "./investigationModel";

type OrderRow = {
  id: string; customer_order_number: string | null; created_at: string;
  updated_at: string | null; status: string; fulfillment_status: string | null;
  verification_status: string | null; verification_completed_at: string | null;
  shipping_first_name: string | null; shipping_last_name: string | null;
  shipping_email: string | null; shipping_address1: string | null;
  shipping_address2: string | null; shipping_city: string | null;
  shipping_state: string | null; shipping_zip: string | null;
  patient_first_name: string | null; patient_last_name: string | null;
  patient_name: string | null; patient_full_name: string | null;
  sku: string | null; right_box_count: number | null; left_box_count: number | null;
  adjusted_right_box_count: number | null; adjusted_left_box_count: number | null;
  order_quantity_adjusted_at: string | null; total_amount_cents: number;
  payment_intent_id: string | null;
};
type EventRow = { order_id: string; event_type: string; created_at: string;
  after: Record<string, unknown> | null };
type ItemRow = { order_id: string; eye: string | null; sku: string | null; box_count: number };
const ORDER_FIELDS = `id,customer_order_number,created_at,updated_at,status,fulfillment_status,
  verification_status,verification_completed_at,shipping_first_name,shipping_last_name,
  shipping_email,shipping_address1,shipping_address2,shipping_city,shipping_state,shipping_zip,
  patient_first_name,patient_last_name,patient_name,patient_full_name,sku,right_box_count,
  left_box_count,adjusted_right_box_count,adjusted_left_box_count,order_quantity_adjusted_at,
  total_amount_cents,payment_intent_id`;
const MAX_ORDERS = 80;
const MAX_STRIPE = 80;
const DAY = 86_400;

function asIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}
function dashboardUrl(kind: "payments" | "invoices", id: string, live: boolean) {
  return `https://dashboard.stripe.com/${live ? "" : "test/"}${kind}/${encodeURIComponent(id)}`;
}
function ref(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}
function stripeQuote(value: string): string {
  return `"${value.replace(/["\\]/g, "").slice(0, 100)}"`;
}
function timeKey(value: InvestigationEvent) { return value.at ?? ""; }

async function orderCandidates(input: InvestigationInput): Promise<{ rows: OrderRow[]; limited: boolean }> {
  const found = new Map<string, OrderRow>();
  let limited = false;
  async function add(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    const { data, error } = await query;
    if (error) throw new Error("Order search is unavailable.");
    const rows = (data ?? []) as OrderRow[];
    if (rows.length >= MAX_ORDERS) limited = true;
    for (const row of rows) found.set(row.id, row);
  }
  const base = () => supabaseServer.from("orders").select(ORDER_FIELDS);
  if (input.mode === "unmatched") return { rows: [], limited: false };
  if (input.kind === "order") {
    const field = input.query.includes("-") && input.query.length === 36 ? "id" : "customer_order_number";
    await add(base().eq(field, input.query).limit(MAX_ORDERS));
  } else if (input.kind === "intent") {
    await add(base().eq("payment_intent_id", input.query).limit(MAX_ORDERS));
  } else if (input.kind === "amount") {
    await add(base().eq("total_amount_cents", input.amountCents!).limit(MAX_ORDERS));
  } else if (input.kind === "date") {
    const bounds = centralDayBounds(input.date!);
    const start = new Date(bounds.gte * 1000).toISOString();
    const end = new Date(bounds.lt * 1000).toISOString();
    await Promise.all([
      add(base().gte("created_at", start).lt("created_at", end).limit(MAX_ORDERS)),
      add(base().gte("updated_at", start).lt("updated_at", end).limit(MAX_ORDERS)),
      (async () => {
        const { data, error } = await supabaseServer.from("order_events")
          .select("order_id").gte("created_at", start).lt("created_at", end).limit(MAX_ORDERS);
        if (error) throw new Error("Activity search is unavailable.");
        if ((data ?? []).length >= MAX_ORDERS) limited = true;
        const ids = [...new Set((data ?? []).map(e => e.order_id))];
        if (ids.length) await add(base().in("id", ids).limit(MAX_ORDERS));
      })(),
    ]);
  } else if (input.kind === "email") {
    await add(base().ilike("shipping_email", input.query).limit(MAX_ORDERS));
  } else if (input.kind === "text") {
    const words = input.query.split(/\s+/).filter(Boolean);
    const first = words[0].replace(/[%_]/g, "");
    const last = (words.at(-1) ?? first).replace(/[%_]/g, "");
    const whole = input.query.replace(/[%_]/g, "");
    await Promise.all([
      add(base().ilike("shipping_first_name", `%${first}%`).limit(MAX_ORDERS)),
      add(base().ilike("shipping_last_name", `%${last}%`).limit(MAX_ORDERS)),
      add(base().ilike("patient_first_name", `%${first}%`).limit(MAX_ORDERS)),
      add(base().ilike("patient_last_name", `%${last}%`).limit(MAX_ORDERS)),
      add(base().ilike("patient_name", `%${whole}%`).limit(MAX_ORDERS)),
      add(base().ilike("patient_full_name", `%${whole}%`).limit(MAX_ORDERS)),
      add(base().ilike("customer_order_number", `%${whole}%`).limit(MAX_ORDERS)),
    ]);
    const needle = input.query.toLowerCase();
    for (const [id, row] of found) {
      const values = [row.customer_order_number, row.shipping_email,
        `${row.shipping_first_name ?? ""} ${row.shipping_last_name ?? ""}`,
        `${row.patient_first_name ?? ""} ${row.patient_last_name ?? ""}`,
        row.patient_name, row.patient_full_name];
      if (!values.some(value => value?.toLowerCase().includes(needle))) found.delete(id);
    }
  }
  return { rows: [...found.values()].slice(0, MAX_ORDERS), limited };
}

async function orderEvents(ids: string[]): Promise<Map<string, EventRow[]>> {
  const result = new Map<string, EventRow[]>();
  if (!ids.length) return result;
  const { data, error } = await supabaseServer.from("order_events")
    .select("order_id,event_type,created_at,after").in("order_id", ids)
    .order("created_at", { ascending: true }).limit(500);
  if (error) throw new Error("Order activity is unavailable.");
  for (const event of (data ?? []) as EventRow[]) {
    result.set(event.order_id, [...(result.get(event.order_id) ?? []), event]);
  }
  return result;
}

async function orderItems(ids: string[]): Promise<Map<string, ItemRow[]>> {
  const result = new Map<string, ItemRow[]>();
  if (!ids.length) return result;
  const { data, error } = await supabaseServer.from("order_items")
    .select("order_id,eye,sku,box_count").in("order_id", ids).limit(500);
  if (error) throw new Error("Order items are unavailable.");
  for (const item of (data ?? []) as ItemRow[]) {
    result.set(item.order_id, [...(result.get(item.order_id) ?? []), item]);
  }
  return result;
}

function publicOrder(row: OrderRow, events: EventRow[], items: ItemRow[]): InvestigationOrder {
  const timeline: InvestigationEvent[] = [{ label: "Order created", at: row.created_at,
    source: "Honest Lenses" }];
  if (row.order_quantity_adjusted_at) timeline.push({ label: "Quantity adjusted",
    at: row.order_quantity_adjusted_at, source: "Honest Lenses" });
  if (row.verification_completed_at) timeline.push({ label: "Prescription verification completed",
    at: row.verification_completed_at, source: "Honest Lenses" });
  for (const event of events) {
    if (event.event_type.startsWith("admin_") || event.event_type.startsWith("founder_")) {
      timeline.push({ label: event.event_type.replaceAll("_", " "), at: event.created_at,
        source: "Honest Lenses" });
    }
  }
  const completed = events.findLast(e =>
    ["completed", "shipped", "delivered"].includes(String(e.after?.fulfillment_status ?? "")));
  if (completed) timeline.push({ label: "Fulfillment completed", at: completed.created_at,
    source: "Honest Lenses" });
  else if (["completed", "shipped", "delivered"].includes(row.fulfillment_status ?? ""))
    timeline.push({ label: "Fulfillment completed (date unavailable)", at: null,
      source: "Honest Lenses" });
  const right = row.adjusted_right_box_count ?? row.right_box_count ?? 0;
  const left = row.adjusted_left_box_count ?? row.left_box_count ?? 0;
  const originalRight = row.right_box_count ?? 0;
  const originalLeft = row.left_box_count ?? 0;
  const adjustedQuantity = row.adjusted_right_box_count !== null || row.adjusted_left_box_count !== null;
  const itemQuantity = items.length ? items.map(item =>
    `${item.box_count} ${item.eye ?? "unspecified"} ${item.sku ?? "lens"}`).join("; ") : null;
  const address = [row.shipping_address1, row.shipping_address2,
    row.shipping_city, row.shipping_state, row.shipping_zip].filter(Boolean).join(", ");
  return {
    id: row.id, number: row.customer_order_number,
    customer: [row.shipping_first_name, row.shipping_last_name].filter(Boolean).join(" ") || "Unknown",
    email: row.shipping_email, patient: [row.patient_first_name, row.patient_last_name]
      .filter(Boolean).join(" ") || row.patient_full_name || row.patient_name,
    status: row.status, fulfillment: row.fulfillment_status,
    verificationStatus: row.verification_status, sku: row.sku,
    quantity: adjustedQuantity
      ? `${originalRight} right / ${originalLeft} left → ${right} right / ${left} left boxes`
      : itemQuantity ?? `${right} right / ${left} left box${right + left === 1 ? "" : "es"}`,
    amountCents: row.total_amount_cents, shipping: address || null,
    paymentIntentId: row.payment_intent_id,
    timeline: timeline.sort((a, b) => timeKey(a).localeCompare(timeKey(b))),
    url: `/admin/investigate?order=${encodeURIComponent(row.id)}`,
  };
}

type StripeFound = { intents: Stripe.PaymentIntent[]; charges: Stripe.Charge[];
  invoices: Stripe.Invoice[]; captureEvents: Map<string, string>; limited: boolean };
async function stripeCandidates(stripe: Stripe, input: InvestigationInput,
  orders: InvestigationOrder[]): Promise<StripeFound> {
  const intents = new Map<string, Stripe.PaymentIntent>();
  const charges = new Map<string, Stripe.Charge>();
  const invoices = new Map<string, Stripe.Invoice>();
  const captureEvents = new Map<string, string>();
  let limited = false;
  const addIntent = (i: Stripe.PaymentIntent) => intents.set(i.id, i);
  const addCharge = (c: Stripe.Charge) => charges.set(c.id, c);
  const addInvoice = (i: Stripe.Invoice) => invoices.set(i.id, i);
  const addList = <T extends { id: string }>(list: { data: T[]; has_more: boolean },
    add: (value: T) => void) => { list.data.forEach(add); if (list.has_more) limited = true; };

  if (input.kind === "intent") addIntent(await stripe.paymentIntents.retrieve(input.query,
    { expand: ["latest_charge", "latest_charge.balance_transaction"] }));
  if (input.kind === "charge") addCharge(await stripe.charges.retrieve(input.query,
    { expand: ["balance_transaction"] }));
  if (input.kind === "invoice") addInvoice(await stripe.invoices.retrieve(input.query));
  if (input.kind === "amount") {
    const amount = input.amountCents!;
    const [pi, charge, invoice] = await Promise.all([
      stripe.paymentIntents.search({ query: `amount:${amount} AND currency:"usd"`, limit: MAX_STRIPE }),
      stripe.charges.search({ query: `amount:${amount} AND currency:"usd"`, limit: MAX_STRIPE }),
      stripe.invoices.search({ query: `total:${amount} AND currency:"usd"`, limit: MAX_STRIPE }),
    ]);
    addList(pi, addIntent); addList(charge, addCharge); addList(invoice, addInvoice);
  }
  if (input.kind === "date" || input.mode === "unmatched") {
    const bounds = input.kind === "date" ? centralDayBounds(input.date!) :
      { gte: Math.floor(Date.now() / 1000) - 30 * DAY, lt: Math.floor(Date.now() / 1000) + 1 };
    const [pi, charge, invoice, balance, paidEvents, capture] = await Promise.all([
      stripe.paymentIntents.list({ created: bounds, limit: MAX_STRIPE }),
      stripe.charges.list({ created: bounds, limit: MAX_STRIPE }),
      stripe.invoices.list({ created: bounds, limit: MAX_STRIPE }),
      stripe.balanceTransactions.list({ created: bounds, type: "charge", limit: MAX_STRIPE }),
      stripe.events.list({ type: "invoice.paid", created: bounds, limit: MAX_STRIPE }),
      stripe.events.list({ type: "charge.captured", created: bounds, limit: MAX_STRIPE }),
    ]);
    addList(pi, addIntent); addList(charge, addCharge); addList(invoice, addInvoice);
    if (balance.has_more || paidEvents.has_more || capture.has_more) limited = true;
    for (const event of capture.data) {
      const chargeId = (event.data.object as { id?: string }).id;
      if (chargeId?.startsWith("ch_")) captureEvents.set(chargeId, asIso(event.created)!);
    }
    const capturedChargeIds = balance.data.map(tx => ref(tx.source)).filter((id): id is string =>
      Boolean(id?.startsWith("ch_"))).slice(0, 30);
    const paidInvoiceIds = paidEvents.data.map(e => (e.data.object as { id?: string }).id)
      .filter((id): id is string => Boolean(id?.startsWith("in_"))).slice(0, 30);
    await Promise.all([
      ...capturedChargeIds.filter(id => !charges.has(id)).map(async id =>
        addCharge(await stripe.charges.retrieve(id, { expand: ["balance_transaction"] }))),
      ...paidInvoiceIds.filter(id => !invoices.has(id)).map(async id =>
        addInvoice(await stripe.invoices.retrieve(id))),
    ]);
  }
  const emails = new Set(orders.map(o => o.email?.toLowerCase()).filter((x): x is string => Boolean(x)));
  if (input.kind === "email") emails.add(input.query.toLowerCase());
  if (input.kind === "text") {
    const customers = await stripe.customers.search({ query: `name~${stripeQuote(input.query)}`,
      limit: 25 });
    if (customers.has_more) limited = true;
    for (const c of customers.data) if (c.email) emails.add(c.email.toLowerCase());
  }
  for (const email of [...emails].slice(0, 5)) {
    const customers = await stripe.customers.search({ query: `email:${stripeQuote(email)}`,
      limit: 25 });
    if (customers.has_more) limited = true;
    for (const customer of customers.data) {
      const [pi, invoice] = await Promise.all([
        stripe.paymentIntents.list({ customer: customer.id, limit: MAX_STRIPE }),
        stripe.invoices.list({ customer: customer.id, limit: MAX_STRIPE }),
      ]);
      addList(pi, addIntent); addList(invoice, addInvoice);
    }
  }
  // Storefront orders often use no Stripe Customer object. Exact intent IDs remain authoritative.
  await Promise.all(orders.map(async order => {
    if (order.paymentIntentId && !intents.has(order.paymentIntentId))
      addIntent(await stripe.paymentIntents.retrieve(order.paymentIntentId,
        { expand: ["latest_charge", "latest_charge.balance_transaction"] }));
  }));
  for (const intent of intents.values()) {
    if (intent.latest_charge && typeof intent.latest_charge !== "string")
      addCharge(intent.latest_charge);
  }
  for (const charge of charges.values()) {
    const id = ref(charge.payment_intent);
    if (id && !intents.has(id)) addIntent(await stripe.paymentIntents.retrieve(id));
  }
  for (const invoice of invoices.values()) {
    const id = invoiceIntentId(invoice);
    if (id && !intents.has(id)) addIntent(await stripe.paymentIntents.retrieve(id,
      { expand: ["latest_charge", "latest_charge.balance_transaction"] }));
  }
  if (input.kind === "text" || input.kind === "email") {
    // Recent invoices cover manually emailed invoices without a Stripe Customer search hit.
    const recent = await stripe.invoices.list({ limit: MAX_STRIPE });
    if (recent.has_more) limited = true;
    const needle = input.query.toLowerCase();
    for (const invoice of recent.data) {
      const haystack = `${invoice.customer_name ?? ""} ${invoice.customer_email ?? ""}`.toLowerCase();
      if (haystack.includes(needle) || emails.has(invoice.customer_email?.toLowerCase() ?? ""))
        addInvoice(invoice);
    }
  }
  return { intents: [...intents.values()], charges: [...charges.values()],
    invoices: [...invoices.values()], captureEvents, limited };
}

async function associatedOrderRows(found: StripeFound, existing: OrderRow[]): Promise<OrderRow[]> {
  const rows = new Map(existing.map(row => [row.id, row]));
  const intentIds = new Set<string>();
  const metadataIds = new Set<string>();
  const emails = new Set<string>();
  const collect = (metadata: Stripe.Metadata | null | undefined, email: string | null | undefined) => {
    const orderId = metadata?.order_id ?? metadata?.orderId;
    if (orderId && /^[0-9a-f-]{36}$/i.test(orderId)) metadataIds.add(orderId);
    if (email) emails.add(email.toLowerCase());
  };
  for (const intent of found.intents) {
    intentIds.add(intent.id); collect(intent.metadata, intent.receipt_email);
  }
  for (const charge of found.charges) {
    const id = ref(charge.payment_intent); if (id) intentIds.add(id);
    collect(charge.metadata, charge.billing_details.email);
  }
  for (const invoice of found.invoices) {
    const id = invoiceIntentId(invoice); if (id) intentIds.add(id);
    collect(invoice.metadata, invoice.customer_email);
  }
  const add = async (query: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await query;
    if (error) throw new Error("Order reconciliation is unavailable.");
    for (const row of (data ?? []) as OrderRow[]) rows.set(row.id, row);
  };
  const ids = [...intentIds].slice(0, MAX_STRIPE);
  if (ids.length) await add(supabaseServer.from("orders").select(ORDER_FIELDS)
    .in("payment_intent_id", ids).limit(MAX_ORDERS));
  const orderIds = [...metadataIds].slice(0, MAX_STRIPE);
  if (orderIds.length) await add(supabaseServer.from("orders").select(ORDER_FIELDS)
    .in("id", orderIds).limit(MAX_ORDERS));
  for (const email of [...emails].slice(0, 10)) {
    await add(supabaseServer.from("orders").select(ORDER_FIELDS)
      .ilike("shipping_email", email).limit(MAX_ORDERS));
  }
  return [...rows.values()].slice(0, MAX_ORDERS);
}

function invoiceIntentId(invoice: Stripe.Invoice): string | null {
  const legacy = invoice as unknown as { payment_intent?: string | { id: string } | null };
  if (legacy.payment_intent) return ref(legacy.payment_intent);
  const payments = invoice.payments?.data ?? [];
  for (const item of payments) {
    const payment = item.payment as { payment_intent?: string | { id: string } | null } | null;
    if (payment?.payment_intent) return ref(payment.payment_intent);
  }
  return null;
}

async function publicPayments(stripe: Stripe, found: StripeFound,
  orders: InvestigationOrder[]): Promise<InvestigationPayment[]> {
  const result: InvestigationPayment[] = [];
  const refs = orders.map(o => ({ id: o.id, paymentIntentId: o.paymentIntentId,
    email: o.email, amountCents: o.amountCents }));
  const chargeByIntent = new Map(found.charges.map(c => [ref(c.payment_intent), c]));
  async function postedAt(charge: Stripe.Charge | undefined): Promise<string | null> {
    if (!charge?.captured || !charge.balance_transaction) return null;
    const bt = typeof charge.balance_transaction === "string"
      ? await stripe.balanceTransactions.retrieve(charge.balance_transaction)
      : charge.balance_transaction;
    return asIso(bt.created);
  }
  for (const intent of found.intents) {
    const charge = chargeByIntent.get(intent.id);
    const email = intent.receipt_email ?? charge?.billing_details.email ?? null;
    const match = linkPaymentToOrder({ intentId: intent.id,
      metadataOrderId: intent.metadata?.order_id ?? intent.metadata?.orderId,
      email, amountCents: intent.amount }, refs);
    const captureAt = charge ? found.captureEvents.get(charge.id) ?? null : null;
    const fundsAt = await postedAt(charge);
    const timeline: InvestigationEvent[] = [
      { label: "PaymentIntent created", at: asIso(intent.created), source: "Stripe" },
    ];
    if (charge) timeline.push({ label: "Payment authorized", at: asIso(charge.created), source: "Stripe" });
    if (charge?.captured) timeline.push({ label: captureAt ? "Payment captured" :
      "Payment captured (date unavailable)", at: captureAt, source: "Stripe" });
    if (fundsAt) timeline.push({ label: "Funds posted to Stripe balance", at: fundsAt,
      source: "Stripe" });
    if (charge?.amount_refunded) timeline.push({ label: "Payment refunded (date unavailable)",
      at: null, source: "Stripe" });
    result.push({ id: intent.id, kind: "PaymentIntent", amountCents: intent.amount,
      currency: intent.currency, status: intent.status, email, createdAt: asIso(intent.created)!,
      paidAt: captureAt ?? fundsAt, refundedCents: charge?.amount_refunded ?? 0,
      intentId: intent.id, chargeId: charge?.id ?? ref(intent.latest_charge), invoiceId: null,
      orderId: match.orderId, confidence: match.confidence, reason: match.reason,
      url: dashboardUrl("payments", intent.id, intent.livemode), timeline });
  }
  for (const charge of found.charges) {
    if (ref(charge.payment_intent) && found.intents.some(i => i.id === ref(charge.payment_intent))) continue;
    const intentId = ref(charge.payment_intent);
    const match = linkPaymentToOrder({ intentId,
      metadataOrderId: charge.metadata?.order_id ?? charge.metadata?.orderId,
      email: charge.billing_details.email, amountCents: charge.amount }, refs);
    const captureAt = found.captureEvents.get(charge.id) ?? null;
    const fundsAt = await postedAt(charge);
    result.push({ id: charge.id, kind: "Charge", amountCents: charge.amount,
      currency: charge.currency, status: charge.captured ? "captured" : charge.status,
      email: charge.billing_details.email, createdAt: asIso(charge.created)!,
      paidAt: captureAt ?? fundsAt,
      refundedCents: charge.amount_refunded, intentId, chargeId: charge.id, invoiceId: null,
      orderId: match.orderId, confidence: match.confidence, reason: match.reason,
      url: dashboardUrl("payments", charge.id, charge.livemode),
      timeline: [{ label: "Charge created / authorization", at: asIso(charge.created), source: "Stripe" },
        ...(charge.captured ? [{ label: captureAt ? "Payment captured" :
          "Payment captured (date unavailable)", at: captureAt, source: "Stripe" as const }] : []),
        ...(fundsAt ? [{ label: "Funds posted to Stripe balance", at: fundsAt,
          source: "Stripe" as const }] : []),
        ...(charge.amount_refunded ? [{ label: "Payment refunded (date unavailable)",
          at: null, source: "Stripe" as const }] : [])] });
  }
  for (const invoice of found.invoices) {
    const intentId = invoiceIntentId(invoice);
    const match = linkPaymentToOrder({ intentId,
      metadataOrderId: invoice.metadata?.order_id ?? invoice.metadata?.orderId,
      email: invoice.customer_email, amountCents: invoice.total }, refs);
    result.push({ id: invoice.id, kind: "Invoice", amountCents: invoice.total,
      currency: invoice.currency, status: invoice.status ?? "unknown",
      email: invoice.customer_email, createdAt: asIso(invoice.created)!,
      paidAt: asIso(invoice.status_transitions?.paid_at), refundedCents: 0,
      intentId, chargeId: null, invoiceId: invoice.id,
      orderId: match.orderId, confidence: match.confidence, reason: match.reason,
      url: dashboardUrl("invoices", invoice.id, invoice.livemode),
      timeline: [{ label: "Invoice created", at: asIso(invoice.created), source: "Stripe" },
        ...(invoice.status_transitions?.paid_at ? [{ label: "Invoice paid",
          at: asIso(invoice.status_transitions.paid_at), source: "Stripe" as const }] : [])] });
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function investigate(input: InvestigationInput): Promise<InvestigationResult> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe is not configured for investigations.");
  const stripe = new Stripe(key);
  const local = await orderCandidates(input);
  const initialEvents = await orderEvents(local.rows.map(o => o.id));
  const initialItems = await orderItems(local.rows.map(o => o.id));
  const initialOrders = local.rows.map(o => publicOrder(o,
    initialEvents.get(o.id) ?? [], initialItems.get(o.id) ?? []));
  const stripeFound = await stripeCandidates(stripe, input, initialOrders);
  const rows = await associatedOrderRows(stripeFound, local.rows);
  const events = await orderEvents(rows.map(o => o.id));
  const items = await orderItems(rows.map(o => o.id));
  const orders = rows.map(o => publicOrder(o, events.get(o.id) ?? [], items.get(o.id) ?? []));
  let payments = await publicPayments(stripe, stripeFound, orders);
  if (input.mode === "unmatched") payments = payments.filter(p => p.confidence !== "Confirmed" &&
    (p.kind !== "Invoice" || p.status === "paid") &&
    (p.kind === "Invoice" || p.status === "succeeded" || p.status === "captured"));
  const notice = ["Stripe search can lag recent activity; exact IDs use direct retrieval."];
  if (input.kind === "date") notice.push("Date boundaries use America/Chicago time. Order creation, updates, events, Stripe payments, and invoice activity are searched separately.");
  if (input.mode === "unmatched") notice.push("Showing recent 30 days of paid records with no confirmed storefront ID. Probable matches need manual review.");
  if (local.limited || stripeFound.limited) notice.push("Result limit reached. Narrow the search by ID, email, amount, or date.");
  return { orders: input.mode === "unmatched" ? [] : orders,
    payments, notice, limited: local.limited || stripeFound.limited };
}
