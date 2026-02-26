"use client";

import { useEffect, useState } from "react";

type DeviceMode = "private" | "public" | null;

export default function DeviceModeGate() {
  // Lazy init avoids effect-triggered state update warning
  const [showPrompt, setShowPrompt] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("hl_device_mode");
  });

  function wipeSensitiveStorage() {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("hl_")) {
        localStorage.removeItem(k);
      }
    });
    sessionStorage.clear();
  }

  useEffect(() => {
    const mode = localStorage.getItem("hl_device_mode");

    if (mode === "public") {
      wipeSensitiveStorage();
    }
  }, []);

  function choose(mode: DeviceMode) {
    localStorage.setItem("hl_device_mode", mode || "private");

    document.cookie = `hl_device=${mode}; path=/; max-age=31536000`;

    if (mode === "public") wipeSensitiveStorage();

    setShowPrompt(false);
  }

  if (!showPrompt) return null;

  return (
    <div className="hl-overlay">
      <div className="hl-overlay-card">
        <h2>This computer is…</h2>

        <button
          className="hl-primary-btn"
          onClick={() => choose("private")}
        >
          My personal device
        </button>

        <button
          className="hl-secondary-btn"
          onClick={() => choose("public")}
        >
          Shared / public computer
        </button>

        <p className="hl-note">
          Shared devices automatically clear saved data like carts,
          prescription drafts, and session info.
        </p>
      </div>

      <style jsx>{`
        .hl-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
        }

        .hl-overlay-card {
          background: #0b0b0b;
          border: 1px solid rgba(207, 199, 255, 0.25);
          padding: 40px 32px;
          border-radius: 18px;
          max-width: 440px;
          width: 90%;
          text-align: center;
          color: #ddd;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        }

        .hl-primary-btn {
          background: #cfc7ff;
          color: #000;
          padding: 10px 18px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 500;
          width: 100%;
          margin-bottom: 12px;
        }

        .hl-secondary-btn {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ddd;
          padding: 10px 18px;
          border-radius: 8px;
          cursor: pointer;
          width: 100%;
          margin-bottom: 12px;
        }

        .hl-note {
          margin-top: 14px;
          font-size: 12px;
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
}