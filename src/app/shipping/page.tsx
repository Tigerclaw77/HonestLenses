"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-client";

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

function inputBaseStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "14px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.35)",
    fontSize: 14,
    background: "#f8fafc",
    outline: "none",
    transition:
      "box-shadow 140ms ease, border-color 140ms ease, background 140ms ease",
  };
}

function labelStyle(): React.CSSProperties {
  return {
    display: "block",
    fontSize: 12,
    color: "#cbd5e1",
    marginBottom: 6,
    fontWeight: 650,
  };
}

function focusRingStyle(): React.CSSProperties {
  return {
    borderColor: "#2563eb",
    boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.38)",
    background: "#ffffff",
  };
}

export default function ShippingPage() {
  const router = useRouter();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [order, setOrder] = useState<DraftOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

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

      if (!session) {
        router.replace("/login");
        return;
      }

      setAccessToken(session.access_token);

      const { data } = await supabase
        .from("orders")
        .select("id, status")
        .eq("user_id", session.user.id)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) {
        setError("No active cart found.");
        setLoading(false);
        return;
      }

      setOrder(data);
      setLoading(false);
    }

    init();
  }, [router]);

  function setField<K extends keyof ShippingForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.shipping_first_name.trim()) return "Enter first name.";
    if (!form.shipping_last_name.trim()) return "Enter last name.";
    if (!/^\S+@\S+\.\S+$/.test(form.shipping_email.trim()))
      return "Enter a valid email address.";
    // phone optional; no validation unless present
    if (!form.shipping_address1.trim()) return "Enter street address.";
    if (!form.shipping_email.trim()) return "Enter email address.";
    if (!form.shipping_city.trim()) return "Enter city.";
    if (!form.shipping_state.trim()) return "Select state.";
    if (!form.shipping_zip.trim()) return "Enter ZIP code.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !accessToken) return;

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/orders/${order.id}/shipping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      setError("Failed to save shipping.");
      setSubmitting(false);
      return;
    }

    router.push("/checkout");
  }

  if (loading) return <main className="content-shell">Loading…</main>;

  return (
    <main>
      <section className="content-shell">
        <h1 className="upper content-title">Shipping Information</h1>
        <p style={{ color: "#cbd5e1", marginTop: 6 }}>
          Enter the address where you would like your lenses delivered.
        </p>

        <div
          className="hl-card"
          style={{
            marginTop: 22,
            background: "rgba(15, 23, 42, 0.65)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: 18,
            padding: 26,
          }}
        >
          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(12,1fr)",
                gap: 12,
              }}
            >
              <div style={{ gridColumn: "span 6" }}>
                <span style={labelStyle()}>First name</span>
                <input
                  value={form.shipping_first_name}
                  onChange={(e) =>
                    setField("shipping_first_name", e.target.value)
                  }
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "shipping_first_name"
                      ? focusRingStyle()
                      : {}),
                  }}
                  onFocus={() => setFocusKey("shipping_first_name")}
                  onBlur={() => setFocusKey(null)}
                />
              </div>

              <div style={{ gridColumn: "span 6" }}>
                <span style={labelStyle()}>Last name</span>
                <input
                  value={form.shipping_last_name}
                  onChange={(e) =>
                    setField("shipping_last_name", e.target.value)
                  }
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "shipping_last_name"
                      ? focusRingStyle()
                      : {}),
                  }}
                  onFocus={() => setFocusKey("shipping_last_name")}
                  onBlur={() => setFocusKey(null)}
                />
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <span style={labelStyle()}>Address line 1</span>
                <input
                  value={form.shipping_address1}
                  onChange={(e) =>
                    setField("shipping_address1", e.target.value)
                  }
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "shipping_address1"
                      ? focusRingStyle()
                      : {}),
                  }}
                  onFocus={() => setFocusKey("shipping_address1")}
                  onBlur={() => setFocusKey(null)}
                />
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <span style={labelStyle()}>Address line 2</span>
                <input
                  value={form.shipping_address2}
                  onChange={(e) =>
                    setField("shipping_address2", e.target.value)
                  }
                  style={inputBaseStyle()}
                />
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <span style={labelStyle()}>Email</span>
                <input
                  type="email"
                  value={form.shipping_email}
                  onChange={(e) => setField("shipping_email", e.target.value)}
                  style={inputBaseStyle()}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <span style={labelStyle()}>Phone (optional)</span>
                <input
                  value={form.shipping_phone}
                  onChange={(e) => setField("shipping_phone", e.target.value)}
                  style={inputBaseStyle()}
                  placeholder="(555) 555-5555"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>

              <div style={{ gridColumn: "span 6" }}>
                <span style={labelStyle()}>City</span>
                <input
                  value={form.shipping_city}
                  onChange={(e) => setField("shipping_city", e.target.value)}
                  style={inputBaseStyle()}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <span style={labelStyle()}>State</span>
                <select
                  value={form.shipping_state}
                  onChange={(e) => setField("shipping_state", e.target.value)}
                  style={inputBaseStyle()}
                >
                  <option value="">Select</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <span style={labelStyle()}>ZIP</span>
                <input
                  value={form.shipping_zip}
                  onChange={(e) => setField("shipping_zip", e.target.value)}
                  style={inputBaseStyle()}
                />
              </div>
            </div>

            {error && (
              <p style={{ marginTop: 12, color: "#f87171", fontWeight: 700 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: 18,
                width: "100%",
                padding: "18px",
                background: submitting
                  ? "#94a3b8"
                  : "linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)",
                color: "#ffffff",
                borderRadius: 12,
                fontWeight: 900,
                fontSize: 16,
                border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                boxShadow: submitting
                  ? "none"
                  : "0 14px 42px rgba(37, 99, 235, 0.28)",
              }}
            >
              {submitting ? "Saving…" : "Continue to Payment"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
