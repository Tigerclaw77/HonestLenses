"use client";

import React from "react";

/* =========================
   Types
========================= */

export type EyeRx = {
  lens_id: string;
  sphere: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
  color?: string;
};

type EyeRowProps = {
  label: "RIGHT EYE" | "LEFT EYE";
  lensName: string;
  rx: EyeRx;
  qty: number;
  onQty: (v: number) => void;
  unitPricePerBoxCents: number | null;
  durationLabel: string;
  quantityOptions: number[];
  disabled?: boolean;
};

/* =========================
   Formatters (UI only)
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

/* =========================
   RX Display
========================= */

function RxBlock({ rx }: { rx: EyeRx }) {
  return (
    <div className="hl-rx-block">
      <div className="hl-rx-row">
        <div className="hl-rx-col">
          <div className="hl-rx-label">SPH</div>
          <div className="hl-rx-value">{fmtNum(rx.sphere)}</div>
        </div>

        {typeof rx.cylinder === "number" &&
          typeof rx.axis === "number" && (
            <>
              <div className="hl-rx-col">
                <div className="hl-rx-label">CYL</div>
                <div className="hl-rx-value">{fmtNum(rx.cylinder)}</div>
              </div>

              <div className="hl-rx-col">
                <div className="hl-rx-label">AXIS</div>
                <div className="hl-rx-value">{rx.axis}</div>
              </div>
            </>
          )}
      </div>

      {rx.add ? (
        <div className="hl-rx-add">
          <span className="hl-rx-add-label">ADD</span>
          <span className="hl-rx-add-value">{rx.add}</span>
        </div>
      ) : null}

      {rx.color ? (
        <div className="hl-rx-color">
          <span className="hl-rx-color-label">Color</span>
          <span className="hl-rx-color-value">{rx.color}</span>
        </div>
      ) : null}
    </div>
  );
}

/* =========================
   Eye Row
========================= */

export default function EyeRow(props: EyeRowProps) {
  const {
    label,
    lensName,
    rx,
    qty,
    onQty,
    unitPricePerBoxCents,
    durationLabel,
    quantityOptions,
    disabled,
  } = props;

  const eyeTotalCents =
    typeof unitPricePerBoxCents === "number"
      ? unitPricePerBoxCents * qty
      : null;

  return (
    <div className="hl-eye">
      <div className="hl-eye-label">{label}</div>
      <div className="hl-eye-lens">{lensName}</div>

      <RxBlock rx={rx} />

      <div className="hl-eye-controls">
        <div className="hl-eye-price">
          {fmtPrice(unitPricePerBoxCents)} / box{" "}
          <span className="hl-pack">({durationLabel})</span>

          <div className="hl-eye-total">
            Eye total: {fmtPrice(eyeTotalCents)}
          </div>
        </div>

        <select
          className="hl-eye-select"
          value={qty}
          disabled={Boolean(disabled)}
          onChange={(e) => onQty(Number(e.target.value))}
        >
          {quantityOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
