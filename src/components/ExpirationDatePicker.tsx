"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import "react-day-picker/dist/style.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
};

export default function ExpirationDatePicker({
  value,
  onChange,
  hasError,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const today = new Date();

  const selectedDate = value ? new Date(value + "T00:00:00") : undefined;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(date: Date | undefined) {
    if (!date) return;

    const formatted = format(date, "yyyy-MM-dd");
    onChange(formatted);
    setOpen(false);
  }

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", width: "100%" }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        <input
          readOnly
          value={value}
          placeholder="YYYY-MM-DD"
          onClick={() => setOpen((prev) => !prev)}
          className={`rx-input ${hasError ? "rx-error" : ""}`}
          style={{ paddingRight: 36, cursor: "pointer" }}
        />

        <div
          onClick={() => setOpen((prev) => !prev)}
          style={{
            position: "absolute",
            right: 10,
            cursor: "pointer",
            opacity: 0.6,
            fontSize: 16,
            userSelect: "none",
          }}
        >
          📅
        </div>
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            marginTop: 8,
            background: "#0f172a",
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
          }}
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            fromDate={today}
          />
        </div>
      )}
    </div>
  );
}