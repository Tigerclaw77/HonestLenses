"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { fetchCart } from "@/lib/cart/api";
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

type ShippingForm = {
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_email: string;
  shipping_phone: string;
  shipping_address1: string;
  shipping_address2: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
};

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

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const data = await fetchCart(session?.access_token ?? null);

      if (!data) {
        setError("No active cart found.");
        setLoading(false);
        return;
      }

      setOrder(data);
      markStepStart(`shipping:${data.id}`);
      setLoading(false);
    }

    init();
  }, []);

  function setField<K extends keyof ShippingForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.shipping_first_name.trim()) return "Enter first name.";
    if (!form.shipping_last_name.trim()) return "Enter last name.";
    if (!form.shipping_email.trim()) return "Enter email.";
    if (!form.shipping_address1.trim()) return "Enter address.";
    if (!form.shipping_city.trim()) return "Enter city.";
    if (!form.shipping_state.trim()) return "Select state.";
    if (!form.shipping_zip.trim()) return "Enter ZIP.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const v = validate();
    if (v) {
      setError(v);
      track(POSTHOG_EVENTS.VALIDATION_ERROR, {
        step: "shipping",
        reason: v,
        order_id: order.id,
        order_status: order.status,
      });
      return;
    }

    setSubmitting(true);

    const res = await fetch(`/api/orders/${order.id}/shipping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      setError("Failed to save shipping.");
      captureClientException(new Error("Failed to save shipping."), {
        source: "shipping_submit",
        order_id: order.id,
        status: res.status,
      });
      setSubmitting(false);
      return;
    }

    track(POSTHOG_EVENTS.CHECKOUT_STEP_TIMED, {
      step: "shipping",
      order_id: order.id,
      order_status: order.status,
      has_shipping_phone: Boolean(form.shipping_phone.trim()),
      duration_ms: consumeStepDurationMs(`shipping:${order.id}`),
    });

    router.push(`/checkout?orderId=${order.id}`);
  }

  if (loading) return <main className="content-shell">Loading…</main>;

  return (
    <main className="content-shell">
        <h1 className="upper content-title">Shipping Information</h1>
        <p style={{ color: "#cbd5e1", lineHeight: 1.6, maxWidth: 760 }}>
          Enter the address where your lenses should be delivered. Shipping
          timing begins after prescription verification is complete; some
          products may ship through authorized manufacturer or distributor
          channels. We will email tracking when the order ships.
        </p>

        <form onSubmit={handleSubmit} className="shipping-grid">
          <div className="col-6">
            <label>First name</label>
            <input
              value={form.shipping_first_name}
              onChange={(e) => setField("shipping_first_name", e.target.value)}
            />
          </div>

          <div className="col-6">
            <label>Last name</label>
            <input
              value={form.shipping_last_name}
              onChange={(e) => setField("shipping_last_name", e.target.value)}
            />
          </div>

          <div className="col-12">
            <label>Address</label>
            <input
              value={form.shipping_address1}
              onChange={(e) => setField("shipping_address1", e.target.value)}
            />
          </div>

          <div className="col-12">
            <label>Address line 2</label>
            <input
              value={form.shipping_address2}
              onChange={(e) => setField("shipping_address2", e.target.value)}
            />
          </div>

          <div className="col-6">
            <label>Email for order updates</label>
            <input
              type="email"
              value={form.shipping_email}
              onChange={(e) => setField("shipping_email", e.target.value)}
            />
          </div>

          <div className="col-6">
            <label>Phone (optional)</label>
            <input
              value={form.shipping_phone}
              onChange={(e) => setField("shipping_phone", e.target.value)}
            />
          </div>

          <div className="col-6">
            <label>City</label>
            <input
              value={form.shipping_city}
              onChange={(e) => setField("shipping_city", e.target.value)}
            />
          </div>

          <div className="col-3">
            <label>State</label>
            <select
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
            <label>ZIP</label>
            <input
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
