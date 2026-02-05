"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-client";
import Header from "../../components/Header";
import { lenses } from "../../data/lenses";

/* =========================
   Types
========================= */

type EyeRx = {
  lens_id: string;
  sphere: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
  color?: string;
};

type RxData = {
  expires: string;
  right?: EyeRx;
  left?: EyeRx;
};

type CartResponse = {
  hasCart: boolean;
  order?: {
    id: string;
    rx: RxData | null;
    lens_id: string | null;
    box_count: number | null;
  };
};

/* =========================
   Helpers
========================= */

function fmtNum(n: number) {
  const abs = Math.abs(n);
  const s = abs.toFixed(2).replace(/\.00$/, "");
  return n < 0 ? `−${s}` : `+${s}`;
}

/**
 * Build structured Rx parts instead of a flat string
 */
function buildRxParts(rx: EyeRx) {
  return {
    sphere: fmtNum(rx.sphere),
    cylinder: typeof rx.cylinder === "number" ? fmtNum(rx.cylinder) : null,
    axis: typeof rx.axis === "number" ? rx.axis.toString() : null,
    add: rx.add ?? null,
    color: rx.color ?? null,
  };
}

/* =========================
   Rx Display Block
========================= */

type RxBlockProps = {
  rx: EyeRx;
};

function RxBlock({ rx }: RxBlockProps) {
  const parts = buildRxParts(rx);

  return (
    <div className="hl-rx-block">
      {/* Base Rx */}
      <div className="hl-rx-row">
        <div className="hl-rx-col">
          <div className="hl-rx-label">SPH</div>
          <div className="hl-rx-value">{parts.sphere}</div>
        </div>

        {parts.cylinder && parts.axis && (
          <>
            <div className="hl-rx-col">
              <div className="hl-rx-label">CYL</div>
              <div className="hl-rx-value">{parts.cylinder}</div>
            </div>

            <div className="hl-rx-col">
              <div className="hl-rx-label">AXIS</div>
              <div className="hl-rx-value">{parts.axis}</div>
            </div>
          </>
        )}
      </div>

      {/* ADD power (distinct) */}
      {parts.add && (
        <div className="hl-rx-add">
          <span className="hl-rx-add-label">ADD</span>
          <span className="hl-rx-add-value">{parts.add}</span>
        </div>
      )}

      {/* COLOR (UI only) */}
      {parts.color && (
        <div className="hl-rx-color">
          <span className="hl-rx-color-label">Color</span>
          <span className="hl-rx-color-value">{parts.color}</span>
        </div>
      )}
    </div>
  );
}

/* =========================
   Eye Row
========================= */

type EyeRowProps = {
  label: "RIGHT EYE" | "LEFT EYE";
  lensName: string;
  rx: EyeRx;
  qty: number;
  onQty: (v: number) => void;
};

function EyeRow({ label, lensName, rx, qty, onQty }: EyeRowProps) {
  return (
    <div className="hl-eye">
      <div className="hl-eye-label">{label}</div>

      <div className="hl-eye-lens">{lensName}</div>

      <RxBlock rx={rx} />

      <div className="hl-eye-controls">
        <div className="hl-eye-price">— / box</div>

        <select
          className="hl-eye-select"
          value={qty}
          onChange={(e) => onQty(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 6].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <div className="hl-eye-total">—</div>
      </div>
    </div>
  );
}

/* =========================
   Component
========================= */

export default function CartPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartResponse | null>(null);

  const [rightQty, setRightQty] = useState(2);
  const [leftQty, setLeftQty] = useState(2);

  /* =========================
     Load Cart
  ========================= */

  useEffect(() => {
    async function loadCart() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }

        const res = await fetch("/api/cart", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const body: CartResponse = await res.json();

        if (!res.ok || !body.hasCart || !body.order) {
          setError("No active cart found.");
          setLoading(false);
          return;
        }

        setCart(body);

        const defaultQty = body.order.box_count ?? 2;
        setRightQty(defaultQty);
        setLeftQty(defaultQty);

        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Failed to load cart.");
        setLoading(false);
      }
    }

    loadCart();
  }, [router]);

  /* =========================
     Checkout
  ========================= */

  async function continueToCheckout() {
    if (!cart?.order?.id) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    const box_count = Math.max(rightQty, leftQty);

    const res = await fetch("/api/cart/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ box_count }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Failed to resolve cart.");
      return;
    }

    router.push("/checkout");
  }

  /* =========================
     Render
  ========================= */

  if (loading) {
    return (
      <>
        <Header variant="shop" />
        <main className="content-shell">Loading cart…</main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header variant="shop" />
        <main className="content-shell">
          <p className="order-error">{error}</p>
        </main>
      </>
    );
  }

  const rx = cart?.order?.rx ?? null;
  const rightEye = rx?.right;
  const leftEye = rx?.left;

  const rightLens = rightEye
    ? lenses.find((l) => l.nameID === rightEye.lens_id)
    : null;

  const leftLens = leftEye
    ? lenses.find((l) => l.nameID === leftEye.lens_id)
    : null;

  const rightLensName = rightLens
    ? `${rightLens.brand ? `${rightLens.brand} ` : ""}${rightLens.name}`
    : "Unknown Lens";

  const leftLensName = leftLens
    ? `${leftLens.brand ? `${leftLens.brand} ` : ""}${leftLens.name}`
    : "Unknown Lens";

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
            >
              Edit prescription
            </button>

            {rightEye && (
              <EyeRow
                label="RIGHT EYE"
                lensName={rightLensName}
                rx={rightEye}
                qty={rightQty}
                onQty={setRightQty}
              />
            )}

            {leftEye && (
              <>
                <hr className="hl-divider" />
                <EyeRow
                  label="LEFT EYE"
                  lensName={leftLensName}
                  rx={leftEye}
                  qty={leftQty}
                  onQty={setLeftQty}
                />
              </>
            )}

            <hr className="hl-divider" />

            <div className="hl-summary">
              <div className="hl-summary-row">
                <span>Shipping</span>
                <span>—</span>
              </div>

              <div className="hl-summary-row hl-summary-total">
                <span>Total</span>
                <span>—</span>
              </div>
            </div>

            <p className="hl-note">
              Please review your prescription carefully before checkout.
            </p>

            <button
              className="primary-btn hl-checkout-cta"
              onClick={continueToCheckout}
            >
              Continue to checkout
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
