"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

type Props = {
  value: string; // stored as "yyyy-MM-dd"
  onChange: (value: string) => void;
  hasError?: boolean;
};

type CalendarPos =
  | { mode: "dropdown"; top: number; left: number; width: number }
  | { mode: "sheet" };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function ExpirationDatePicker({
  value,
  onChange,
  hasError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CalendarPos | null>(null);
  const [month, setMonth] = useState<Date>(() => {
    if (value) {
      const d = new Date(`${value}T00:00:00`);
      if (!isNaN(d.getTime())) {
        return new Date(d.getFullYear(), d.getMonth(), 1);
      }
    }

    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // “today” normalized to local midnight (avoids time drift)
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const selectedDate = useMemo(() => {
    return value ? new Date(value + "T00:00:00") : null;
  }, [value]);

  // Build a 6-week grid (42 cells) starting Sunday (US style)
  const days = useMemo(() => {
    const base =
      !month || isNaN(month.getTime())
        ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        : month;

    const start = startOfWeek(startOfMonth(base), { weekStartsOn: 0 });

    const total = 42;
    const list: Date[] = [];

    for (let i = 0; i < total; i++) {
      list.push(addDays(start, i));
    }

    return list;
  }, [month]);

  const isMobile = typeof window !== "undefined" && window.innerWidth <= 899;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!open) return;
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function openCalendar() {
    if (!wrapperRef.current) return;

    const rect = wrapperRef.current.getBoundingClientRect();

    if (isMobile) {
      setPos({ mode: "sheet" });
      setOpen(true);
      return;
    }

    // Desktop dropdown: keep within viewport
    const dropdownWidth = Math.max(320, Math.min(380, rect.width));
    const left = clamp(rect.left, 12, window.innerWidth - dropdownWidth - 12);

    // Estimate height (~380-420). We’ll open above if needed.
    const estimatedHeight = 420;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < estimatedHeight;

    const top = openAbove ? rect.top - estimatedHeight - 10 : rect.bottom + 10;

    setPos({
      mode: "dropdown",
      top: clamp(top, 12, window.innerHeight - estimatedHeight - 12),
      left,
      width: dropdownWidth,
    });

    setOpen(true);
  }

  function toggle() {
    if (open) setOpen(false);
    else openCalendar();
  }

  function selectDay(d: Date) {
    if (isBefore(d, today)) return;

    const formatted = format(d, "yyyy-MM-dd");

    setTypedValue(""); // ADD THIS
    onChange(formatted);
    setOpen(false);
  }

  // If user picks a date, keep calendar month aligned to it next time
  // useEffect(() => {
  //   if (!selectedDate) return;
  //   setMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  // }, [selectedDate]);

  const weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const [typedValue, setTypedValue] = useState(() => {
    if (!value) return "";

    const parsed = new Date(`${value}T00:00:00`);
    if (isNaN(parsed.getTime())) return "";

    return format(parsed, "MM/dd/yyyy");
  });

  useEffect(() => {
    if (!value) {
      setTypedValue("");
      return;
    }

    const parsed = new Date(`${value}T00:00:00`);
    if (isNaN(parsed.getTime())) return;

    setTypedValue(format(parsed, "MM/dd/yyyy"));
  }, [value]);

  const displayValue = typedValue;

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      {/* Input */}
      <div
        style={{ position: "relative", display: "flex", alignItems: "center" }}
      >
        <input
          value={displayValue}
          placeholder="MM/DD/YYYY"
          onClick={toggle}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 8);

            let m = "";
            let d = "";
            let y = "";

            if (digits.length === 5) {
              // M DD YY
              m = digits[0].padStart(2, "0");
              d = digits.slice(1, 3);
              y = `20${digits.slice(3, 5)}`;
            } else if (digits.length === 6) {
              // MM DD YY
              m = digits.slice(0, 2);
              d = digits.slice(2, 4);
              y = `20${digits.slice(4, 6)}`;
            } else if (digits.length === 8) {
              // MM DD YYYY
              m = digits.slice(0, 2);
              d = digits.slice(2, 4);
              y = digits.slice(4, 8);
            } else {
              // progressive formatting
              if (digits.length >= 1) m = digits.slice(0, 2);
              if (digits.length >= 3) d = digits.slice(2, 4);
              if (digits.length >= 5) y = digits.slice(4);
            }

            let formatted = m;

            if (d) formatted += `/${d}`;
            if (y) formatted += `/${y}`;

            setTypedValue(formatted);

            if (m.length === 2 && d.length === 2 && y.length === 4) {
              const iso = `${y}-${m}-${d}`;
              const parsed = new Date(`${iso}T00:00:00`);

              if (!isNaN(parsed.getTime())) {
                onChange(iso);
                setMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
              }
            }
          }}
          onBlur={() => {
            if (!typedValue) return;

            const parts = typedValue.split("/");

            if (parts.length !== 3) return;

            const [m, d, y] = parts;

            if (y.length !== 4) return;

            const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
            const parsed = new Date(`${iso}T00:00:00`);

            if (isNaN(parsed.getTime())) return;

            onChange(iso);
          }}
          className={`rx-input ${hasError ? "rx-error" : ""}`}
          style={{
            paddingRight: 42,
            width: "100%",
          }}
        />
        {/* Calendar icon (no emoji) */}
        <button
          type="button"
          onClick={toggle}
          aria-label="Open calendar"
          style={{
            position: "absolute",
            right: 8,
            width: 32,
            height: 32,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.85)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* simple calendar glyph */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7 2v3M17 2v3M4 9h16M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Popover / Sheet */}
      {open && pos && (
        <>
          {/* Mobile backdrop */}
          {pos.mode === "sheet" && (
            <div
              onClick={() => setOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.65)",
                zIndex: 9998,
              }}
            />
          )}

          <div
            style={
              pos.mode === "sheet"
                ? {
                    position: "fixed",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 9999,
                    padding: 18,
                    background:
                      "linear-gradient(180deg, rgba(12,18,32,0.98), rgba(7,10,18,0.98))",
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 18,
                    boxShadow: "0 -18px 60px rgba(0,0,0,0.75)",
                  }
                : {
                    position: "fixed",
                    top: pos.top,
                    left: pos.left,
                    width: pos.width,
                    zIndex: 9999,
                    padding: 14,
                    background:
                      "linear-gradient(180deg, rgba(12,18,32,0.98), rgba(7,10,18,0.98))",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    boxShadow: "0 18px 60px rgba(0,0,0,0.75)",
                  }
            }
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <button
                type="button"
                onClick={() => setMonth((m) => subMonths(m, 1))}
                aria-label="Previous month"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.92)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* bold chevron */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M15 6l-6 6 6 6"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <div
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  color: "rgba(255,255,255,0.96)",
                }}
              >
                {!isNaN(month.getTime()) ? format(month, "MMMM yyyy") : ""}
              </div>

              <button
                type="button"
                onClick={() => setMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.92)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M9 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            {/* Weekday labels */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 8,
                padding: "4px 2px 10px",
              }}
            >
              {weekdayLabels.map((w) => (
                <div
                  key={w}
                  style={{
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    color: "rgba(207,199,255,0.72)",
                  }}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 8,
                paddingBottom: pos.mode === "sheet" ? 8 : 0,
              }}
            >
              {days.map((d, i) => {
                const inMonth = isSameMonth(d, month);
                const disabled = isBefore(d, today);
                const selected = selectedDate
                  ? isSameDay(d, selectedDate)
                  : false;
                const isToday = isSameDay(d, today);

                const baseBg = selected
                  ? "linear-gradient(180deg, rgba(34,197,94,0.95), rgba(16,185,129,0.88))"
                  : "rgba(255,255,255,0.05)";

                const border = selected
                  ? "1px solid rgba(255,255,255,0.25)"
                  : isToday
                    ? "1px solid rgba(207,199,255,0.38)"
                    : "1px solid rgba(255,255,255,0.10)";

                const textColor = selected
                  ? "#07110b"
                  : disabled
                    ? "rgba(255,255,255,0.22)"
                    : inMonth
                      ? "rgba(255,255,255,0.92)"
                      : "rgba(255,255,255,0.45)";

                return (
                  <button
                    key={`${d.getTime()}-${i}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectDay(d)}
                    style={{
                      height: 44,
                      borderRadius: 12,
                      border,
                      background: baseBg,
                      color: textColor,
                      fontSize: 15,
                      fontWeight: selected ? 800 : 600,
                      cursor: disabled ? "not-allowed" : "pointer",
                      boxShadow: selected
                        ? "0 10px 22px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.35)"
                        : "inset 0 1px 0 rgba(255,255,255,0.06)",
                      opacity: disabled ? 0.65 : 1,
                      userSelect: "none",
                    }}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Mobile close affordance */}
            {pos.mode === "sheet" && (
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    height: 46,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.85)",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                  }}
                >
                  CLOSE
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
