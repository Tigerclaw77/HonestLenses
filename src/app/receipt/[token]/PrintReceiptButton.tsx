"use client";

export default function PrintReceiptButton() {
  return (
    <button className="receipt-print-button" type="button" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
