import SystemHealthClient from "./SystemHealthClient";

export default function AdminSystemHealthPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
        padding: 24,
      }}
    >
      <section style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Commerce System Health</h1>
        <p style={{ color: "#94a3b8", lineHeight: 1.6, marginBottom: 22 }}>
          Operational integrity counts from the v2 payment ledger,
          reconciliation runs, and exactly-one-queue projection.
        </p>
        <SystemHealthClient />
      </section>
    </main>
  );
}
