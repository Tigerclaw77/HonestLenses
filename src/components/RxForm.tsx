"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import AddSelector from "../components/AddSelector";
import { resolveAddOptions } from "../lib/resolveAddOptions";
import ColorSelector from "../components/ColorSelector";
import { getColorOptions } from "../data/lensColors";
import { lenses } from "../data/lenses";
import { getLensDisplayName } from "../lib/cart/display";

/* =========================
   Types
========================= */

type EyeRxDraft = {
  lens_id: string;
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

type RxFormMode = "manual" | "ocr";

type OcrExtract = {
  patientName?: string;
  doctorName?: string;
  doctorPhone?: string;
  issuedDate?: string;   // 🔹 add this (you’re displaying issued)
  expires?: string;      // 🔹 helpful for consistency
  rawText?: string;
};

type Props = {
  orderId: string;                 // 🔹 make required (Confirm flow depends on it)
  mode?: RxFormMode;               // manual | ocr
  initialDraft?: RxDraft;          // pre-filled draft (OCR → mapped to draft format)
  ocrExtract?: OcrExtract;         // extracted metadata block
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
  for (let v = -0.75; v >= -6.0; v -= 0.5) values.push(Number(v.toFixed(2)));
  return values;
})();

const AXIS_OPTIONS = Array.from({ length: 18 }, (_, i) => (i + 1) * 10);

