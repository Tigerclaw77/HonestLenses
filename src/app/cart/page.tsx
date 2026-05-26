"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-client";

import Header from "../../components/Header";
import EyeRow from "../../components/cart/EyeRow";
import AuthGate from "@/components/AuthGate";

import { fmtPrice } from "../../lib/cart/formatters";
import { buildQuantityConfig } from "../../lib/cart/quantityConfig";
import type { CartOrder } from "../../lib/cart/types";
import { fetchCart, resolveCart } from "../../lib/cart/api";
import { getLensDisplayName } from "../../lib/cart/display";
import { deriveTotalMonths, type ShippingMethod } from "../../lib/shipping";
import { resolveShipping } from "../../lib/shipping/resolveShipping";
import {
  POSTHOG_EVENTS,
  captureClientException,
  markStepStart,
  track,
} from "@/lib/posthog/client";
import { getCartLensAnalyticsProperties } from "@/lib/posthog/lensMetadata";
import { trackFunnelEvent } from "@/lib/telemetry/funnel";

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

      const previousTotalBoxes =
        (cart?.right_box_count ?? 0) + (cart?.left_box_count ?? 0);
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
        track(
          nextRight + nextLeft === 0
            ? POSTHOG_EVENTS.REMOVED_FROM_CART
            : POSTHOG_EVENTS.CART_QUANTITY_CHANGED,
          {
            ...getCartLensAnalyticsProperties(updated),
            order_id: updated.id,
            source: "cart_quantity_control",
            right_box_count: nextRight,
            left_box_count: nextLeft,
            previous_total_boxes: previousTotalBoxes,
            total_boxes: nextRight + nextLeft,
            cart_value_cents: updated.total_amount_cents ?? null,
            total_cart_value_cents: updated.total_amount_cents ?? null,
            shipping_cents: updated.shipping_cents ?? null,
            supply_duration_months: deriveTotalMonths({
              sku: updated.sku,
              totalBoxes: nextRight + nextLeft,
              right_box_count: nextRight,
              left_box_count: nextLeft,
            }),
          },
        );
        setRightQtyOverride(null);
        setLeftQtyOverride(null);
      } catch (e) {
        console.error("[CartPage] qty update failed", e);
        captureClientException(e, { source: "cart_quantity_change" });
        setError(e instanceof Error ? e.message : "Failed to update quantity.");
      } finally {
        setSyncingQty(false);
      }
    },
    [accessToken, cart?.left_box_count, cart?.right_box_count, syncingQty],
  );

  const handleShippingMethodChange = useCallback(
    async (nextMethod: ShippingMethod) => {
      if (syncingQty || !cart) return;

      const token = accessToken ?? (DEV_MODE ? DEV_ACCESS_TOKEN : null);

      if (!token) {
        setError("Session missing. Please log in again.");
        return;
      }

      const previousMethod = cart.shipping_method ?? "standard";
      if (previousMethod === nextMethod) return;

      const rightCount = cart.rx?.right
        ? (cart.right_box_count ?? defaultPerEye)
        : 0;
      const leftCount = cart.rx?.left
        ? (cart.left_box_count ?? defaultPerEye)
        : 0;
      const selectedTotalBoxes = rightCount + leftCount;
      const selectedTotalMonths = deriveTotalMonths({
        sku: cart.sku,
        totalBoxes: selectedTotalBoxes,
        left_box_count: cart.rx?.left ? leftCount : null,
        right_box_count: cart.rx?.right ? rightCount : null,
      });
      const selectedShipping = resolveShipping({
        manufacturer: cart.manufacturer,
        totalMonths: selectedTotalMonths,
        itemCount: selectedTotalBoxes,
        hasMixedSkus: false,
        shippingMethod: nextMethod,
      }).shippingCents;
      const subtotal = Math.max(
        0,
        (cart.total_amount_cents ?? 0) - (cart.shipping_cents ?? 0),
      );

      track(POSTHOG_EVENTS.SHIPPING_METHOD_SELECTED, {
        order_id: cart.id,
        shipping_method: nextMethod,
        previous_shipping_method: previousMethod,
        subtotal,
        shipping_cents: selectedShipping,
      });

      if (nextMethod === "express") {
        track(POSTHOG_EVENTS.EXPRESS_SHIPPING_SELECTED, {
          order_id: cart.id,
          shipping_method: nextMethod,
          subtotal,
          shipping_cents: selectedShipping,
        });
      }

      setSyncingQty(true);
      setError(null);

      try {
        const updated = await resolveCart(token, {
          shipping_method: nextMethod,
        });

        setCart(updated);
        track(POSTHOG_EVENTS.CHECKOUT_SHIPPING_UPDATED, {
          order_id: updated.id,
          shipping_method: updated.shipping_method ?? "standard",
          subtotal: Math.max(
            0,
            (updated.total_amount_cents ?? 0) - (updated.shipping_cents ?? 0),
          ),
          shipping_cents: updated.shipping_cents ?? null,
        });
      } catch (e) {
        console.error("[CartPage] shipping method update failed", e);
        captureClientException(e, { source: "cart_shipping_method_change" });
        setError(
          e instanceof Error ? e.message : "Failed to update shipping.",
        );
      } finally {
        setSyncingQty(false);
      }
    },
    [accessToken, cart, defaultPerEye, syncingQty],
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

  const rx = cart?.rx;
  const rightEye = rx?.right ?? null;
  const leftEye = rx?.left ?? null;

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
  const shippingMethod: ShippingMethod = cart.shipping_method ?? "standard";

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
          shippingMethod,
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

  const canCheckout = !syncingQty && totalBoxes > 0 && previewTotal > 0;

  /* ---------- Render ---------- */

  const cartUI = (
    <main>
      <section className="content-shell">
        <h1 className="upper content-title">Your Cart</h1>
        <p style={{ color: "#cbd5e1", lineHeight: 1.6, maxWidth: 760 }}>
          Choose the number of boxes for each eye. Supply limits are based on
          your prescription expiration date, and final fulfillment depends on
          prescription verification.
        </p>

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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 10,
                margin: "16px 0",
              }}
            >
              <button
                type="button"
                onClick={() => void handleShippingMethodChange("standard")}
                disabled={syncingQty}
                style={{
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 10,
                  border:
                    shippingMethod === "standard"
                      ? "1px solid #93c5fd"
                      : "1px solid rgba(148,163,184,0.28)",
                  background:
                    shippingMethod === "standard"
                      ? "rgba(37,99,235,0.16)"
                      : "rgba(15,23,42,0.45)",
                  color: "#e2e8f0",
                  cursor: syncingQty ? "not-allowed" : "pointer",
                }}
              >
                <div style={{ fontWeight: 800 }}>Standard Shipping</div>
                <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
                  Most orders arrive within 7-10 business days.
                </div>
              </button>

              <button
                type="button"
                onClick={() => void handleShippingMethodChange("express")}
                disabled={syncingQty}
                style={{
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 10,
                  border:
                    shippingMethod === "express"
                      ? "1px solid #a78bfa"
                      : "1px solid rgba(148,163,184,0.28)",
                  background:
                    shippingMethod === "express"
                      ? "rgba(124,58,237,0.18)"
                      : "rgba(15,23,42,0.45)",
                  color: "#e2e8f0",
                  cursor: syncingQty ? "not-allowed" : "pointer",
                }}
              >
                <div style={{ fontWeight: 800 }}>Express Shipping</div>
                <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
                  Priority processing and expedited shipping where available.
                </div>
                <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
                  Delivery timing may vary based on manufacturer fulfillment and
                  prescription verification.
                </div>
              </button>
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
              markStepStart(`checkout_duration:${cart.id}`);
              void trackFunnelEvent(POSTHOG_EVENTS.CHECKOUT_STARTED, {
                ...getCartLensAnalyticsProperties(cart),
                order_id: cart.id,
                source: "cart",
                cart_value_cents: previewTotal,
                total_cart_value_cents: previewTotal,
                shipping_cents: previewShipping,
                shipping_method: shippingMethod,
                supply_duration_months: totalMonths,
                estimated_annual_supply: totalMonths >= 12,
              });
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
    </>
  );
}
