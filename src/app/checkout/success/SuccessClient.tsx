"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    localStorage.removeItem("rx_upload_order_id");
  }, []);

  const mode = searchParams.get("mode") ?? "passive"; // default safe
  const deadline = searchParams.get("deadline");

  const isPassive = mode === "passive";
  const isUploaded = mode === "uploaded";

  return (
    <main>
      <section className="content-shell">
        <style>{`
          .hl-success-card {
            margin-top: 40px;
            background: rgba(15, 23, 42, 0.75);
            border: 1px solid rgba(148, 163, 184, 0.18);
            border-radius: 20px;
            padding: 36px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.55);
            max-width: 820px;
          }

          .hl-success-title {
            font-size: 34px;
            font-weight: 900;
            letter-spacing: 0.2px;
            color: #ffffff;
            margin-bottom: 14px;
          }

          .hl-success-sub {
            font-size: 16px;
            color: #cbd5e1;
            line-height: 1.6;
            margin-bottom: 28px;
            max-width: 640px;
          }

          .hl-blue-panel {
            border-left: 4px solid #2563eb;
            background: rgba(37, 99, 235, 0.07);
            padding: 20px 22px;
            border-radius: 14px;
            margin-bottom: 26px;
          }

          .hl-blue-panel ul {
            margin: 0;
            padding-left: 18px;
          }

          .hl-blue-panel li {
            margin-bottom: 8px;
            color: #e2e8f0;
            font-size: 15px;
            line-height: 1.5;
          }

          .hl-note {
            margin-top: 18px;
            font-size: 14px;
            color: #94a3b8;
            line-height: 1.5;
          }

          .hl-secondary-btn {
            margin-top: 28px;
            padding: 16px 24px;
            background: rgba(148, 163, 184, 0.12);
            color: #e2e8f0;
            border-radius: 12px;
            border: 1px solid rgba(148, 163, 184, 0.25);
            font-weight: 700;
            letter-spacing: 0.4px;
            cursor: pointer;
            transition: background 140ms ease, border-color 140ms ease;
          }

          .hl-secondary-btn:hover {
            background: rgba(148, 163, 184, 0.2);
            border-color: rgba(148, 163, 184, 0.4);
          }
        `}</style>

        <div className="hl-success-card">
          <h1 className="hl-success-title">
            {isUploaded
              ? "Order Received"
              : "Order Received - Verification In Progress"}
          </h1>

          <p className="hl-success-sub">
            {isUploaded
              ? "Your prescription has been received and verified. Your order is now being processed."
              : "Your payment has been authorized. Prescription confirmation is required before shipment."}
          </p>

          <div className="hl-blue-panel">
            <ul>
              {isPassive && (
                <>
                  <li>Your order is pending prescription verification</li>
                  <li>
                    Most verifications are completed within 8 business hours
                  </li>
                  <li>We’ll email you once verification is complete</li>
                  <li>If clarification is needed, we’ll contact you</li>
                </>
              )}

              {isUploaded && (
                <>
                  <li>Your prescription has been confirmed</li>
                  <li>Your order is being prepared for shipment</li>
                  {/* <li>We’ll notify you if anything is needed</li> */}
                  <li>You’ll receive tracking once it ships</li>
                </>
              )}
            </ul>
          </div>

          <p className="hl-note">
            Your payment has been authorized and will be captured shortly.
          </p>

          {deadline && isPassive && (
            <p className="hl-note" style={{ marginTop: 6 }}>
              Estimated verification window ends:{" "}
              <strong style={{ color: "#e2e8f0" }}>
                {new Date(deadline).toLocaleString()}
              </strong>
            </p>
          )}

          <button
            className="hl-secondary-btn"
            onClick={() => router.push("/upload-prescription")}
          >
            Place Another Order
          </button>
        </div>
      </section>
    </main>
  );
}
