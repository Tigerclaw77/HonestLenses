"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Header from "../../components/Header"; // adjust path if your Header is elsewhere

type UploadedFile = {
  id: string;
  file: File;
};

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export default function OrderPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;

    const next: UploadedFile[] = Array.from(incoming).map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}-${Math.random()
        .toString(16)
        .slice(2)}`,
      file: f,
    }));

    // Keep it simple: append (user can remove)
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((x) => x.id !== id));
  };

  const openPicker = () => {
    inputRef.current?.click();
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const canContinue = files.length > 0;

  return (
    <>
      {/* Use your header variant that hides "Order" if you want.
          For now, treat this as "shop-like" content. */}
      <Header variant="shop" />

      <main>
        <section className="content-shell">
          <h1 className="upper content-title">Order Contacts</h1>

          <p className="content-lead">
            Choose the fastest option if you have a prescription available.
            If you don’t, you can still proceed by entering it manually.
          </p>

          {/* FASTEST PATH */}
          <div className="order-card">
            <div className="order-card-head">
              <h2 className="order-card-title">Fastest: Upload a prescription</h2>
              <p className="order-card-sub">
                Upload a photo or PDF of your contact lens prescription.
              </p>
            </div>

            <div
              className={`upload-zone ${isDragging ? "dragging" : ""}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              role="button"
              tabIndex={0}
              onClick={openPicker}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openPicker();
              }}
              aria-label="Upload prescription"
            >
              <div className="upload-zone-inner">
                <div className="upload-zone-title">
                  Drag &amp; drop here, or click to upload
                </div>
                <div className="upload-zone-hint">
                  PDF, JPG, PNG, HEIC accepted
                </div>
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display: "none" }}
              onChange={(e) => addFiles(e.target.files)}
            />

            {files.length > 0 && (
              <div className="upload-list">
                {files.map((x) => (
                  <div key={x.id} className="upload-item">
                    <div className="upload-item-left">
                      <div className="upload-filename">{x.file.name}</div>
                      <div className="upload-meta">{formatBytes(x.file.size)}</div>
                    </div>

                    <button
                      type="button"
                      className="upload-remove"
                      onClick={() => removeFile(x.id)}
                      aria-label={`Remove ${x.file.name}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="order-actions">
              <button
                type="button"
                className={`primary-btn ${canContinue ? "" : "btn-disabled"}`}
                disabled={!canContinue}
                onClick={() => {
                  // MVP stub: later this navigates into checkout / cart
                  alert("Next step: connect this to checkout/cart.");
                }}
              >
                Continue
              </button>

              <Link href="/" className="ghost-link">
                Back to Home
              </Link>
            </div>

            <p className="order-fineprint">
              If you uploaded a file, keep your original prescription available
              in case your prescriber needs to confirm details.
            </p>
          </div>

          {/* DIVIDER */}
          <div className="order-divider">
            <span>or</span>
          </div>

          {/* MANUAL ENTRY PATH */}
          <div className="order-card">
            <div className="order-card-head">
              <h2 className="order-card-title">Don’t have it handy?</h2>
              <p className="order-card-sub">
                You can enter your prescription manually.
              </p>
            </div>

            <div className="order-actions">
              <Link href="/enter-prescription" className="primary-btn">
                Enter prescription manually
              </Link>

              <Link href="/about" className="ghost-link">
                How it works
              </Link>
            </div>

            <p className="order-fineprint">
              Manually entered prescriptions are verified prior to fulfillment.
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-left">© 2026 Honest Lenses</div>

        <div className="footer-right">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </footer>
    </>
  );
}
