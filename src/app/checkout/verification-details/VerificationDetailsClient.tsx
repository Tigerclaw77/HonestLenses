"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase-client";

type DetailsResponse = {
  ok?: boolean;
  error?: string;
  passive_deadline_at?: string;
};

type DraftOrPendingOrder = {
  id: string;
  status: string;
  total_amount_cents: number | null;

  shipping_first_name: string | null;
  shipping_last_name: string | null;
  shipping_address1: string | null;
  shipping_address2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;

  verification_status?: string | null;
};

type FormState = {
  patient_first_name: string;
  patient_middle_name: string;
  patient_last_name: string;
  patient_dob: string;

  patient_address1: string;
  patient_address2: string;
  patient_city: string;
  patient_state: string;
  patient_zip: string;

  prescriber_name: string;
  prescriber_practice: string;
  prescriber_city: string;
  prescriber_state: string;
  prescriber_phone: string;
  prescriber_email: string;

  allow_lower_price_adjustment: boolean;
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
    border: "1px solid rgba(148, 163, 184, 0.35)",
    outline: "none",
    fontSize: 14,
    background: "#f8fafc",
    transition: "box-shadow 140ms ease, border-color 140ms ease",
  };
}

function labelStyle(): React.CSSProperties {
  return {
    display: "block",
    fontSize: 12,
    color: "#cbd5e1",
    marginBottom: 6,
    letterSpacing: 0.2,
    fontWeight: 650,
  };
}

function focusRingStyle(): React.CSSProperties {
  return {
    borderColor: "#2563eb",
    boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.35)",
    background: "#ffffff",
  };
}

function formatDobMMDDYYYY(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);

  let out = mm;
  if (digits.length >= 3) out += " / " + dd;
  if (digits.length >= 5) out += " / " + yyyy;
  return out;
}

