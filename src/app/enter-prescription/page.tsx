"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import Header from "../../components/Header";
import AddSelector from "../../components/AddSelector";
import { resolveAddOptions } from "../../lib/resolveAddOptions";
import ColorSelector from "../../components/ColorSelector";
import { getColorOptions } from "../../data/lensColors";
import { lenses } from "../../data/lenses";

/* =========================
   Types
========================= */

type EyeRxDraft = {
  lensId: string;
  sph: string;
  cyl: string;
  axis: string;
  add: string;
  bc: string;
  color: string;
};

type RxDraft = {
  right: EyeRxDraft;
  left: EyeRxDraft;
  expires: string;
};

type EyeRx = {
  lens_id?: string | null;
  sphere: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
  // NOTE: color not currently stored in rx payload in your version.
  // If you later decide to store it, add: color?: string;
};

type RxPayload = {
  expires: string;
  right?: EyeRx;
  left?: EyeRx;
};

/* =========================
   Numeric Formatters
========================= */

// Base Curve: tenths only (8.4, 8.6)
function formatBC(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "";
  return value.toFixed(1);
}

// SPH / CYL / ADD: hundredths (−1.25, +2.00)
function formatHundredths(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "";
  return value.toFixed(2);
}

/* =========================
   Supabase
========================= */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/* =========================
   Constants
========================= */

const LS_RX_DRAFT = "hl_rx_draft_v1";
const LS_ORDER_ID = "hl_active_order_id";

const CYL_OPTIONS = (() => {
  const values: number[] = [];
  for (let v = -0.75; v >= -6.0; v -= 0.5) {
    values.push(Number(v.toFixed(2)));
  }
  return values;
})();

const AXIS_OPTIONS = Array.from({ length: 18 }, (_, i) => (i + 1) * 10);

/* =========================
   Component
========================= */

