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
            Terms and conditions for ordering contact lenses through Honest
            Lenses will be posted here.
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
