import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ResumeOrderClient from "./ResumeOrderClient";

type ResumeOrderPageProps = {
  searchParams: Promise<{
    status?: string;
  }>;
};

function parseStatus(value?: string): "expired" | "invalid" | null {
  return value === "expired" || value === "invalid" ? value : null;
}

export default async function ResumeOrderPage({
  searchParams,
}: ResumeOrderPageProps) {
  const params = await searchParams;

  return (
    <>
      <Header variant="content" />
      <main className="content-shell resume-order-shell">
        <section className="resume-order-card">
          <div className="resume-order-brand">HONEST LENSES</div>
          <h1 className="upper content-title">Resume an unfinished order</h1>
          <ResumeOrderClient initialStatus={parseStatus(params.status)} />
        </section>
      </main>
      <Footer />
    </>
  );
}
