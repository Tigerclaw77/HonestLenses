"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type SuccessMode = "uploaded" | "passive" | "unknown";

function parseMode(raw: string | null): SuccessMode {
  if (raw === "uploaded") return "uploaded";
  if (raw === "passive") return "passive";
  return "unknown";
}

function parseDeadline(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    localStorage.removeItem("rx_upload_order_id");
  }, []);

  const mode = parseMode(searchParams.get("mode"));
  const deadlineDate = parseDeadline(searchParams.get("deadline"));
  const orderId = searchParams.get("orderId");

  const isUploaded = mode === "uploaded";
  const isPassive = mode === "passive";
  const isUnknown = mode === "unknown";

  let title = "Order Received";
  let subText =
    "Your order has been received and is now being processed.";
  let noteText =
    "You can check your account for the latest order status.";
  let bullets: string[] = [
    "We’ve received your order",
    "We’ll email you if any follow-up is needed",
    "You can review your order status in your account",
  ];

  if (isUploaded) {
    title = "Order Received";
    subText =
      "Your prescription has been received and verified. Your order is now being processed.";
    noteText =
      "Your payment has been processed and your order is moving into fulfillment.";
    bullets = [
      "Your prescription has been confirmed",
      "Your order is being prepared for shipment",
      "You’ll receive tracking once it ships",
    ];
  }

  if (isPassive) {
    title = "Order Received - Verification In Progress";
    subText =
      "Your payment has been authorized. Prescription confirmation is required before shipment.";
    noteText =
      "Your payment has been authorized and will be captured once prescription verification is complete.";
    bullets = [
      "Your order is pending prescription verification",
      "Most verifications are completed within 8 business hours",
      "We’ll email you once verification is complete",
      "If clarification is needed, we’ll contact you",
    ];
  }

  if (isUnknown) {
    title = "Order Received";
    subText =
      "We received your order, but the confirmation details were incomplete.";
    noteText =
      "Please check your email or account for the latest order status.";
    bullets = [
      "Your order was received",
      "We’ll contact you if anything further is needed",
      "You can review your order status in your account",
    ];
  }

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

          .hl-actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-top: 28px;
          }

          .hl-secondary-btn,
          .hl-primary-btn {
            padding: 16px 24px;
            border-radius: 12px;
            font-weight: 700;
            letter-spacing: 0.4px;
            cursor: pointer;
            transition: background 140ms ease, border-color 140ms ease;
          }

          .hl-secondary-btn {
            background: rgba(148, 163, 184, 0.12);
            color: #e2e8f0;
            border: 1px solid rgba(148, 163, 184, 0.25);
          }

          .hl-secondary-btn:hover {
            background: rgba(148, 163, 184, 0.2);
            border-color: rgba(148, 163, 184, 0.4);
          }

          .hl-primary-btn {
            background: linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%);
            color: #ffffff;
            border: 1px solid rgba(37, 99, 235, 0.4);
          }

          .hl-primary-btn:hover {
            filter: brightness(1.05);
          }

          .hl-order-id {
            margin-top: 8px;
            font-size: 14px;
            color: #94a3b8;
          }
        `}</style>

        <div className="hl-success-card">
          <h1 className="hl-success-title">{title}</h1>

          <p className="hl-success-sub">{subText}</p>

          {orderId && <p className="hl-order-id">Order ID: {orderId}</p>}

          <div className="hl-blue-panel">
            <ul>
              {bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <p className="hl-note">{noteText}</p>

          {deadlineDate && isPassive && (
            <p className="hl-note" style={{ marginTop: 6 }}>
              Estimated verification window ends:{" "}
              <strong style={{ color: "#e2e8f0" }}>
                {deadlineDate.toLocaleString()}
              </strong>
            </p>
          )}

          {isUnknown && (
            <p className="hl-note" style={{ marginTop: 6 }}>
              Confirmation mode was missing or invalid in the URL. This does not
              necessarily mean your order failed, but the page could not
              determine the exact checkout state.
            </p>
          )}

          <div className="hl-actions">
            <button
              className="hl-primary-btn"
              onClick={() => router.push("/dashboard")}
            >
              Go to My Account
            </button>

            <button
              className="hl-secondary-btn"
              onClick={() => router.push("/upload-prescription")}
            >
              Place Another Order
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}