function validateEye(
  d: EyeRxDraft,
  lensObj: (typeof lenses)[number] | undefined,
  colorOptions: string[],
): EyeFieldErrorMap | null {
  if (!(d.lens_id || d.sph || d.cyl || d.axis || d.add || d.bc || d.color))
    return null;

  const e: EyeFieldErrorMap = {};

  // Lens required if anything entered for eye
  if (!d.lens_id || !lensObj) e.lens = true;

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

export default function RxForm({
  orderId,
  mode = "manual",
  initialDraft,
  ocrExtract,
}: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // field-level validation state
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});

  /* =========================
     State – Right Eye
  ========================= */
  const [rightlens_id, setRightlens_id] = useState("");
  const [rightSph, setRightSph] = useState("");
  const [rightCyl, setRightCyl] = useState("");
  const [rightAxis, setRightAxis] = useState("");
  const [rightAdd, setRightAdd] = useState("");
  const [rightColor, setRightColor] = useState("");
  const [rightBC, setRightBC] = useState("");

  /* =========================
     State – Left Eye
  ========================= */
  const [leftlens_id, setLeftlens_id] = useState("");
  const [leftSph, setLeftSph] = useState("");
  const [leftCyl, setLeftCyl] = useState("");
  const [leftAxis, setLeftAxis] = useState("");
  const [leftAdd, setLeftAdd] = useState("");
  const [leftColor, setLeftColor] = useState("");
  const [leftBC, setLeftBC] = useState("");

  const [expires, setExpires] = useState("");

  // OCR-only meta (does not exist for manual entry)
  const [patientName, setPatientName] = useState(
    mode === "ocr" ? (ocrExtract?.patientName ?? "") : "",
  );
  const [doctorName, setDoctorName] = useState(
    mode === "ocr" ? (ocrExtract?.doctorName ?? "") : "",
  );
  const [doctorPhone, setDoctorPhone] = useState(
    mode === "ocr" ? (ocrExtract?.doctorPhone ?? "") : "",
  );

  const rightLens = lenses.find((l) => l.lens_id === rightlens_id);
  const leftLens = lenses.find((l) => l.lens_id === leftlens_id);

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
     Draft application helper
  ========================= */

  const applyDraft = useCallback((d: RxDraft) => {
    setRightlens_id(d.right.lens_id);
    setRightSph(d.right.sph);
    setRightCyl(d.right.cyl);
    setRightAxis(d.right.axis);
    setRightAdd(d.right.add);
    setRightBC(d.right.bc);
    setRightColor(d.right.color);

    setLeftlens_id(d.left.lens_id);
    setLeftSph(d.left.sph);
    setLeftCyl(d.left.cyl);
    setLeftAxis(d.left.axis);
    setLeftAdd(d.left.add);
    setLeftBC(d.left.bc);
    setLeftColor(d.left.color);

    setExpires(d.expires);
  }, []);

  /* =========================
     Draft restore (manual only)
  ========================= */

  const restoreDraftFromLocalStorage = useCallback(() => {
    const raw = localStorage.getItem(LS_RX_DRAFT);

    if (!raw) {
      setHydrated(true);
      return;
    }

    try {
      const parsed: RxDraft = JSON.parse(raw);
      applyDraft(parsed);
    } catch {
      // ignore malformed drafts
    } finally {
      setHydrated(true);
    }
  }, [applyDraft]);

  useEffect(() => {
    // OCR mode: we do NOT load/overwrite from localStorage
    if (mode === "ocr") {
      setHydrated(true);
      return;
    }

    restoreDraftFromLocalStorage();
  }, [mode, restoreDraftFromLocalStorage]);

  /* =========================
     OCR prefill (ocr only)
  ========================= */

  useEffect(() => {
    if (mode !== "ocr") return;
    if (!initialDraft) return;

    applyDraft(initialDraft);

    // meta from OCR
    setPatientName(ocrExtract?.patientName ?? "");
    setDoctorName(ocrExtract?.doctorName ?? "");
    setDoctorPhone(ocrExtract?.doctorPhone ?? "");

    setHydrated(true);
  }, [
    mode,
    initialDraft,
    applyDraft,
    ocrExtract?.patientName,
    ocrExtract?.doctorName,
    ocrExtract?.doctorPhone,
  ]);

  function resetToOcr() {
    if (mode !== "ocr" || !initialDraft) return;

    applyDraft(initialDraft);

    setPatientName(ocrExtract?.patientName ?? "");
    setDoctorName(ocrExtract?.doctorName ?? "");
    setDoctorPhone(ocrExtract?.doctorPhone ?? "");

    // Clear any error highlights after reset
    setFieldErrors({});
  }

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

    if (!rightLens.multiBC && rightLens.baseCurves?.length === 1) {
      setRightBC(formatBC(rightLens.baseCurves[0]));
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

    if (!leftLens.multiBC && leftLens.baseCurves?.length === 1) {
      setLeftBC(formatBC(leftLens.baseCurves[0]));
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
     Persist to localStorage (manual only)
  ========================= */

  useEffect(() => {
    if (!hydrated) return;
    if (mode !== "manual") return;

    const draft: RxDraft = {
      right: {
        lens_id: rightlens_id,
        sph: rightSph,
        cyl: rightCyl,
        axis: rightAxis,
        add: rightAdd,
        bc: rightBC,
        color: rightColor,
      },
      left: {
        lens_id: leftlens_id,
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
    mode,
    rightlens_id,
    rightSph,
    rightCyl,
    rightAxis,
    rightAdd,
    rightBC,
    rightColor,
    leftlens_id,
    leftSph,
    leftCyl,
    leftAxis,
    leftAdd,
    leftBC,
    leftColor,
    expires,
  ]);

  async function getOrCreateDraftOrder(accessToken: string): Promise<string> {
    console.log("🟦 [RxForm] getOrCreateDraftOrder: checking /api/cart");

    const cartRes = await fetch("/api/cart", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    console.log("🟦 [RxForm] /api/cart status =", cartRes.status);

    if (cartRes.ok) {
      const cart = await cartRes.json();
      console.log("🟦 [RxForm] /api/cart body =", cart);

      if (cart?.hasCart && cart.order?.id) {
        console.log("🟩 [RxForm] Using existing order id", cart.order.id);
        return cart.order.id;
      }
    } else {
      try {
        const errBody = await cartRes.json();
        console.log("🟨 [RxForm] /api/cart non-ok body =", errBody);
      } catch {
        // ignore
      }
    }

    console.log("🟦 [RxForm] No cart found; creating /api/orders (POST)");

    const orderRes = await fetch("/api/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const body = await orderRes.json();
    console.log("🟦 [RxForm] /api/orders status/body =", orderRes.status, body);

    if (!orderRes.ok || !body.orderId) {
      throw new Error(body.error || "Failed to create order");
    }

    console.log("🟩 [RxForm] Created order id", body.orderId);
    return body.orderId;
  }

  /* =========================
     Validation (Lens-driven)
  ========================= */

  function isEyeTouched(d: EyeRxDraft) {
    return Boolean(
      d.lens_id || d.sph || d.cyl || d.axis || d.add || d.bc || d.color,
    );
  }

  const validateAll = useCallback((): FieldErrorMap => {
    const map: FieldErrorMap = {};

    const rightDraft: EyeRxDraft = {
      lens_id: rightlens_id,
      sph: rightSph,
      cyl: rightCyl,
      axis: rightAxis,
      add: rightAdd,
      bc: rightBC,
      color: rightColor,
    };

    const leftDraft: EyeRxDraft = {
      lens_id: leftlens_id,
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
    if (!expires) map.expires = true;

    const rErr = validateEye(rightDraft, rightLens, rightColorOptions);
    if (rErr) map.right = rErr;

    const lErr = validateEye(leftDraft, leftLens, leftColorOptions);
    if (lErr) map.left = lErr;

    return map;
  }, [
    rightlens_id,
    rightSph,
    rightCyl,
    rightAxis,
    rightAdd,
    rightBC,
    rightColor,
    leftlens_id,
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

  /* =========================
     Submit
  ========================= */

  useEffect(() => {
    if (!rightLens) return;
    if (rightColor && rightColorOptions.length === 0) setRightColor("");
  }, [rightLens, rightColor, rightColorOptions]);

  useEffect(() => {
    if (!leftLens) return;
    if (leftColor && leftColorOptions.length === 0) setLeftColor("");
  }, [leftLens, leftColor, leftColorOptions]);

  async function submitRx() {
    if (loading) return;

    const map = validateAll();
    setFieldErrors(map);
    if (hasAnyErrors(map)) return;

    // ONE-EYE confirm (ONLY after fields are valid)
    const rightDraft: EyeRxDraft = {
      lens_id: rightlens_id,
      sph: rightSph,
      cyl: rightCyl,
      axis: rightAxis,
      add: rightAdd,
      bc: rightBC,
      color: rightColor,
    };
    const leftDraft: EyeRxDraft = {
      lens_id: leftlens_id,
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
      console.log("🟦 [RxForm] submitRx start");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      console.log("🟦 [RxForm] session present?", Boolean(session));

      if (!session) {
        router.push("/login");
        return;
      }

      const finalOrderId =
        orderId ?? (await getOrCreateDraftOrder(session.access_token));
      console.log("🟦 [RxForm] orderId =", finalOrderId);

      const rx: RxPayload & {
        patient_name?: string;
        prescriber_name?: string;
        prescriber_phone?: string;
      } = { expires };

      if (rightTouched && rightLens) {
        rx.right = {
          lens_id: rightlens_id,
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
          lens_id: leftlens_id,
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

      if (mode === "ocr") {
        rx.patient_name = patientName || undefined;
        rx.prescriber_name = doctorName || undefined;
        rx.prescriber_phone = doctorPhone || undefined;
      }

      console.log("🟦 [RxForm] POST /api/orders/:id/rx payload =", rx);

      const rxRes = await fetch(`/api/orders/${finalOrderId}/rx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(rx),
        cache: "no-store",
      });

      console.log("🟦 [RxForm] /api/orders/:id/rx status =", rxRes.status);

      let rxBody: unknown = null;
      try {
        rxBody = await rxRes.json();
      } catch {
        // ignore
      }

      console.log("🟦 [RxForm] /api/orders/:id/rx body =", rxBody);

      if (!rxRes.ok) {
        if (rxBody && typeof rxBody === "object" && "error" in rxBody) {
          throw new Error(String((rxBody as { error: unknown }).error));
        }
        throw new Error("Prescription submission failed");
      }

      /* 🔑 Resolve pricing ONCE */
      console.log("🟦 [RxForm] POST /api/cart/resolve");

      const resolveRes = await fetch("/api/cart/resolve", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      console.log("🟦 [RxForm] /api/cart/resolve status =", resolveRes.status);

      let resolveBody: unknown = null;
      try {
        resolveBody = await resolveRes.json();
      } catch {
        // ignore
      }

      console.log("🟦 [RxForm] /api/cart/resolve body =", resolveBody);

      if (!resolveRes.ok) {
        if (
          resolveBody &&
          typeof resolveBody === "object" &&
          "error" in resolveBody
        ) {
          throw new Error(String((resolveBody as { error: unknown }).error));
        }
        throw new Error("Cart resolve failed");
      }

      console.log("🟩 [RxForm] resolve OK → redirecting to /cart");
      router.push("/cart");
    } catch (err) {
      console.error("🔴 [RxForm] submitRx error:", err);
      // Optional: surface a user-friendly alert for MVP
      // alert(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
      console.log("🟦 [RxForm] submitRx end");
    }
  }

  function copyRightToLeft() {
    if (!rightlens_id) return;

    setLeftlens_id(rightlens_id);
    setLeftSph(rightSph);
    setLeftCyl(rightCyl);
    setLeftAxis(rightAxis);
    setLeftAdd(rightAdd);
    setLeftBC(rightBC);
    setLeftColor(rightColor);
  }

  function copyLeftToRight() {
    if (!leftlens_id) return;

    setRightlens_id(leftlens_id);
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
      <main>
        <section className="content-shell">
          <h1 className="upper content-title">Enter Prescription</h1>

          {mode === "ocr" && (
            <div
              className="order-card rx-meta-section"
              style={{ marginBottom: 16 }}
            >
              <h3 style={{ marginBottom: 12 }}>Scanned prescription details</h3>

              <div className="rx-grid" style={{ marginBottom: 12 }}>
                <div className="rx-field">
                  <label className="rx-label">Patient name</label>
                  <input
                    className="rx-input"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Patient name"
                  />
                  <div className="rx-hint">
                    Optional — used only for the uploaded Rx flow.
                  </div>
                </div>

                <div className="rx-field">
                  <label className="rx-label">Doctor / prescriber name</label>
                  <input
                    className="rx-input"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="Doctor name"
                  />
                  <div className="rx-hint">
                    Optional — used only for the uploaded Rx flow.
                  </div>
                </div>

                <div className="rx-field">
                  <label className="rx-label">Doctor phone</label>
                  <input
                    className="rx-input"
                    value={doctorPhone}
                    onChange={(e) => setDoctorPhone(e.target.value)}
                    placeholder="(###) ###-####"
                  />
                  <div className="rx-hint">
                    Please verify — we’ll use this for verification.
                  </div>
                </div>
              </div>

              <button type="button" className="ghost-btn" onClick={resetToOcr}>
                Reset to scanned values
              </button>
            </div>
          )}

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
                disabled={!rightlens_id}
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
                    value={rightlens_id}
                    onChange={(e) => setRightlens_id(e.target.value)}
                  >
                    <option value="">Select lens</option>
                    {lenses.map((l) => (
                      <option key={l.lens_id} value={l.lens_id}>
                        {getLensDisplayName(l.lens_id, null)}
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
                disabled={!leftlens_id}
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
                    value={leftlens_id}
                    onChange={(e) => setLeftlens_id(e.target.value)}
                  >
                    <option value="">Select lens</option>
                    {lenses.map((l) => (
                      <option key={l.lens_id} value={l.lens_id}>
                        {getLensDisplayName(l.lens_id, null)}
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
