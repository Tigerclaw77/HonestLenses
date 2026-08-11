"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { prepareMobilePrescriptionFile } from "@/lib/mobilePrescriptionImage";

type State = "checking" | "ready" | "uploading" | "complete" | "expired" | "invalid";

export default function PhoneUploadClient() {
  const [token, setToken] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const chooserRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const capability = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    setToken(capability);
  }, []);

  useEffect(() => {
    if (token === null) return;
    if (!token) {
      setState("invalid");
      return;
    }
    let active = true;
    fetch("/api/prescription-handoffs/mobile/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { status?: string };
        if (!active) return;
        if (!response.ok) setState("invalid");
        else if (body.status === "completed") setState("complete");
        else if (body.status === "expired") setState("expired");
        else if (body.status === "uploading") {
          setError("Another upload is still processing. Wait a moment and try again.");
          setState("ready");
        } else setState("ready");
      })
      .catch(() => active && setState("invalid"));
    return () => { active = false; };
  }, [token]);

  async function upload(selected: File | null) {
    if (!selected || state !== "ready") return;
    setState("uploading");
    setError(null);
    try {
      const normalized = await prepareMobilePrescriptionFile(selected);
      const form = new FormData();
      form.set("token", token ?? "");
      form.set("file", normalized);
      const response = await fetch("/api/prescription-handoffs/mobile/upload", {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        if (response.status === 409) setState("expired");
        else {
          setError(body.error ?? "We couldn't upload that photo. Please try again.");
          setState("ready");
        }
        return;
      }
      setState("complete");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "We couldn't prepare that photo. Please try again.",
      );
      setState("ready");
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
      if (chooserRef.current) chooserRef.current.value = "";
    }
  }

  return (
    <main className="phone-upload-shell">
      <section className="phone-upload-card">
        <div className="phone-upload-brand">HONEST LENSES</div>
        {state === "complete" ? (
          <>
            <div className="phone-upload-success" aria-hidden="true">✓</div>
            <h1>Prescription uploaded</h1>
            <p>You can return to your computer to continue your order.</p>
          </>
        ) : state === "expired" ? (
          <>
            <h1>This QR code has expired.</h1>
            <p>Return to your computer and generate a new code.</p>
          </>
        ) : state === "invalid" ? (
          <>
            <h1>Mobile upload unavailable</h1>
            <p>This link is invalid or no longer available. Return to your computer and generate a new code.</p>
          </>
        ) : (
          <>
            <h1>Upload your prescription</h1>
            <p>Photograph the full prescription in good light, or choose an existing image.</p>
            <button
              type="button"
              className="phone-upload-primary"
              disabled={state !== "ready"}
              onClick={() => cameraRef.current?.click()}
            >
              {state === "uploading" ? "Preparing photo…" : "Take photo"}
            </button>
            <button
              type="button"
              className="phone-upload-secondary"
              disabled={state !== "ready"}
              onClick={() => chooserRef.current?.click()}
            >
              Choose photo
            </button>
            <input
              ref={cameraRef}
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => void upload(event.target.files?.[0] ?? null)}
            />
            <input
              ref={chooserRef}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
              onChange={(event) => void upload(event.target.files?.[0] ?? null)}
            />
            {error && <p className="phone-upload-error" role="alert">{error}</p>}
            <p className="phone-upload-privacy">This link can only upload one prescription and expires shortly.</p>
          </>
        )}
      </section>
    </main>
  );
}