export default function EnterPrescriptionPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  /* =========================
     State – Right Eye
  ========================= */
  const [rightLensId, setRightLensId] = useState("");
  const [rightSph, setRightSph] = useState("");
  const [rightCyl, setRightCyl] = useState("");
  const [rightAxis, setRightAxis] = useState("");
  const [rightAdd, setRightAdd] = useState("");
  const [rightColor, setRightColor] = useState("");
  const [rightBC, setRightBC] = useState("");

  /* =========================
     State – Left Eye
  ========================= */
  const [leftLensId, setLeftLensId] = useState("");
  const [leftSph, setLeftSph] = useState("");
  const [leftCyl, setLeftCyl] = useState("");
  const [leftAxis, setLeftAxis] = useState("");
  const [leftAdd, setLeftAdd] = useState("");
  const [leftColor, setLeftColor] = useState("");
  const [leftBC, setLeftBC] = useState("");

  const [expires, setExpires] = useState("");

  const rightLens = lenses.find((l) => l.nameID === rightLensId);
  const leftLens = lenses.find((l) => l.nameID === leftLensId);

  const rightColorOptions = getColorOptions(rightLens?.name);
  const leftColorOptions = getColorOptions(leftLens?.name);

  const PLANO_HINT = "0.00 indicates Plano (PL)";
  const EmptyHint = () => <div className="rx-hint">&nbsp;</div>;

  function restoreDraftFromLocalStorage() {
    const raw = localStorage.getItem(LS_RX_DRAFT);

    // Even if there's no draft, we still mark hydrated
    if (!raw) {
      setHydrated(true);
      return;
    }

    try {
      const parsed: RxDraft = JSON.parse(raw);

      setRightLensId(parsed.right.lensId);
      setRightSph(parsed.right.sph);
      setRightCyl(parsed.right.cyl);
      setRightAxis(parsed.right.axis);
      setRightAdd(parsed.right.add);
      setRightBC(parsed.right.bc);
      setRightColor(parsed.right.color);

      setLeftLensId(parsed.left.lensId);
      setLeftSph(parsed.left.sph);
      setLeftCyl(parsed.left.cyl);
      setLeftAxis(parsed.left.axis);
      setLeftAdd(parsed.left.add);
      setLeftBC(parsed.left.bc);
      setLeftColor(parsed.left.color);

      setExpires(parsed.expires);
    } catch {
      // ignore malformed drafts
    } finally {
      setHydrated(true);
    }
  }

  useEffect(() => {
    restoreDraftFromLocalStorage();
  }, []);

  /* =========================
     Effects - Lens constraints
  ========================= */

  useEffect(() => {
    if (rightLens && !rightLens.toric) {
      setRightCyl("");
      setRightAxis("");
    }
    if (rightLens && !rightLens.multifocal) {
      setRightAdd("");
    }
    if (rightLens && !rightLens.multiBC) {
      setRightBC(formatBC(rightLens.baseCurves[0]));
    }
    if (rightLens) {
      setRightColor("");
    }
  }, [rightLens]); // keep exactly as you had

  useEffect(() => {
    if (leftLens && !leftLens.toric) {
      setLeftCyl("");
      setLeftAxis("");
    }
    if (leftLens && !leftLens.multifocal) {
      setLeftAdd("");
    }
    if (leftLens && !leftLens.multiBC) {
      setLeftBC(formatBC(leftLens.baseCurves[0]));
    }
    if (leftLens) {
      setLeftColor("");
    }
  }, [leftLens]); // keep exactly as you had

  /* =========================
     Restore/Hydrate Strategy
     1) Try server rx using LS_ORDER_ID (NO creating new order here)
     2) Fallback to local draft
  ========================= */

  // const [hydratedFromServer, setHydratedFromServer] = useState(false);

  /* =========================
     Persist to localStorage
========================= */

  useEffect(() => {
    if (!hydrated) return;

    const draft: RxDraft = {
      right: {
        lensId: rightLensId,
        sph: rightSph,
        cyl: rightCyl,
        axis: rightAxis,
        add: rightAdd,
        bc: rightBC,
        color: rightColor,
      },
      left: {
        lensId: leftLensId,
        sph: leftSph,
        cyl: leftCyl,
        axis: leftAxis,
        add: leftAdd,
        bc: leftBC,
        color: leftColor,
      },
      expires,
    };

    localStorage.setItem(LS_RX_DRAFT, JSON.stringify(draft));
  }, [
    hydrated,
    rightLensId,
    rightSph,
    rightCyl,
    rightAxis,
    rightAdd,
    rightBC,
    rightColor,
    leftLensId,
    leftSph,
    leftCyl,
    leftAxis,
    leftAdd,
    leftBC,
    leftColor,
    expires,
  ]);

  /* =========================
     Submit
  ========================= */

  async function submitRx() {
    if (loading) return;
    setError(null);

    const hasRight = rightSph !== "";
    const hasLeft = leftSph !== "";

    if (!hasRight && !hasLeft) {
      setError("Please enter a prescription for at least one eye.");
      return;
    }

    if (!expires) {
      setError("Please enter your prescription expiration date.");
      return;
    }

    // Color validation stays exactly where you had it (before posting rx)
    if (hasRight && rightColorOptions.length > 0 && !rightColor) {
      setError("Please select a color for the right eye.");
      return;
    }

    if (hasLeft && leftColorOptions.length > 0 && !leftColor) {
      setError("Please select a color for the left eye.");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      // ✅ Use stable orderId from localStorage if present
      // ✅ If missing, create/reuse order and STORE it (same pattern as upload-prescription)
      let orderId = localStorage.getItem(LS_ORDER_ID);

      if (!orderId) {
        const orderRes = await fetch("/api/orders", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const orderBody = await orderRes.json();

        if (!orderRes.ok || !orderBody.orderId) {
          throw new Error(orderBody.error || "Failed to create order");
        }

        orderId = orderBody.orderId as string;
        localStorage.setItem(LS_ORDER_ID, orderId);
      }

      if (!orderId) {
        throw new Error("orderId missing");
      }

      const rx: RxPayload = { expires };

      if (hasRight && rightLens) {
        rx.right = {
          lens_id: rightLensId,
          sphere: Number(rightSph),
          ...(rightLens.toric && {
            cylinder: Number(rightCyl),
            axis: Number(rightAxis),
          }),
          ...(rightLens.multifocal && { add: rightAdd }),
          base_curve: Number(rightBC),
        };
      }

      if (hasLeft && leftLens) {
        rx.left = {
          lens_id: leftLensId,
          sphere: Number(leftSph),
          ...(leftLens.toric && {
            cylinder: Number(leftCyl),
            axis: Number(leftAxis),
          }),
          ...(leftLens.multifocal && { add: leftAdd }),
          base_curve: Number(leftBC),
        };
      }

      const rxRes = await fetch(`/api/orders/${orderId}/rx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(rx),
      });

      if (!rxRes.ok) {
        const body = await rxRes.json();
        throw new Error(body.error || "Prescription submission failed");
      }

      // ✅ IMPORTANT: DO NOT clear draft here.
      // If user hits back from checkout, they still expect the form to be there.
      // Clear draft only after payment capture (checkout step 5) or explicit “Reset” button later.

      router.push("/checkout");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function copyRightToLeft() {
    if (!rightLensId) return;

    setLeftLensId(rightLensId);
    setLeftSph(rightSph);
    setLeftCyl(rightCyl);
    setLeftAxis(rightAxis);
    setLeftAdd(rightAdd);
    setLeftBC(rightBC);
    setLeftColor(rightColor);
  }

  function copyLeftToRight() {
    if (!leftLensId) return;

    setRightLensId(leftLensId);
    setRightSph(leftSph);
    setRightCyl(leftCyl);
    setRightAxis(leftAxis);
    setRightAdd(leftAdd);
    setRightBC(leftBC);
    setRightColor(leftColor);
  }

  /* =========================
     Render
  ========================= */

  return (
    <>
      <Header variant="shop" />

      <main>
        <section className="content-shell">
          <h1 className="upper content-title">Enter Prescription</h1>

          <div className="order-card">
            <p className="form-hint">
              Use <strong>0.00</strong> for <em>PL / Plano</em>.
            </p>

            {/* ===== RIGHT EYE ===== */}
            <div className="rx-eye-header">
              <h3 className="rx-eye-title">Right Eye (OD)</h3>

              <button
                type="button"
                className="copy-eye-btn"
                disabled={!rightLensId}
                onClick={copyRightToLeft}
              >
                Copy to left eye
              </button>
            </div>

            <div className="rx-eye">
              <div className="rx-grid rx-grid-top">
                <div className="rx-field">
                  <select
                    className="lens-select"
                    value={rightLensId}
                    onChange={(e) => setRightLensId(e.target.value)}
                  >
                    <option value="">Select lens</option>
                    {lenses.map((l) => (
                      <option key={l.nameID} value={l.nameID}>
                        {l.brand} — {l.name}
                      </option>
                    ))}
                  </select>
                  <EmptyHint />
                </div>

                <div className="rx-field">
                  <input
                    type="number"
                    step="0.25"
                    placeholder="Sphere*"
                    value={rightSph}
                    onChange={(e) =>
                      setRightSph(
                        e.target.value === ""
                          ? ""
                          : formatHundredths(Number(e.target.value)),
                      )
                    }
                  />
                  <div className="rx-hint">{PLANO_HINT}</div>
                </div>

                {rightLens?.toric && (
                  <>
                    <div className="rx-field">
                      <select
                        className="rx-select"
                        value={rightCyl}
                        onChange={(e) => setRightCyl(e.target.value)}
                      >
                        <option value="">CYL</option>
                        {CYL_OPTIONS.map((v) => (
                          <option key={v} value={formatHundredths(v)}>
                            {formatHundredths(v)}
                          </option>
                        ))}
                      </select>
                      <EmptyHint />
                    </div>

                    <div className="rx-field">
                      <select
                        className="rx-select"
                        value={rightAxis}
                        onChange={(e) => setRightAxis(e.target.value)}
                      >
                        <option value="">Axis</option>
                        {AXIS_OPTIONS.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <EmptyHint />
                    </div>
                  </>
                )}

                {rightLens?.multifocal && (
                  <div className="rx-field">
                    <AddSelector
                      value={rightAdd ?? ""}
                      onChange={setRightAdd}
                      options={resolveAddOptions(rightLens)}
                    />
                    <EmptyHint />
                  </div>
                )}

                {rightLens &&
                  (rightLens.multiBC ? (
                    <div className="rx-field">
                      <select
                        className="rx-select"
                        value={rightBC}
                        onChange={(e) => setRightBC(e.target.value)}
                      >
                        <option value="">BC</option>
                        {rightLens.baseCurves.map((bc) => (
                          <option key={bc} value={formatBC(bc)}>
                            {formatBC(bc)}
                          </option>
                        ))}
                      </select>
                      <EmptyHint />
                    </div>
                  ) : (
                    <div className="rx-field">
                      <input
                        value={formatBC(rightLens.baseCurves[0])}
                        disabled
                      />
                      <EmptyHint />
                    </div>
                  ))}

                {rightLens && rightColorOptions.length > 0 && (
                  <div className="rx-field">
                    <ColorSelector
                      value={rightColor}
                      onChange={setRightColor}
                      options={rightColorOptions}
                    />
                    <EmptyHint />
                  </div>
                )}
              </div>
            </div>

            <div className="rx-divider" />

            {/* ===== LEFT EYE ===== */}
            <div className="rx-eye-header">
              <h3 className="rx-eye-title">Left Eye (OS)</h3>

              <button
                type="button"
                className="copy-eye-btn"
                disabled={!leftLensId}
                onClick={copyLeftToRight}
              >
                Copy to right eye
              </button>
            </div>

            <div className="rx-eye">
              <div className="rx-grid rx-grid-top">
                <div className="rx-field">
                  <select
                    className="lens-select"
                    value={leftLensId}
                    onChange={(e) => setLeftLensId(e.target.value)}
                  >
                    <option value="">Select lens</option>
                    {lenses.map((l) => (
                      <option key={l.nameID} value={l.nameID}>
                        {l.brand} — {l.name}
                      </option>
                    ))}
                  </select>
                  <EmptyHint />
                </div>

                <div className="rx-field">
                  <input
                    type="number"
                    step="0.25"
                    placeholder="Sphere*"
                    value={leftSph}
                    onChange={(e) =>
                      setLeftSph(
                        e.target.value === ""
                          ? ""
                          : formatHundredths(Number(e.target.value)),
                      )
                    }
                  />
                  <div className="rx-hint">{PLANO_HINT}</div>
                </div>

                {leftLens?.toric && (
                  <>
                    <div className="rx-field">
                      <select
                        className="rx-select"
                        value={leftCyl}
                        onChange={(e) => setLeftCyl(e.target.value)}
                      >
                        <option value="">CYL</option>
                        {CYL_OPTIONS.map((v) => (
                          <option key={v} value={formatHundredths(v)}>
                            {formatHundredths(v)}
                          </option>
                        ))}
                      </select>
                      <EmptyHint />
                    </div>

                    <div className="rx-field">
                      <select
                        className="rx-select"
                        value={leftAxis}
                        onChange={(e) => setLeftAxis(e.target.value)}
                      >
                        <option value="">Axis</option>
                        {AXIS_OPTIONS.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <EmptyHint />
                    </div>
                  </>
                )}

                {leftLens?.multifocal && (
                  <div className="rx-field">
                    <AddSelector
                      value={leftAdd ?? ""}
                      onChange={setLeftAdd}
                      options={resolveAddOptions(leftLens)}
                    />
                    <EmptyHint />
                  </div>
                )}

                {leftLens &&
                  (leftLens.multiBC ? (
                    <div className="rx-field">
                      <select
                        className="rx-select"
                        value={leftBC}
                        onChange={(e) => setLeftBC(e.target.value)}
                      >
                        <option value="">BC</option>
                        {leftLens.baseCurves.map((bc) => (
                          <option key={bc} value={formatBC(bc)}>
                            {formatBC(bc)}
                          </option>
                        ))}
                      </select>
                      <EmptyHint />
                    </div>
                  ) : (
                    <div className="rx-field">
                      <input
                        value={formatBC(leftLens.baseCurves[0])}
                        disabled
                      />
                      <EmptyHint />
                    </div>
                  ))}

                {leftLens && leftColorOptions.length > 0 && (
                  <div className="rx-field">
                    <ColorSelector
                      value={leftColor}
                      onChange={setLeftColor}
                      options={leftColorOptions}
                    />
                    <EmptyHint />
                  </div>
                )}
              </div>
            </div>

            <div className="rx-divider" />

            <div className="rx-footer-row">
              <div className="rx-expiration">
                <label htmlFor="expires">Expiration date</label>
                <input
                  id="expires"
                  type="date"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  required
                />
              </div>

              <button
                className="primary-btn"
                onClick={submitRx}
                disabled={loading}
              >
                {loading ? "Processing…" : "Continue to checkout"}
              </button>
            </div>

            {error && <p className="order-error">{error}</p>}
          </div>

          <div className="order-actions">
            <Link href="/upload-prescription" className="ghost-link">
              Upload prescription instead
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
