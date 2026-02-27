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
import { SKU_BOX_DURATION_MONTHS } from "../../lib/pricing/skuDefaults";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MIN_DAYS_FOR_ANNUAL_UPSELL = 150;
const FLAT_SHIPPING_CENTS_UNDER_ANNUAL = 1000;

function safeRemainingDays(expires: string) {
  if (!expires) return 0;
  const t = new Date(expires).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((t - Date.now()) / MS_PER_DAY);
}

export default function CartPage() {
  const router = useRouter();

  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [syncingQty, setSyncingQty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartOrder | null>(null);

  const [showShippingModal, setShowShippingModal] = useState(false);

  const [rightQtyOverride, setRightQtyOverride] = useState<number | null>(null);
  const [leftQtyOverride, setLeftQtyOverride] = useState<number | null>(null);

  /* ---------- Derived ---------- */

  const expires = cart?.rx?.expires ?? "";
  const sku = cart?.sku ?? "";

  const quantityConfig = useMemo(() => {
    if (!expires || !sku) return null;
    return buildQuantityConfig(expires, sku);
  }, [expires, sku]);

  const remainingDays = useMemo(() => safeRemainingDays(expires), [expires]);

  const defaultPerEye = quantityConfig?.defaultPerEye ?? 1;
  const quantityOptions = quantityConfig?.options ?? [1, 2, 3, 4, 6, 8];
  const durationLabel = quantityConfig?.durationLabel ?? "box";

  const durationMonths =
    sku && SKU_BOX_DURATION_MONTHS[sku] ? SKU_BOX_DURATION_MONTHS[sku] : 1;

  /* ---------- Qty change ---------- */

  const handleQtyChange = useCallback(
    async (nextRight: number, nextLeft: number) => {
      if (syncingQty) return;
      if (!accessToken) {
        setError("Session missing. Please log in again.");
        return;
      }

      setSyncingQty(true);
      setError(null);

      try {
        const updated = await resolveCart(accessToken, {
          right_box_count: nextRight,
          left_box_count: nextLeft,
          box_count: nextRight + nextLeft,
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

        const {
          data: { session },
        } = await supabase.auth.getSession();

        // AuthGate should prevent this in practice, but keep it safe.
        if (!session) {
          if (!alive) return;
          setAccessToken(null);
          setCart(null);
          setError("Please log in to view your cart.");
          setLoading(false);
          return;
        }

        if (!alive) return;
        setAccessToken(session.access_token);

        const initial = await fetchCart(session.access_token);
        if (!alive) return;

        if (!initial) {
          setError("No active cart found.");
          setLoading(false);
          return;
        }

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
  }, []);

  /* ---------- CV Block Detection ---------- */

  const rx = cart?.rx;
  const rightEye = rx?.right ?? null;
  const leftEye = rx?.left ?? null;

  const hasCVLens =
    rightEye?.lens_id?.startsWith("CV") || leftEye?.lens_id?.startsWith("CV");

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
      <AuthGate>
        <>
          <Header variant="shop" />
          <main className="content-shell">
            <p className="order-error">{error ?? "Cart unavailable."}</p>
          </main>
        </>
      </AuthGate>
    );
  }

  /* ---------- RX ---------- */

  const rightLensName = rightEye
    ? getLensDisplayName(rightEye.lens_id, cart.sku)
    : "Unknown Lens";

  const leftLensName = leftEye
    ? getLensDisplayName(leftEye.lens_id, cart.sku)
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

  /* ---------- Annual supply logic ---------- */

  const rightMonths = rightEye ? effectiveRight * durationMonths : 0;
  const leftMonths = leftEye ? effectiveLeft * durationMonths : 0;

  const isAnnualPerEye =
    (!rightEye || rightMonths >= 12) && (!leftEye || leftMonths >= 12);

  const previewShipping =
    totalBoxes > 0
      ? isAnnualPerEye
        ? 0
        : FLAT_SHIPPING_CENTS_UNDER_ANNUAL
      : 0;

  const showFreeShipUpsell =
    remainingDays >= MIN_DAYS_FOR_ANNUAL_UPSELL &&
    totalBoxes > 0 &&
    !isAnnualPerEye;

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

  return (
    <AuthGate>
      <>
        <Header variant="shop" />

        <main>
          <section className="content-shell">
            <h1 className="upper content-title">Your Cart</h1>

            <div className="order-card hl-cart">
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
                  <span>Subtotal</span>
                  <span>{fmtPrice(previewSubtotal)}</span>
                </div>

                <div className="hl-summary-row">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span>Shipping</span>

                    {!isAnnualPerEye && totalBoxes > 0 && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: "#a78bfa",
                          letterSpacing: "0.2px",
                        }}
                      >
                        Annual supplies ship free
                      </span>
                    )}
                  </div>

                  <span>
                    {previewShipping === 0 ? "Free" : fmtPrice(previewShipping)}
                  </span>
                </div>

                {showFreeShipUpsell && (
                  <div className="hl-summary-row" style={{ fontSize: 12 }}>
                    <span />
                    <button
                      type="button"
                      onClick={() => setShowShippingModal(true)}
                      style={{
                        textDecoration: "underline",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "inherit",
                        padding: 0,
                      }}
                    >
                      How to get free shipping
                    </button>
                  </div>
                )}

                <div className="hl-summary-row hl-summary-total">
                  <span>Total</span>
                  <span>{fmtPrice(previewTotal)}</span>
                </div>
              </div>

              <button
                className="primary-btn hl-checkout-cta"
                onClick={() => router.push("/shipping")}
                disabled={!canCheckout}
              >
                Continue to checkout
              </button>
            </div>
          </section>
        </main>

        {showShippingModal && (
          <div
            onClick={() => setShowShippingModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "90%",
                maxWidth: 420,
                background: "#111",
                borderRadius: 12,
                padding: "28px 24px",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              }}
            >
              <h3 style={{ marginBottom: 12 }}>Free Shipping</h3>
              <p style={{ color: "#e5e7eb", lineHeight: 1.5 }}>
                Free shipping is available when you order a 12-month supply for
                the eye(s) you&apos;re purchasing.
              </p>

              <button
                type="button"
                onClick={() => setShowShippingModal(false)}
                style={{
                  marginTop: 16,
                  width: "100%",
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {hasCVLens && (
          <ComingSoonOverlay
            brand="CooperVision"
            onClose={() => router.push("/")}
          />
        )}
      </>
    </AuthGate>
  );
}