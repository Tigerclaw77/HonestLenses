"use client";

import { FormEvent, useState } from "react";

import { POSTHOG_EVENTS, track } from "@/lib/posthog/client";

import styles from "./conversion.module.css";

export default function SaveCartForm({ cartId }: { cartId: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;

    setLoading(true);
    setMessage(null);
    setError(null);
    track(POSTHOG_EVENTS.SAVE_CART_STARTED, {
      source: "cart",
      order_id: cartId,
    });

    try {
      const response = await fetch("/api/cart/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartId, email }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };

      if (!response.ok || body.ok !== true) {
        setError(body.error ?? "Unable to save your cart right now.");
        return;
      }

      track(POSTHOG_EVENTS.SAVE_CART_COMPLETED, {
        source: "cart",
        order_id: cartId,
      });
      setMessage("Check your email for a secure link to return to your cart.");
      setEmail("");
    } catch {
      setError("Unable to save your cart right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.saveCart} aria-labelledby="save-cart-title">
      <h2 id="save-cart-title">Still thinking it over?</h2>
      <p>Enter your email to save your cart.</p>
      <form onSubmit={handleSubmit} className={styles.saveCartForm}>
        <label className="sr-only" htmlFor="save-cart-email">Email address</label>
        <input
          id="save-cart-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save cart"}
        </button>
      </form>
      <p className={styles.finePrint}>
        No account required. No automatic coupon or marketing subscription.
      </p>
      {message ? <p className={styles.status} role="status">{message}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
