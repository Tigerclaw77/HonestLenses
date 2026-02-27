"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
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
      const d = new Date(value + "T00:00:00");
      return new Date(d.getFullYear(), d.getMonth(), 1);
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
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });

    // Force 6 rows for stable layout
    const total = 42;
    const first = start;
    const list: Date[] = [];
    for (let i = 0; i < total; i++) {
      list.push(addDays(first, i));
    }
    // If the natural end is beyond our 42, it's fine. If not, 42 still covers.
    // (Keeps the box consistent month-to-month)
    void end;
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
    // disable strictly before today
    if (isBefore(d, today)) return;

    const formatted = format(d, "yyyy-MM-dd");
    onChange(formatted);
    setOpen(false);
  }

  // If user picks a date, keep calendar month aligned to it next time
  // useEffect(() => {
  //   if (!selectedDate) return;
  //   setMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  // }, [selectedDate]);

  const displayValue = useMemo(() => {
    if (!value) return "";
    try {
      return format(new Date(value + "T00:00:00"), "MM/dd/yyyy");
    } catch {
      return "";
    }
  }, [value]);

  const weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      {/* Input */}
      <div
        style={{ position: "relative", display: "flex", alignItems: "center" }}
      >
        <input
          readOnly
          value={displayValue}
          placeholder="MM/DD/YYYY"
          onClick={toggle}
          className={`rx-input ${hasError ? "rx-error" : ""}`}
          style={{
            paddingRight: 42,
            cursor: "pointer",
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
                {format(month, "MMMM yyyy")}
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
              {days.map((d) => {
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
                    key={d.toISOString()}
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
