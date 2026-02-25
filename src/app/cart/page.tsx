"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-client";

import Header from "../../components/Header";
import EyeRow from "../../components/cart/EyeRow";

import { fmtPrice } from "../../lib/cart/formatters";
import { buildQuantityConfig } from "../../lib/cart/quantityConfig";
import type { CartOrder } from "../../lib/cart/types";
import { fetchCart, resolveCart } from "../../lib/cart/api";
import { getLensDisplayName } from "../../lib/cart/display";
import { SKU_BOX_DURATION_MONTHS } from "../../lib/pricing/skuDefaults";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MIN_DAYS_FOR_ANNUAL_UPSELL = 150; // your rule
const FLAT_SHIPPING_CENTS_UNDER_ANNUAL = 1000; // $10 under annual

function safeRemainingDays(expires: string) {
  if (!expires) return 0;
  const t = new Date(expires).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((t - Date.now()) / MS_PER_DAY);
}

export default function CartPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [syncingQty, setSyncingQty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartOrder | null>(null);

  const [showShippingModal, setShowShippingModal] = useState(false);

  // UI-only overrides (keeps dropdown stable while we wait for resolve)
  const [rightQtyOverride, setRightQtyOverride] = useState<number | null>(null);
  const [leftQtyOverride, setLeftQtyOverride] = useState<number | null>(null);

  /* ---------- Derived ---------- */

  const expires = cart?.rx?.expires ?? "";
  const sku = cart?.sku ?? "";

  const quantityConfig = useMemo(() => {
    if (!expires || !sku) return null;
    return buildQuantityConfig(expires, sku);
  }, [expires, sku]);

  // ✅ do NOT rely on extra fields that don't exist on QuantityConfig
  const remainingDays = useMemo(() => safeRemainingDays(expires), [expires]);

  const defaultPerEye = quantityConfig?.defaultPerEye ?? 1;
  const quantityOptions = quantityConfig?.options ?? [1, 2, 3, 4, 6, 8];
  const durationLabel = quantityConfig?.durationLabel ?? "box";

  // ✅ IMPORTANT: we need durationMonths for "annual supply" logic.
  // If your buildQuantityConfig already knows it, use it.
  // If not, set this to 1 and you’ll still be correct once buildQuantityConfig includes it.
  const durationMonths =
    sku && SKU_BOX_DURATION_MONTHS[sku] ? SKU_BOX_DURATION_MONTHS[sku] : 1;

  /* ---------- Qty change ---------- */

  const handleQtyChange = useCallback(
    async (nextRight: number, nextLeft: number) => {
      if (syncingQty) return;

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

        // ✅ your resolveCart typing expects box_count (your screenshot showed that)
        const updated = await resolveCart(session.access_token, {
          right_box_count: nextRight,
          left_box_count: nextLeft,
          box_count: nextRight + nextLeft,
        });

        setCart(updated);

        // backend is authoritative, clear overrides after success
        setRightQtyOverride(null);
        setLeftQtyOverride(null);
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

  /* ---------- Annual supply logic (PER EYE, not across order) ---------- */

  const rightMonths = rightEye ? effectiveRight * durationMonths : 0;
  const leftMonths = leftEye ? effectiveLeft * durationMonths : 0;

  const isAnnualPerEye =
    (!rightEye || rightMonths >= 12) && (!leftEye || leftMonths >= 12);

  // shipping is always available, but free only when annual-per-eye
  const previewShipping =
    totalBoxes > 0
      ? isAnnualPerEye
        ? 0
        : FLAT_SHIPPING_CENTS_UNDER_ANNUAL
      : 0;

  // upsell link ONLY when:
  // remainingDays >= 150 AND selected is NOT annual-per-eye
  const showFreeShipUpsell =
    remainingDays >= MIN_DAYS_FOR_ANNUAL_UPSELL &&
    totalBoxes > 0 &&
    !isAnnualPerEye;

  /* ---------- Price math (stable + honest) ---------- */

  const serverShipping =
    typeof cart.shipping_cents === "number" ? cart.shipping_cents : 0;

  const serverTotal =
    typeof cart.total_amount_cents === "number" ? cart.total_amount_cents : 0;

  // serverSubtotal is the best we can do without calling getPrice() on the client
  const serverSubtotal = Math.max(0, serverTotal - serverShipping);

  // Use server box_count if present; otherwise fall back to current UI selection
  const serverBoxCount =
    typeof cart.box_count === "number" && cart.box_count > 0
      ? cart.box_count
      : totalBoxes;

  // Unit price derived from serverSubtotal/serverBoxCount
  const unitPricePerBoxCents =
    serverBoxCount > 0 ? Math.round(serverSubtotal / serverBoxCount) : null;

  const previewSubtotal =
    totalBoxes > 0 && unitPricePerBoxCents !== null
      ? unitPricePerBoxCents * totalBoxes
      : 0;

  const previewTotal = previewSubtotal + previewShipping;

  const canCheckout = !syncingQty && totalBoxes > 0 && previewTotal > 0;

  /* ---------- Render ---------- */

  return (
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
                <span>Shipping</span>
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
              onClick={() => router.push("/shipping")}
              disabled={!canCheckout}
              title={canCheckout ? "" : "Select at least 1 box to continue."}
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
            <h3
              style={{
                marginBottom: 12,
                fontSize: 18,
                letterSpacing: 1,
              }}
            >
              Free Shipping
            </h3>

            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                opacity: 0.9,
                marginBottom: 20,
              }}
            >
              Free shipping is available when you order a 12-month supply for
              the eye(s) you&apos;re purchasing.
              <br />
              <br />
              Increase quantity above to reach an annual supply.
            </p>

            <button
              onClick={() => setShowShippingModal(false)}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "linear-gradient(180deg, #2a2a2a, #1c1c1c)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                color: "#fff",
                fontWeight: 500,
                letterSpacing: 0.5,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "linear-gradient(180deg, #333, #222)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  "linear-gradient(180deg, #2a2a2a, #1c1c1c)";
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
