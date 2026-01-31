"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Header from "../components/Header";
import Footer from "../components/Footer";
import FindDoctorModal from "../components/FindDoctorModal";
import ShopIntentModal from "../components/ShopIntentModal";

export default function HomePage() {
  const router = useRouter();

  const [isFindDoctorOpen, setIsFindDoctorOpen] = useState(false);
  const [isShopIntentOpen, setIsShopIntentOpen] = useState(true);

  // Lock body scroll when ANY modal is open
  useEffect(() => {
    const shouldLock = isFindDoctorOpen || isShopIntentOpen;
    document.body.style.overflow = shouldLock ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isFindDoctorOpen, isShopIntentOpen]);

  return (
    <main>
      {/* HEADER */}
      <Header
        variant="home"
        onShopIntent={() => setIsShopIntentOpen(true)}
      />

      {/* ==================================================
          HERO
      ================================================== */}
      <section className="hero-wix">
        <div className="hero-image">
          <h1 className="upper">
            Contact Lenses
            <br />
            For Your Family
          </h1>

          <button
            className="hero-btn"
            onClick={() => setIsShopIntentOpen(true)}
          >
            Shop Now
          </button>
        </div>
      </section>

      {/* ==================================================
          ASSURANCE STRIP
      ================================================== */}
      <section className="assurance">
        <ul>
          <li>Valid prescription required</li>
          <li>Manufacturer-direct fulfillment</li>
          <li>No gray market lenses</li>
        </ul>
      </section>

      {/* ==================================================
          HOW IT WORKS
      ================================================== */}
      <section className="how-it-works">
        <div className="how-grid">
          <div>
            <h3>1. Place your order</h3>
            <p>
              Enter your prescription details or upload a valid prescription
              during checkout.
            </p>
          </div>
          <div>
            <h3>2. We verify</h3>
            <p>
              Prescriptions are verified prior to fulfillment in accordance with
              federal law.
            </p>
          </div>
          <div>
            <h3>3. Ships to you</h3>
            <p>
              Lenses ship directly from authorized manufacturers or
              distributors.
            </p>
          </div>
        </div>
      </section>

      {/* ==================================================
          IMAGE BAND
      ================================================== */}
      <section className="prescription-cta section-soft">
        <div className="prescription-inner">
          <h2 className="upper">Need a prescription?</h2>

          <p>
            Contact lenses require a valid prescription. We can help you find a
            licensed eye care professional near you.
          </p>

          <button
            className="primary-btn"
            onClick={() => setIsFindDoctorOpen(true)}
          >
            Find a Doctor
          </button>
        </div>
      </section>

      {/* ==================================================
          ABOUT
      ================================================== */}
      <section className="about-honest">
        <div className="about-inner">
          <div className="about-text">
            <h2 className="upper">About Honest Lenses</h2>

            <p>
              Honest Lenses is a trusted contact lens seller. We ship lenses
              directly from authorized manufacturers and distributors, ensuring
              the highest standards of safety and authenticity.
            </p>

            <p>
              When you order from Honest Lenses, you can be confident that your
              family receives only legitimate, properly verified contact lenses.
            </p>
          </div>

          <div className="about-image">
            <Image
              src="/cl.png"
              alt="Life with clear vision"
              width={1200}
              height={800}
              sizes="(max-width: 768px) 100vw, 50vw"
              style={{ width: "100%", height: "auto" }}
            />
          </div>
        </div>
      </section>

      {/* ==================================================
          CTA
      ================================================== */}
      <section className="cta">
        <h2>Ready to order?</h2>
        <Link href="/order" className="primary-btn">
          Order Contacts
        </Link>
      </section>

      <Link href="/order" className="sticky-order-cta">
        Order Contacts
      </Link>

      <Footer />

      {/* ==================================================
          MODALS
      ================================================== */}
      <FindDoctorModal
        isOpen={isFindDoctorOpen}
        onClose={() => setIsFindDoctorOpen(false)}
      />

      <ShopIntentModal
        isOpen={isShopIntentOpen}
        onClose={() => setIsShopIntentOpen(false)}
        onJustLooking={() => {
          setIsShopIntentOpen(false);
          router.push("/shop");
        }}
        onHasPrescription={() => {
          setIsShopIntentOpen(false);
          router.push("/order");
        }}
      />
    </main>
  );
}
