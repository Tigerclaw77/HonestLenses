"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase-client";

interface SmallScreenOverlayProps {
  onContinue?: () => void;
}

export default function SmallScreenOverlay({
  onContinue,
}: SmallScreenOverlayProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (submitting) return;

    setErrorMsg(null);
    setSubmitting(true);

    const cleaned = email.trim().toLowerCase();

    try {
      // Optional email — allow skip
      if (!cleaned) {
        setSubmitted(true);
        return;
      }

      const { data, error } = await supabase
        .from("site_reminders") // <-- new table
        .upsert(
          {
            email: cleaned,
            context: "small_screen",
            last_seen: new Date().toISOString(),
          },
          { onConflict: "email,context" },
        )
        .select();

      console.log("INSERT RESULT:", { data, error });
      if (error) throw error;

      setSubmitted(true);
    } catch (err: unknown) {
      console.error("[SmallScreenOverlay]", err);

      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="hl-overlay">
      <div className="hl-overlay-card">
        <h2>
          Continue on a
          <br />
          larger screen
        </h2>

        {!submitted ? (
          <>
            <p>
              Contact lens ordering requires <br />
              careful prescription review.
              <br />
              <br />
              We’ll send you a quick link so you can <br />
              return later from a desktop.
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="Email for reminder (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />

              <button
                type="submit"
                className="hl-primary-btn"
                disabled={submitting}
              >
                {submitting ? "Saving…" : "Send reminder"}
              </button>
            </form>

            {errorMsg && <div className="hl-error">{errorMsg}</div>}
          </>
        ) : (
          <>
            <div className="hl-success">✓ Reminder saved</div>
            <p>You can revisit Honest Lenses anytime from a larger screen.</p>
          </>
        )}

        <button className="hl-secondary-btn" onClick={() => onContinue?.()}>
          Continue anyway
        </button>
      </div>

      <style jsx>{`
        .hl-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
        }

        .hl-overlay-card {
          background: #0b0b0b;
          border: 1px solid rgba(207, 199, 255, 0.25);
          padding: 40px 32px;
          border-radius: 18px;
          max-width: 440px;
          width: 90%;
          text-align: center;
          color: #ddd;
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
          opacity: 0.85;
          line-height: 1.6;
          margin-bottom: 20px;
        }

        input {
          width: 100%;
          margin: 14px 0 18px;
          padding: 12px;
          background: #111;
          color: #fff;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .hl-primary-btn {
          background: #cfc7ff;
          color: #000;
          padding: 10px 18px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 500;
          width: 100%;
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

        .hl-success {
          color: #cfc7ff;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .hl-error {
          margin-top: 10px;
          color: #ff6b6b;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}
