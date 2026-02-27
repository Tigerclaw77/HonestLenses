"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const next = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // If already logged in, go where intended
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
      setMessage("Check your email for the login link.");
    }

    setLoading(false);
  }

  return (
    <main style={outerShell}>
      <div style={card}>
        <h1 style={title}>Continue</h1>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              ...buttonStyle,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Sending link…" : "Continue with Email"}
          </button>
        </form>

        {message && <p style={messageStyle}>{message}</p>}
      </div>
    </main>
  );
}

/* =========================
   Styles
========================= */

const outerShell: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "linear-gradient(180deg, #05070f 0%, #0b1220 100%)",
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: "420px",
  background: "rgba(15, 23, 42, 0.85)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 20,
  padding: "40px 32px",
  boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
  backdropFilter: "blur(6px)",
};

const title: React.CSSProperties = {
  fontSize: 42,
  fontWeight: 800,
  color: "#ffffff",
  marginBottom: 32,
  letterSpacing: "-0.02em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "16px 18px",
  fontSize: 16,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(255,255,255,0.04)",
  color: "#ffffff",
  outline: "none",
  marginBottom: 18,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "18px",
  fontSize: 16,
  fontWeight: 800,
  borderRadius: 14,
  border: "none",
  color: "#ffffff",
  background: "linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)",
  boxShadow: "0 20px 50px rgba(37,99,235,0.35)",
};

const messageStyle: React.CSSProperties = {
  marginTop: 18,
  fontSize: 14,
  color: "#94a3b8",
};