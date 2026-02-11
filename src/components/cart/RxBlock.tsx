"use client";

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

/* =========================
   Helpers (local to display)
========================= */

// Format numbers like −1.25, +2, 0
function fmtNum(n: number) {
  const abs = Math.abs(n);
  const s = abs.toFixed(2).replace(/\.00$/, "");
  return n < 0 ? `−${s}` : `+${s}`;
}

/* =========================
   Component
========================= */

export default function RxBlock({ rx }: { rx: EyeRx }) {
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
                <div className="hl-rx-value">
                  {fmtNum(rx.cylinder)}
                </div>
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
