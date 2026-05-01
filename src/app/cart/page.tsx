"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-client";

import Header from "../../components/Header";
import EyeRow from "../../components/cart/EyeRow";
import ComingSoonOverlay from "@/components/overlays/ComingSoonOverlay";
import AuthGate from "@/components/AuthGate";

import { fmtPrice } from "../../lib/cart/formatters";
import { buildQuantityConfig } from "../../lib/cart/quantityConfig";
import type { CartOrder } from "../../lib/cart/types";
import { fetchCart, resolveCart } from "../../lib/cart/api";
import { getLensDisplayName } from "../../lib/cart/display";
import { deriveTotalMonths } from "../../lib/shipping";
import { resolveShipping } from "../../lib/shipping/resolveShipping";

const DEV_MODE =
  process.env.NODE_ENV === "development" && process.env.VERCEL !== "1";

const DEV_ACCESS_TOKEN = "dev-local-token";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function safeRemainingDays(expires: string) {
  if (!expires) return 0;

  const t = new Date(expires).getTime();
  if (Number.isNaN(t)) return 0;

  return Math.floor((t - Date.now()) / MS_PER_DAY);
}

export default function CartPage() {
  const router = useRouter();

  const [accessToken, setAccessToken] = useState<string | null>(
    DEV_MODE ? DEV_ACCESS_TOKEN : null,
  );

  const [loading, setLoading] = useState(true);
  const [syncingQty, setSyncingQty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartOrder | null>(null);

  const [rightQtyOverride, setRightQtyOverride] = useState<number | null>(null);
  const [leftQtyOverride, setLeftQtyOverride] = useState<number | null>(null);

  /* ---------- Derived ---------- */

  const expires = cart?.rx?.expires ?? "";
  const sku = cart?.sku ?? "";

  const quantityConfig = useMemo(() => {
    if (!expires || !sku) return null;

    try {
      return buildQuantityConfig(expires, sku);
    } catch (e) {
      console.error("[CartPage] buildQuantityConfig failed", e);
      return null;
    }
  }, [expires, sku]);

  const remainingDays = useMemo(() => safeRemainingDays(expires), [expires]);

  const defaultPerEye = quantityConfig?.defaultPerEye ?? 1;
  const quantityOptions = quantityConfig?.options ?? [1, 2, 3, 4, 6, 8];
  const durationLabel = quantityConfig?.durationLabel ?? "box";

  /* ---------- Qty change ---------- */

  const handleQtyChange = useCallback(
    async (nextRight: number, nextLeft: number) => {
      if (syncingQty) return;

      const token = accessToken ?? (DEV_MODE ? DEV_ACCESS_TOKEN : null);

      if (!token) {
        setError("Session missing. Please log in again.");
        return;
      }

      setSyncingQty(true);
      setError(null);

      try {
        const updated = await resolveCart(token, {
          right_box_count: nextRight,
          left_box_count: nextLeft,
        });

        setCart(updated);
        setRightQtyOverride(null);
        setLeftQtyOverride(null);
      } catch (e) {
        console.error("[CartPage] qty update failed", e);
        setError(e instanceof Error ? e.message : "Failed to update quantity.");
      } finally {
        setSyncingQty(false);
      }
    },
    [accessToken, syncingQty],
  );

  /* ---------- Initial load ---------- */

  useEffect(() => {
    let alive = true;

    async function loadCart() {
      try {
        setLoading(true);
        setError(null);

        let token: string | null = null;

        if (DEV_MODE) {
          token = DEV_ACCESS_TOKEN;
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          token = session?.access_token ?? null;
        }

        if (!alive) return;

        if (!token) {
          setAccessToken(null);
          setCart(null);
          setError("Please log in to view your cart.");
          setLoading(false);
          return;
        }

        setAccessToken(token);

        const initial = await fetchCart(token);
        if (!alive) return;

        if (!initial) {
          setCart(null);
          setError("No active cart found.");
          setLoading(false);
          return;
        }

        setCart(initial);

        const finalized = await resolveCart(token);
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

    void loadCart();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------- CV Block Detection ---------- */

  const rx = cart?.rx;
  const rightEye = rx?.right ?? null;
  const leftEye = rx?.left ?? null;

  const hasCVLens =
    rightEye?.coreId?.startsWith("CV") || leftEye?.coreId?.startsWith("CV");

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

  const rightLensName = rightEye
    ? getLensDisplayName(rightEye.coreId, cart.sku)
    : "Unknown Lens";

  const leftLensName = leftEye
    ? getLensDisplayName(leftEye.coreId, cart.sku)
    : "Unknown Lens";

  /* ---------- Effective quantities ---------- */

  const storedRight =
    typeof cart.right_box_count === "number" ? cart.right_box_count : null;

  const storedLeft =
    typeof cart.left_box_count === "number" ? cart.left_box_count : null;

  const effectiveRight =
    rightQtyOverride ?? storedRight ?? (rightEye ? defaultPerEye : 0);

  const effectiveLeft =
    leftQtyOverride ?? storedLeft ?? (leftEye ? defaultPerEye : 0);

  const totalBoxes =
    (rightEye ? effectiveRight : 0) + (leftEye ? effectiveLeft : 0);

  /* ---------- Shipping logic ---------- */

  const totalMonths = deriveTotalMonths({
    sku,
    totalBoxes,
    left_box_count: leftEye ? effectiveLeft : null,
    right_box_count: rightEye ? effectiveRight : null,
  });
  const previewShipping =
    totalBoxes > 0
      ? resolveShipping({
          manufacturer: cart.manufacturer,
          totalMonths,
          itemCount: totalBoxes,
          hasMixedSkus: false,
        }).shippingCents
      : 0;

  const showAnnualFreeShippingHint =
    totalMonths < 12 && totalBoxes > 0 && remainingDays >= 150;

  /* ---------- Price math ---------- */

  const serverShipping =
    typeof cart.shipping_cents === "number" ? cart.shipping_cents : 0;

  const serverTotal =
    typeof cart.total_amount_cents === "number" ? cart.total_amount_cents : 0;

  const serverSubtotal = Math.max(0, serverTotal - serverShipping);

  const serverBoxCount =
    typeof cart.box_count === "number" && cart.box_count > 0
      ? cart.box_count
      : totalBoxes;

  const unitPricePerBoxCents =
    serverBoxCount > 0 ? Math.round(serverSubtotal / serverBoxCount) : null;

  const previewSubtotal =
    totalBoxes > 0 && unitPricePerBoxCents !== null
      ? unitPricePerBoxCents * totalBoxes
      : 0;

  const previewTotal = previewSubtotal + previewShipping;

  const canCheckout =
    !syncingQty && totalBoxes > 0 && previewTotal > 0 && !hasCVLens;

  /* ---------- Render ---------- */

  const cartUI = (
    <main>
      <section className="content-shell">
        <h1 className="upper content-title">Your Cart</h1>

        <div className="order-card hl-cart">
          {error && <p className="order-error">{error}</p>}

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
              <span>Subtotal</span>
              <span>{fmtPrice(previewSubtotal)}</span>
            </div>

            <div className="hl-summary-row">
              <span>Shipping</span>
              <span>
                {previewShipping === 0 ? "Free" : fmtPrice(previewShipping)}
              </span>
            </div>

            {showAnnualFreeShippingHint && (
              <div
                style={{
                  fontSize: 12,
                  color: "#c4b5fd",
                  marginTop: 6,
                  textAlign: "right",
                }}
              >
                Free shipping when you update to an annual supply
              </div>
            )}

            <div className="hl-summary-row hl-summary-total">
              <span>Total</span>
              <span>{fmtPrice(previewTotal)}</span>
            </div>
          </div>

          <button
            className="primary-btn hl-checkout-cta"
            onClick={() => {
              if (syncingQty) return;
              router.push("/shipping");
            }}
            disabled={!canCheckout}
          >
            Continue to checkout
          </button>
        </div>
      </section>
    </main>
  );

  return (
    <>
      <Header variant="shop" />

      {DEV_MODE ? cartUI : <AuthGate>{cartUI}</AuthGate>}

      {hasCVLens && (
        <ComingSoonOverlay
          brand="CooperVision"
          onClose={() => router.push("/")}
        />
      )}
    </>
  );
}
