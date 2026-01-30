import Image from "next/image";
import Header from "../../components/Header";
import Footer from "../../components/Footer";

export default function AboutPage() {
  return (
    <>
      <Header variant="about" />
      <main>
        {/* ==================================================
          ABOUT HERO / INTRO
      ================================================== */}
        <section className="about-honest">
          <div className="about-inner">
            <div className="about-text">
              <h2 className="upper">About Honest Lenses</h2>

              <p>
                Not all contact lenses sold online come through the same
                channels. In today’s market, lenses are often resold after
                passing through multiple intermediaries, third-party warehouses,
                or overseas distributors — sometimes outside the conditions
                intended by the manufacturer.
              </p>

              <p>
                When lenses change hands repeatedly, it becomes difficult to
                know how they were stored, how old they are, whether they were
                originally intended for sale in the United States, or whether
                they are authentic.
              </p>

              <p>
                Counterfeit and diverted contact lenses have been documented in
                the online marketplace, making it harder for consumers to
                distinguish legitimate products from look-alike packaging.
              </p>

              <p>
                Honest Lenses was created to remove that uncertainty. We sell
                only prescription-required contact lenses sourced directly from
                authorized U.S. manufacturers and distributors, with
                prescription verification performed prior to fulfillment.
              </p>

              <p>
                When you order from Honest Lenses, you are receiving lenses with
                a known origin, a documented chain of custody, and handling that
                meets U.S. regulatory standards.
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
          TRUST / COMPLIANCE STRIP
      ================================================== */}
        <section className="assurance">
          <ul>
            <li>Authorized manufacturers only</li>
            <li>Prescription verification required</li>
            <li>No gray-market lenses</li>
          </ul>
        </section>

        {/* ==================================================
          CLOSING CTA
      ================================================== */}
        <section className="cta">
          <h2>Ready to order?</h2>
          <p>
            If you already have a valid prescription, you can begin shopping
            confidently with Honest Lenses.
          </p>
          <button className="primary-btn">Shop contact lenses</button>
        </section>
      </main>
      <Footer />
    </>
  );
}
