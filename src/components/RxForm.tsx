"use client";

import { useEffect, useState } from "react";
import { resolveBrand } from "@/lib/resolveBrand";
import { lenses } from "@/LensCore"; // adjust path if needed

/* =========================
   TYPES
========================= */

type EyeRxDraft = {
  coreId: string;
  brand: string;
  sph: string;
  cyl: string;
  axis: string;
  add: string;
  bc: string;
  dia: string;
  color: string;
};

export type RxDraft = {
  right: EyeRxDraft;
  left: EyeRxDraft;
  expires: string;
};

/* =========================
   VALIDATION
========================= */

function validateEye(d: EyeRxDraft) {
  const isEmpty =
    !d.coreId &&
    !d.brand &&
    !d.sph &&
    !d.cyl &&
    !d.axis &&
    !d.add &&
    !d.bc &&
    !d.dia &&
    !d.color;

  return { ok: !isEmpty };
}

/* =========================
   COMPONENT
========================= */

export default function RxForm({
  initialDraft,
}: {
  initialDraft?: RxDraft | null;
}) {
  /* =========================
     STATE
  ========================= */

  /* =========================
     APPLY INITIAL
  ========================= */

  const [right, setRight] = useState<EyeRxDraft>(
    initialDraft?.right ?? {
      coreId: "",
      brand: "",
      sph: "",
      cyl: "",
      axis: "",
      add: "",
      bc: "",
      dia: "",
      color: "",
    },
  );

  const [left, setLeft] = useState<EyeRxDraft>(
    initialDraft?.left ?? {
      coreId: "",
      brand: "",
      sph: "",
      cyl: "",
      axis: "",
      add: "",
      bc: "",
      dia: "",
      color: "",
    },
  );

  const [expires, setExpires] = useState(initialDraft?.expires ?? "");

  /* =========================
     SAVE DRAFT
  ========================= */

  useEffect(() => {
    const draft: RxDraft = { right, left, expires };
    localStorage.setItem("rxDraft", JSON.stringify(draft));
  }, [right, left, expires]);

  /* =========================
     SUBMIT
  ========================= */

  function submitRx() {
    const r = validateEye(right);
    const l = validateEye(left);

    if (!r.ok && !l.ok) {
      alert("Enter at least one eye");
      return;
    }

    const resolveEye = (eye: typeof right) => {
      const result = resolveBrand(
        {
          rawString: eye.brand,
          hasCyl: !!eye.cyl,
          hasAdd: !!eye.add,
          bc: eye.bc ? Number(eye.bc) : null,
          dia: eye.dia ? Number(eye.dia) : null,
        },
        lenses,
      );

      return {
        ...eye,
        coreId: result.lensId,
        resolveMeta: result,
      };
    };

    const resolvedRight = resolveEye(right);
    const resolvedLeft = resolveEye(left);

    const eyes = [
      { label: "Right eye", data: resolvedRight },
      { label: "Left eye", data: resolvedLeft },
    ];

    // 🔥 CONFIDENCE GATING
    for (const eye of eyes) {
      const meta = eye.data.resolveMeta;

      if (!meta) continue;

      if (meta.confidence === "low") {
        alert(
          `${eye.label}: Unable to confidently identify lens.\nPlease enter a more specific brand.`,
        );
        return;
      }

      if (meta.confidence === "medium") {
        const confirm = window.confirm(
          `${eye.label}: Lens match is uncertain.\n\nContinue anyway?`,
        );

        if (!confirm) return;
      }
    }

    // ✅ SAFE TO PROCEED
    console.log("RESOLVED RX", {
      right: resolvedRight,
      left: resolvedLeft,
      expires,
    });
  }

  /* =========================
     UI
  ========================= */

  const renderEye = (
    label: string,
    eye: EyeRxDraft,
    setEye: (e: EyeRxDraft) => void,
  ) => (
    <div style={{ marginBottom: 30 }}>
      <h3>{label}</h3>

      <input
        placeholder="Brand"
        value={eye.brand}
        onChange={(e) =>
          setEye({
            ...eye,
            brand: e.target.value,
          })
        }
      />

      <input
        placeholder="Sphere"
        value={eye.sph}
        onChange={(e) => setEye({ ...eye, sph: e.target.value })}
      />

      <input
        placeholder="Cylinder"
        value={eye.cyl}
        onChange={(e) => setEye({ ...eye, cyl: e.target.value })}
      />

      <input
        placeholder="Axis"
        value={eye.axis}
        onChange={(e) => setEye({ ...eye, axis: e.target.value })}
      />

      <input
        placeholder="Add"
        value={eye.add}
        onChange={(e) => setEye({ ...eye, add: e.target.value })}
      />

      <input
        placeholder="Base Curve"
        value={eye.bc}
        onChange={(e) => setEye({ ...eye, bc: e.target.value })}
      />

      <input
        placeholder="Diameter"
        value={eye.dia}
        onChange={(e) => setEye({ ...eye, dia: e.target.value })}
      />

      <input
        placeholder="Color"
        value={eye.color}
        onChange={(e) => setEye({ ...eye, color: e.target.value })}
      />
    </div>
  );

  return (
    <div style={{ padding: 40 }}>
      <h2>Prescription</h2>

      {renderEye("Right Eye (OD)", right, setRight)}
      {renderEye("Left Eye (OS)", left, setLeft)}

      <div style={{ marginTop: 20 }}>
        <input
          placeholder="Expiration Date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
        />
      </div>

      <button style={{ marginTop: 20 }} onClick={submitRx}>
        Submit
      </button>
    </div>
  );
}
