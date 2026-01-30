import Header from "../../components/Header";
import Footer from "../../components/Footer";

export default function ContactPage() {
  return (
    <>
      <Header variant="content" />

      <main className="content-page">
        <div className="content-page-inner">
          <h1 className="upper">Contact</h1>

          <p>
            For questions about orders, prescriptions, or compliance, please
            email:
          </p>

          <p style={{ marginTop: "1rem" }}>
            <strong>support@honestlenses.com</strong>
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
