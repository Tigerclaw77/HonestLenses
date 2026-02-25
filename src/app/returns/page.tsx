import Header from "../../components/Header";
import Footer from "../../components/Footer";

import { ReactNode } from "react";

export default function ReturnsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-neutral-950 text-neutral-200">
      <Header />

      <main className="content-shell">
        <div className="mb-16">
          <h1 className="text-4xl font-semibold text-white tracking-tight mb-4">
            Returns & Refunds
          </h1>
          <p className="text-neutral-400 max-w-2xl">
            Clear policies designed to protect patients and ensure product integrity.
          </p>
        </div>

        <PolicySection number="1" title="Before You Open Your Boxes">
          <p>Please examine your shipment upon receipt.</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Wrong product shipped</li>
            <li>Prescription parameters do not match your order</li>
            <li>Packaging damaged in transit</li>
          </ul>
          <p>
            Contact us within <span className="text-white font-medium">7 days of delivery</span> before opening the boxes.
            We will correct any shipping error at no cost to you.
          </p>
        </PolicySection>

        <PolicySection number="2" title="Unopened Boxes">
          <p>
            Unopened boxes may be returned within{" "}
            <span className="text-white font-medium">60 days of delivery</span> for a refund.
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Original, unopened, unmarked condition</li>
            <li>No writing, stickers, or alterations</li>
            <li>Not expired</li>
            <li>All boxes from the order included</li>
          </ul>
          <p>
            Return shipping is the customer’s responsibility unless the return is due to an Honest Lenses error.
          </p>
          <p>
            Refunds are issued after returned product is received and inspected.
          </p>
        </PolicySection>

        <PolicySection number="3" title="Opened Boxes">
          <p className="text-white font-medium">
            Opened boxes are not eligible for return or refund.
          </p>
          <p>
            Contact lenses are regulated medical devices and cannot be restocked once opened.
          </p>
          <p>
            If you experience comfort, vision, or adaptation concerns, please consult your prescribing eye care professional.
            Some manufacturers may offer satisfaction programs administered directly by the manufacturer.
          </p>
        </PolicySection>

        <PolicySection number="4" title="Prescription Changes">
          <ul className="list-disc pl-6 space-y-2">
            <li>Unopened boxes may be returned under Section 2</li>
            <li>Opened boxes are not eligible for return</li>
          </ul>
          <p>We recommend confirming your prescription details before ordering.</p>
        </PolicySection>

        <PolicySection number="5" title="Manufacturer Defects">
          <ul className="list-disc pl-6 space-y-2">
            <li>Contact us before discarding product</li>
            <li>We may request return of the product for review</li>
          </ul>
          <p>Refund or replacement will be issued if the defect is confirmed.</p>
        </PolicySection>

        <PolicySection number="6" title="Refund Timing">
          <p>
            Refunds are issued to the original form of payment after inspection.
            Please allow 5–10 business days for your financial institution to process the credit.
          </p>
        </PolicySection>

        <PolicySection number="7" title="Non-Returnable Items">
          <ul className="list-disc pl-6 space-y-2">
            <li>Opened contact lens boxes</li>
            <li>Expired product</li>
            <li>Discontinued product</li>
            <li>Product damaged after delivery</li>
          </ul>
        </PolicySection>
      </main>

      <Footer />
    </div>
  );
}

type PolicySectionProps = {
  number: string;
  title: string;
  children: ReactNode;
};

function PolicySection({ number, title, children }: PolicySectionProps) {
  return (
    <section className="mb-16">
      <div className="bg-red-500 p-40">
        
        <h2 className="text-2xl font-semibold text-white tracking-tight mb-8">
          <span className="text-neutral-500 mr-3">{number}.</span>
          {title}
        </h2>

        <div className="text-[15px] leading-7 text-neutral-300 space-y-6">
          {children}
        </div>

      </div>
    </section>
  );
}