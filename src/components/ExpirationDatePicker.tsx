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

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseStrictParts(
  year: number,
  month: number,
  day: number,
): Date | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return new Date(year, month - 1, day);
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return parseStrictParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

function parseDisplayDate(value: string): { date: Date; iso: string } | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const monthText = match[1];
  const dayText = match[2];
  const yearText = match[3];
  const date = parseStrictParts(
    Number(yearText),
    Number(monthText),
    Number(dayText),
  );

  if (!date) return null;

  return {
    date,
    iso: `${yearText}-${monthText}-${dayText}`,
  };
}

function formatInputValue(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const month = digits.slice(0, 2);
  const day = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  let formatted = month;
  if (digits.length > 2) formatted += `/${day}`;
  if (digits.length > 4) formatted += `/${year}`;
  return formatted;
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
      const d = parseIsoDate(value);
      if (d) {
        return new Date(d.getFullYear(), d.getMonth(), 1);
      }
    }

    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const skipNextValueSyncRef = useRef(false);

  // “today” normalized to local midnight (avoids time drift)
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const selectedDate = useMemo(() => {
    return value ? parseIsoDate(value) : null;
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

    setTypedValue(format(d, "MM/dd/yyyy"));
    skipNextValueSyncRef.current = true;
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

    const parsed = parseIsoDate(value);
    if (!parsed) return "";

    return format(parsed, "MM/dd/yyyy");
  });

  useEffect(() => {
    if (skipNextValueSyncRef.current) {
      skipNextValueSyncRef.current = false;
      return;
    }

    if (!value) {
      setTypedValue("");
      return;
    }

    const parsed = parseIsoDate(value);
    if (!parsed) return;

    setTypedValue(format(parsed, "MM/dd/yyyy"));
  }, [value]);

  function emitValue(nextValue: string) {
    if (nextValue !== value) {
      skipNextValueSyncRef.current = true;
    }
    onChange(nextValue);
  }

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
            const formatted = formatInputValue(e.target.value);
            setTypedValue(formatted);

            if (formatted.length === 10) {
              const parsed = parseDisplayDate(formatted);
              emitValue(parsed?.iso ?? "");
              if (parsed) {
                setMonth(
                  new Date(
                    parsed.date.getFullYear(),
                    parsed.date.getMonth(),
                    1,
                  ),
                );
              }
            } else if (value) {
              emitValue("");
            }
          }}
          onBlur={() => {
            if (!typedValue) return;

            const parsed = parseDisplayDate(typedValue);
            emitValue(parsed?.iso ?? "");
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
