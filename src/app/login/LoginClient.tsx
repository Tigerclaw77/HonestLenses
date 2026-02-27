"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.replace(next ?? "/");
      }
    }

    checkSession();
  }, [router, next]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const redirectTo = `${window.location.origin}/auth/callback${
      next ? `?next=${encodeURIComponent(next)}` : ""
    }`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Check your email for a secure access link.");
    }

    setLoading(false);
  }

  console.log("LOGIN CLIENT V2 RENDERED");

  return (
    <main className="hl-login-shell">
      <div className="hl-login-card">
        <div className="hl-login-header">
          <div className="hl-login-brand">HONEST LENSES</div>
          <h1 className="hl-login-title">Secure Sign In</h1>
          <p className="hl-login-subtitle">
            We’ll email you a one-time secure login link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="hl-login-form">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            className="hl-login-input"
          />

          <button type="submit" disabled={loading} className="hl-login-button">
            {loading ? "Sending…" : "Continue with Email"}
          </button>
        </form>

        {message && <p className="hl-login-message">{message}</p>}

        <div className="hl-login-footer">
          Secure • Prescription Verified • Optometrist-Owned
        </div>
      </div>

      <style>{`
        .hl-login-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;

          position: fixed;
          inset: 0;

          background:
            linear-gradient(
            rgba(5, 10, 25, 0.88),
            rgba(5, 10, 25, 0.88)
            ),
            radial-gradient(
            1400px 900px at 50% 35%,
            rgba(79, 70, 229, 0.05),
            transparent 60%
            ),
            linear-gradient(180deg, #060913 0%, #0d1628 100%);
        }

        .hl-login-card {
          width: 100%;
          max-width: 460px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 16px;
          padding: 48px 42px;
          box-shadow: 0 50px 120px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(12px);
          animation: hlFadeIn 480ms ease-out;
        }

        @keyframes hlFadeIn {
          from {
          opacity: 0;
          transform: translateY(6px);
         }
         to {
          opacity: 1;
          transform: translateY(0);
         }
        }

        .hl-login-brand {
          font-size: 11px;
          letter-spacing: 0.2em;
          color: rgba(148, 163, 184, 0.6);
          margin-bottom: 16px;
        }

        .hl-login-title {
          font-size: 36px;
          font-weight: 650;
          color: #ffffff;
          margin: 0 0 12px 0;
          letter-spacing: -0.02em;
        }

        .hl-login-subtitle {
          font-size: 14px;
          color: rgba(148, 163, 184, 0.75);
          margin-bottom: 36px;
        }

        .hl-login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .hl-login-input {
          padding: 16px 18px;
          font-size: 15px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.85);
          color: #ffffff;
          outline: none;
          transition: border 0.2s ease, box-shadow 0.2s ease;
        }

        .hl-login-input:focus {
          border: 1px solid #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
        }

        .hl-login-button {
          padding: 18px;
          font-size: 15px;
          font-weight: 600;
          border-radius: 14px;
          border: none;
          color: #ffffff;
          background: #3730a3;
          box-shadow: 0 10px 40px rgba(55, 48, 163, 0.35);
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 20px 60px rgba(79, 70, 229, 0.35);
        }

        .hl-login-button:hover {
          background: #4338ca;
          transform: translateY(-1px);
        }

        .hl-login-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .hl-login-message {
          margin-top: 18px;
          font-size: 14px;
          color: rgba(148, 163, 184, 0.85);
        }

        .hl-login-footer {
          margin-top: 34px;
          font-size: 12px;
          color: rgba(148, 163, 184, 0.55);
          letter-spacing: 0.05em;
        }
      `}</style>
    </main>
  );
}
