"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import AddSelector from "../components/AddSelector";
import { resolveAxisOptions } from "@/LensCore/helpers/resolveAxisOptions";
import { resolveAddOptions } from "../LensCore/helpers/resolveAddOptions";
import ColorSelector from "../components/ColorSelector";
import { getColorOptions } from "../data/lensColors";
import { getLensDisplayName } from "../lib/cart/display";
import ExpirationDatePicker from "@/components/ExpirationDatePicker";
import type { OcrExtract } from "@/types/ocr";
import { lenses } from "@/LensCore";
import type { LensCore } from "@/LensCore";
import { formatSphere } from "@/LensCore";
import { resolveSphereOptions } from "@/LensCore/helpers/resolveSphereOptions";
import { resolveCylinderOptions } from "@/LensCore/helpers/resolveCylinderOptions";

import {
  formatBC,
  formatHundredths,
  isEyeTouched,
  isValidFutureExpiration,
} from "./RxFormUtils";

/* =========================
   Types
========================= */

type EyeRxDraft = {
  coreId: string;
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
  coreId?: string | null;
  sphere: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
  color?: string;
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

type Props = {
  mode?: RxFormMode;
  initialDraft?: RxDraft;
  ocrExtract?: OcrExtract;
  initialRightLens?: string;
  initialLeftLens?: string;
};

/* =========================
   Constants
========================= */

const LS_RX_DRAFT = "hl_rx_draft_v1";
const NOT_LISTED_VALUE = "__NOT_LISTED__";

function validateEye(
  d: EyeRxDraft,
  lensObj: LensCore | undefined,
  colorOptions: string[],
  lensNotListed = false,
): EyeFieldErrorMap | null {
  if (!(d.coreId || d.sph || d.cyl || d.axis || d.add || d.bc || d.color)) {
    return null;
  }

  const e: EyeFieldErrorMap = {};

  if (lensNotListed) {
    if (!d.sph) e.sph = true;

    const hasCyl = Boolean(d.cyl);
    const hasAxis = Boolean(d.axis);

    if (hasCyl && !hasAxis) e.axis = true;
    if (hasAxis && !hasCyl) e.cyl = true;

    return Object.keys(e).length ? e : null;
  }

  if (!d.coreId || !lensObj) e.lens = true;
  if (!d.sph) e.sph = true;

  if (lensObj?.type.toric) {
    if (!d.cyl) e.cyl = true;
    if (!d.axis) e.axis = true;
  }

  if (lensObj?.type.multifocal) {
    const opts = resolveAddOptions(
      lensObj,
      d.bc ? Number(d.bc) : null,
      d.sph ? Number(d.sph) : null,
    );

    if (opts.length > 0 && !d.add) e.add = true;
  }

  const bcList = lensObj?.parameters.baseCurve;

  if (bcList && bcList.length > 1 && !d.bc) {
    e.bc = true;
  }

  if (colorOptions.length > 0 && !d.color) e.color = true;

  return Object.keys(e).length ? e : null;
}

/* =========================
   Component
========================= */

export default function RxForm({
  mode = "manual",
  initialDraft,
  ocrExtract,
  initialRightLens,
  initialLeftLens,
}: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});

  /* =========================
     State – Right Eye
  ========================= */
  const [rightcoreId, setRightcoreId] = useState("");
  const [rightSph, setRightSph] = useState("");
  const [rightCyl, setRightCyl] = useState("");
  const [rightAxis, setRightAxis] = useState("");
  const [rightAdd, setRightAdd] = useState("");
  const [rightColor, setRightColor] = useState("");
  const [rightBC, setRightBC] = useState("");
  const [rightLensNotListed, setRightLensNotListed] = useState(false);

  /* =========================
     State – Left Eye
  ========================= */
  const [leftcoreId, setLeftcoreId] = useState("");
  const [leftSph, setLeftSph] = useState("");
  const [leftCyl, setLeftCyl] = useState("");
  const [leftAxis, setLeftAxis] = useState("");
  const [leftAdd, setLeftAdd] = useState("");
  const [leftColor, setLeftColor] = useState("");
  const [leftBC, setLeftBC] = useState("");
  const [leftLensNotListed, setLeftLensNotListed] = useState(false);

  const [expires, setExpires] = useState("");

  const proposedLensId = ocrExtract?.proposedLensId ?? null;
  const proposalConfidence =
    mode === "ocr" ? (ocrExtract?.proposalConfidence ?? null) : null;

  const [ocrError, setOcrError] = useState(false);

  const lensCardState: "error" | "suggested" | "manual" =
    ocrError || !proposedLensId
      ? "error"
      : proposalConfidence === "high"
        ? "suggested"
        : proposalConfidence === "medium"
          ? "manual"
          : "error";

  const [patientName, setPatientName] = useState(
    mode === "ocr" ? (ocrExtract?.patientName ?? "") : "",
  );
  const [doctorName, setDoctorName] = useState(
    mode === "ocr" ? (ocrExtract?.doctorName ?? "") : "",
  );
  const [doctorPhone, setDoctorPhone] = useState(
    mode === "ocr" ? (ocrExtract?.doctorPhone ?? "") : "",
  );

  const rightLens = lenses.find((l) => l.coreId === rightcoreId);
  const leftLens = lenses.find((l) => l.coreId === leftcoreId);

  const rightSphereOptions = useMemo(() => {
    if (!rightLens) return [];

    return resolveSphereOptions(
      rightLens,
      rightBC ? Number(rightBC) : null,
      rightCyl ? Number(rightCyl) : null,
      rightAxis ? Number(rightAxis) : null,
      rightAdd ?? null,
    );
  }, [rightLens, rightBC, rightCyl, rightAxis, rightAdd]);

  const leftSphereOptions = useMemo(() => {
    if (!leftLens) return [];

    return resolveSphereOptions(
      leftLens,
      leftBC ? Number(leftBC) : null,
      leftCyl ? Number(leftCyl) : null,
      leftAxis ? Number(leftAxis) : null,
      leftAdd ?? null,
    );
  }, [leftLens, leftBC, leftCyl, leftAxis, leftAdd]);

  const rightColorOptions = useMemo(() => {
    if (!rightLens) return [];
    return getColorOptions(rightLens.coreId);
  }, [rightLens]);

  const leftColorOptions = useMemo(() => {
    if (!leftLens) return [];
    return getColorOptions(leftLens.coreId);
  }, [leftLens]);

  const rightCylOptions = useMemo(() => {
    if (!rightLens?.type.toric) return [];

    const axis = rightAxis ? Number(rightAxis) : null;
    const sph = rightSph ? Number(rightSph) : null;

    return resolveCylinderOptions(rightLens, axis, sph);
  }, [rightLens, rightAxis, rightSph]);

  const leftCylOptions = useMemo(() => {
    if (!leftLens?.type.toric) return [];

    const axis = leftAxis ? Number(leftAxis) : null;
    const sph = leftSph ? Number(leftSph) : null;

    return resolveCylinderOptions(leftLens, axis, sph);
  }, [leftLens, leftAxis, leftSph]);

  const rightAxisOptions = useMemo(() => {
    if (!rightLens?.type.toric) return [];

    const cyl = rightCyl ? Number(rightCyl) : null;
    const sph = rightSph ? Number(rightSph) : null;

    return resolveAxisOptions(rightLens, cyl, sph);
  }, [rightLens, rightCyl, rightSph]);

  const leftAxisOptions = useMemo(() => {
    if (!leftLens?.type.toric) return [];

    const cyl = leftCyl ? Number(leftCyl) : null;
    const sph = leftSph ? Number(leftSph) : null;

    return resolveAxisOptions(leftLens, cyl, sph);
  }, [leftLens, leftCyl, leftSph]);

  const PLANO_HINT = "0.00 indicates Plano (PL)";
  const EmptyHint = () => <div className="rx-hint">&nbsp;</div>;
  const EmptyLabel = () => <label className="rx-label">&nbsp;</label>;

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 899);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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
    setRightcoreId(d.right.coreId);
    setRightSph(d.right.sph);
    setRightCyl(d.right.cyl);
    setRightAxis(d.right.axis);
    setRightAdd(d.right.add);
    setRightBC(d.right.bc);
    setRightColor(d.right.color);
    setRightLensNotListed(false);

    setLeftcoreId(d.left.coreId);
    setLeftSph(d.left.sph);
    setLeftCyl(d.left.cyl);
    setLeftAxis(d.left.axis);
    setLeftAdd(d.left.add);
    setLeftBC(d.left.bc);
    setLeftColor(d.left.color);
    setLeftLensNotListed(false);

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

      if (initialRightLens) {
        parsed.right.coreId = initialRightLens;
      }

      if (initialLeftLens) {
        parsed.left.coreId = initialLeftLens;
      }

      applyDraft(parsed);
    } catch {
      // ignore malformed drafts
    } finally {
      setHydrated(true);
    }
  }, [applyDraft, initialRightLens, initialLeftLens]);

  useEffect(() => {
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

    const noSphereDetected =
      !initialDraft?.right?.sph && !initialDraft?.left?.sph;

    if (noSphereDetected) {
      setOcrError(true);
    } else {
      setOcrError(false);

      if (proposedLensId && proposalConfidence !== "low") {
        if (!initialDraft.right.coreId) setRightcoreId(proposedLensId);
        if (!initialDraft.left.coreId) setLeftcoreId(proposedLensId);
      }
    }

    setRightLensNotListed(false);
    setLeftLensNotListed(false);

    setPatientName(ocrExtract?.patientName ?? "");
    setDoctorName(ocrExtract?.doctorName ?? "");
    setDoctorPhone(ocrExtract?.doctorPhone ?? "");

    setHydrated(true);
  }, [
    mode,
    initialDraft,
    applyDraft,
    ocrExtract,
    proposedLensId,
    proposalConfidence,
  ]);

  function resetToOcr() {
    if (mode !== "ocr" || !initialDraft) return;

    applyDraft(initialDraft);

    if (proposedLensId && proposalConfidence !== "low") {
      if (!initialDraft.right.coreId) setRightcoreId(proposedLensId);
      if (!initialDraft.left.coreId) setLeftcoreId(proposedLensId);
    }

    setRightLensNotListed(false);
    setLeftLensNotListed(false);

    setPatientName(ocrExtract?.patientName ?? "");
    setDoctorName(ocrExtract?.doctorName ?? "");
    setDoctorPhone(ocrExtract?.doctorPhone ?? "");

    const noSphereDetected =
      !initialDraft?.right?.sph && !initialDraft?.left?.sph;
    setOcrError(noSphereDetected);

    setFieldErrors({});
  }

  /* =========================
     Persist to localStorage (manual only)
  ========================= */

  useEffect(() => {
    if (!hydrated) return;
    if (mode !== "manual") return;

    const draft: RxDraft = {
      right: {
        coreId: rightcoreId,
        sph: rightSph,
        cyl: rightCyl,
        axis: rightAxis,
        add: rightAdd,
        bc: rightBC,
        color: rightColor,
      },
      left: {
        coreId: leftcoreId,
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
    rightcoreId,
    rightSph,
    rightCyl,
    rightAxis,
    rightAdd,
    rightBC,
    rightColor,
    leftcoreId,
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

  const validateAll = useCallback((): FieldErrorMap => {
    const map: FieldErrorMap = {};

    const rightDraft: EyeRxDraft = {
      coreId: rightcoreId,
      sph: rightSph,
      cyl: rightCyl,
      axis: rightAxis,
      add: rightAdd,
      bc: rightBC,
      color: rightColor,
    };

    const leftDraft: EyeRxDraft = {
      coreId: leftcoreId,
      sph: leftSph,
      cyl: leftCyl,
      axis: leftAxis,
      add: leftAdd,
      bc: leftBC,
      color: leftColor,
    };

    const rightTouched = isEyeTouched(rightDraft);
    const leftTouched = isEyeTouched(leftDraft);

    if (!rightTouched && !leftTouched) {
      map.noneEntered = true;
      return map;
    }

    if (!isValidFutureExpiration(expires)) {
      map.expires = true;
    }

    const rErr = validateEye(
      rightDraft,
      rightLens,
      rightColorOptions,
      rightLensNotListed,
    );
    if (rErr) map.right = rErr;

    const lErr = validateEye(
      leftDraft,
      leftLens,
      leftColorOptions,
      leftLensNotListed,
    );
    if (lErr) map.left = lErr;

    return map;
  }, [
    rightcoreId,
    rightSph,
    rightCyl,
    rightAxis,
    rightAdd,
    rightBC,
    rightColor,
    leftcoreId,
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
    rightLensNotListed,
    leftLensNotListed,
  ]);

  function isLensFamilyMatch(a: string, b: string): boolean {
    const lensA = lenses.find((l) => l.coreId === a);
    const lensB = lenses.find((l) => l.coreId === b);

    if (!lensA || !lensB) return false;

    // 1. Replacement (your real guard)
    if (lensA.replacement !== lensB.replacement) return false;

    // 2. Structure (correct property path)
    if (lensA.type.toric !== lensB.type.toric) return false;
    if (lensA.type.multifocal !== lensB.type.multifocal) return false;

    // 3. Family name (correct field)
    const normalize = (name: string) =>
      name.toLowerCase().replace(/[^a-z0-9]/g, "");

    const nameA = normalize(lensA.displayName);
    const nameB = normalize(lensB.displayName);

    const tokensA = nameA.split(/(?=[A-Z])/);
    const tokensB = nameB.split(/(?=[A-Z])/);

    const overlap = tokensA.some((t) => tokensB.includes(t));

    return overlap;
  }

  /* =========================
     Submit
  ========================= */

  async function submitRx() {
    if (loading) return;

    const map = validateAll();
    setFieldErrors(map);
    if (hasAnyErrors(map)) return;

    const rightDraft: EyeRxDraft = {
      coreId: rightcoreId,
      sph: rightSph,
      cyl: rightCyl,
      axis: rightAxis,
      add: rightAdd,
      bc: rightBC,
      color: rightColor,
    };

    const leftDraft: EyeRxDraft = {
      coreId: leftcoreId,
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

      let accessToken = session?.access_token;

      if (!accessToken && process.env.NODE_ENV === "development") {
        console.log("🟨 DEV MODE: using local token");
        accessToken = "dev-local-token";
      }

      if (!accessToken) {
        const next = window.location.pathname + window.location.search;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      console.log("STEP 1: starting draft order creation");
      const finalOrderId = await getOrCreateDraftOrder(accessToken);
      console.log("STEP 2: draft order id =", finalOrderId);

      const requiresReview = rightLensNotListed || leftLensNotListed;

      // =========================
      // AUTO VALIDATION (OCR vs Selection)
      // =========================

      let verificationStatus: "auto_verified" | "flagged" | "requires_review" =
        "auto_verified";

      // Case 1: lens not listed → requires review
      if (requiresReview) {
        verificationStatus = "requires_review";
      }

      // Case 2: OCR mismatch (only if we have OCR + selected lens)
      else if (mode === "ocr" && proposedLensId) {
        const rightMismatch =
          rightTouched &&
          rightcoreId &&
          proposedLensId &&
          !isLensFamilyMatch(rightcoreId, proposedLensId);

        const leftMismatch =
          leftTouched &&
          leftcoreId &&
          proposedLensId &&
          !isLensFamilyMatch(leftcoreId, proposedLensId);

        if (rightMismatch || leftMismatch) {
          verificationStatus = "flagged";
        }
      }

      const rx: RxPayload & {
        patient_name?: string;
        prescriber_name?: string;
        prescriber_phone?: string;
        brand_confidence?: "high" | "medium" | "low" | "unknown";
        requires_review?: boolean;
        verification_status?: "auto_verified" | "flagged" | "requires_review";
      } = { expires };

      if (mode === "ocr") {
        rx.brand_confidence = proposalConfidence ?? "unknown";
      }

      rx.verification_status = verificationStatus;

      if (verificationStatus === "requires_review") {
        rx.requires_review = true;
      }

      if (rightTouched) {
        if (rightLensNotListed) {
          rx.right = {
            coreId: null,
            sphere: Number(rightSph),
            ...(rightCyl && { cylinder: Number(rightCyl) }),
            ...(rightAxis && { axis: Number(rightAxis) }),
            ...(rightAdd && { add: rightAdd }),
            ...(rightBC && { base_curve: Number(rightBC) }),
            ...(rightColor && { color: rightColor }),
          };
        } else if (rightLens) {
          rx.right = {
            coreId: rightcoreId,
            sphere: Number(rightSph),
            ...(rightLens.type.toric && {
              cylinder: Number(rightCyl),
              axis: Number(rightAxis),
            }),
            ...(rightLens.type.multifocal && rightAdd && { add: rightAdd }),
            ...(rightBC && { base_curve: Number(rightBC) }),
            ...(rightColor && { color: rightColor }),
          };
        }
      }

      if (leftTouched) {
        if (leftLensNotListed) {
          rx.left = {
            coreId: null,
            sphere: Number(leftSph),
            ...(leftCyl && { cylinder: Number(leftCyl) }),
            ...(leftAxis && { axis: Number(leftAxis) }),
            ...(leftAdd && { add: leftAdd }),
            ...(leftBC && { base_curve: Number(leftBC) }),
            ...(leftColor && { color: leftColor }),
          };
        } else if (leftLens) {
          rx.left = {
            coreId: leftcoreId,
            sphere: Number(leftSph),
            ...(leftLens.type.toric && {
              cylinder: Number(leftCyl),
              axis: Number(leftAxis),
            }),
            ...(leftLens.type.multifocal && leftAdd && { add: leftAdd }),
            ...(leftBC && { base_curve: Number(leftBC) }),
            ...(leftColor && { color: leftColor }),
          };
        }
      }

      if (mode === "ocr") {
        rx.patient_name = patientName || undefined;
        rx.prescriber_name = doctorName || undefined;
        rx.prescriber_phone = doctorPhone || undefined;
      }

      console.log("STEP 3: posting RX");

      const rxRes = await fetch(`/api/orders/${finalOrderId}/rx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(rx),
        cache: "no-store",
      });

      let rxBody: unknown = null;
      try {
        rxBody = await rxRes.json();
      } catch {
        // ignore
      }

      if (!rxRes.ok) {
        if (rxBody && typeof rxBody === "object" && "error" in rxBody) {
          throw new Error(String((rxBody as { error: unknown }).error));
        }
        throw new Error("Prescription submission failed");
      }

      router.push(`/order/${finalOrderId}?status=review`);

      console.log("STEP 4: resolving cart");

      const resolveRes = await fetch("/api/cart/resolve", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order_id: finalOrderId }),
        cache: "no-store",
      });

      let resolveBody: unknown = null;
      try {
        resolveBody = await resolveRes.json();
      } catch {
        // ignore
      }

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

      router.push("/cart");
    } catch (err) {
      console.error("🔴 [RxForm] submitRx error:", err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function copyRightToLeft() {
    if (!rightcoreId && !rightLensNotListed) return;

    if (rightLensNotListed) {
      setLeftLensNotListed(true);
      setLeftcoreId("");
    } else {
      setLeftLensNotListed(false);
      setLeftcoreId(rightcoreId);
    }

    setLeftSph(rightSph);
    setLeftCyl(rightCyl);
    setLeftAxis(rightAxis);
    setLeftAdd(rightAdd);
    setLeftBC(rightBC);
    setLeftColor(rightColor);
  }

  function copyLeftToRight() {
    if (!leftcoreId && !leftLensNotListed) return;

    if (leftLensNotListed) {
      setRightLensNotListed(true);
      setRightcoreId("");
    } else {
      setRightLensNotListed(false);
      setRightcoreId(leftcoreId);
    }

    setRightSph(leftSph);
    setRightCyl(leftCyl);
    setRightAxis(leftAxis);
    setRightAdd(leftAdd);
    setRightBC(leftBC);
    setRightColor(leftColor);
  }

  if (!hydrated) {
    return null;
  }

  return (
    <main>
      <section className="content-shell">
        <h1 className="upper content-title">
          {mode === "ocr" ? "Confirm Your Prescription" : "Enter Prescription"}
        </h1>

        {mode === "ocr" && (
          <div
            className="order-card rx-meta-section"
            style={{ marginBottom: 16 }}
          >
            <h3 style={{ marginBottom: 12 }}>Scanned prescription details</h3>

            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 400,
                letterSpacing: "0.4px",
              }}
              className={`order-card detected-lens-card ${lensCardState}`}
            >
              {proposedLensId && lensCardState === "suggested" && (
                <div className="rx-hint mt-2">
                  <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    ✓ Detected lens: {getLensDisplayName(proposedLensId, null)}
                  </span>
                </div>
              )}

              {lensCardState === "manual" && (
                <div className="rx-hint mt-2">
                  <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                    We found a possible match. Please review the lens brand and
                    prescription values below before continuing.
                  </span>
                </div>
              )}

              {lensCardState === "error" && (
                <div className="rx-hint mt-2">
                  <span
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 400,
                      letterSpacing: "0.25px",
                    }}
                  >
                    We couldn’t confidently extract prescription values from the
                    uploaded image. Please enter them manually below. A licensed
                    optometrist will verify before shipping.
                  </span>
                </div>
              )}
            </div>

            <div className="rx-meta-grid" style={{ marginBottom: 12 }}>
              <div className="rx-field">
                <label className="rx-label">Patient name</label>
                <input
                  className="rx-input"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Patient name"
                />
              </div>

              <div className="rx-field">
                <label className="rx-label">Prescriber name</label>
                <input
                  className="rx-input"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="Doctor name"
                />
              </div>

              <div className="rx-field">
                <label className="rx-label">Doctor phone</label>
                <input
                  className="rx-input"
                  value={doctorPhone}
                  onChange={(e) => setDoctorPhone(e.target.value)}
                  placeholder="(###) ###-####"
                />
              </div>
            </div>

            {!ocrError && (
              <button type="button" className="reset-link" onClick={resetToOcr}>
                Reset to scanned values
              </button>
            )}
          </div>
        )}

        <div className="order-card">
          {fieldErrors.noneEntered && (
            <div className="rx-eye-error">
              Please enter a prescription for at least one eye.
            </div>
          )}

          {/* ===== RIGHT EYE ===== */}
          <div className="rx-eye-header">
            <h3 className="rx-eye-title">Right Eye (OD)</h3>

            {(mode === "manual" || lensCardState === "error") && (
              <button
                type="button"
                className="copy-eye-btn"
                disabled={!rightcoreId && !rightLensNotListed}
                onClick={copyRightToLeft}
              >
                Copy to left eye
              </button>
            )}
          </div>

          {eyeHasErrors("right") && (
            <div className="rx-eye-error">
              Please complete the highlighted fields.
            </div>
          )}

          <div className="rx-eye">
            <div className="rx-grid">
              <div className="rx-field">
                {mode === "ocr" ? (
                  <label className="rx-label">
                    Select the exact lens written on your prescription
                  </label>
                ) : (
                  <EmptyLabel />
                )}

                <select
                  className={cls("lens-select", fieldErrors.right?.lens)}
                  value={rightLensNotListed ? NOT_LISTED_VALUE : rightcoreId}
                  onChange={(e) => {
                    const val = e.target.value;

                    if (val === NOT_LISTED_VALUE) {
                      setRightcoreId("");
                      setRightLensNotListed(true);
                    } else {
                      setRightcoreId(val);
                      setRightLensNotListed(false);
                    }
                  }}
                >
                  <option value="">Select lens</option>
                  {(mode === "ocr" && proposedLensId
                    ? lenses.filter((l) =>
                        isLensFamilyMatch(l.coreId, proposedLensId),
                      )
                    : lenses
                  ).map((l) => (
                    <option key={l.coreId} value={l.coreId}>
                      {getLensDisplayName(l.coreId, null)}
                    </option>
                  ))}

                  <option disabled>────────────</option>
                  <option value="__NOT_LISTED__">My lens isn’t listed</option>
                </select>

                {rightLensNotListed ? (
                  <div className="rx-hint">
                    We’ll review the prescription you uploaded and assist
                    manually if this lens isn’t in our catalog yet.
                  </div>
                ) : (
                  mode === "ocr" &&
                  proposalConfidence === "high" &&
                  proposedLensId && (
                    <div className="rx-hint">
                      Detected from your prescription.
                    </div>
                  )
                )}
              </div>

              <div className="rx-field">
                <EmptyLabel />
                <select
                  className={cls("rx-select", fieldErrors.right?.sph)}
                  value={rightSph}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRightSph(v);

                    const nextSph = v ? Number(v) : null;

                    const nextAxisOptions = rightLens
                      ? resolveAxisOptions(
                          rightLens,
                          rightCyl ? Number(rightCyl) : null,
                          nextSph,
                        )
                      : [];

                    if (
                      rightAxis &&
                      nextAxisOptions.length &&
                      !nextAxisOptions.includes(Number(rightAxis))
                    ) {
                      setRightAxis("");
                    }
                  }}
                >
                  <option value="">SPH</option>
                  {rightSphereOptions.map((v) => {
                    const str = formatSphere(v);
                    return (
                      <option key={v} value={str}>
                        {str}
                      </option>
                    );
                  })}
                </select>
                <div className="rx-hint">{PLANO_HINT}</div>
              </div>

              {rightLens?.type.toric && (
                <div className="rx-field">
                  <EmptyLabel />
                  <select
                    className={cls("rx-select", fieldErrors.right?.cyl)}
                    value={rightCyl}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRightCyl(v);

                      const nextCyl = v ? Number(v) : null;

                      const nextAxisOptions = rightLens
                        ? resolveAxisOptions(
                            rightLens,
                            nextCyl,
                            rightSph ? Number(rightSph) : null,
                          )
                        : [];

                      if (
                        rightAxis &&
                        nextAxisOptions.length &&
                        !nextAxisOptions.includes(Number(rightAxis))
                      ) {
                        setRightAxis("");
                      }

                      const nextSphereOptions = rightLens
                        ? resolveSphereOptions(
                            rightLens,
                            rightBC ? Number(rightBC) : null,
                            nextCyl,
                            rightAxis ? Number(rightAxis) : null,
                            rightAdd ?? null,
                          )
                        : [];

                      if (
                        rightSph &&
                        nextSphereOptions.length &&
                        !nextSphereOptions.includes(Number(rightSph))
                      ) {
                        setRightSph("");
                      }
                    }}
                  >
                    <option value="">CYL</option>
                    {rightCylOptions.map((v) => (
                      <option key={v} value={formatHundredths(v)}>
                        {formatHundredths(v)}
                      </option>
                    ))}
                  </select>
                  <EmptyHint />
                </div>
              )}

              {rightLens?.type.toric && (
                <div className="rx-field">
                  <EmptyLabel />
                  <select
                    className={cls("rx-select", fieldErrors.right?.axis)}
                    value={rightAxis}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRightAxis(v);

                      const nextAxis = v ? Number(v) : null;

                      const nextCylOptions = rightLens
                        ? resolveCylinderOptions(
                            rightLens,
                            nextAxis,
                            rightSph ? Number(rightSph) : null,
                          )
                        : [];

                      if (
                        rightCyl &&
                        nextCylOptions.length &&
                        !nextCylOptions.includes(Number(rightCyl))
                      ) {
                        setRightCyl("");
                      }

                      const nextSphereOptions = rightLens
                        ? resolveSphereOptions(
                            rightLens,
                            rightBC ? Number(rightBC) : null,
                            rightCyl ? Number(rightCyl) : null,
                            nextAxis,
                            rightAdd ?? null,
                          )
                        : [];

                      if (
                        rightSph &&
                        nextSphereOptions.length &&
                        !nextSphereOptions.includes(Number(rightSph))
                      ) {
                        setRightSph("");
                      }
                    }}
                  >
                    <option value="">Axis</option>
                    {rightAxisOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <EmptyHint />
                </div>
              )}

              {rightLens?.type.multifocal && (
                <div className="rx-field">
                  <EmptyLabel />
                  <div
                    className={fieldErrors.right?.add ? "rx-error-wrap" : ""}
                  >
                    <AddSelector
                      value={rightAdd ?? ""}
                      onChange={(v) => setRightAdd(v)}
                      options={resolveAddOptions(
                        rightLens,
                        rightBC ? Number(rightBC) : null,
                        rightSph ? Number(rightSph) : null,
                      )}
                    />
                  </div>
                  <EmptyHint />
                </div>
              )}

              {rightLens &&
                rightLens.parameters.baseCurve &&
                rightLens.parameters.baseCurve.length > 1 && (
                  <div className="rx-field">
                    <EmptyLabel />
                    <select
                      className={cls("rx-select", fieldErrors.right?.bc)}
                      value={rightBC}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRightBC(v);
                        const nextBC = v ? Number(v) : null;

                        if (rightLens?.type.multifocal) {
                          const nextAddOptions = resolveAddOptions(
                            rightLens,
                            nextBC,
                            rightSph ? Number(rightSph) : null,
                          );

                          if (rightAdd && !nextAddOptions.includes(rightAdd)) {
                            setRightAdd("");
                          }
                        }
                      }}
                    >
                      <option value="">BC</option>
                      {rightLens.parameters.baseCurve
                        .filter((bc) => {
                          if (!rightLens.type.multifocal) return true;
                          if (!rightAdd) return bc !== 8.7;

                          const isXRAdd = rightAdd.endsWith("N");
                          if (!isXRAdd && bc === 8.7) return false;

                          return true;
                        })
                        .map((bc) => (
                          <option key={bc} value={formatBC(bc)}>
                            {formatBC(bc)}
                          </option>
                        ))}
                    </select>
                    <EmptyHint />
                  </div>
                )}

              {rightLens &&
                rightLens.parameters.baseCurve &&
                rightLens.parameters.baseCurve.length === 1 && (
                  <div className="rx-field">
                    <EmptyLabel />
                    <input
                      className={cls("rx-input", fieldErrors.right?.bc)}
                      value={
                        rightLens.parameters.baseCurve?.[0]
                          ? formatBC(rightLens.parameters.baseCurve[0])
                          : ""
                      }
                      disabled
                    />
                    <EmptyHint />
                  </div>
                )}

              {rightLens && rightColorOptions.length > 0 && (
                <div className="rx-field">
                  <EmptyLabel />
                  <div
                    className={fieldErrors.right?.color ? "rx-error-wrap" : ""}
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

            {(mode === "manual" || lensCardState === "error") && (
              <button
                type="button"
                className="copy-eye-btn"
                disabled={!leftcoreId && !leftLensNotListed}
                onClick={copyLeftToRight}
              >
                Copy to right eye
              </button>
            )}
          </div>

          {eyeHasErrors("left") && (
            <div className="rx-eye-error">
              Please complete the highlighted fields.
            </div>
          )}

          <div className="rx-eye">
            <div className="rx-grid">
              <div className="rx-field">
                {mode === "ocr" ? (
                  <label className="rx-label">
                    Select the exact lens written on your prescription
                  </label>
                ) : (
                  <EmptyLabel />
                )}

                <select
                  className={cls("lens-select", fieldErrors.left?.lens)}
                  value={leftLensNotListed ? NOT_LISTED_VALUE : leftcoreId}
                  onChange={(e) => {
                    const val = e.target.value;

                    if (val === NOT_LISTED_VALUE) {
                      setLeftcoreId("");
                      setLeftLensNotListed(true);
                    } else {
                      setLeftcoreId(val);
                      setLeftLensNotListed(false);
                    }
                  }}
                >
                  <option value="">Select lens</option>
                  {(mode === "ocr" && proposedLensId
                    ? lenses.filter((l) =>
                        isLensFamilyMatch(l.coreId, proposedLensId),
                      )
                    : lenses
                  ).map((l) => (
                    <option key={l.coreId} value={l.coreId}>
                      {getLensDisplayName(l.coreId, null)}
                    </option>
                  ))}

                  <option value={NOT_LISTED_VALUE}>My lens isn’t listed</option>
                </select>

                {leftLensNotListed ? (
                  <div className="rx-hint">
                    We’ll review the prescription you uploaded and assist
                    manually if this lens isn’t in our catalog yet.
                  </div>
                ) : (
                  mode === "ocr" &&
                  proposalConfidence === "high" &&
                  proposedLensId && (
                    <div className="rx-hint">
                      Detected from your prescription.
                    </div>
                  )
                )}
              </div>

              <div className="rx-field">
                <EmptyLabel />
                <select
                  className={cls("rx-select", fieldErrors.left?.sph)}
                  value={leftSph}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLeftSph(v);

                    const nextSph = v ? Number(v) : null;

                    const nextAxisOptions = leftLens
                      ? resolveAxisOptions(
                          leftLens,
                          leftCyl ? Number(leftCyl) : null,
                          nextSph,
                        )
                      : [];

                    if (
                      leftAxis &&
                      nextAxisOptions.length &&
                      !nextAxisOptions.includes(Number(leftAxis))
                    ) {
                      setLeftAxis("");
                    }
                  }}
                >
                  <option value="">SPH</option>
                  {leftSphereOptions.map((v) => {
                    const str = formatSphere(v);
                    return (
                      <option key={v} value={str}>
                        {str}
                      </option>
                    );
                  })}
                </select>
                <div className="rx-hint">{PLANO_HINT}</div>
              </div>

              {leftLens?.type.toric && (
                <div className="rx-field">
                  <EmptyLabel />
                  <select
                    className={cls("rx-select", fieldErrors.left?.cyl)}
                    value={leftCyl}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLeftCyl(v);

                      const nextCyl = v ? Number(v) : null;

                      const nextAxisOptions = leftLens
                        ? resolveAxisOptions(
                            leftLens,
                            nextCyl,
                            leftSph ? Number(leftSph) : null,
                          )
                        : [];

                      if (
                        leftAxis &&
                        nextAxisOptions.length &&
                        !nextAxisOptions.includes(Number(leftAxis))
                      ) {
                        setLeftAxis("");
                      }

                      const nextSphereOptions = leftLens
                        ? resolveSphereOptions(
                            leftLens,
                            leftBC ? Number(leftBC) : null,
                            nextCyl,
                            leftAxis ? Number(leftAxis) : null,
                            leftAdd ?? null,
                          )
                        : [];

                      if (
                        leftSph &&
                        nextSphereOptions.length &&
                        !nextSphereOptions.includes(Number(leftSph))
                      ) {
                        setLeftSph("");
                      }
                    }}
                  >
                    <option value="">CYL</option>
                    {leftCylOptions.map((v) => (
                      <option key={v} value={formatHundredths(v)}>
                        {formatHundredths(v)}
                      </option>
                    ))}
                  </select>
                  <EmptyHint />
                </div>
              )}

              {leftLens?.type.toric && (
                <div className="rx-field">
                  <EmptyLabel />
                  <select
                    className={cls("rx-select", fieldErrors.left?.axis)}
                    value={leftAxis}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLeftAxis(v);

                      const nextAxis = v ? Number(v) : null;

                      const nextCylOptions = leftLens
                        ? resolveCylinderOptions(
                            leftLens,
                            nextAxis,
                            leftSph ? Number(leftSph) : null,
                          )
                        : [];

                      if (
                        leftCyl &&
                        nextCylOptions.length &&
                        !nextCylOptions.includes(Number(leftCyl))
                      ) {
                        setLeftCyl("");
                      }

                      const nextSphereOptions = leftLens
                        ? resolveSphereOptions(
                            leftLens,
                            leftBC ? Number(leftBC) : null,
                            leftCyl ? Number(leftCyl) : null,
                            nextAxis,
                            leftAdd ?? null,
                          )
                        : [];

                      if (
                        leftSph &&
                        nextSphereOptions.length &&
                        !nextSphereOptions.includes(Number(leftSph))
                      ) {
                        setLeftSph("");
                      }
                    }}
                  >
                    <option value="">Axis</option>
                    {leftAxisOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <EmptyHint />
                </div>
              )}

              {leftLens?.type.multifocal && (
                <div className="rx-field">
                  <EmptyLabel />
                  <div className={fieldErrors.left?.add ? "rx-error-wrap" : ""}>
                    <AddSelector
                      value={leftAdd ?? ""}
                      onChange={(v) => setLeftAdd(v)}
                      options={resolveAddOptions(
                        leftLens,
                        leftBC ? Number(leftBC) : null,
                        leftSph ? Number(leftSph) : null,
                      )}
                    />
                  </div>
                  <EmptyHint />
                </div>
              )}

              {leftLens &&
                leftLens.parameters.baseCurve &&
                leftLens.parameters.baseCurve.length > 1 && (
                  <div className="rx-field">
                    <EmptyLabel />
                    <select
                      className={cls("rx-select", fieldErrors.left?.bc)}
                      value={leftBC}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLeftBC(v);

                        const nextBC = v ? Number(v) : null;

                        if (leftLens?.type.multifocal) {
                          const nextAddOptions = resolveAddOptions(
                            leftLens,
                            nextBC,
                            leftSph ? Number(leftSph) : null,
                          );

                          if (leftAdd && !nextAddOptions.includes(leftAdd)) {
                            setLeftAdd("");
                          }
                        }
                      }}
                    >
                      <option value="">BC</option>
                      {leftLens.parameters.baseCurve
                        .filter((bc) => {
                          if (!leftLens.type.multifocal) return true;
                          if (!leftAdd) return bc !== 8.7;

                          const isXRAdd = leftAdd.endsWith("N");
                          if (!isXRAdd && bc === 8.7) return false;

                          return true;
                        })
                        .map((bc) => (
                          <option key={bc} value={formatBC(bc)}>
                            {formatBC(bc)}
                          </option>
                        ))}
                    </select>
                    <EmptyHint />
                  </div>
                )}

              {leftLens &&
                leftLens.parameters.baseCurve &&
                leftLens.parameters.baseCurve.length === 1 && (
                  <div className="rx-field">
                    <EmptyLabel />
                    <input
                      className={cls("rx-input", fieldErrors.left?.bc)}
                      value={
                        leftLens.parameters.baseCurve?.[0]
                          ? formatBC(leftLens.parameters.baseCurve[0])
                          : ""
                      }
                      disabled
                    />
                    <EmptyHint />
                  </div>
                )}

              {leftLens && leftColorOptions.length > 0 && (
                <div className="rx-field">
                  <EmptyLabel />
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

              <ExpirationDatePicker
                value={expires}
                onChange={setExpires}
                hasError={fieldErrors.expires}
              />

              {fieldErrors.expires && (
                <div className="rx-hint" style={{ marginTop: 4 }}>
                  A valid, unexpired prescription date is required to proceed.
                </div>
              )}
            </div>

            <button
              className={
                isMobile
                  ? `mobile-cta ${!loading ? "active" : "disabled"}`
                  : "primary-btn"
              }
              onClick={submitRx}
              disabled={loading}
            >
              {loading ? "Processing…" : <>Review & Continue ➜</>}
            </button>
          </div>
        </div>

        {mode === "manual" && (
          <div className="order-actions">
            <Link href="/upload-prescription" className="ghost-link">
              Upload prescription instead
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