function dobToIso(display: string): string {
  const digits = display.replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

function normalizePhone(s: string) {
  return s.replace(/[^\d]/g, "");
}

function clearManualRxLocalStorage() {
  // wipe all manual RX keys
  localStorage.removeItem("rx_manual_order_draft");
  localStorage.removeItem("rx_manual_form_state");
  localStorage.removeItem("rx_upload_order_d");
}

export default function VerificationDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [order, setOrder] = useState<DraftOrPendingOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    patient_first_name: "",
    patient_middle_name: "",
    patient_last_name: "",
    patient_dob: "",
    patient_address1: "",
    patient_address2: "",
    patient_city: "",
    patient_state: "",
    patient_zip: "",
    prescriber_name: "",
    prescriber_practice: "",
    prescriber_city: "",
    prescriber_state: "",
    prescriber_phone: "",
    prescriber_email: "",
    allow_lower_price_adjustment: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          const current = window.location.pathname + window.location.search;

          router.replace(`/login?next=${encodeURIComponent(current)}`);
          return;
        }

        if (!orderId) {
          setError("Missing order id.");
          setLoading(false);
          return;
        }

        setAccessToken(session.access_token);

        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .select(
            `
            id,
            status,
            total_amount_cents,
            shipping_first_name,
            shipping_last_name,
            shipping_address1,
            shipping_address2,
            shipping_city,
            shipping_state,
            shipping_zip,
            verification_status
          `,
          )
          .eq("user_id", session.user.id)
          .eq("id", orderId)
          .maybeSingle();

        if (orderError || !orderData) {
          throw new Error("Order not found.");
        }

        if (cancelled) return;

        const typedOrder = orderData as DraftOrPendingOrder;

        const isUploaded =
          typedOrder.verification_status === "verified" ||
          typedOrder.verification_status === "ocr_verified" ||
          typedOrder.verification_status === "upload_verified";

        if (isUploaded) {
          clearManualRxLocalStorage();
          router.replace("/checkout/success?mode=uploaded");
          return;
        }

        setOrder(typedOrder);

        setForm((prev) => ({
          ...prev,
          patient_first_name: typedOrder.shipping_first_name ?? "",
          patient_last_name: typedOrder.shipping_last_name ?? "",
          patient_address1: typedOrder.shipping_address1 ?? "",
          patient_address2: typedOrder.shipping_address2 ?? "",
          patient_city: typedOrder.shipping_city ?? "",
          patient_state: typedOrder.shipping_state ?? "",
          patient_zip: typedOrder.shipping_zip ?? "",
        }));

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load.");
        setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [router, orderId]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.patient_first_name.trim()) return "Enter first name.";
    if (!form.patient_last_name.trim()) return "Enter last name.";
    if (!dobToIso(form.patient_dob)) return "Enter DOB (MM / DD / YYYY).";
    if (!form.patient_address1.trim()) return "Enter address.";
    if (!form.patient_city.trim()) return "Enter city.";
    if (!form.patient_state.trim()) return "Choose state.";
    if (!form.patient_zip.trim()) return "Enter ZIP.";
    if (!form.prescriber_name.trim() && !form.prescriber_practice.trim())
      return "Enter doctor or practice name.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accessToken || submitting) return;

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      patient_first_name: form.patient_first_name.trim(),
      patient_middle_name: form.patient_middle_name.trim(),
      patient_last_name: form.patient_last_name.trim(),
      patient_dob: dobToIso(form.patient_dob),
      patient_address1: form.patient_address1.trim(),
      patient_address2: form.patient_address2.trim(),
      patient_city: form.patient_city.trim(),
      patient_state: form.patient_state.trim(),
      patient_zip: form.patient_zip.trim(),
      prescriber_name: form.prescriber_name.trim(),
      prescriber_practice: form.prescriber_practice.trim(),
      prescriber_city: form.prescriber_city.trim(),
      prescriber_state: form.prescriber_state.trim(),
      prescriber_phone: normalizePhone(form.prescriber_phone),
      prescriber_email: form.prescriber_email.trim(),
      allow_lower_price_adjustment: form.allow_lower_price_adjustment,
    };

    const res = await fetch("/api/verification/details", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const body: DetailsResponse = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body?.error || "Submission failed.");
      setSubmitting(false);
      return;
    }

    clearManualRxLocalStorage();

    if (body.passive_deadline_at) {
      router.replace(
        `/checkout/success?deadline=${encodeURIComponent(
          body.passive_deadline_at,
        )}`,
      );
    } else {
      router.replace("/checkout/success");
    }
  }

  if (loading) return <main className="content-shell">Loading…</main>;

  if (error && !order) {
    return (
      <main className="content-shell">
        <p className="order-error">{error}</p>
      </main>
    );
  }

  return (
    <main>
      <section className="content-shell">
        <h1 className="upper content-title">
          Final Step — Prescription Verification
        </h1>

        <div className="hl-card">
          <form onSubmit={handleSubmit}>
            {/* Patient */}
            <h2
              style={{
                fontSize: 22,
                fontWeight: 900,
                marginBottom: 14,
                color: "#ffffff",
              }}
            >
              Patient Information
            </h2>
            <p style={{ color: "#cbd5e1", marginTop: -4, marginBottom: 18 }}>
              Please enter the patient’s name exactly as it appears on the
              prescription.
            </p>

            <div className="hl-grid">
              {/* Desktop proportions: First(3) MI(1) Last(4) DOB(4) */}
              <div className="col" style={{ gridColumn: "span 3" }}>
                <span style={labelStyle()}>First name</span>
                <input
                  value={form.patient_first_name}
                  onChange={(e) =>
                    setField("patient_first_name", e.target.value)
                  }
                  placeholder="First"
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "patient_first_name"
                      ? focusRingStyle()
                      : {}),
                  }}
                  onFocus={() => setFocusKey("patient_first_name")}
                  onBlur={() => setFocusKey(null)}
                  autoComplete="given-name"
                />
              </div>

              <div className="col" style={{ gridColumn: "span 1" }}>
                <span style={labelStyle()}>MI</span>
                <input
                  value={form.patient_middle_name}
                  onChange={(e) =>
                    setField("patient_middle_name", e.target.value)
                  }
                  placeholder="M"
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "patient_middle_name"
                      ? focusRingStyle()
                      : {}),
                  }}
                  onFocus={() => setFocusKey("patient_middle_name")}
                  onBlur={() => setFocusKey(null)}
                  autoComplete="additional-name"
                  maxLength={2}
                />
              </div>

              <div className="col" style={{ gridColumn: "span 4" }}>
                <span style={labelStyle()}>Last name</span>
                <input
                  value={form.patient_last_name}
                  onChange={(e) =>
                    setField("patient_last_name", e.target.value)
                  }
                  placeholder="Last"
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "patient_last_name"
                      ? focusRingStyle()
                      : {}),
                  }}
                  onFocus={() => setFocusKey("patient_last_name")}
                  onBlur={() => setFocusKey(null)}
                  autoComplete="family-name"
                />
              </div>

              {/* DOB: masked text to avoid the calendar icon overlap problem */}
              <div className="col" style={{ gridColumn: "span 4" }}>
                <span style={labelStyle()}>DOB</span>
                <input
                  value={form.patient_dob}
                  onChange={(e) =>
                    setField("patient_dob", formatDobMMDDYYYY(e.target.value))
                  }
                  placeholder="MM / DD / YYYY"
                  inputMode="numeric"
                  style={{
                    ...inputBaseStyle(),
                    letterSpacing: 0.2,
                    ...(focusKey === "patient_dob" ? focusRingStyle() : {}),
                  }}
                  onFocus={() => setFocusKey("patient_dob")}
                  onBlur={() => setFocusKey(null)}
                />
              </div>

              <div className="col" style={{ gridColumn: "span 12" }}>
                <span style={labelStyle()}>Address line 1</span>
                <input
                  value={form.patient_address1}
                  onChange={(e) => setField("patient_address1", e.target.value)}
                  placeholder="Street address"
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "patient_address1"
                      ? focusRingStyle()
                      : {}),
                  }}
                  onFocus={() => setFocusKey("patient_address1")}
                  onBlur={() => setFocusKey(null)}
                  autoComplete="address-line1"
                />
              </div>

              <div className="col" style={{ gridColumn: "span 12" }}>
                <span style={labelStyle()}>Address line 2</span>
                <input
                  value={form.patient_address2}
                  onChange={(e) => setField("patient_address2", e.target.value)}
                  placeholder="Apt / Suite (optional)"
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "patient_address2"
                      ? focusRingStyle()
                      : {}),
                  }}
                  onFocus={() => setFocusKey("patient_address2")}
                  onBlur={() => setFocusKey(null)}
                  autoComplete="address-line2"
                />
              </div>

              <div className="col" style={{ gridColumn: "span 6" }}>
                <span style={labelStyle()}>City</span>
                <input
                  value={form.patient_city}
                  onChange={(e) => setField("patient_city", e.target.value)}
                  placeholder="City"
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "patient_city" ? focusRingStyle() : {}),
                  }}
                  onFocus={() => setFocusKey("patient_city")}
                  onBlur={() => setFocusKey(null)}
                  autoComplete="address-level2"
                />
              </div>

              <div className="col" style={{ gridColumn: "span 3" }}>
                <span style={labelStyle()}>State</span>
                <select
                  value={form.patient_state}
                  onChange={(e) => setField("patient_state", e.target.value)}
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "patient_state" ? focusRingStyle() : {}),
                  }}
                  onFocus={() => setFocusKey("patient_state")}
                  onBlur={() => setFocusKey(null)}
                  autoComplete="address-level1"
                >
                  <option value="">Select</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col" style={{ gridColumn: "span 3" }}>
                <span style={labelStyle()}>ZIP</span>
                <input
                  value={form.patient_zip}
                  onChange={(e) => setField("patient_zip", e.target.value)}
                  placeholder="ZIP"
                  style={{
                    ...inputBaseStyle(),
                    ...(focusKey === "patient_zip" ? focusRingStyle() : {}),
                  }}
                  onFocus={() => setFocusKey("patient_zip")}
                  onBlur={() => setFocusKey(null)}
                  autoComplete="postal-code"
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 6,
                marginBottom: 18,
                padding: "12px 14px",
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "rgba(148, 163, 184, 0.18)",
                color: "#cbd5e1",
                fontSize: 13,
                background: "rgba(2, 6, 23, 0.35)",
              }}
            >
              <strong style={{ color: "#ffffff" }}>Tip:</strong> For fastest
              approval, use the same name and address your doctor has on file.
            </div>

            <div className="hl-divider" />

            {/* Prescriber */}
            <div className="hl-light-panel">
              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  marginBottom: 6,
                  color: "#0f172a",
                }}
              >
                Your Eye Doctor
              </h3>

              <div className="hl-helper">
                Please supply enough information to help us identify your doctor
                or their office.
                <br />
                <strong>At minimum:</strong> doctor name and/or practice name.
              </div>

              <div className="hl-grid" style={{ marginBottom: 0 }}>
                <div className="col" style={{ gridColumn: "span 6" }}>
                  <label style={{ ...labelStyle(), color: "#1e293b" }}>
                    Doctor name
                  </label>
                  <input
                    value={form.prescriber_name}
                    onChange={(e) =>
                      setField("prescriber_name", e.target.value)
                    }
                    placeholder="Dr. John Smith"
                    style={{
                      ...inputBaseStyle(),
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "rgba(15,23,42,0.12)",
                      ...(focusKey === "prescriber_name"
                        ? focusRingStyle()
                        : {}),
                    }}
                    onFocus={() => setFocusKey("prescriber_name")}
                    onBlur={() => setFocusKey(null)}
                  />
                </div>

                <div className="col" style={{ gridColumn: "span 6" }}>
                  <label style={{ ...labelStyle(), color: "#1e293b" }}>
                    Practice name (optional)
                  </label>
                  <input
                    value={form.prescriber_practice}
                    onChange={(e) =>
                      setField("prescriber_practice", e.target.value)
                    }
                    placeholder="Family Vision Center"
                    style={{
                      ...inputBaseStyle(),
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "rgba(15,23,42,0.12)",
                      ...(focusKey === "prescriber_practice"
                        ? focusRingStyle()
                        : {}),
                    }}
                    onFocus={() => setFocusKey("prescriber_practice")}
                    onBlur={() => setFocusKey(null)}
                  />
                </div>

                <div className="col" style={{ gridColumn: "span 4" }}>
                  <label style={{ ...labelStyle(), color: "#1e293b" }}>
                    Phone (optional)
                  </label>
                  <input
                    value={form.prescriber_phone}
                    onChange={(e) =>
                      setField("prescriber_phone", e.target.value)
                    }
                    placeholder="(555) 555-5555"
                    style={{
                      ...inputBaseStyle(),
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "rgba(15,23,42,0.12)",
                      ...(focusKey === "prescriber_phone"
                        ? focusRingStyle()
                        : {}),
                    }}
                    onFocus={() => setFocusKey("prescriber_phone")}
                    onBlur={() => setFocusKey(null)}
                    inputMode="tel"
                  />
                </div>

                <div className="col" style={{ gridColumn: "span 4" }}>
                  <label style={{ ...labelStyle(), color: "#1e293b" }}>
                    City (optional)
                  </label>
                  <input
                    value={form.prescriber_city}
                    onChange={(e) =>
                      setField("prescriber_city", e.target.value)
                    }
                    placeholder="City"
                    style={{
                      ...inputBaseStyle(),
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "rgba(15,23,42,0.12)",
                      ...(focusKey === "prescriber_city"
                        ? focusRingStyle()
                        : {}),
                    }}
                    onFocus={() => setFocusKey("prescriber_city")}
                    onBlur={() => setFocusKey(null)}
                  />
                </div>

                <div className="col" style={{ gridColumn: "span 4" }}>
                  <label style={{ ...labelStyle(), color: "#1e293b" }}>
                    State (optional)
                  </label>
                  <select
                    value={form.prescriber_state}
                    onChange={(e) =>
                      setField("prescriber_state", e.target.value)
                    }
                    style={{
                      ...inputBaseStyle(),
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "rgba(15,23,42,0.12)",
                      ...(focusKey === "prescriber_state"
                        ? focusRingStyle()
                        : {}),
                    }}
                    onFocus={() => setFocusKey("prescriber_state")}
                    onBlur={() => setFocusKey(null)}
                  >
                    <option value="">Select</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col" style={{ gridColumn: "span 12" }}>
                  <label style={{ ...labelStyle(), color: "#1e293b" }}>
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    value={form.prescriber_email}
                    onChange={(e) =>
                      setField("prescriber_email", e.target.value)
                    }
                    placeholder="Email"
                    style={{
                      ...inputBaseStyle(),
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "rgba(15,23,42,0.12)",
                      ...(focusKey === "prescriber_email"
                        ? focusRingStyle()
                        : {}),
                    }}
                    onFocus={() => setFocusKey("prescriber_email")}
                    onBlur={() => setFocusKey(null)}
                  />
                </div>
              </div>
            </div>

            {/* Optional adjustment */}
            <div
              style={{
                marginTop: 18,
                marginBottom: 18,
                padding: "16px 16px",
                borderRadius: 14,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "rgba(37, 99, 235, 0.35)",
                background: "rgba(37, 99, 235, 0.08)",
              }}
            >
              <div
                style={{ fontWeight: 900, color: "#ffffff", marginBottom: 8 }}
              >
                Optional: Faster & Lower-Cost Approval
              </div>

              <label
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  color: "#e2e8f0",
                  fontSize: 14,
                  lineHeight: 1.35,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.allow_lower_price_adjustment}
                  onChange={(e) =>
                    setField("allow_lower_price_adjustment", e.target.checked)
                  }
                  style={{ marginTop: 3 }}
                />
                <span>
                  If my doctor reduces the quantity or switches to a lower-cost
                  equivalent, go ahead and adjust my order and charge the lower
                  amount automatically.
                  <div style={{ marginTop: 6, fontSize: 13, color: "#cbd5e1" }}>
                    We will never increase your price without your approval.
                  </div>
                </span>
              </label>
            </div>

            {error && (
              <p style={{ marginTop: 12, color: "#f87171", fontWeight: 700 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !accessToken}
              style={{
                marginTop: 14,
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
              {submitting ? "Sending…" : "Send to Doctor"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
