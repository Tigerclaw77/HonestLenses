"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import Header from "../../components/Header";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const LS_ORDER_ID = "rx_upload_order_id";
const LS_FILENAME = "rx_upload_filename";

export default function UploadPrescriptionPage() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [existingFilename, setExistingFilename] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🔁 Restore local state on mount
  useEffect(() => {
    const savedOrderId = localStorage.getItem(LS_ORDER_ID);
    const savedFilename = localStorage.getItem(LS_FILENAME);

    if (savedOrderId) setExistingOrderId(savedOrderId);
    if (savedFilename) setExistingFilename(savedFilename);
  }, []);

  async function submitUpload() {
    if (!file || loading) return;

    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      // 1️⃣ Create or reuse order
      let orderId = existingOrderId;

      if (!orderId) {
        const orderRes = await fetch("/api/orders", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const orderBody = await orderRes.json();

        if (!orderRes.ok || !orderBody.orderId) {
          throw new Error(orderBody.error || "Order creation failed");
        }

        orderId = orderBody.orderId;

        if (!orderId) {
          throw new Error("orderId missing when attempting to persist");
        }

        localStorage.setItem(LS_ORDER_ID, orderId);
      }

      // 2️⃣ Upload file
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch(`/api/orders/${orderId}/rx-upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!uploadRes.ok) {
        const body = await uploadRes.json();
        throw new Error(body.error || "Upload failed");
      }

      // 3️⃣ Persist success + clear transient state
      localStorage.setItem(LS_FILENAME, file.name);

      // Optional: clear after success so repeat visits are clean
      // localStorage.removeItem(LS_ORDER_ID);
      // localStorage.removeItem(LS_FILENAME);

      router.push("/checkout");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header variant="shop" />

      <main>
        <section className="content-shell">
          <h1 className="upper content-title">Upload Prescription</h1>

          <p className="content-lead">
            Upload a photo or PDF of your valid contact lens prescription. We’ll
            verify it before fulfillment.
          </p>

          <div className="order-card">
            {existingFilename && !file && (
              <p style={{ marginBottom: 12, opacity: 0.85 }}>
                Previously selected: <strong>{existingFilename}</strong>
              </p>
            )}

            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                setFile(selected);
                if (selected) {
                  localStorage.setItem(LS_FILENAME, selected.name);
                }
              }}
            />

            <button
              className="primary-btn"
              onClick={submitUpload}
              disabled={!file || loading}
            >
              {loading ? "Uploading…" : "Continue to checkout"}
            </button>

            {error && <p className="order-error">{error}</p>}
          </div>

          <p className="order-fineprint">
            Uploaded prescriptions are reviewed for accuracy before lenses ship.
          </p>

          <div className="order-actions">
            <Link href="/enter-prescription" className="ghost-link">
              Enter prescription manually instead
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
