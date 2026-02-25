import Header from "../../components/Header";
import Footer from "../../components/Footer";

export default function PrivacyPage() {
  return (
    <>
      <Header variant="content" />

      <main className="content-page">
        <div className="content-page-inner">
          <h1 className="upper">Privacy Policy</h1>

          <p>
            Effective Date: {new Date().getFullYear()}
          </p>

          <p style={{ marginTop: 20 }}>
            Honest Lenses (“we,” “our,” or “us”) is committed to protecting
            your personal and prescription information. This Privacy Policy
            explains what information we collect, how we use it, and how we
            protect it.
          </p>

          <h3 style={{ marginTop: 32 }}>Information We Collect</h3>

          <ul style={{ marginTop: 10, lineHeight: 1.7 }}>
            <li>Name and contact information (email, phone number)</li>
            <li>Shipping and billing address</li>
            <li>Prescription details and prescriber information</li>
            <li>Order history and transaction details</li>
            <li>Account login credentials (if applicable)</li>
          </ul>

          <h3 style={{ marginTop: 32 }}>Payment Information</h3>

          <p>
            Payment information is processed securely through Stripe. Honest
            Lenses does not store full credit card numbers or sensitive payment
            credentials on our servers.
          </p>

          <h3 style={{ marginTop: 32 }}>How We Use Your Information</h3>

          <ul style={{ marginTop: 10, lineHeight: 1.7 }}>
            <li>To process and fulfill contact lens orders</li>
            <li>To verify prescriptions as required by law</li>
            <li>To communicate order status and support requests</li>
            <li>To comply with legal and regulatory requirements</li>
          </ul>

          <h3 style={{ marginTop: 32 }}>Prescription Data</h3>

          <p>
            Prescription information is collected solely for order fulfillment
            and verification in accordance with the FTC Contact Lens Rule.
            We do not sell or use prescription data for marketing purposes.
          </p>

          <h3 style={{ marginTop: 32 }}>Data Security</h3>

          <p>
            We implement industry-standard security measures including encrypted
            connections (HTTPS), database row-level security controls, and
            restricted backend access to protect your information.
          </p>

          <h3 style={{ marginTop: 32 }}>Third-Party Service Providers</h3>

          <p>
            We may share limited information with trusted third-party providers
            necessary to operate our business, including payment processors,
            shipping carriers, and email delivery services. These providers
            receive only the information required to perform their services.
          </p>

          <h3 style={{ marginTop: 32 }}>Data Retention</h3>

          <p>
            Order and prescription information may be retained as required for
            regulatory compliance, audit purposes, and operational integrity.
          </p>

          <h3 style={{ marginTop: 32 }}>Your Rights</h3>

          <p>
            You may request access to or correction of your personal
            information by contacting us at support@honestlenses.com.
          </p>

          <h3 style={{ marginTop: 32 }}>Contact</h3>

          <p>
            If you have questions about this Privacy Policy, please contact:
          </p>

          <p style={{ marginTop: 10 }}>
            <strong>support@honestlenses.com</strong>
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}