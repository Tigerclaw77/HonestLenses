import Header from "../../components/Header";
import Footer from "../../components/Footer";

export default function TermsPage() {
  return (
    <>
      <Header variant="content" />

      <main className="content-page">
        <div className="content-page-inner">
          <h1 className="upper">Terms of Use</h1>

          <p>
            Effective Date: {new Date().getFullYear()}
          </p>

          <p style={{ marginTop: 20 }}>
            These Terms of Use govern your access to and use of the Honest
            Lenses website and services. By placing an order, you agree to
            these Terms.
          </p>

          <h3 style={{ marginTop: 32 }}>Eligibility</h3>

          <p>
            You must be at least 18 years old and legally capable of entering
            into a binding agreement to purchase contact lenses through this
            website.
          </p>

          <h3 style={{ marginTop: 32 }}>Prescription Requirement</h3>

          <p>
            All contact lens orders require a valid, unexpired prescription
            issued by a licensed eye care professional.
          </p>

          <p style={{ marginTop: 10 }}>
            Honest Lenses verifies prescriptions in accordance with the FTC
            Contact Lens Rule. Orders may be delayed or canceled if a valid
            prescription cannot be verified.
          </p>

          <h3 style={{ marginTop: 32 }}>Order Acceptance</h3>

          <p>
            Submission of an order does not guarantee acceptance. Honest Lenses
            reserves the right to refuse or cancel any order for reasons
            including, but not limited to:
          </p>

          <ul style={{ marginTop: 10, lineHeight: 1.7 }}>
            <li>Prescription verification failure</li>
            <li>Pricing or typographical errors</li>
            <li>Product unavailability</li>
            <li>Suspected fraud or misuse</li>
          </ul>

          <h3 style={{ marginTop: 32 }}>Pricing</h3>

          <p>
            All prices are subject to change without notice. In the event of a
            pricing error, we reserve the right to cancel the affected order
            prior to shipment.
          </p>

          <h3 style={{ marginTop: 32 }}>Returns</h3>

          <p>
            Returns are governed by our Returns Policy. Contact lenses are
            medical devices and are subject to manufacturer-specific return
            requirements.
          </p>

          <h3 style={{ marginTop: 32 }}>Limitation of Liability</h3>

          <p>
            Honest Lenses is a contact lens retailer and does not provide eye
            exams or medical advice. We are not responsible for misuse of
            contact lenses or failure to follow your eye care professional’s
            instructions.
          </p>

          <p style={{ marginTop: 10 }}>
            To the fullest extent permitted by law, Honest Lenses shall not be
            liable for indirect, incidental, or consequential damages arising
            from use of this website or products purchased through it.
          </p>

          <h3 style={{ marginTop: 32 }}>Intellectual Property</h3>

          <p>
            All website content, design, and branding are the property of
            Honest Lenses and may not be reproduced without permission.
          </p>

          <h3 style={{ marginTop: 32 }}>Governing Law</h3>

          <p>
            These Terms shall be governed by the laws of the State of Texas,
            without regard to conflict of law principles.
          </p>

          <h3 style={{ marginTop: 32 }}>Contact</h3>

          <p>
            Questions regarding these Terms may be directed to:
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