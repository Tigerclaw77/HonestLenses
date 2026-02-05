"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import Header from "../../components/Header";

const LS_ORDER_ID = "rx_upload_order_id";
const LS_FILENAME = "rx_upload_filename";

export default function UploadPrescriptionPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  function handleFileSelected(selected: File | null) {
    if (!selected) return;
    setFile(selected);
    localStorage.setItem(LS_FILENAME, selected.name);
  }

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

      // 3️⃣ Persist success + filename
      localStorage.setItem(LS_FILENAME, file.name);

      router.push("/cart");
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
          <h2 className="rx-choice-title">
            How would you like to provide your prescription?
          </h2>

          <div className="rx-choice-grid">
            {/* Upload / Camera / Drag & Drop */}
            <div
              className={`rx-choice-card rx-dropzone ${file ? "has-file" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files?.[0] ?? null;
                handleFileSelected(dropped);
              }}
            >
              <h3>Upload or take a photo</h3>
              <p className="rx-upload-subtitle">
                Upload a photo or PDF of your prescription.
              </p>

              <p className="rx-upload-hint">
                Drag & drop here, or tap to upload / take a photo
              </p>

              {existingFilename && !file && (
                <p className="rx-filename">
                  Previously selected: <strong>{existingFilename}</strong>
                </p>
              )}

              {file && (
                <p className="rx-filename">
                  Selected file: <strong>{file.name}</strong>
                </p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) =>
                  handleFileSelected(e.target.files?.[0] ?? null)
                }
                hidden
              />

              <button
                className="primary-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  submitUpload();
                }}
                disabled={!file || loading}
              >
                {loading ? "Uploading…" : "Continue to cart"}
              </button>

              {error && <p className="order-error">{error}</p>}
            </div>

            {/* Manual entry */}
            <div className="rx-choice-card rx-choice-manual">
              <h3>Enter it manually</h3>
              <p className="rx-manual-subtitle">
                Don’t have it with you right now?
              </p>

              <p className="rx-manual-hint">
                You can enter your prescription details manually in a short
                form.
              </p>

              <Link href="/enter-prescription" className="primary-btn">
                Enter prescription manually
              </Link>
            </div>
          </div>

          <p className="order-fineprint">
            Prescriptions are reviewed for accuracy before lenses ship.
          </p>
        </section>
      </main>
    </>
  );
}
