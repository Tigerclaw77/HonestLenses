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

type CartOrder = {
  id: string;
  rx: RxData | null;
  lens_id: string | null;
  box_count: number | null;
  price_per_box_cents: number | null;
  total_amount_cents: number | null;
};

type CartResponse = {
  hasCart: boolean;
  order?: CartOrder;
};

/* =========================
   Helpers
========================= */

function fmtNum(n: number) {
  const abs = Math.abs(n);
  const s = abs.toFixed(2).replace(/\.00$/, "");
  return n < 0 ? `−${s}` : `+${s}`;
}

function fmtPrice(cents?: number | null) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

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
   Rx Display
========================= */

function RxBlock({ rx }: { rx: EyeRx }) {
  const parts = buildRxParts(rx);

  return (
    <div className="hl-rx-block">
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

      {parts.add && (
        <div className="hl-rx-add">
          <span className="hl-rx-add-label">ADD</span>
          <span className="hl-rx-add-value">{parts.add}</span>
        </div>
      )}

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

function EyeRow({
  label,
  lensName,
  rx,
  qty,
  onQty,
  pricePerBox,
  total,
}: {
  label: "RIGHT EYE" | "LEFT EYE";
  lensName: string;
  rx: EyeRx;
  qty: number;
  onQty: (v: number) => void;
  pricePerBox: number | null;
  total: number | null;
}) {
  return (
    <div className="hl-eye">
      <div className="hl-eye-label">{label}</div>
      <div className="hl-eye-lens">{lensName}</div>

      <RxBlock rx={rx} />

      <div className="hl-eye-controls">
        <div className="hl-eye-price">{fmtPrice(pricePerBox)} / box</div>

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

        <div className="hl-eye-total">{fmtPrice(total)}</div>
      </div>
    </div>
  );
}

/* =========================
   Page
========================= */

export default function CartPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartOrder | null>(null);

  const [rightQty, setRightQty] = useState(2);
  const [leftQty, setLeftQty] = useState(2);

  useEffect(() => {
    async function loadCart() {
      console.log("🟢 [CartPage] loadCart START");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        console.log("🟢 [CartPage] session", session?.user?.id);

        if (!session) {
          console.log("🔴 [CartPage] NO SESSION → redirect");
          router.push("/login");
          return;
        }

        const res = await fetch("/api/cart", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const body: CartResponse = await res.json();
        console.log("🟢 [CartPage] /api/cart RESPONSE", body);

        if (!res.ok || !body.hasCart || !body.order) {
          console.log("🔴 [CartPage] NO ACTIVE CART");
          setError("No active cart found.");
          setLoading(false);
          return;
        }

        const order = body.order;

        console.log("🟢 [CartPage] CART ORDER", order);

        const needsResolve =
          order.box_count == null ||
          order.price_per_box_cents == null ||
          order.total_amount_cents === 0;

        console.log("🟡 [CartPage] needsResolve =", needsResolve);

        if (needsResolve) {
          console.log("🟡 [CartPage] POST /api/cart/resolve");

          const resolveRes = await fetch("/api/cart/resolve", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
          });

          let resolveBody: unknown = null;
          try {
            resolveBody = await resolveRes.json();
          } catch {
            resolveBody = "[no json body]";
          }

          console.log("🟡 [CartPage] RESOLVE RESPONSE", {
            status: resolveRes.status,
            body: resolveBody,
          });

          const refreshed = await fetch("/api/cart", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });

          const refreshedBody: CartResponse = await refreshed.json();
          console.log("🟡 [CartPage] REFETCH RESPONSE", refreshedBody);

          setCart(refreshedBody.order ?? null);
        } else {
          setCart(order);
        }

        const qty = order.box_count ?? 2;
        setRightQty(qty);
        setLeftQty(qty);

        setLoading(false);
        console.log("🟢 [CartPage] loadCart DONE");
      } catch (err) {
        console.error("🔴 [CartPage] loadCart ERROR", err);
        setError("Failed to load cart.");
        setLoading(false);
      }
    }

    loadCart();
  }, [router]);

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

  const rx = cart?.rx ?? null;
  const rightEye = rx?.right;
  const leftEye = rx?.left;

  const rightLens = rightEye
    ? lenses.find((l) => l.lens_id === rightEye.lens_id)
    : null;

  const leftLens = leftEye
    ? lenses.find((l) => l.lens_id === leftEye.lens_id)
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
                pricePerBox={cart?.price_per_box_cents ?? null}
                total={cart?.total_amount_cents ?? null}
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
                  pricePerBox={cart?.price_per_box_cents ?? null}
                  total={cart?.total_amount_cents ?? null}
                />
              </>
            )}

            <hr className="hl-divider" />

            <div className="hl-summary">
              <div className="hl-summary-row">
                <span>Total</span>
                <span>{fmtPrice(cart?.total_amount_cents)}</span>
              </div>
            </div>

            <button
              className="primary-btn hl-checkout-cta"
              onClick={() => router.push("/checkout")}
            >
              Continue to checkout
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
