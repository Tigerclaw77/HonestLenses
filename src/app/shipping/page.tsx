"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import { fetchCart, OrderAccessExpiredError } from "@/lib/cart/api";
import { fetchWithOrderAccess } from "@/lib/auth/orderAccessFetch";
import { isEmailAddress, isUsPostalCode } from "@/lib/security/inputValidation";
import {
  clearShippingDraft,
  readShippingDraft,
  saveShippingDraft,
  type ShippingDraftFields,
} from "@/lib/shipping/shippingDraft";
import {
  POSTHOG_EVENTS,
  captureClientException,
  consumeStepDurationMs,
  markStepStart,
  track,
} from "@/lib/posthog/client";

type DraftOrder = {
  id: string;
  status: string;
};

type ShippingForm = ShippingDraftFields;

const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

export default function ShippingPage() {
  const router = useRouter();

  const [order, setOrder] = useState<DraftOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actorId = useRef("guest");
  const formStarted = useRef(false);
  const initStarted = useRef(false);

  const [form, setForm] = useState<ShippingForm>({
    shipping_first_name: "",
    shipping_last_name: "",
    shipping_email: "",
    shipping_phone: "",
    shipping_address1: "",
    shipping_address2: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zip: "",
  });
  const formRef = useRef(form);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const data = await fetchCart(session?.access_token ?? null);

        if (!data || data.status !== "draft") {
          clearShippingDraft(sessionStorage);
          setError("No active cart found.");
          track(POSTHOG_EVENTS.SHIPPING_VIEWED, { cart_state: "missing" });
          return;
        }

        actorId.current = session?.user?.id ?? "guest";
        const saved = readShippingDraft(sessionStorage, data.id, actorId.current);
        if (saved) {
          formRef.current = saved;
          setForm(saved);
        }
        setOrder(data);
        markStepStart(`shipping:${data.id}`);
        track(POSTHOG_EVENTS.SHIPPING_VIEWED, {
          cart_state: "ready",
          order_status: data.status,
        });
      } catch (initError) {
        const accessExpired = initError instanceof OrderAccessExpiredError;
        setError(
          accessExpired
            ? "Your checkout session expired. Return to your cart to continue."
            : "Unable to load cart. Please return to your cart and try again.",
        );
        track(POSTHOG_EVENTS.SHIPPING_VIEWED, {
          cart_state: accessExpired ? "access_expired" : "load_failed",
        });
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  function setField<K extends keyof ShippingForm>(key: K, value: string) {
    const next = { ...formRef.current, [key]: value };
    formRef.current = next;
    setForm(next);
    if (!order) return;
    saveShippingDraft(sessionStorage, order.id, actorId.current, next);
    if (!formStarted.current) {
      formStarted.current = true;
      const marker = `hl_shipping_started_v1:${order.id}`;
      try {
        if (sessionStorage.getItem(marker)) return;
        sessionStorage.setItem(marker, "1");
      } catch { /* Analytics can proceed when storage is unavailable. */ }
      track(POSTHOG_EVENTS.SHIPPING_FORM_STARTED, { order_status: order.status });
    }
  }

  function validate(): { message: string; category: string } | null {
    const current = formRef.current;
    if (!current.shipping_first_name.trim()) return { message: "Enter first name.", category: "first_name_missing" };
    if (!current.shipping_last_name.trim()) return { message: "Enter last name.", category: "last_name_missing" };
    if (!current.shipping_email.trim()) return { message: "Enter email.", category: "email_missing" };
    if (!isEmailAddress(current.shipping_email.trim())) return { message: "Enter a valid email.", category: "email_invalid" };
    if (!current.shipping_address1.trim()) return { message: "Enter address.", category: "address_missing" };
    if (!current.shipping_city.trim()) return { message: "Enter city.", category: "city_missing" };
    if (!current.shipping_state.trim()) return { message: "Select state.", category: "state_missing" };
    if (!current.shipping_zip.trim()) return { message: "Enter ZIP.", category: "zip_missing" };
    if (!isUsPostalCode(current.shipping_zip.trim())) return { message: "Enter a valid ZIP.", category: "zip_invalid" };
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;

    const v = validate();
    if (v) {
      setError(v.message);
      track(POSTHOG_EVENTS.SHIPPING_VALIDATION_FAILED, { failure_category: v.category });
      track(POSTHOG_EVENTS.VALIDATION_ERROR, {
        step: "shipping",
        reason: v.message,
        order_status: order.status,
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetchWithOrderAccess(`/api/orders/${order.id}/shipping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formRef.current),
      }, session?.access_token ?? null);

      if (!res.ok) {
        setError(
          res.status === 401
            ? "Your checkout session expired. Return to your cart to continue."
            : "Failed to save shipping.",
        );
        track(POSTHOG_EVENTS.SHIPPING_SAVE_FAILED, {
          failure_category:
            res.status === 401 ? "access_expired" : "http_error",
          http_status: res.status,
        });
        captureClientException(new Error("Failed to save shipping."), {
          source: "shipping_submit",
          http_status: res.status,
        });
        return;
      }

      clearShippingDraft(sessionStorage);
      track(POSTHOG_EVENTS.SHIPPING_SAVE_SUCCEEDED, { order_status: order.status });
      track(POSTHOG_EVENTS.CHECKOUT_STEP_TIMED, {
        step: "shipping",
        order_id: order.id,
        order_status: order.status,
        has_shipping_phone: Boolean(formRef.current.shipping_phone.trim()),
        duration_ms: consumeStepDurationMs(`shipping:${order.id}`),
      });

      router.push(`/checkout?orderId=${order.id}`);
    } catch {
      setError("Unable to save shipping. Please try again.");
      track(POSTHOG_EVENTS.SHIPPING_SAVE_FAILED, { failure_category: "network_error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="content-shell">Loading…</main>;

  if (!order) {
    return (
      <main className="content-shell">
        <h1 className="upper content-title">Shipping Information</h1>
        <p className="error-text">{error}</p>
        <Link href="/cart">Return to cart</Link>
      </main>
    );
  }

  return (
    <main className="content-shell">
        <h1 className="upper content-title">Shipping Information</h1>
        <p style={{ color: "#cbd5e1", lineHeight: 1.6, maxWidth: 760 }}>
          Enter the address where your lenses should be delivered. Shipping
          timing begins after prescription verification is complete; some
          products may ship through authorized manufacturer or distributor
          channels. We will email tracking when the order ships.
        </p>

        <form onSubmit={handleSubmit} className="shipping-grid" noValidate>
          <div className="col-6">
            <label htmlFor="shipping-first-name">First name</label>
            <input
              id="shipping-first-name"
              name="given-name"
              autoComplete="shipping given-name"
              value={form.shipping_first_name}
              onChange={(e) => setField("shipping_first_name", e.target.value)}
            />
          </div>

          <div className="col-6">
            <label htmlFor="shipping-last-name">Last name</label>
            <input
              id="shipping-last-name"
              name="family-name"
              autoComplete="shipping family-name"
              value={form.shipping_last_name}
              onChange={(e) => setField("shipping_last_name", e.target.value)}
            />
          </div>

          <div className="col-12">
            <label htmlFor="shipping-address1">Address</label>
            <input
              id="shipping-address1"
              name="address-line1"
              autoComplete="shipping address-line1"
              value={form.shipping_address1}
              onChange={(e) => setField("shipping_address1", e.target.value)}
            />
          </div>

          <div className="col-12">
            <label htmlFor="shipping-address2">Address line 2</label>
            <input
              id="shipping-address2"
              name="address-line2"
              autoComplete="shipping address-line2"
              value={form.shipping_address2}
              onChange={(e) => setField("shipping_address2", e.target.value)}
            />
          </div>

          <div className="col-6">
            <label htmlFor="shipping-email">Email for order updates</label>
            <input
              id="shipping-email"
              name="email"
              type="email"
              autoComplete="shipping email"
              value={form.shipping_email}
              onChange={(e) => setField("shipping_email", e.target.value)}
            />
          </div>

          <div className="col-6">
            <label htmlFor="shipping-phone">Phone (optional)</label>
            <input
              id="shipping-phone"
              name="tel"
              type="tel"
              autoComplete="shipping tel"
              value={form.shipping_phone}
              onChange={(e) => setField("shipping_phone", e.target.value)}
            />
          </div>

          <div className="col-6">
            <label htmlFor="shipping-city">City</label>
            <input
              id="shipping-city"
              name="address-level2"
              autoComplete="shipping address-level2"
              value={form.shipping_city}
              onChange={(e) => setField("shipping_city", e.target.value)}
            />
          </div>

          <div className="col-3">
            <label htmlFor="shipping-state">State</label>
            <select
              id="shipping-state"
              name="address-level1"
              autoComplete="shipping address-level1"
              value={form.shipping_state}
              onChange={(e) => setField("shipping_state", e.target.value)}
            >
              <option value="">Select</option>
              {US_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="col-3">
            <label htmlFor="shipping-zip">ZIP</label>
            <input
              id="shipping-zip"
              name="postal-code"
              autoComplete="shipping postal-code"
              value={form.shipping_zip}
              onChange={(e) => setField("shipping_zip", e.target.value)}
            />
          </div>

          {error && <p className="error-text col-12">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="primary-btn submit-btn"
          >
            {submitting ? "Saving..." : "Continue to Payment"}
          </button>

          <p className="shipping-note col-12">
            You will review payment on the next step. Lenses are not shipped
            until prescription verification is complete.
          </p>
        </form>

        <style>{`
          .shipping-grid {
            display: grid;
            grid-template-columns: repeat(12, 1fr);
            gap: 14px;
            margin-top: 20px;
          }

          .col-6 { grid-column: span 6; }
          .col-3 { grid-column: span 3; }
          .col-12 { grid-column: span 12; }

          @media (max-width: 600px) {
            .shipping-grid > .col-6,
            .shipping-grid > .col-3 { grid-column: span 12; }
          }

          input, select {
            width: 100%;
            padding: 14px;
            border-radius: 10px;
            background: #0b1220;
            border: 1px solid rgba(148,163,184,0.3);
            color: white;
            transition: border 0.15s, box-shadow 0.15s;
          }

          input:focus, select:focus {
            outline: none;
            border: 1px solid #3b82f6;
            box-shadow: 0 0 0 2px rgba(59,130,246,0.25);
          }

          label {
            font-size: 12px;
            margin-bottom: 4px;
            display: block;
            color: #e2e8f0;
          }

          .submit-btn {
            grid-column: span 12;
            width: 100%;
            margin-top: 24px;
            font-size: 1rem;
          }

          .submit-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .shipping-note {
            margin: 0;
            color: #94a3b8;
            font-size: 13px;
            line-height: 1.5;
            text-align: center;
          }
        `}</style>
    </main>
  );
}
