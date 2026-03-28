"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-client";
// import AuthGate from "@/components/AuthGate";

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
        console.log("NO SESSION ON SHIPPING");
        return;
      }

      console.log("SHIPPING USER:", session.user.id);

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

      console.log("FOUND ORDER:", data.id);

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
    if (!/^\S+@\S+\.\S+$/.test(form.shipping_email.trim()))
      return "Enter a valid email address.";
    if (!form.shipping_address1.trim()) return "Enter street address.";
    if (!form.shipping_city.trim()) return "Enter city.";
    if (!form.shipping_state.trim()) return "Select state.";
    if (!form.shipping_zip.trim()) return "Enter ZIP code.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!order) {
      console.log("BLOCKED: no order");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      console.log("BLOCKED: no session");
      return;
    }

    const v = validate();
    if (v) {
      console.log("BLOCKED: validation", v);
      setError(v);
      return;
    }

    setSubmitting(true);
    setError(null);

    console.log("SUBMIT SHIPPING → ORDER:", order.id);

    const res = await fetch(`/api/orders/${order.id}/shipping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      console.log("BLOCKED: API failed");
      setError("Failed to save shipping.");
      setSubmitting(false);
      return;
    }

    console.log("SHIPPING SAVED — NAVIGATING");

    router.push("/checkout");
  }

  if (loading) return <main className="content-shell">Loading…</main>;

  return (
    <main>
      <section className="content-shell">
        <h1 className="upper content-title">Shipping Information</h1>

        <form onSubmit={handleSubmit}>
          {/* keep your existing form UI unchanged */}

          {error && <p style={{ color: "red" }}>{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Continue to Payment"}
          </button>
        </form>
      </section>
    </main>
  );
}
