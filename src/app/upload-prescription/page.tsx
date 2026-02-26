"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import Header from "../../components/Header";

const LS_ORDER_ID = "rx_upload_order_id";

type CartResponse = {
  hasCart?: boolean;
  order?: { id: string };
};

type CreateOrderResponse = {
  orderId?: string;
  error?: string;
};

export default function UploadPrescriptionPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileSelected(selected: File | null) {
    if (!selected) return;
    setFile(selected);
  }

  async function getOrCreateDraftOrder(accessToken: string): Promise<string> {
    // Check existing draft/cart first
    const cartRes = await fetch("/api/cart", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (cartRes.ok) {
      const cart: CartResponse = await cartRes.json();
      if (cart.hasCart && cart.order?.id) {
        return cart.order.id;
      }
    }

    // Otherwise create draft order
    const orderRes = await fetch("/api/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const body: CreateOrderResponse = await orderRes.json();

    if (!orderRes.ok || !body.orderId) {
      throw new Error(body.error ?? "Failed to create order");
    }

    return body.orderId;
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

      const orderId = await getOrCreateDraftOrder(session.access_token);
      localStorage.setItem(LS_ORDER_ID, orderId);

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
        const body: { error?: string } = await uploadRes.json();
        throw new Error(body.error ?? "Upload failed");
      }

      await fetch(`/api/orders/${orderId}/rx-ocr`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      router.push(`/upload-prescription/confirm?orderId=${orderId}`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Upload failed");
      }
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
            {/* Upload card */}
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

              {file && (
                <div
                  className="rx-filename"
                  style={{
                    marginBottom: 24,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>
                    Selected file: <strong>{file.name}</strong>
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#f87171",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    ✕
                  </button>
                </div>
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

            {/* Manual entry card */}
            <div className="rx-choice-card rx-choice-manual">
              <h3>Enter it manually</h3>
              <p className="rx-manual-subtitle">
                Don’t have it with you right now?
              </p>

              <p className="rx-manual-hint">
                You can enter your prescription details manually in a short
                form.
              </p>

              <Link
                href="/enter-prescription"
                className="primary-btn"
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  textAlign: "center",
                }}
              >
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