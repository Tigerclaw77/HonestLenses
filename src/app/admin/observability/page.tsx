const FUNNEL_EVENTS = [
  "homepage_viewed",
  "browse_viewed",
  "product_modal_opened",
  "upload_prescription_viewed",
  "rx_method_selected",
  "rx_upload_started",
  "rx_upload_completed",
  "rx_upload_failed",
  "login_redirect_started",
  "auth_callback_received",
  "auth_session_restored",
  "upload_resume_after_auth",
  "checkout_started",
  "payment_intent_created",
  "order_authorized",
  "order_captured",
];

const WATCHLISTS = [
  {
    title: "Client errors",
    query: "client_error, $exception grouped by route, component, source",
  },
  {
    title: "Dead-click hotspots",
    query: "$dead_click filtered to /upload-prescription and /enter-prescription",
  },
  {
    title: "Upload failures",
    query: "rx_upload_failed by reason, file_type, device_type",
  },
  {
    title: "Auth callback failures",
    query: "auth_session_restored where restored=false by reason and next_route",
  },
  {
    title: "Funnel drop-off",
    query: FUNNEL_EVENTS.join(" -> "),
  },
];

export default function AdminObservabilityPage() {
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
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>
          Conversion Observability
        </h1>
        <p style={{ color: "#94a3b8", lineHeight: 1.6 }}>
          Use this page as the internal PostHog dashboard map for conversion
          stabilization. It intentionally stores no customer, prescription, or
          replay data inside the app; raw investigation stays in PostHog access
          controls.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
            marginTop: 22,
          }}
        >
          {WATCHLISTS.map((item) => (
            <article
              key={item.title}
              style={{
                border: "1px solid rgba(148,163,184,0.18)",
                borderRadius: 10,
                background: "rgba(15,23,42,0.72)",
                padding: 16,
              }}
            >
              <h2 style={{ fontSize: 16, marginTop: 0 }}>{item.title}</h2>
              <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.55 }}>
                {item.query}
              </p>
            </article>
          ))}
        </div>

        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 18 }}>Core Funnel Events</h2>
          <ol style={{ lineHeight: 1.8, color: "#cbd5e1" }}>
            {FUNNEL_EVENTS.map((event) => (
              <li key={event}>
                <code>{event}</code>
              </li>
            ))}
          </ol>
        </section>

        <section
          style={{
            marginTop: 22,
            borderTop: "1px solid rgba(148,163,184,0.18)",
            paddingTop: 18,
            color: "#94a3b8",
            fontSize: 13,
            lineHeight: 1.65,
          }}
        >
          Replay privacy defaults: mask inputs, mask personal-data properties,
          block file inputs, iframes, canvas, and any element marked with{" "}
          <code>data-ph-block-replay</code> or{" "}
          <code>data-sensitive-media</code>.
        </section>
      </section>
    </main>
  );
}
