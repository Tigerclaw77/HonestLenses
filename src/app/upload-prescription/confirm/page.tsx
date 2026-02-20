"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import Header from "../../../components/Header";

type RxForm = {
  patient_name: string;
  dob: string;
  lens_brand: string;
  expiration_date: string;
  doctor_name: string;
  doctor_phone: string;
};

export default function ConfirmPrescriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  const [form, setForm] = useState<RxForm>({
    patient_name: "",
    dob: "",
    lens_brand: "",
    expiration_date: "",
    doctor_name: "",
    doctor_phone: "",
  });

  useEffect(() => {
    async function loadRx() {
      if (!orderId) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const res = await fetch(`/api/orders/${orderId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        setError("Failed to load prescription");
        setLoading(false);
        return;
      }

      const body = await res.json();

      const order = body.order;

      setForm({
        patient_name: order.rx_patient_name ?? "",
        dob: order.rx_dob ?? "",
        lens_brand: order.rx_lens_brand ?? "",
        expiration_date: order.rx_expiration_date ?? "",
        doctor_name: order.rx_doctor_name ?? "",
        doctor_phone: order.rx_doctor_phone ?? "",
      });

      if (order.rx_is_expired) {
        setIsExpired(true);
      }

      setLoading(false);
    }

    loadRx();
  }, [orderId, router]);

  function handleChange(field: keyof RxForm, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSubmit() {
    if (!orderId || saving) return;

    setSaving(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const res = await fetch(
        `/api/orders/${orderId}/rx-confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(form),
        }
      );

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Save failed");
      }

      router.push("/cart");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <Header variant="shop" />
        <main>
          <section className="content-shell">
            <p>Loading prescription…</p>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <Header variant="shop" />

      <main>
        <section className="content-shell">
          <h2>Review your prescription</h2>

          {isExpired && (
            <div className="order-error">
              This prescription appears to be expired. Federal law requires a
              valid prescription before lenses can ship.
            </div>
          )}

          <div className="rx-confirm-grid">
            <label>
              Patient Name
              <input
                value={form.patient_name}
                onChange={(e) =>
                  handleChange("patient_name", e.target.value)
                }
              />
            </label>

            <label>
              Date of Birth
              <input
                type="date"
                value={form.dob}
                onChange={(e) =>
                  handleChange("dob", e.target.value)
                }
              />
            </label>

            <label>
              Lens Brand
              <input
                value={form.lens_brand}
                onChange={(e) =>
                  handleChange("lens_brand", e.target.value)
                }
              />
            </label>

            <label>
              Expiration Date
              <input
                type="date"
                value={form.expiration_date}
                onChange={(e) =>
                  handleChange("expiration_date", e.target.value)
                }
              />
            </label>

            <label>
              Doctor Name
              <input
                value={form.doctor_name}
                onChange={(e) =>
                  handleChange("doctor_name", e.target.value)
                }
              />
            </label>

            <label>
              Doctor Phone
              <input
                value={form.doctor_phone}
                onChange={(e) =>
                  handleChange("doctor_phone", e.target.value)
                }
              />
            </label>
          </div>

          <button
            className="primary-btn"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "Saving…" : "Confirm and continue"}
          </button>

          {error && <p className="order-error">{error}</p>}
        </section>
      </main>
    </>
  );
}