import Header from "../../components/Header";
import Footer from "../../components/Footer";

export default function VerificationPage() {
  return (
    <>
      <Header variant="content" />

      <main className="content-page">
        <div className="content-page-inner">
          <h1 className="upper">Prescription Verification</h1>

          <p>
            Honest Lenses verifies all contact lens prescriptions in accordance
            with the FTC Contact Lens Rule.
          </p>

          <h3 style={{ marginTop: 30 }}>Verification Process</h3>

          <ul style={{ marginTop: 10, lineHeight: 1.7 }}>
            <li>
              Orders are subject to prescription confirmation before shipment.
            </li>
            <li>
              We may contact your prescriber to confirm validity and details.
            </li>
            <li>
              Passive verification timelines may apply under federal law.
            </li>
          </ul>

          <h3 style={{ marginTop: 30 }}>Order Delays or Cancellation</h3>

          <p>
            Orders may be delayed or canceled if a valid prescription cannot be
            verified. Providing accurate prescriber information helps avoid
            delays.
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}