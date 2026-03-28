"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-client";
import AuthGate from "@/components/AuthGate";

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
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

function inputBaseStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 15,
    background: "rgba(15, 23, 42, 0.6)",
    color: "#e5e7eb",
  };
}

function labelStyle(): React.CSSProperties {
  return {
    display: "block",
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 6,
    fontWeight: 600,
  };
}

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

      if (!session) {
        setError("Not logged in.");
        setLoading(false);
        return;
      }

      console.log("TRACE user:", session.user.id);

      const { data, error } = await supabase
        .from("orders")
        .select("id, status")
        .eq("user_id", session.user.id)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        console.log("TRACE no draft:", error);
        setError("No active cart found.");
        setLoading(false);
        return;
      }

      console.log("TRACE orderId (fetched):", data.id);

      setOrder(data);
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
    if (!form.shipping_address1.trim()) return "Enter street address.";
    if (!form.shipping_city.trim()) return "Enter city.";
    if (!form.shipping_state.trim()) return "Select state.";
    if (!form.shipping_zip.trim()) return "Enter ZIP code.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!order) {
      console.log("TRACE blocked: no order");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      console.log("TRACE blocked: no session");
      return;
    }

    const v = validate();
    if (v) {
      console.log("TRACE validation:", v);
      setError(v);
      return;
    }

    console.log("TRACE orderId (submit):", order.id);

    const res = await fetch(`/api/orders/${order.id}/shipping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      console.log("TRACE API failed");
      setError("Failed to save shipping.");
      return;
    }

    console.log("TRACE orderId (navigate):", order.id);

    router.push(`/checkout?orderId=${order.id}`);
  }

  if (loading) return <main className="content-shell">Loading…</main>;

  return (
    <AuthGate>
      <main>
        <section className="content-shell">
          <h1 className="upper content-title">Shipping Information</h1>

          <div className="hl-card">
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(12, 1fr)",
                  gap: 16,
                }}
              >
                <div style={{ gridColumn: "span 6" }}>
                  <span style={labelStyle()}>First name</span>
                  <input value={form.shipping_first_name} onChange={(e) => setField("shipping_first_name", e.target.value)} style={inputBaseStyle()} />
                </div>

                <div style={{ gridColumn: "span 6" }}>
                  <span style={labelStyle()}>Last name</span>
                  <input value={form.shipping_last_name} onChange={(e) => setField("shipping_last_name", e.target.value)} style={inputBaseStyle()} />
                </div>

                <div style={{ gridColumn: "span 12" }}>
                  <span style={labelStyle()}>Address</span>
                  <input value={form.shipping_address1} onChange={(e) => setField("shipping_address1", e.target.value)} style={inputBaseStyle()} />
                </div>

                <div style={{ gridColumn: "span 6" }}>
                  <span style={labelStyle()}>City</span>
                  <input value={form.shipping_city} onChange={(e) => setField("shipping_city", e.target.value)} style={inputBaseStyle()} />
                </div>

                <div style={{ gridColumn: "span 3" }}>
                  <span style={labelStyle()}>State</span>
                  <select value={form.shipping_state} onChange={(e) => setField("shipping_state", e.target.value)} style={inputBaseStyle()}>
                    <option value="">Select</option>
                    {US_STATES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div style={{ gridColumn: "span 3" }}>
                  <span style={labelStyle()}>ZIP</span>
                  <input value={form.shipping_zip} onChange={(e) => setField("shipping_zip", e.target.value)} style={inputBaseStyle()} />
                </div>
              </div>
              {error && <p style={{ color: "red" }}>{error}</p>}

              <button type="submit" style={{ marginTop: 20 }}>
                Continue to Payment
              </button>
            </form>
          </div>
        </section>
      </main>
    </AuthGate>
  );
}