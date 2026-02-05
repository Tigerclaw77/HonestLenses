"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
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

type EyeFieldErrorMap = {
  lens?: boolean;
  sph?: boolean;
  cyl?: boolean;
  axis?: boolean;
  add?: boolean;
  bc?: boolean;
  color?: boolean;
};

type FieldErrorMap = {
  right?: EyeFieldErrorMap;
  left?: EyeFieldErrorMap;
  expires?: boolean;
  noneEntered?: boolean;
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
   Constants
========================= */

const LS_RX_DRAFT = "hl_rx_draft_v1";

const CYL_OPTIONS = (() => {
  const values: number[] = [];
  for (let v = -0.75; v >= -6.0; v -= 0.5) {
    values.push(Number(v.toFixed(2)));
  }
  return values;
})();

const AXIS_OPTIONS = Array.from({ length: 18 }, (_, i) => (i + 1) * 10);

function validateEye(
  d: EyeRxDraft,
  lensObj: (typeof lenses)[number] | undefined,
  colorOptions: string[],
): EyeFieldErrorMap | null {
  if (!(d.lensId || d.sph || d.cyl || d.axis || d.add || d.bc || d.color))
    return null;

  const e: EyeFieldErrorMap = {};

  // Lens required if anything entered for eye
  if (!d.lensId || !lensObj) e.lens = true;

  // Sphere required once an eye is being entered
  if (!d.sph) e.sph = true;

  // Toric requires CYL + AXIS
  if (lensObj?.toric) {
    if (!d.cyl) e.cyl = true;
    if (!d.axis) e.axis = true;
  }

  // Multifocal requires ADD if options exist
  if (lensObj?.multifocal) {
    const opts = resolveAddOptions(lensObj);
    if (opts.length > 0 && !d.add) e.add = true;
  }

  // Base curve required if multiBC, or if lens has no bc data
  if (lensObj?.multiBC) {
    if (!d.bc) e.bc = true;
  } else {
    const bc0 = lensObj?.baseCurves?.[0];
    if (!bc0) e.bc = true;
  }

  // Color required if options exist
  if (colorOptions.length > 0 && !d.color) e.color = true;

  return Object.keys(e).length ? e : null;
}

/* =========================
   Component
========================= */

export default function EnterPrescriptionPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // After the user clicks Continue once, we keep validation “live”
  // const [didAttemptSubmit, setDidAttemptSubmit] = useState(false);

  // field-level validation state
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});

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

  /* =========================
     Error helpers
  ========================= */

  function hasAnyErrors(map: FieldErrorMap) {
    if (map.noneEntered) return true;
    if (map.expires) return true;
    if (map.right && Object.values(map.right).some(Boolean)) return true;
    if (map.left && Object.values(map.left).some(Boolean)) return true;
    return false;
  }

  function eyeHasErrors(which: "right" | "left") {
    const e = which === "right" ? fieldErrors.right : fieldErrors.left;
    return Boolean(e && Object.values(e).some(Boolean));
  }

  function cls(base: string, isErr?: boolean) {
    return isErr ? `${base} rx-error` : base;
  }

  /* =========================
     Draft restore
  ========================= */

  function restoreDraftFromLocalStorage() {
    const raw = localStorage.getItem(LS_RX_DRAFT);

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
    if (!rightLens) return;

    if (!rightLens.toric) {
      setRightCyl("");
      setRightAxis("");
    }

    if (!rightLens.multifocal) {
      setRightAdd("");
    }

    if (!rightLens.multiBC) {
      const bc0 = rightLens.baseCurves?.[0];
      setRightBC(bc0 ? formatBC(bc0) : "");
    }

    if (
      rightColor &&
      rightColorOptions.length > 0 &&
      !rightColorOptions.includes(rightColor)
    ) {
      setRightColor("");
    }
  }, [rightLens, rightColor, rightColorOptions]);

  useEffect(() => {
    if (!leftLens) return;

    if (!leftLens.toric) {
      setLeftCyl("");
      setLeftAxis("");
    }

    if (!leftLens.multifocal) {
      setLeftAdd("");
    }

    if (!leftLens.multiBC) {
      const bc0 = leftLens.baseCurves?.[0];
      setLeftBC(bc0 ? formatBC(bc0) : "");
    }

    if (
      leftColor &&
      leftColorOptions.length > 0 &&
      !leftColorOptions.includes(leftColor)
    ) {
      setLeftColor("");
    }
  }, [leftLens, leftColor, leftColorOptions]);

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

  async function getOrCreateDraftOrder(accessToken: string): Promise<string> {
    const cartRes = await fetch("/api/cart", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (cartRes.ok) {
      const cart = await cartRes.json();
      if (cart?.hasCart && cart.order?.id) {
        return cart.order.id;
      }
    }

    const orderRes = await fetch("/api/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const body = await orderRes.json();
    if (!orderRes.ok || !body.orderId) {
      throw new Error(body.error || "Failed to create order");
    }

    return body.orderId;
  }

  /* =========================
     Validation (Lens-driven)
  ========================= */

  function isEyeTouched(d: EyeRxDraft) {
    return Boolean(
      d.lensId || d.sph || d.cyl || d.axis || d.add || d.bc || d.color,
    );
  }

  // function validateEye(
  //   d: EyeRxDraft,
  //   lensObj: (typeof lenses)[number] | undefined,
  //   colorOptions: string[],
  // ): EyeFieldErrorMap | null {
  //   if (!isEyeTouched(d)) return null;

  //   const e: EyeFieldErrorMap = {};

  //   // Lens required if anything entered for eye
  //   if (!d.lensId || !lensObj) e.lens = true;

  //   // Sphere required once an eye is being entered
  //   if (!d.sph) e.sph = true;

  //   // Toric requires CYL + AXIS
  //   if (lensObj?.toric) {
  //     if (!d.cyl) e.cyl = true;
  //     if (!d.axis) e.axis = true;
  //   }

  //   // Multifocal requires ADD if options exist
  //   if (lensObj?.multifocal) {
  //     const opts = resolveAddOptions(lensObj);
  //     if (opts.length > 0 && !d.add) e.add = true;
  //   }

  //   // Base curve required if multiBC, or if lens has no bc data
  //   if (lensObj?.multiBC) {
  //     if (!d.bc) e.bc = true;
  //   } else {
  //     const bc0 = lensObj?.baseCurves?.[0];
  //     if (!bc0) e.bc = true;
  //   }

  //   // Color required if options exist
  //   if (colorOptions.length > 0 && !d.color) e.color = true;

  //   return Object.keys(e).length ? e : null;
  // }

  const validateAll = useCallback((): FieldErrorMap => {
    const map: FieldErrorMap = {};

    const rightDraft: EyeRxDraft = {
      lensId: rightLensId,
      sph: rightSph,
      cyl: rightCyl,
      axis: rightAxis,
      add: rightAdd,
      bc: rightBC,
      color: rightColor,
    };

    const leftDraft: EyeRxDraft = {
      lensId: leftLensId,
      sph: leftSph,
      cyl: leftCyl,
      axis: leftAxis,
      add: leftAdd,
      bc: leftBC,
      color: leftColor,
    };

    const rightTouched = isEyeTouched(rightDraft);
    const leftTouched = isEyeTouched(leftDraft);

    // Require at least one eye (GLOBAL flag only)
    if (!rightTouched && !leftTouched) {
      map.noneEntered = true;
      return map;
    }

    // Expiration required if any eye is entered
    if (!expires) {
      map.expires = true;
    }

    const rErr = validateEye(rightDraft, rightLens, rightColorOptions);
    if (rErr) map.right = rErr;

    const lErr = validateEye(leftDraft, leftLens, leftColorOptions);
    if (lErr) map.left = lErr;

    return map;
  }, [
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
    rightLens,
    leftLens,
    rightColorOptions,
    leftColorOptions,
  ]);

  // Live revalidation ONLY after the user attempts submit once
  // useEffect(() => {
  //   if (!didAttemptSubmit) return;
  //   setFieldErrors(validateAll());
  // }, [didAttemptSubmit, validateAll]);

  /* =========================
     Submit
  ========================= */

  async function submitRx() {
    if (loading) return;

    // setDidAttemptSubmit(true);

    const map = validateAll();
    setFieldErrors(map);

    if (hasAnyErrors(map)) return;

    // ONE-EYE confirm (ONLY after fields are valid)
    const rightDraft: EyeRxDraft = {
      lensId: rightLensId,
      sph: rightSph,
      cyl: rightCyl,
      axis: rightAxis,
      add: rightAdd,
      bc: rightBC,
      color: rightColor,
    };
    const leftDraft: EyeRxDraft = {
      lensId: leftLensId,
      sph: leftSph,
      cyl: leftCyl,
      axis: leftAxis,
      add: leftAdd,
      bc: leftBC,
      color: leftColor,
    };

    const rightTouched = isEyeTouched(rightDraft);
    const leftTouched = isEyeTouched(leftDraft);

    if (rightTouched !== leftTouched) {
      const proceed = window.confirm(
        "You entered a prescription for only one eye.\n\nContinue?",
      );
      if (!proceed) return;
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

      const orderId = await getOrCreateDraftOrder(session.access_token);

      const rx: RxPayload = { expires };

      if (rightTouched && rightLens) {
        rx.right = {
          lens_id: rightLensId,
          sphere: Number(rightSph),
          ...(rightLens.toric && {
            cylinder: Number(rightCyl),
            axis: Number(rightAxis),
          }),
          ...(rightLens.multifocal && rightAdd && { add: rightAdd }),
          ...(rightBC && { base_curve: Number(rightBC) }),
          ...(rightColor && { color: rightColor }),
        };
      }

      if (leftTouched && leftLens) {
        rx.left = {
          lens_id: leftLensId,
          sphere: Number(leftSph),
          ...(leftLens.toric && {
            cylinder: Number(leftCyl),
            axis: Number(leftAxis),
          }),
          ...(leftLens.multifocal && leftAdd && { add: leftAdd }),
          ...(leftBC && { base_curve: Number(leftBC) }),
          ...(leftColor && { color: leftColor }),
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

      router.push("/cart");
    } catch (err) {
      console.error(err);
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

            {fieldErrors.noneEntered && (
              <div className="rx-eye-error">
                Please enter a prescription for at least one eye.
              </div>
            )}

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

            {eyeHasErrors("right") && (
              <div className="rx-eye-error">
                Please complete the highlighted fields.
              </div>
            )}

            <div className="rx-eye">
              <div className="rx-grid rx-grid-top">
                <div className="rx-field">
                  <select
                    className={cls("lens-select", fieldErrors.right?.lens)}
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
                    className={cls("rx-input", fieldErrors.right?.sph)}
                    type="number"
                    step="0.25"
                    placeholder="Sphere*"
                    value={rightSph}
                    onChange={(e) => {
                      setRightSph(
                        e.target.value === ""
                          ? ""
                          : formatHundredths(Number(e.target.value)),
                      );
                    }}
                  />
                  <div className="rx-hint">{PLANO_HINT}</div>
                </div>

                {rightLens?.toric && (
                  <>
                    <div className="rx-field">
                      <select
                        className={cls("rx-select", fieldErrors.right?.cyl)}
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
                        className={cls("rx-select", fieldErrors.right?.axis)}
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
                    <div
                      className={fieldErrors.right?.add ? "rx-error-wrap" : ""}
                    >
                      <AddSelector
                        value={rightAdd ?? ""}
                        onChange={(v) => setRightAdd(v)}
                        options={resolveAddOptions(rightLens)}
                      />
                    </div>
                    <EmptyHint />
                  </div>
                )}

                {rightLens &&
                  (rightLens.multiBC ? (
                    <div className="rx-field">
                      <select
                        className={cls("rx-select", fieldErrors.right?.bc)}
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
                        className={cls("rx-input", fieldErrors.right?.bc)}
                        value={
                          rightLens.baseCurves?.[0]
                            ? formatBC(rightLens.baseCurves[0])
                            : ""
                        }
                        disabled
                      />
                      <EmptyHint />
                    </div>
                  ))}

                {rightLens && rightColorOptions.length > 0 && (
                  <div className="rx-field">
                    <div
                      className={
                        fieldErrors.right?.color ? "rx-error-wrap" : ""
                      }
                    >
                      <ColorSelector
                        value={rightColor}
                        onChange={(v) => setRightColor(v)}
                        options={rightColorOptions}
                      />
                    </div>
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

            {eyeHasErrors("left") && (
              <div className="rx-eye-error">
                Please complete the highlighted fields.
              </div>
            )}

            <div className="rx-eye">
              <div className="rx-grid rx-grid-top">
                <div className="rx-field">
                  <select
                    className={cls("lens-select", fieldErrors.left?.lens)}
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
                    className={cls("rx-input", fieldErrors.left?.sph)}
                    type="number"
                    step="0.25"
                    placeholder="Sphere*"
                    value={leftSph}
                    onChange={(e) => {
                      setLeftSph(
                        e.target.value === ""
                          ? ""
                          : formatHundredths(Number(e.target.value)),
                      );
                    }}
                  />
                  <div className="rx-hint">{PLANO_HINT}</div>
                </div>

                {leftLens?.toric && (
                  <>
                    <div className="rx-field">
                      <select
                        className={cls("rx-select", fieldErrors.left?.cyl)}
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
                        className={cls("rx-select", fieldErrors.left?.axis)}
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
                    <div
                      className={fieldErrors.left?.add ? "rx-error-wrap" : ""}
                    >
                      <AddSelector
                        value={leftAdd ?? ""}
                        onChange={(v) => setLeftAdd(v)}
                        options={resolveAddOptions(leftLens)}
                      />
                    </div>
                    <EmptyHint />
                  </div>
                )}

                {leftLens &&
                  (leftLens.multiBC ? (
                    <div className="rx-field">
                      <select
                        className={cls("rx-select", fieldErrors.left?.bc)}
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
                        className={cls("rx-input", fieldErrors.left?.bc)}
                        value={
                          leftLens.baseCurves?.[0]
                            ? formatBC(leftLens.baseCurves[0])
                            : ""
                        }
                        disabled
                      />
                      <EmptyHint />
                    </div>
                  ))}

                {leftLens && leftColorOptions.length > 0 && (
                  <div className="rx-field">
                    <div
                      className={fieldErrors.left?.color ? "rx-error-wrap" : ""}
                    >
                      <ColorSelector
                        value={leftColor}
                        onChange={(v) => setLeftColor(v)}
                        options={leftColorOptions}
                      />
                    </div>
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
                  className={fieldErrors.expires ? "rx-error" : ""}
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
                {loading ? "Processing…" : "Continue to cart"}
              </button>
            </div>
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
