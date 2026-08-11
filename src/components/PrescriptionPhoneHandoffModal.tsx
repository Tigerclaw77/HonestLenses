"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import ModalShell from "./ModalShell";

type Handoff = {
  handoffId: string;
  expiresAt: string;
  qrDataUrl: string;
};

type Props = {
  isOpen: boolean;
  orderId: string | null;
  accessToken: string | null;
  onClose: () => void;
  onComplete: (orderId: string) => void;
};

export default function PrescriptionPhoneHandoffModal({
  isOpen,
  orderId,
  accessToken,
  onClose,
  onComplete,
}: Props) {
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const generate = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    setExpired(false);
    try {
      const response = await fetch("/api/prescription-handoffs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ orderId }),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<Handoff> & { error?: string };
      if (!response.ok || !body.handoffId || !body.expiresAt || !body.qrDataUrl) {
        throw new Error(body.error ?? "Unable to generate a mobile upload code.");
      }
      setHandoff(body as Handoff);
      setSecondsLeft(Math.max(0, Math.ceil((Date.parse(body.expiresAt) - Date.now()) / 1000)));
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Unable to generate a mobile upload code.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, orderId]);

  useEffect(() => {
    if (!isOpen || !orderId) return;
    setHandoff(null);
    void generate();
  }, [generate, isOpen, orderId]);

  useEffect(() => {
    if (!isOpen || !handoff || expired) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((Date.parse(handoff.expiresAt) - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) setExpired(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expired, handoff, isOpen]);

  useEffect(() => {
    if (!isOpen || !handoff || expired || !orderId) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/prescription-handoffs/${handoff.handoffId}`, {
          cache: "no-store",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        const body = (await response.json().catch(() => ({}))) as { status?: string };
        if (!active) return;
        if (body.status === "completed") onComplete(orderId);
        else if (body.status === "expired") setExpired(true);
      } catch {
        // A transient poll failure is harmless; the next interval retries.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [accessToken, expired, handoff, isOpen, onComplete, orderId]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} labelledBy="phone-handoff-title">
      <div className="modal-body phone-handoff-modal">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2 id="phone-handoff-title">Upload from your phone</h2>
        <p>Scan the QR code with your phone&apos;s camera. You can take a photo of your prescription or choose an existing photo.</p>
        {loading && <div className="phone-handoff-loading">Generating secure code…</div>}
        {error && <p className="order-error" role="alert">{error}</p>}
        {expired ? (
          <div className="phone-handoff-expired">
            <strong>This QR code has expired.</strong>
            <button type="button" className="phone-handoff-regenerate" onClick={() => void generate()}>
              Generate a new code
            </button>
          </div>
        ) : handoff ? (
          <>
            <div className="phone-handoff-qr">
              <Image src={handoff.qrDataUrl} alt="Secure mobile prescription upload QR code" width={280} height={280} unoptimized />
            </div>
            <p className="phone-handoff-expiry">Expires in {minutes}:{seconds}</p>
          </>
        ) : null}
      </div>
    </ModalShell>
  );
}
