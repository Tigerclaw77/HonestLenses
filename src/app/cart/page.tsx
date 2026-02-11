"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-client";

import Header from "../../components/Header";
import EyeRow from "../../components/cart/EyeRow";

import { fmtPrice } from "../../lib/cart/formatters";
import { buildQuantityConfig } from "../../lib/cart/quantityConfig";
import type { CartOrder } from "../../lib/cart/types";
import { fetchCart, resolveCart } from "../../lib/cart/api";
import { getLensDisplayName } from "../../lib/cart/display";

/* =========================
   Page
========================= */

export default function CartPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [syncingQty, setSyncingQty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartOrder | null>(null);

  // UI-only overrides (keeps dropdown stable during re-fetch)
  const [rightQtyOverride, setRightQtyOverride] = useState<number | null>(null);
  const [leftQtyOverride, setLeftQtyOverride] = useState<number | null>(null);

  // prevents auto-resolve after user interaction
  const hasUserAdjustedQty = useRef(false);

  /* ---------- Derived ---------- */

  const expires = cart?.rx?.expires ?? "";
  const sku = cart?.sku ?? "";

  const quantityConfig = useMemo(() => {
    if (!expires || !sku) return null;
    return buildQuantityConfig(expires, sku);
  }, [expires, sku]);

  /* ---------- Qty change ---------- */

  const handleQtyChange = useCallback(
    async (nextRight: number, nextLeft: number) => {
      if (syncingQty) return;

      hasUserAdjustedQty.current = true;
      setSyncingQty(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }

        const updated = await resolveCart(session.access_token, {
          right_box_count: nextRight,
          left_box_count: nextLeft,
          box_count: nextRight + nextLeft,
        });

        setCart(updated);

        // Keep overrides only if backend echoes something unexpected
        const serverRight =
          typeof updated.right_box_count === "number"
            ? updated.right_box_count
            : null;

        const serverLeft =
          typeof updated.left_box_count === "number"
            ? updated.left_box_count
            : null;

        const serverMatches =
          (serverRight === null || serverRight === nextRight) &&
          (serverLeft === null || serverLeft === nextLeft);

        if (serverMatches) {
          setRightQtyOverride(null);
          setLeftQtyOverride(null);
        } else {
          setRightQtyOverride(nextRight);
          setLeftQtyOverride(nextLeft);
        }
      } catch (e) {
        console.error("[CartPage] qty update failed", e);
        setError(e instanceof Error ? e.message : "Failed to update quantity.");
      } finally {
        setSyncingQty(false);
      }
    },
    [router, syncingQty],
  );

  /* ---------- Initial load ---------- */

  useEffect(() => {
    let alive = true;

    async function loadCart() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }

        const initial = await fetchCart(session.access_token);
        if (!alive) return;

        if (!initial) {
          setError("No active cart found.");
          setLoading(false);
          return;
        }

        // authoritative resolve on load ONLY
        const finalized = await resolveCart(session.access_token);
        if (!alive) return;

        setCart(finalized);
        setLoading(false);
      } catch (err) {
        console.error("[CartPage] load error", err);
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load cart.");
        setLoading(false);
      }
    }

    loadCart();
    return () => {
      alive = false;
    };
  }, [router]);

  /* ---------- Guards ---------- */

  if (loading) {
    return (
      <>
        <Header variant="shop" />
        <main className="content-shell">Loading cart…</main>
      </>
    );
  }

  if (!cart || !cart.rx) {
    return (
      <>
        <Header variant="shop" />
        <main className="content-shell">
          <p className="order-error">{error ?? "Cart unavailable."}</p>
        </main>
      </>
    );
  }

  /* ---------- RX ---------- */

  const rx = cart.rx;
  const rightEye = rx.right ?? null;
  const leftEye = rx.left ?? null;

  const rightLensName = rightEye
    ? getLensDisplayName(rightEye.lens_id, cart.sku)
    : "Unknown Lens";

  const leftLensName = leftEye
    ? getLensDisplayName(leftEye.lens_id, cart.sku)
    : "Unknown Lens";

  /* ---------- Quantities ---------- */

  const defaultPerEye = quantityConfig?.defaultPerEye ?? 1;

  // ✅ Include 0 as an option (but keep the rest of your options)
  const baseOptions = quantityConfig?.options ?? [1, 2, 3, 4, 6, 8];
  const quantityOptions = baseOptions.includes(0) ? baseOptions : [0, ...baseOptions];

  const durationLabel = quantityConfig?.durationLabel ?? "box";

  // allow 0 stored values
  const storedRight =
    typeof cart.right_box_count === "number" ? cart.right_box_count : null;

  const storedLeft =
    typeof cart.left_box_count === "number" ? cart.left_box_count : null;

  const effectiveRight =
    rightQtyOverride ?? storedRight ?? (rightEye ? defaultPerEye : 0);

  const effectiveLeft =
    leftQtyOverride ?? storedLeft ?? (leftEye ? defaultPerEye : 0);

  // ✅ Always compute from effective per-eye qty (prevents stale cart.box_count from lying)
  const totalBoxesFromEyes =
    (rightEye ? effectiveRight : 0) + (leftEye ? effectiveLeft : 0);

  const storedBoxCount =
    typeof cart.box_count === "number" && cart.box_count > 0
      ? cart.box_count
      : totalBoxesFromEyes;

  // derive a unit price from whatever the server last said
  const unitPricePerBoxCents =
    typeof cart.total_amount_cents === "number" && storedBoxCount > 0
      ? Math.round(cart.total_amount_cents / storedBoxCount)
      : null;

  // ✅ UI total that follows the dropdown immediately (even if backend lags)
  const displayTotalCents =
    totalBoxesFromEyes <= 0
      ? 0
      : typeof unitPricePerBoxCents === "number"
        ? unitPricePerBoxCents * totalBoxesFromEyes
        : cart.total_amount_cents ?? 0;

  const canCheckout =
    !syncingQty && totalBoxesFromEyes > 0 && displayTotalCents > 0;

  /* ---------- Render ---------- */

  return (
    <>
      <Header variant="shop" />

      <main>
        <section className="content-shell">
          <h1 className="upper content-title">Your Cart</h1>

          <div className="order-card hl-cart">
            <button
              className="hl-cart-edit"
              onClick={() => router.push("/prescription")}
              disabled={syncingQty}
            >
              Edit prescription
            </button>

            {error ? <p className="order-error">{error}</p> : null}

            {rightEye && (
              <EyeRow
                label="RIGHT EYE"
                lensName={rightLensName}
                rx={rightEye}
                qty={effectiveRight}
                onQty={(v) => {
                  setRightQtyOverride(v);
                  void handleQtyChange(v, effectiveLeft);
                }}
                unitPricePerBoxCents={unitPricePerBoxCents}
                durationLabel={durationLabel}
                quantityOptions={quantityOptions}
                disabled={syncingQty}
              />
            )}

            {leftEye && (
              <>
                <hr className="hl-divider" />
                <EyeRow
                  label="LEFT EYE"
                  lensName={leftLensName}
                  rx={leftEye}
                  qty={effectiveLeft}
                  onQty={(v) => {
                    setLeftQtyOverride(v);
                    void handleQtyChange(effectiveRight, v);
                  }}
                  unitPricePerBoxCents={unitPricePerBoxCents}
                  durationLabel={durationLabel}
                  quantityOptions={quantityOptions}
                  disabled={syncingQty}
                />
              </>
            )}

            <hr className="hl-divider" />

            <div className="hl-summary">
              <div className="hl-summary-row">
                <span>Total</span>
                <span>{fmtPrice(displayTotalCents)}</span>
              </div>

              {syncingQty && (
                <div className="hl-summary-row">
                  <span />
                  <span style={{ fontSize: 12, opacity: 0.8 }}>
                    Updating quantity…
                  </span>
                </div>
              )}
            </div>

            <button
              className="primary-btn hl-checkout-cta"
              onClick={() => router.push("/checkout")}
              disabled={!canCheckout}
              title={
                canCheckout
                  ? ""
                  : "Select at least 1 box to continue."
              }
            >
              Continue to checkout
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
