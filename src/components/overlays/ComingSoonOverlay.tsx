"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import type { FormEvent } from "react";

type Props = {
  brand?: string;
  onClose?: () => void;
  inline?: boolean;
};

export default function ComingSoonOverlay({
  brand = "CooperVision",
  onClose,
  inline = false,
}: Props) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const cleaned = email.trim().toLowerCase();

    // Allow skipping email entirely
    if (!cleaned) {
      setSubmitted(true);
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await supabase
        .from("product_interest")
        .upsert(
          {
            email: cleaned,
            brand,
            last_seen: new Date().toISOString(),
          },
          { onConflict: "email,brand" }
        );

      if (error) throw error;

      setSubmitted(true);
    } catch (err) {
      console.error("[ComingSoonOverlay]", err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (onClose) {
      onClose();
      return;
    }

    router.back();
  }

  return (
    <div className={inline ? "hl-overlay-inline" : "hl-overlay"}>
      <div className="hl-overlay-card">
        <h2>
          {brand} lenses
          <br />
          coming soon
        </h2>

        {!submitted ? (
          <>
            <p>
              We’re working to add direct supply access for these lenses.
              <br />
              You can leave your email if you’d like to be notified if they
              become available.
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="Email for notification (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />

              <button
                type="submit"
                className="hl-primary-btn"
                disabled={submitting}
              >
                {submitting ? "Saving…" : "Notify me"}
              </button>
            </form>
          </>
        ) : (
          <p>Thanks — we’ll let you know.</p>
        )}

        <button onClick={handleClose} className="hl-secondary-btn">
          Go back
        </button>
      </div>

      <style jsx>{`
        .hl-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .hl-overlay-inline {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 5;
        }

        .hl-overlay-card {
          background: #111;
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 40px 32px;
          border-radius: 18px;
          max-width: 440px;
          width: 90%;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        }

        h2 {
          margin-bottom: 16px;
          font-weight: 600;
          letter-spacing: 0.4px;
          line-height: 1.25;
        }

        p {
          font-size: 14px;
          opacity: 0.8;
          line-height: 1.6;
          margin-bottom: 20px;
        }

        input {
          width: 100%;
          margin: 14px 0 18px;
          padding: 12px;
          background: #0b0b0b;
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
        }

        .hl-primary-btn {
          background: #cfc7ff;
          color: #000;
          padding: 10px 18px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 500;
        }

        .hl-primary-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .hl-secondary-btn {
          margin-top: 22px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          font-size: 13px;
        }

        .hl-secondary-btn:hover {
          color: #fff;
        }
      `}</style>
    </div>
  );
}