import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./guide.module.css";

export type GuideFaq = {
  question: string;
  answer: string;
};

type GuideSection = {
  heading: string;
  content: ReactNode;
};

export type GuidePage = {
  slug: string;
  title: string;
  metaTitle?: string;
  h1?: string;
  description: string;
  summary: string;
  intro: ReactNode;
  lead?: ReactNode;
  sections: GuideSection[];
  faqs: GuideFaq[];
  postFaqSections?: GuideSection[];
};

function ActionLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={styles.actionLink}>
      {children}
    </Link>
  );
}

function GuideCallout({ children }: { children: ReactNode }) {
  return <div className={styles.callout}>{children}</div>;
}

function GuideTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.articleTable}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProcessDiagram({ children }: { children: string }) {
  return <pre className={styles.processDiagram}>{children}</pre>;
}

export const guides: GuidePage[] = [
  {
    slug: "why-is-my-contact-lens-order-delayed",
    title: "Why Is My Contact Lens Order Delayed?",
    description:
      "Common reasons a contact lens order may be delayed, including prescription verification, prescriber response time, incomplete details, product availability, and shipping processing.",
    summary:
      "A practical explanation of verification, prescriber response time, product availability, and what customers can do to help an order move cleanly.",
    intro: (
      <>
        A contact lens order can be delayed for several normal reasons. Most
        delays happen because prescription verification, prescriber response,
        product availability, or shipping handoff is still in progress.
      </>
    ),
    sections: [
      {
        heading: "Prescription Verification Comes First",
        content: (
          <>
            <p>
              Contact lenses require a valid prescription before fulfillment.
              Honest Lenses reviews the prescription information you provide and
              may contact your prescriber when verification is needed.
            </p>
            <p>
              Verification is not just a formality. The lens brand, power, base
              curve, diameter when applicable, quantity, patient information,
              prescriber information, issue date, and expiration date all need
              to support the order being filled.
            </p>
          </>
        ),
      },
      {
        heading: "Doctor Response Delays",
        content: (
          <>
            <p>
              If we need to contact your eye care professional, timing can
              depend on office hours and how quickly the office responds. Under
              the FTC Contact Lens Rule, the verification window is measured in
              business hours, not simply clock hours.
            </p>
            <p>
              Requests sent after hours, near weekends, or before a federal
              holiday may take longer to resolve. If the prescriber confirms,
              corrects, or disputes the prescription, the order may need
              additional review before it can continue.
            </p>
          </>
        ),
      },
      {
        heading: "Incomplete Prescription Information",
        content: (
          <>
            <p>
              Small details can slow an otherwise straightforward order. Common
              examples include:
            </p>
            <ul>
              <li>Missing or unclear expiration date</li>
              <li>Prescriber name or office contact information that is hard to verify</li>
              <li>Patient name that does not match the prescription document</li>
              <li>Unclear lens brand, base curve, diameter, or power</li>
              <li>A photo or upload that cuts off part of the prescription</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Manufacturer or Vendor Availability",
        content: (
          <>
            <p>
              Some contact lenses, powers, or pack sizes may require additional
              processing through authorized manufacturer or distributor
              channels. Availability can vary by brand and parameter.
            </p>
            <p>
              If a product or parameter is not immediately available, the order
              may remain pending while sourcing is confirmed or while support
              reviews the next appropriate step.
            </p>
          </>
        ),
      },
      {
        heading: "Shipping Processing",
        content: (
          <>
            <p>
              Shipping timing generally begins after prescription verification
              and product processing are complete. A tracking number is usually
              created when the package is prepared for carrier handoff.
            </p>
            <p>
              An order can look quiet for a short period while it is moving
              through verification or fulfillment steps before carrier tracking
              becomes available.
            </p>
          </>
        ),
      },
      {
        heading: "What You Can Do to Help",
        content: (
          <>
            <ul>
              <li>Upload a clear image or PDF of the official prescription.</li>
              <li>Make sure the prescription is current and not expired.</li>
              <li>Enter the prescriber office name, phone, fax, or email carefully.</li>
              <li>Use the exact brand and parameters written on the prescription.</li>
              <li>Respond to support requests if we need clarification.</li>
            </ul>
            <div className={styles.actionLinks}>
              <ActionLink href="/upload-prescription">
                Upload a prescription
              </ActionLink>
              <ActionLink href="/verification">
                Read about verification
              </ActionLink>
              <ActionLink href="/contact">Contact support</ActionLink>
            </div>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Does a delay mean my order was rejected?",
        answer:
          "Not necessarily. A delay often means verification, product availability, or shipping processing is still in progress. If the prescription cannot be verified or needs correction, Honest Lenses may contact you for more information.",
      },
      {
        question: "Can Honest Lenses ship while verification is pending?",
        answer:
          "No. Contact lenses require a valid prescription before fulfillment. Orders may not ship until the prescription requirement has been satisfied.",
      },
      {
        question: "Can I help by contacting my eye doctor's office?",
        answer:
          "It can help in some cases, especially if the office needs to respond to a verification request or provide a clearer prescription copy. Make sure the office has your current contact lens prescription on file.",
      },
    ],
  },
  {
    slug: "passive-prescription-verification",
    title: "What Is Passive Prescription Verification?",
    description:
      "A plain-English explanation of passive prescription verification under the FTC Contact Lens Rule, including prescriber contact, the eight-business-hour window, and disputed prescriptions.",
    summary:
      "Plain-English guidance on how passive verification works, what the prescriber can do, and why it is still a prescription verification process.",
    intro: (
      <>
        Passive prescription verification is a process that may allow a contact
        lens seller to fill an order when a prescriber does not respond to a
        complete verification request within the business-hour window
        described by the FTC rule.
      </>
    ),
    sections: [
      {
        heading: "Passive Verification in Plain English",
        content: (
          <>
            <p>
              Passive verification does not mean an order skips the
              prescription requirement. The seller still needs prescription
              information and must send a verification request to the
              prescriber using direct communication, such as phone, fax, or
              email.
            </p>
            <p>
              If the request is complete and the prescriber does not respond
              within the required business-hour window, the prescription may be
              treated as verified for that order under the rule.
            </p>
          </>
        ),
      },
      {
        heading: "The FTC Contact Lens Rule Concept",
        content: (
          <>
            <p>
              The FTC Contact Lens Rule gives contact lens sellers a framework
              for verifying prescriptions. A seller can use a copy of the
              prescription provided by the customer, or the seller can contact
              the prescriber to verify the information.
            </p>
            <p>
              The rule also describes when a prescription is considered
              verified, including when a prescriber confirms it, corrects it, or
              does not respond within the applicable eight business hours after
              receiving a complete verification request.
            </p>
          </>
        ),
      },
      {
        heading: "Prescriber Contact and Business Hours",
        content: (
          <>
            <p>
              The eight-business-hour period is not the same as eight clock
              hours. It is generally calculated during 9 a.m. to 5 p.m.,
              Monday through Friday, excluding federal holidays, in the time
              zone of the prescriber office. Saturday hours may count only when the
              seller has appropriate knowledge that the prescriber is regularly
              open then.
            </p>
            <div className={styles.callout}>
              <p>
                This is why a request sent late Friday, after hours, or before
                a holiday may not resolve until the next business period.
              </p>
            </div>
          </>
        ),
      },
      {
        heading: "If the Doctor Responds",
        content: (
          <>
            <p>
              A prescriber can confirm that the prescription is accurate. A
              prescriber can also provide corrected information, or state that
              the prescription is inaccurate, expired, or otherwise invalid.
            </p>
            <p>
              If the prescriber disputes the prescription or says it is expired
              or invalid, the order cannot simply continue as submitted. Honest
              Lenses may need corrected prescription information or a current
              prescription before fulfillment.
            </p>
          </>
        ),
      },
      {
        heading: "If the Doctor Does Not Respond",
        content: (
          <>
            <p>
              If a complete verification request is received and the prescriber
              does not respond within the applicable eight business hours, the
              prescription may be considered verified under the rule. That does
              not remove the need for accurate prescription information, and it
              does not override a timely dispute from the prescriber.
            </p>
            <div className={styles.actionLinks}>
              <ActionLink href="/verification">
                Prescription verification
              </ActionLink>
              <ActionLink href="/upload-prescription">
                Upload your prescription
              </ActionLink>
            </div>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Is passive verification the same as no prescription?",
        answer:
          "No. Passive verification still depends on prescription information and prescriber contact. It is one verification pathway under the FTC Contact Lens Rule, not a way to buy contact lenses without a valid prescription.",
      },
      {
        question: "Does passive verification always take eight hours?",
        answer:
          "No. The FTC rule uses eight business hours, which is different from eight clock hours. Weekends, federal holidays, after-hours requests, and incomplete information can affect timing.",
      },
      {
        question: "What happens if my doctor disputes the prescription?",
        answer:
          "If the prescriber timely states that the prescription is inaccurate, expired, or invalid, Honest Lenses cannot fill the order as submitted. You may need corrected information or a current prescription.",
      },
    ],
  },
  {
    slug: "can-i-buy-contacts-with-expired-prescription",
    title: "Can I Buy Contacts With an Expired Prescription?",
    description:
      "Why contact lens retailers require a current prescription, what to do if your prescription is expired, and how the requirement supports safety and compliance.",
    summary:
      "A clear explanation of the valid prescription requirement, why expiration dates matter, and what to do before ordering.",
    intro: (
      <>
        In general, you need a current, valid contact lens prescription to buy
        contact lenses. If your prescription is expired, Honest Lenses cannot
        simply ignore the expiration date and fill the order as if it were
        current.
      </>
    ),
    sections: [
      {
        heading: "A Valid Prescription Is Required",
        content: (
          <>
            <p>
              Contact lenses are prescription medical devices. A valid contact
              lens prescription identifies the lens brand or material,
              parameters, prescriber, patient, issue date, and expiration date
              needed to fill the order accurately.
            </p>
            <p>
              The prescription must match the lenses being ordered. A glasses
              prescription is not the same as a contact lens prescription.
            </p>
          </>
        ),
      },
      {
        heading: "Why Retailers Cannot Ignore Expiration",
        content: (
          <>
            <p>
              Expiration is part of whether a contact lens prescription is
              current. Sellers are expected to fill orders based on a valid
              prescription or verify the prescription through the appropriate
              process.
            </p>
            <p>
              If the prescription is expired, or if the prescriber states that
              it is expired during verification, the order cannot continue as
              submitted.
            </p>
          </>
        ),
      },
      {
        heading: "What to Do If Your Prescription Is Expired",
        content: (
          <>
            <ul>
              <li>Schedule a contact lens exam or renewal with your eye care professional.</li>
              <li>Ask for a copy of your updated contact lens prescription after the fitting is complete.</li>
              <li>Upload the current prescription or enter the updated details when ordering.</li>
              <li>Check that the brand, power, base curve, diameter, and expiration date are readable.</li>
            </ul>
            <div className={styles.actionLinks}>
              <ActionLink href="/upload-prescription">
                Upload a current prescription
              </ActionLink>
              <ActionLink href="/enter-prescription">
                Enter prescription details
              </ActionLink>
            </div>
          </>
        ),
      },
      {
        heading: "Why This Protects Safety and Compliance",
        content: (
          <>
            <p>
              Contact lens fit, eye health, and prescription needs can change
              over time. The expiration date helps make sure the prescription
              reflects a recent clinical evaluation by your eye care
              professional.
            </p>
            <p>
              The requirement also keeps the ordering process aligned with
              federal and state prescription rules. Honest Lenses is a retailer,
              not a substitute for an eye exam or medical care.
            </p>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Can passive verification renew an expired prescription?",
        answer:
          "No. Passive verification is not a renewal process. If a prescription is expired or the prescriber says it is expired, you need a current prescription before the order can be filled.",
      },
      {
        question: "What if my contact lens prescription has not changed?",
        answer:
          "You still need a current prescription. If your lenses and vision feel stable, your eye care professional can determine whether renewal is appropriate.",
      },
      {
        question: "Can I use my glasses prescription to buy contacts?",
        answer:
          "No. A glasses prescription does not include all contact lens fitting information. Contact lenses require a contact lens prescription with the lens brand or material and fitting parameters.",
      },
    ],
  },
  {
    slug: "how-long-does-contact-lens-verification-take",
    title: "How Long Does Contact Lens Verification Take?",
    description:
      "How contact lens prescription verification timing can differ for uploaded prescriptions and prescriber verification, including business hours, weekends, holidays, and incomplete information.",
    summary:
      "Realistic expectations for uploaded prescriptions, prescriber contact, business-hour timing, weekends, holidays, and missing details.",
    intro: (
      <>
        Contact lens verification timing depends on how complete the
        prescription information is and whether Honest Lenses can verify from
        the uploaded prescription or needs to contact your prescriber.
      </>
    ),
    sections: [
      {
        heading: "Uploaded Prescription Review",
        content: (
          <>
            <p>
              If you upload a clear image or PDF of a current contact lens
              prescription, review is often more direct because the prescription
              details are visible in one place.
            </p>
            <p>
              Review can take longer if the document is blurry, cropped,
              missing the expiration date, or does not clearly show the lens
              brand and parameters needed for the order.
            </p>
          </>
        ),
      },
      {
        heading: "Doctor Verification",
        content: (
          <>
            <p>
              If we need to contact your prescriber, timing depends on when the
              prescriber receives a complete request and whether the office
              responds, corrects the information, or disputes the prescription.
            </p>
            <p>
              Under the FTC Contact Lens Rule, the passive verification period
              is eight business hours after a complete verification request is
              received by the prescriber. That timing is not the same as eight
              clock hours.
            </p>
            <div className={styles.actionLinks}>
              <ActionLink href="/guides/what-happens-if-my-eye-doctor-does-not-respond">
                what happens if your eye doctor does not respond
              </ActionLink>
            </div>
          </>
        ),
      },
      {
        heading: "Weekends, Holidays, and After-Hours Orders",
        content: (
          <>
            <p>
              Business-hour timing generally runs during weekday business hours
              and excludes federal holidays. Saturday hours may count only when
              the seller has appropriate knowledge that the prescriber is
              regularly open on Saturday.
            </p>
            <p>
              An order placed after office hours, over a weekend, or before a
              federal holiday may therefore take longer than an order submitted
              earlier in the business week.
            </p>
          </>
        ),
      },
      {
        heading: "Incomplete Information Adds Time",
        content: (
          <>
            <p>
              Verification can pause when required information is missing or
              unclear. Common examples include:
            </p>
            <ul>
              <li>Missing prescriber phone, fax, or office name</li>
              <li>Prescription photo that cuts off the expiration date</li>
              <li>Mismatch between the ordered lens and the prescription brand</li>
              <li>Missing base curve, diameter, or other required lens parameters</li>
              <li>Patient information that the prescriber cannot match</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Realistic Expectations",
        content: (
          <>
            <p>
              Straightforward orders with a clear, current prescription may
              move more quickly. Orders requiring prescriber contact, corrected
              information, or product availability review can take longer.
            </p>
            <p>
              Honest Lenses avoids promising a fixed verification time because
              the timing can depend on prescriber response, business hours,
              prescription completeness, and order details.
            </p>
            <div className={styles.actionLinks}>
              <ActionLink href="/upload-prescription">
                Upload prescription
              </ActionLink>
              <ActionLink href="/browse">Browse contacts</ActionLink>
            </div>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Can contact lens verification happen right away?",
        answer:
          "No. Verification may be quick when the prescription is clear and current, but some orders require prescriber contact or additional review. Honest Lenses does not promise a fixed verification time.",
      },
      {
        question: "Do weekends count toward verification time?",
        answer:
          "Usually not unless the seller has appropriate knowledge that the prescriber's office is regularly open on Saturday. Federal holidays are excluded from the standard business-hour calculation.",
      },
      {
        question: "Why did my uploaded prescription still need review?",
        answer:
          "Uploaded prescriptions still need to be readable, current, and matched to the ordered lenses. If anything is unclear or inconsistent, support may need to review or verify more information.",
      },
    ],
  },
  {
    slug: "why-are-contact-lenses-cheaper-online",
    title: "Why Are Contact Lenses Cheaper Online?",
    description:
      "Why online contact lens prices can be lower, how overhead and pricing models differ, and why correct brand and prescription matching matter more than choosing the lowest price alone.",
    summary:
      "A practical look at online pricing, lower overhead, distributor costs, pack sizes, and why exact prescription matching matters.",
    intro: (
      <>
        Contact lenses can cost less online because online retailers often have
        different overhead, fulfillment, and pricing models than local offices
        or retail stores.
      </>
    ),
    sections: [
      {
        heading: "Lower Retail Overhead",
        content: (
          <>
            <p>
              Online contact lens retailers may not carry the same costs as a
              clinic or retail store, such as exam lane space, front-desk
              staffing for in-person sales, or local inventory displays.
            </p>
            <p>
              Lower overhead can make room for different pricing, especially
              when fulfillment is centralized or routed through authorized
              manufacturer and distributor channels.
            </p>
          </>
        ),
      },
      {
        heading: "Different Pricing Models",
        content: (
          <>
            <p>
              Online prices may reflect pack size, manufacturer pricing,
              distributor cost, inventory availability, shipping cost, and
              retailer margin. A price that looks lower at first glance may
              change when quantity, shipping, taxes, or pack size are compared.
            </p>
            <p>
              For that reason, it is useful to compare the actual lens, box
              size, and annual supply needs rather than only the first price you
              see.
            </p>
          </>
        ),
      },
      {
        heading: "Manufacturer and Distributor Costs",
        content: (
          <>
            <p>
              Contact lenses are made by manufacturers and distributed through
              supply chains that can vary by brand and product family. Some
              lenses or parameters may have different availability or cost
              structures.
            </p>
            <p>
              Honest Lenses focuses on prescription-required lenses sourced
              through authorized U.S. manufacturer and distributor channels.
              That sourcing approach matters, even when a lower price is
              available somewhere else.
            </p>
          </>
        ),
      },
      {
        heading: "Lowest Price Is Not Always the Right Choice",
        content: (
          <>
            <p>
              The right contact lens order is the one that matches your valid
              prescription. A lower price does not help if the brand, power,
              base curve, diameter, add power, cylinder, axis, color, or pack
              size does not match what your eye care professional prescribed.
            </p>
            <p>
              Do not substitute a different lens because it costs less unless
              your prescriber updates your contact lens prescription. Different
              brands and materials can fit and perform differently.
            </p>
          </>
        ),
      },
      {
        heading: "How to Compare Online Contact Lens Prices",
        content: (
          <>
            <ul>
              <li>Compare the exact brand and lens type on your prescription.</li>
              <li>Check the pack size, such as 30-pack, 90-pack, 6-pack, or 12-pack.</li>
              <li>Confirm the prescription is current before checkout.</li>
              <li>Review shipping, taxes, and any required verification steps.</li>
              <li>Choose a retailer that takes prescription matching and sourcing seriously.</li>
            </ul>
            <div className={styles.actionLinks}>
              <ActionLink href="/browse">Browse contact lenses</ActionLink>
              <ActionLink href="/about">About Honest Lenses</ActionLink>
            </div>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Are online contact lenses the same as lenses from an eye doctor's office?",
        answer:
          "They should match the exact brand and parameters on your valid contact lens prescription and come through appropriate supply channels. Do not switch brands or lens types unless your prescriber changes the prescription.",
      },
      {
        question: "Why do prices vary by brand or prescription?",
        answer:
          "Prices can vary because of manufacturer cost, distributor cost, pack size, availability, and lens design. Toric, multifocal, color, or specialty parameter lenses may be priced differently from standard spherical lenses.",
      },
      {
        question: "Should I buy a cheaper different lens if my prescription brand costs more?",
        answer:
          "No. Contact lenses should be purchased according to the brand and parameters on your current prescription. Ask your eye care professional before changing lens brands or designs.",
      },
    ],
  },
  {
    slug: "why-was-my-contact-lens-prescription-rejected",
    title: "Why Was My Contact Lens Prescription Rejected?",
    description:
      "Common reasons a contact lens prescription may not verify, including expiration, mismatched lens details, invalid prescriber response, incomplete information, or submitting a glasses prescription.",
    summary:
      "Why a contact lens order may stop during verification and what customers can do next.",
    intro: (
      <>
        A contact lens prescription may be rejected or fail verification when
        the prescription is expired, incomplete, mismatched to the order, or
        disputed by the prescriber.
      </>
    ),
    sections: [
      {
        heading: "The Prescription May Be Expired",
        content: (
          <>
            <p>
              Contact lenses require a valid contact lens prescription. If the
              expiration date has passed, or if the prescriber reports that the
              prescription is expired, the order cannot be completed from that
              prescription.
            </p>
            <p>
              If your prescription is expired, contact your eye care
              professional about an exam, renewal, or updated contact lens
              prescription.
            </p>
          </>
        ),
      },
      {
        heading: "The Lens Details May Not Match",
        content: (
          <>
            <p>
              The ordered lens must match the contact lens prescription. A
              mismatch can include the brand, power, base curve, diameter, lens
              type, cylinder, axis, add power, or color when those details
              apply.
            </p>
            <p>
              A seller should not substitute a different contact lens brand or
              design unless the prescriber updates the prescription.
            </p>
          </>
        ),
      },
      {
        heading: "The Prescriber May Dispute It",
        content: (
          <>
            <p>
              During verification, the prescriber may report that the
              prescription is invalid, incomplete, inaccurate, expired, or not
              found in the patient record. When that happens, the order needs
              corrected information before it can continue.
            </p>
            <p>
              The prescriber may also indicate that a contact lens fitting is
              not complete or that the submitted details do not reflect a
              finalized contact lens prescription.
            </p>
            <p>
              Honest Lenses may ask you for a clearer prescription copy or
              updated prescriber information if the office cannot verify the
              details submitted.
            </p>
          </>
        ),
      },
      {
        heading: "A Glasses Prescription Was Submitted",
        content: (
          <>
            <p>
              A glasses prescription is not the same as a contact lens
              prescription. Contact lenses sit on the eye and require fitting
              details such as the prescribed contact lens brand or material and
              lens measurements.
            </p>
            <p>
              If you only have a glasses prescription, ask your eye care
              professional whether a contact lens fitting or updated contact
              lens prescription is needed.
            </p>
          </>
        ),
      },
      {
        heading: "What to Do Next",
        content: (
          <>
            <ul>
              <li>Review the brand and parameters against your prescription.</li>
              <li>Upload a clear, complete copy of the contact lens prescription.</li>
              <li>Check that the patient name and expiration date are visible.</li>
              <li>Confirm the prescriber office contact information is accurate.</li>
              <li>Contact your prescriber if the prescription needs correction or renewal.</li>
            </ul>
            <div className={styles.actionLinks}>
              <ActionLink href="/upload-prescription">
                Upload prescription
              </ActionLink>
              <ActionLink href="/verification">
                Read about verification
              </ActionLink>
            </div>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Can my contact lens order be rejected if my prescription is expired?",
        answer:
          "Yes. A contact lens order may not be completed if the prescription is expired or if the prescriber reports that it is no longer valid.",
      },
      {
        question: "What if I entered the wrong brand or power?",
        answer:
          "The order may need correction before it can continue. Contact lenses should be ordered according to the exact brand and parameters on the valid contact lens prescription.",
      },
      {
        question: "Can I order a different contact lens brand than the one prescribed?",
        answer:
          "No. A different brand or lens design should not be substituted unless your eye care professional updates the contact lens prescription.",
      },
      {
        question: "What should I do if my prescription does not verify?",
        answer:
          "Check whether the prescription is current, complete, and matched to the ordered lenses. You may need to upload a clearer copy, correct prescriber information, or contact your eye care professional for an updated prescription.",
      },
    ],
  },
  {
    slug: "what-happens-if-my-eye-doctor-does-not-respond",
    title:
      "What Happens If My Eye Doctor Does Not Respond to Prescription Verification?",
    description:
      "What can happen when a prescriber does not respond to contact lens prescription verification, including passive verification, business-hour timing, and other order delays.",
    summary:
      "How passive verification works when the prescriber does not respond, and why no response does not always mean the order ships immediately.",
    intro: (
      <>
        If your eye doctor does not respond to a complete contact lens
        prescription verification request within the allowed business-hour
        window, the prescription may be treated as verified for that order under
        the FTC Contact Lens Rule.
      </>
    ),
    sections: [
      {
        heading: "Passive Verification in Plain Language",
        content: (
          <>
            <p>
              Passive verification is a verification pathway, not a way to skip
              the prescription requirement. The seller still needs prescription
              information and must send a complete request to the prescriber.
            </p>
            <p>
              If the prescriber does not respond within the applicable business
              hours, the prescription may be treated as verified unless another
              issue prevents fulfillment.
            </p>
          </>
        ),
      },
      {
        heading: "The Request Must Be Complete",
        content: (
          <>
            <p>
              Passive verification depends on a complete verification request.
              Missing patient details, prescriber contact information, lens
              brand, power, or expiration information can delay the process.
            </p>
            <p>
              If the request cannot be sent correctly, the business-hour window
              may not start until the required information is available.
            </p>
          </>
        ),
      },
      {
        heading: "Business Hours Matter",
        content: (
          <>
            <p>
              The verification window is measured in business hours, not simply
              clock hours. Requests sent after office hours, over weekends, or
              near federal holidays may take longer to resolve.
            </p>
            <p>
              Saturday time may count only when the seller has appropriate
              knowledge that the prescriber is regularly open on Saturday.
            </p>
          </>
        ),
      },
      {
        heading: "No Response Does Not Mean Immediate Shipment",
        content: (
          <>
            <p>
              A prescription may be treated as verified after the allowed
              business-hour window, but the order can still require product
              processing, availability review, payment review, or shipping
              preparation.
            </p>
            <p>
              If any prescription detail is inconsistent or incomplete, support
              may still need to resolve that issue before fulfillment.
            </p>
            <div className={styles.actionLinks}>
              <ActionLink href="/guides/passive-prescription-verification">
                Passive verification guide
              </ActionLink>
              <ActionLink href="/verification">
                Prescription verification
              </ActionLink>
            </div>
          </>
        ),
      },
      {
        heading: "Related Prescription Verification Guides",
        content: (
          <>
            <p>
              These related guides explain common prescription review questions
              that can affect whether an order moves forward cleanly.
            </p>
            <div className={styles.actionLinks}>
              <ActionLink href="/guides/why-was-my-contact-lens-prescription-rejected">
                Why a contact lens prescription gets rejected
              </ActionLink>
              <ActionLink href="/guides/why-do-contact-lens-prescriptions-expire">
                Why contact lens prescriptions expire
              </ActionLink>
              <ActionLink href="/guides/how-long-does-contact-lens-verification-take">
                How long contact lens verification takes
              </ActionLink>
              <ActionLink href="/guides/what-information-is-needed-to-verify-a-contact-lens-prescription">
                What information is needed to verify a contact lens prescription
              </ActionLink>
            </div>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Does no response mean my order can move forward right away?",
        answer:
          "Not by itself. A lack of response may allow the prescription to be treated as verified only when a complete request was received and the required business-hour window has passed. Other order or prescription issues can still require review.",
      },
      {
        question: "How long does passive verification take?",
        answer:
          "The FTC Contact Lens Rule uses an eight-business-hour window after a complete verification request is received by the prescriber. That is not the same as eight clock hours.",
      },
      {
        question: "Do weekends or holidays count?",
        answer:
          "Federal holidays are excluded. Weekend time generally does not count unless the seller has appropriate knowledge that the prescriber is regularly open on Saturday.",
      },
      {
        question: "Can my order still be delayed after passive verification?",
        answer:
          "Yes. Product availability, shipping processing, payment review, incomplete order information, or other prescription inconsistencies can still delay fulfillment.",
      },
    ],
  },
  {
    slug: "what-information-is-needed-to-verify-a-contact-lens-prescription",
    title: "What Information Is Needed to Verify a Contact Lens Prescription?",
    description:
      "The patient, prescriber, lens, parameter, and expiration information typically needed to verify a contact lens prescription and reduce order delays.",
    summary:
      "A checklist of the prescription and prescriber details that help contact lens verification move cleanly.",
    intro: (
      <>
        To verify a contact lens prescription, the seller needs enough patient,
        prescriber, lens, parameter, and expiration information to confirm that
        the order matches a valid contact lens prescription.
      </>
    ),
    sections: [
      {
        heading: "Patient and Prescriber Information",
        content: (
          <>
            <p>
              Verification usually starts with the patient name and prescriber
              information. The prescriber office needs to be identifiable so the
              prescription can be confirmed when direct verification is needed.
            </p>
            <ul>
              <li>Patient name as written on the prescription</li>
              <li>Prescriber name</li>
              <li>Clinic or office name when available</li>
              <li>Phone, fax, email, or other contact details</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Lens Brand and Basic Parameters",
        content: (
          <>
            <p>
              Contact lens prescriptions are brand and fit specific. The lens
              brand, manufacturer, material, or exact product name matters
              because different lenses can fit and perform differently.
            </p>
            <ul>
              <li>Lens brand or product name</li>
              <li>Manufacturer when listed</li>
              <li>Power or sphere for each eye</li>
              <li>Base curve and diameter when applicable</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Toric, Multifocal, and Other Lens Details",
        content: (
          <>
            <p>
              Some prescriptions require additional fields. Toric lenses for
              astigmatism commonly include cylinder and axis. Multifocal lenses
              commonly include add power or add designation.
            </p>
            <ul>
              <li>Cylinder and axis for toric lenses</li>
              <li>Add power for multifocal lenses</li>
              <li>Color or other product-specific details when prescribed</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Dates and Completeness",
        content: (
          <>
            <p>
              The prescription should include enough date information to show
              whether it is current. Missing, cropped, or unreadable dates can
              slow verification.
            </p>
            <ul>
              <li>Expiration date</li>
              <li>Issue or exam date when shown</li>
              <li>Readable image or PDF if uploading the prescription</li>
            </ul>
            <div className={styles.actionLinks}>
              <ActionLink href="/upload-prescription">
                Upload prescription
              </ActionLink>
              <ActionLink href="/enter-prescription">
                Enter prescription details
              </ActionLink>
            </div>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Do I need to upload my prescription?",
        answer:
          "Uploading a clear prescription can help, but some orders may also use prescriber verification. The information still needs to be complete and accurate.",
      },
      {
        question: "Why does the contact lens brand matter?",
        answer:
          "Contact lens prescriptions are brand and fit specific. A different brand may have a different design, material, or fit and should not be substituted unless the prescriber updates the prescription.",
      },
      {
        question: "What happens if my doctor's contact information is wrong?",
        answer:
          "Verification may be delayed because the seller may not be able to send a complete request to the correct prescriber office.",
      },
      {
        question: "What information is different for toric or multifocal lenses?",
        answer:
          "Toric lenses commonly require cylinder and axis. Multifocal lenses commonly require add power or add designation. These fields need to match the prescription.",
      },
    ],
  },
  {
    slug: "can-i-use-my-glasses-prescription-to-buy-contacts",
    title: "Can I Use My Glasses Prescription to Buy Contact Lenses?",
    description:
      "Why a glasses prescription cannot be used as a contact lens prescription, what contact lens prescriptions include, and what to ask your eye care provider.",
    summary:
      "The direct answer on glasses prescriptions, contact lens fitting details, and why sellers should not convert one into the other.",
    intro: (
      <>
        No. A glasses prescription is not the same as a contact lens
        prescription and should not be used by itself to buy contact lenses.
      </>
    ),
    sections: [
      {
        heading: "Glasses and Contacts Are Different Prescriptions",
        content: (
          <>
            <p>
              Glasses sit in front of the eyes. Contact lenses sit directly on
              the eyes. Because of that difference, a contact lens prescription
              includes fitting details that are not usually part of a glasses
              prescription.
            </p>
            <p>
              Contact lenses are prescription medical devices and should be
              dispensed according to a valid contact lens prescription.
            </p>
          </>
        ),
      },
      {
        heading: "What a Contact Lens Prescription Includes",
        content: (
          <>
            <p>
              A contact lens prescription typically identifies the lens brand or
              material and the parameters needed for each eye. Depending on the
              lens, those details may include power, base curve, diameter,
              cylinder, axis, add power, or color.
            </p>
            <p>
              The prescription should also identify the patient, prescriber, and
              expiration date.
            </p>
          </>
        ),
      },
      {
        heading: "A Seller Should Not Convert It",
        content: (
          <>
            <p>
              Honest Lenses should not convert a glasses prescription into a
              contact lens prescription. That decision belongs with your eye
              care professional, who can evaluate fit, vision, and eye health.
            </p>
            <p>
              If you want to wear contact lenses, ask your eye care provider
              for a contact lens prescription after any required fitting.
            </p>
          </>
        ),
      },
      {
        heading: "What to Do If You Only Have a Glasses Prescription",
        content: (
          <>
            <ul>
              <li>Contact your eye care professional.</li>
              <li>Ask whether you need a contact lens fitting.</li>
              <li>Request a copy of your current contact lens prescription if one exists.</li>
              <li>Use the exact brand and parameters listed on that prescription.</li>
            </ul>
            <div className={styles.actionLinks}>
              <ActionLink href="/guides/what-information-is-needed-to-verify-a-contact-lens-prescription">
                Verification information checklist
              </ActionLink>
              <ActionLink href="/contact">Contact support</ActionLink>
            </div>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Why are glasses and contact lens prescriptions different?",
        answer:
          "Contact lenses sit on the eye and require fitting information, including the prescribed lens brand or material and parameters. Glasses prescriptions do not usually include those contact lens details.",
      },
      {
        question: "Can Honest Lenses convert my glasses prescription?",
        answer:
          "No. Honest Lenses should not convert a glasses prescription into a contact lens prescription. Ask your eye care professional for a valid contact lens prescription.",
      },
      {
        question: "What if I know my contact lens power from an old box?",
        answer:
          "An old box is not a substitute for a current valid contact lens prescription. The order still needs to match a valid prescription for the wearer.",
      },
      {
        question: "Do I need a contact lens fitting?",
        answer:
          "Your eye care professional can tell you whether a fitting or updated evaluation is needed before issuing a contact lens prescription.",
      },
    ],
  },
  {
    slug: "why-do-contact-lens-prescriptions-expire",
    title: "Why Do Contact Lens Prescriptions Expire?",
    description:
      "Why contact lens prescriptions have expiration dates, how expiration supports professional evaluation, and what customers should do when a prescription is expired.",
    summary:
      "Why expiration dates matter for contact lens prescriptions and what to do before placing a new order.",
    intro: (
      <>
        Contact lens prescriptions expire because eye health, lens fit, and
        vision needs can change over time, and the expiration date helps ensure
        ongoing professional evaluation.
      </>
    ),
    sections: [
      {
        heading: "Contact Lenses Are Medical Devices",
        content: (
          <>
            <p>
              Contact lenses are prescription medical devices. A current
              prescription helps confirm that the lens brand and parameters are
              still the ones your eye care professional prescribed.
            </p>
            <p>
              Expiration dates are part of determining whether a prescription
              is current for a new order.
            </p>
          </>
        ),
      },
      {
        heading: "Fit and Vision Can Change",
        content: (
          <>
            <p>
              Your prescription, comfort, tear film, lens fit, and wearing
              needs can change. An expiration date encourages periodic review
              with an eye care professional instead of relying indefinitely on
              older information.
            </p>
            <p>
              If your lenses still feel fine, your prescriber can determine
              whether renewal is appropriate.
            </p>
          </>
        ),
      },
      {
        heading: "Expired Prescriptions Can Block Orders",
        content: (
          <>
            <p>
              Expired prescriptions generally cannot be used to complete a new
              contact lens order. If the prescriber reports that the
              prescription is expired, the order cannot continue as submitted.
            </p>
            <p>
              Honest Lenses may ask for a current prescription before
              fulfillment.
            </p>
          </>
        ),
      },
      {
        heading: "What to Do If Yours Is Expired",
        content: (
          <>
            <ul>
              <li>Schedule an eye exam or contact lens renewal.</li>
              <li>Ask your prescriber for a copy of the updated contact lens prescription.</li>
              <li>Confirm the brand, parameters, and expiration date are readable.</li>
              <li>Use the updated prescription when placing your order.</li>
            </ul>
            <div className={styles.actionLinks}>
              <ActionLink href="/guides/can-i-buy-contacts-with-expired-prescription">
                Buying with an expired prescription
              </ActionLink>
              <ActionLink href="/upload-prescription">
                Upload current prescription
              </ActionLink>
            </div>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Can I buy contacts after my prescription expires?",
        answer:
          "Generally, no. A new order requires a valid contact lens prescription. If your prescription is expired, contact your eye care professional about renewal.",
      },
      {
        question: "Why do contact prescriptions expire sooner than I expected?",
        answer:
          "Expiration timing can depend on applicable rules and clinical judgment from the prescriber. Ask your eye care professional if you have questions about the date listed.",
      },
      {
        question: "Who sets the expiration date?",
        answer:
          "The prescriber sets the expiration date within applicable law and professional requirements.",
      },
      {
        question: "What should I do if my prescription is expired?",
        answer:
          "Schedule an exam or contact your prescriber about renewal, then use the updated contact lens prescription for your order.",
      },
    ],
  },
  {
    slug: "can-someone-else-order-contacts-for-me",
    title: "Can Someone Else Order Contact Lenses for Me?",
    description:
      "When another person may place a contact lens order for the wearer, why the prescription must belong to the actual wearer, and what information needs to match.",
    summary:
      "Practical guidance for family members and caregivers ordering contact lenses for someone else.",
    intro: (
      <>
        Someone else may be able to place an order for you, but the contact
        lenses must be ordered using the actual wearer name and valid contact
        lens prescription information.
      </>
    ),
    sections: [
      {
        heading: "The Prescription Must Belong to the Wearer",
        content: (
          <>
            <p>
              Contact lens prescriptions are patient specific. The prescription
              used for the order must be for the person who will wear the
              lenses, not the person placing or paying for the order.
            </p>
            <p>
              Do not use a prescription written for another person, even if the
              brand or power looks similar.
            </p>
          </>
        ),
      },
      {
        heading: "Order Details Need to Match",
        content: (
          <>
            <p>
              The wearer name, lens brand, parameters, prescriber information,
              and expiration date should match the valid contact lens
              prescription. Mismatches can delay or prevent fulfillment.
            </p>
            <p>
              The shipping or payment information may belong to another person,
              but the prescription information should identify the wearer.
            </p>
          </>
        ),
      },
      {
        heading: "Ordering for a Child or Dependent",
        content: (
          <>
            <p>
              A parent, guardian, or caregiver may place an order for a child or
              dependent when the order uses a valid contact lens prescription
              written for the wearer.
            </p>
            <p>
              Enter names and prescriber details carefully so the prescriber
              office can match the verification request to the correct patient
              record.
            </p>
          </>
        ),
      },
      {
        heading: "Practical Checklist",
        content: (
          <>
            <ul>
              <li>Use the legal name of the wearer or the name shown on the prescription.</li>
              <li>Order the exact lens brand and parameters prescribed.</li>
              <li>Confirm the prescription is current and readable.</li>
              <li>Use accurate prescriber office contact information.</li>
              <li>Do not share or reuse a prescription written for another person.</li>
            </ul>
            <div className={styles.actionLinks}>
              <ActionLink href="/browse">Browse contacts</ActionLink>
              <ActionLink href="/upload-prescription">
                Upload prescription
              </ActionLink>
            </div>
          </>
        ),
      },
    ],
    faqs: [
      {
        question: "Can I order contacts for my child?",
        answer:
          "A parent or guardian may be able to place an order, but the prescription information should be for the child who will wear the lenses.",
      },
      {
        question: "Can I order contacts for my spouse or parent?",
        answer:
          "Yes, another person may place or pay for an order, but the prescription must belong to the wearer and match the lenses ordered.",
      },
      {
        question: "Can two people share the same contact lens prescription?",
        answer:
          "No. Contact lens prescriptions are patient specific and should not be shared, even when two people appear to use similar lenses.",
      },
      {
        question: "Whose name should be on the prescription?",
        answer:
          "The prescription should be in the name of the person who will wear the contact lenses.",
      },
    ],
  },
  {
    slug: "how-contact-lens-prescription-verification-works",
    title:
      "Contact Lens Prescription Verification: What Happens After You Order Online",
    metaTitle: "How Online Contact Lens Prescription Verification Works",
    h1: "What Happens After You Order Contacts Online? Prescription Verification Explained",
    description:
      "Learn what happens after you order contacts online, how prescription verification works, what eight business hours means, and what can delay an order.",
    summary:
      "A complete, plain-English explanation of contact lens prescription verification from checkout through fulfillment.",
    intro: (
      <>
        When you order contact lenses online, the seller must confirm that the
        lenses match a valid contact lens prescription before providing them to
        you.
      </>
    ),
    lead: (
      <>
        <p>That confirmation can happen in one of two ways:</p>
        <ol>
          <li>
            You provide a readable copy of your current contact lens
            prescription.
          </li>
          <li>
            The seller sends a complete verification request to your eye doctor
            or other authorized prescriber.
          </li>
        </ol>
        <p>
          If the prescription is confirmed—or qualifies for passive
          verification after the federal response period—the order can move
          forward. If the prescription is expired, invalid, or inconsistent
          with the order, the problem must be resolved before the lenses can be
          provided.
        </p>
        <p>
          This guide explains exactly what happens from the moment you place the
          order until verification is complete. The goal is to help you
          understand the process—not to convince you to order from Honest
          Lenses. Whether you buy from us or another seller, the verification
          process follows the same federal rules.
        </p>
        <p>
          If you have ever wondered why ordering contact lenses online can take
          longer than ordering many other products, the steps below walk through
          the entire process from checkout to shipment.
        </p>
      </>
    ),
    sections: [
      {
        heading: "Why Prescription Verification Exists",
        content: (
          <>
            <p>
              Contact lenses are prescription medical devices. They sit directly
              on the eye and must match the product and fitting specifications
              selected by an eye care professional.
            </p>
            <p>A contact lens prescription can include:</p>
            <ul>
              <li>The exact lens brand or manufacturer</li>
              <li>Power or sphere</li>
              <li>Base curve</li>
              <li>Diameter</li>
              <li>Cylinder and axis for toric lenses</li>
              <li>
                Add power or another add designation for multifocal lenses
              </li>
              <li>Issue and expiration dates</li>
              <li>Prescriber information</li>
            </ul>
            <p>
              The brand is not merely a shopping preference. Different contact
              lenses can have different materials, shapes, dimensions, and
              optical designs even when their power values look similar.
            </p>
            <p>
              The FDA advises customers to check that the seller provides the
              exact prescribed brand, lens name, power, base curve, diameter,
              and any cylinder or axis values. A seller should not substitute
              another lens without prescriber authorization. See the FDA&apos;s{" "}
              <a href="https://www.fda.gov/medical-devices/contact-lenses/buying-contact-lenses">
                guidance on buying contact lenses
              </a>
              .
            </p>
            <p>
              Verification does not create a new prescription. It does not renew
              an expired prescription or replace an eye examination. It confirms
              that the order can be filled according to the prescription already
              issued for the patient.
            </p>
            <GuideCallout>
              <p>
                <strong>From our experience</strong>
              </p>
              <p>
                Many customers expect verification to be a second medical
                review. It is not. Your prescriber has already determined which
                lens is appropriate. Our job is to confirm that the product
                being ordered matches that prescription accurately.
              </p>
            </GuideCallout>
            <GuideTable
              headers={["Agency", "Role"]}
              rows={[
                [
                  "FDA",
                  "Oversees contact lens safety, effectiveness, and manufacturing",
                ],
                [
                  "FTC",
                  "Enforces rules governing prescription release, verification, and contact lens sales",
                ],
              ]}
            />
            <p>
              The federal verification requirements appear in the{" "}
              <a href="https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-315">
                FTC Contact Lens Rule, 16 CFR Part 315
              </a>
              .
            </p>
          </>
        ),
      },
      {
        heading: "What Happens After You Click “Place Order”",
        content: (
          <>
            <p>The complete customer journey looks like this:</p>
            <ProcessDiagram>{`You place the order
        ↓
Did you upload a prescription?
        ├── Yes → Honest Lenses reviews the document
        │             ↓
        │       Is it readable, current, complete, and a match?
        │             ├── Yes → Prescription verified
        │             └── No  → More information or prescriber contact needed
        │
        └── No → You provide patient and prescriber details
                      ↓
                 Honest Lenses sends a complete verification request
                      ↓
                 Prescriber confirms, corrects, rejects, or does not respond
                      ↓
                 Verification outcome determined
        ↓
Payment completed after verification
        ↓
Order enters fulfillment
        ↓
Shipment and tracking`}</ProcessDiagram>
            <GuideCallout>
              <p>
                <strong>Example A: Customer uploads a prescription</strong>
              </p>
              <p>
                The customer uploads a clear, current prescription. Honest
                Lenses reviews it. Verification completes, payment is captured,
                and the order enters fulfillment.
              </p>
              <p>
                <strong>Example B: Honest Lenses contacts the prescriber</strong>
              </p>
              <p>
                The customer does not upload a prescription. Honest Lenses sends
                a verification request to the prescriber. The office confirms
                the prescription the next morning. Verification completes,
                payment is captured, and the order enters fulfillment.
              </p>
            </GuideCallout>
            <p>
              Verification and fulfillment are separate stages. Completing
              verification means the prescription requirement has been
              satisfied. The order may still need normal product processing and
              shipping time.
            </p>
            <h3>At-a-glance journey</h3>
            <GuideTable
              headers={["Stage", "What happens", "What you may see"]}
              rows={[
                [
                  "Checkout",
                  "You submit the order and payment information",
                  "Order confirmation and pending payment authorization",
                ],
                [
                  "Prescription review",
                  "An uploaded document is reviewed, or verification details are collected",
                  "Awaiting verification",
                ],
                [
                  "Prescriber contact, if needed",
                  "A complete request is sent to the prescriber",
                  "Estimated verification window",
                ],
                [
                  "Resolution",
                  "Prescription is confirmed, corrected, denied, or passively verified",
                  "Status update or request for information",
                ],
                [
                  "Payment completion",
                  "The authorized payment is captured after verification",
                  "Payment changes from authorized to paid",
                ],
                [
                  "Fulfillment",
                  "The exact prescribed lenses enter the supplier process",
                  "Ordered, shipped, and tracking updates",
                ],
              ]}
            />
          </>
        ),
      },
      {
        heading: "Where Payment Fits Into the Process",
        content: (
          <>
            <p>
              Honest Lenses authorizes your card when you place the order.
              Payment is captured after prescription verification is complete.
            </p>
            <p>
              An authorization confirms that the payment method can cover the
              order. It may appear as a pending transaction in your bank
              account, but it is not the same as a completed charge.
            </p>
            <p>
              If the prescription cannot be verified and the order is canceled,
              Honest Lenses does not capture the payment. Your bank controls how
              quickly the pending authorization disappears.
            </p>
            <GuideCallout>
              <p>
                <strong>
                  💳 Card authorization is not the same as a completed charge.
                </strong>
              </p>
              <p>
                Honest Lenses authorizes payment at checkout and captures it
                after verification. Some banks display both stages similarly,
                but they are different payment events.
              </p>
            </GuideCallout>
            <p>
              This payment sequence is an Honest Lenses policy. It is not part
              of the federal prescription-verification rule.
            </p>
          </>
        ),
      },
      {
        heading: "The Two Verification Paths",
        content: (
          <>
            <p>
              Federal law allows a seller to provide contact lenses when the
              patient presents a valid prescription or when the prescription is
              verified through direct communication with the prescriber. See{" "}
              <a href="https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-315/section-315.5">
                16 CFR §315.5
              </a>
              .
            </p>
            <h3>Path 1: You upload the prescription</h3>
            <p>
              A clear copy or photograph allows Honest Lenses to review the
              prescription directly.
            </p>
            <p>The document should show:</p>
            <ul>
              <li>Patient name</li>
              <li>Prescriber information</li>
              <li>Examination, issue, and expiration dates</li>
              <li>Exact lens brand or manufacturer</li>
              <li>Prescription parameters for each eye</li>
              <li>Base curve and diameter when applicable</li>
              <li>Cylinder and axis for toric lenses</li>
              <li>Add power or designation for multifocal lenses</li>
            </ul>
            <GuideCallout>
              <p>
                <strong>
                  📄 Uploading usually makes verification more direct—but only
                  when the document is readable and complete.
                </strong>
              </p>
              <p>
                A photograph that omits the expiration date, cuts off part of
                the prescription, or is obscured by glare may require another
                upload or prescriber contact.
              </p>
            </GuideCallout>
            <p>
              Uploading does not guarantee immediate approval. Honest Lenses
              must still determine that the document is current, complete, and
              consistent with the order.
            </p>
            <p>
              For a detailed upload checklist, see{" "}
              <Link href="/guides/what-information-is-needed-to-verify-a-contact-lens-prescription">
                what information is needed to verify a contact lens prescription
              </Link>
              .
            </p>
            <GuideCallout>
              <p>
                <strong>From our experience</strong>
              </p>
              <p>
                The most useful upload is usually the least complicated one:
                one clear image of the entire official prescription, taken
                straight on, with all four edges visible. Screenshots, partial
                images, folded documents, and photographs taken from a distance
                are more likely to hide information that matters.
              </p>
            </GuideCallout>
            <h3>Path 2: Honest Lenses contacts the prescriber</h3>
            <p>
              If you do not upload a usable prescription, Honest Lenses
              collects enough information to identify:
            </p>
            <ul>
              <li>The patient</li>
              <li>The prescribed lenses</li>
              <li>The quantity ordered</li>
              <li>The prescriber or practice</li>
            </ul>
            <p>
              Honest Lenses then sends a complete verification request through
              direct communication.
            </p>
            <p>
              Under the Contact Lens Rule, direct communication means completed
              communication by telephone, fax, or email. The federal response
              period begins only after the prescriber receives the required
              information.
            </p>
          </>
        ),
      },
      {
        heading: "What Information Honest Lenses Needs",
        content: (
          <>
            <p>
              The required information depends on whether you upload a
              prescription or use direct prescriber verification.
            </p>
            <h3>Information about the lenses</h3>
            <p>
              Honest Lenses needs enough information to identify the exact
              product:
            </p>
            <ul>
              <li>Lens brand or manufacturer</li>
              <li>Power for each eye</li>
              <li>Base curve or other appropriate fit designation</li>
              <li>Diameter when applicable</li>
              <li>Cylinder and axis when applicable</li>
              <li>Multifocal add when applicable</li>
              <li>Quantity ordered</li>
            </ul>
            <p>
              A glasses prescription cannot be used in place of these details.
              The differences are explained in{" "}
              <Link href="/guides/can-i-use-my-glasses-prescription-to-buy-contacts">
                Can I Use My Glasses Prescription to Buy Contact Lenses?
              </Link>
            </p>
            <h3>Patient information</h3>
            <p>
              For a direct verification request, federal rules require the
              patient&apos;s full name and address.
            </p>
            <p>
              Honest Lenses also requests the patient&apos;s date of birth. Date
              of birth is not one of the fields specifically required in the
              federal verification request, but it helps the prescriber&apos;s
              office identify the correct patient record.
            </p>
            <p>
              Use the name, date of birth, and address that the office is most
              likely to have on file.
            </p>
            <h3>Prescriber information</h3>
            <p>
              Honest Lenses needs enough information to identify and contact the
              correct office:
            </p>
            <ul>
              <li>Prescriber or doctor name</li>
              <li>Practice name, if known</li>
              <li>Office phone number or email address</li>
              <li>Office location when available</li>
            </ul>
            <GuideCallout>
              <p>
                <strong>From our experience</strong>
              </p>
              <p>
                Patient identity and office contact information cause more
                avoidable friction than complicated prescription values. A
                correct doctor name paired with an old office phone number may
                still send the request to the wrong place. The current practice
                name and a direct phone number or monitored email address are
                especially helpful.
              </p>
            </GuideCallout>
            <h3>Federal requirements versus Honest Lenses policies</h3>
            <GuideTable
              headers={["Information or action", "Source"]}
              rows={[
                [
                  "A valid prescription must be presented or verified",
                  "Federal requirement",
                ],
                [
                  "The seller must offer a clear way to submit a prescription before requesting prescriber details",
                  "Federal requirement",
                ],
                [
                  "A direct request includes patient name, address, lens details, quantity, and timing information",
                  "Federal requirement",
                ],
                [
                  "Date of birth is collected to help the office match the patient record",
                  "Honest Lenses operational policy",
                ],
                [
                  "Payment is authorized at checkout and captured after verification",
                  "Honest Lenses payment policy",
                ],
                [
                  "Orders do not enter fulfillment until verification is complete",
                  "Honest Lenses fulfillment policy consistent with the prescription requirement",
                ],
              ]}
            />
            <p>
              The FTC&apos;s complete list of required verification information
              is available in its{" "}
              <a href="https://www.ftc.gov/business-guidance/resources/contact-lens-rule-guide-prescribers-sellers">
                guide for prescribers and sellers
              </a>
              .
            </p>
          </>
        ),
      },
      {
        heading: "How Direct Verification Works",
        content: (
          <>
            <p>
              When Honest Lenses needs to contact the prescriber, it sends a
              request using the available office contact information.
            </p>
            <p>The request identifies:</p>
            <ul>
              <li>The patient</li>
              <li>
                The lenses and prescription parameters supplied for the order
              </li>
              <li>The quantity ordered</li>
              <li>The order date</li>
              <li>The date and time of the verification request</li>
              <li>How the prescriber can respond</li>
              <li>How to contact Honest Lenses</li>
            </ul>
            <p>The prescriber can then:</p>
            <ol>
              <li>Confirm the prescription.</li>
              <li>Correct inaccurate information.</li>
              <li>
                Explain that the prescription is expired, inaccurate, or
                otherwise invalid.
              </li>
              <li>Not respond before the federal deadline.</li>
            </ol>
            <p>
              The seller must provide a reasonable opportunity for the
              prescriber to respond. It must also retain records of verification
              requests and responses as required by the Contact Lens Rule.
            </p>
            <GuideCallout>
              <p>
                <strong>From our experience</strong>
              </p>
              <p>
                A verification request is easier for an office to process when
                the patient name matches its chart and the lens information is
                complete. Calling the office yourself is not required, but
                letting the staff know that a request is coming can help them
                recognize it.
              </p>
            </GuideCallout>
          </>
        ),
      },
      {
        heading: "Passive Verification and the Eight-Business-Hour Rule",
        content: (
          <>
            <p>Passive verification applies when:</p>
            <ol>
              <li>
                The seller sends a complete verification request through direct
                communication.
              </li>
              <li>The prescriber receives it.</li>
              <li>
                The seller provides a reasonable opportunity to respond.
              </li>
              <li>Eight business hours pass without a response.</li>
            </ol>
            <p>
              At that point, the prescription is considered verified under the
              Contact Lens Rule.
            </p>
            <GuideCallout>
              <p>
                <strong>
                  ⚠️ Eight business hours does not mean eight clock hours.
                </strong>
              </p>
              <p>
                The clock starts when the prescriber receives a complete
                request—not when the customer places the order or enters the
                doctor&apos;s information.
              </p>
            </GuideCallout>
            <p>
              A business hour is an hour between 9:00 a.m. and 5:00 p.m., Monday
              through Friday, excluding federal holidays, in the prescriber&apos;s
              time zone.
            </p>
            <p>
              Saturday hours may count only if the seller has actual knowledge
              of the prescriber&apos;s regular Saturday hours and keeps the
              required record.
            </p>
            <h3>Example: received late Monday</h3>
            <ProcessDiagram>{`Monday
4:00–5:00 p.m.         1 business hour

Tuesday
9:00 a.m.–4:00 p.m.    7 business hours

Tuesday at 4:00 p.m.   Eight-business-hour period ends`}</ProcessDiagram>
            <h3>Example: received Friday without known Saturday hours</h3>
            <ProcessDiagram>{`Friday
11:00 a.m.–5:00 p.m.    6 business hours

Weekend
No hours counted

Monday
9:00–11:00 a.m.         Final 2 business hours

Monday at 11:00 a.m.    Eight-business-hour period ends`}</ProcessDiagram>
            <h3>Example: received after hours</h3>
            <p>
              A request received at 7:00 p.m. Tuesday begins counting at 9:00
              a.m. Wednesday. If there is no federal holiday, the
              eight-business-hour period ends at 5:00 p.m. Wednesday.
            </p>
            <p>
              These examples follow the{" "}
              <a href="https://www.ftc.gov/business-guidance/resources/faqs-complying-contact-lens-rule">
                FTC&apos;s Contact Lens Rule FAQ
              </a>
              .
            </p>
            <GuideCallout>
              <p>
                <strong>From our experience</strong>
              </p>
              <p>
                The most common timing misconception is that the clock begins at
                checkout. It may take additional time to collect missing
                details, identify the correct office, and complete delivery of
                the verification request. None of that time is part of the
                eight-business-hour period.
              </p>
            </GuideCallout>
            <p>
              For a deeper explanation of the rule, see{" "}
              <Link href="/guides/passive-prescription-verification">
                What Is Passive Prescription Verification?
              </Link>{" "}
              For more timing examples, see{" "}
              <Link href="/guides/how-long-does-contact-lens-verification-take">
                How Long Does Contact Lens Verification Take?
              </Link>
            </p>
            <GuideCallout>
              <p>
                <strong>
                  ⚠️ Passive verification does not renew an expired prescription.
                </strong>
              </p>
              <p>
                It does not extend an expiration date already known to have
                passed, override a timely denial, correct contradictory
                information, or permit a different brand to be substituted.
              </p>
            </GuideCallout>
          </>
        ),
      },
      {
        heading: "What Each Prescriber Response Means",
        content: (
          <>
            <GuideTable
              headers={[
                "Prescriber response",
                "Verification result",
                "What happens next",
              ]}
              rows={[
                [
                  "Confirms the information",
                  "Verified",
                  "Payment can be captured and fulfillment can begin",
                ],
                [
                  "Supplies corrected information",
                  "Corrected prescription is verified",
                  "Honest Lenses checks whether the corrected prescription matches the order",
                ],
                [
                  "Reports it as expired, inaccurate, or invalid",
                  "Not fillable as submitted",
                  "Order pauses while the problem is resolved",
                ],
                [
                  "Does not respond within eight business hours",
                  "Passively verified",
                  "The order may proceed if no other issue remains",
                ],
              ]}
            />
            <h3>The prescriber confirms it</h3>
            <p>The prescription is verified as submitted.</p>
            <p>
              Honest Lenses can capture the authorized payment and move the
              order into fulfillment. Normal product processing and shipping
              time still apply.
            </p>
            <h3>The prescriber changes something</h3>
            <p>
              Federal rules treat the prescription as verified when the
              prescriber supplies accurate corrected information. The
              customer&apos;s order must still agree with that corrected
              prescription.
            </p>
            <ul>
              <li>If the order already matches, it can proceed.</li>
              <li>
                If it does not match, Honest Lenses pauses the order and
                contacts the customer.
              </li>
              <li>
                Honest Lenses does not silently substitute another brand or
                treat a mismatched order as approved.
              </li>
            </ul>
            <h3>The prescriber rejects it</h3>
            <p>
              A prescriber may report that the prescription is expired,
              inaccurate, or otherwise invalid. A timely denial should explain
              the reason.
            </p>
            <p>
              Honest Lenses cannot fill the prescription as submitted. The
              customer may need to:
            </p>
            <ul>
              <li>Upload a current prescription</li>
              <li>Correct patient or prescriber information</li>
              <li>Confirm corrected order details</li>
              <li>Obtain a new contact lens prescription</li>
            </ul>
            <p>
              The focused guide{" "}
              <Link href="/guides/why-was-my-contact-lens-prescription-rejected">
                Why Was My Contact Lens Prescription Rejected?
              </Link>{" "}
              explains these outcomes in more detail.
            </p>
            <h3>The prescriber never responds</h3>
            <p>
              If the office received a complete request and eight business
              hours pass without a response, the prescription is passively
              verified.
            </p>
            <p>“No response” does not mean:</p>
            <ul>
              <li>The office actively approved the prescription</li>
              <li>Eight clock hours passed</li>
              <li>The clock started at checkout</li>
              <li>An incomplete request became complete</li>
              <li>A known expired prescription was renewed</li>
            </ul>
            <p>
              For the non-response pathway specifically, see{" "}
              <Link href="/guides/what-happens-if-my-eye-doctor-does-not-respond">
                What Happens If My Eye Doctor Does Not Respond?
              </Link>
            </p>
          </>
        ),
      },
      {
        heading: "Common Reasons Verification Is Delayed",
        content: (
          <>
            <p>
              The most preventable delays usually involve missing, unreadable,
              or mismatched information.
            </p>
            <GuideTable
              headers={["Cause", "Why it creates a delay"]}
              rows={[
                [
                  "Blurred or cropped upload",
                  "Important prescription fields cannot be read",
                ],
                [
                  "Missing expiration date",
                  "The document may not establish that the prescription is current",
                ],
                [
                  "Wrong lens brand",
                  "Sellers generally may not substitute another prescribed product",
                ],
                [
                  "Missing toric or multifocal values",
                  "The order may not contain enough information to fill the prescription",
                ],
                [
                  "Patient name does not match",
                  "The office may not find the correct record",
                ],
                [
                  "Outdated office information",
                  "The request may not reach the prescriber",
                ],
                [
                  "After-hours delivery",
                  "The federal clock may not begin until the next business period",
                ],
                [
                  "Weekend or federal holiday",
                  "Those hours generally do not count",
                ],
                [
                  "Prescriber correction or denial",
                  "The submitted order may no longer match",
                ],
                [
                  "Verification information still missing",
                  "A complete request cannot be sent yet",
                ],
              ]}
            />
            <GuideCallout>
              <p>
                <strong>From our experience: the most avoidable mistakes</strong>
              </p>
              <ul>
                <li>
                  Uploading only the lens values while cutting off the patient,
                  prescriber, or expiration information
                </li>
                <li>
                  Entering a nickname when the office has a different legal name
                  on file
                </li>
                <li>
                  Selecting a similar-looking lens instead of the exact
                  prescribed brand
                </li>
                <li>
                  Providing contact information for a former office location
                </li>
                <li>
                  Submitting a glasses prescription or old contact lens box as
                  though it were a current contact lens prescription
                </li>
              </ul>
            </GuideCallout>
            <p>
              A contact lens box can help identify the product, but it usually
              does not establish that the prescription is current.
            </p>
            <p>
              For the wider order timeline—including product availability and
              shipping—see{" "}
              <Link href="/guides/why-is-my-contact-lens-order-delayed">
                Why Is My Contact Lens Order Delayed?
              </Link>
            </p>
          </>
        ),
      },
      {
        heading: "What Customers Can Do to Help",
        content: (
          <>
            <h3>Use a current contact lens prescription</h3>
            <p>
              Check the expiration date before ordering. If it has expired,
              passive verification is not a renewal process. See{" "}
              <Link href="/guides/can-i-buy-contacts-with-expired-prescription">
                Can I Buy Contacts With an Expired Prescription?
              </Link>
            </p>
            <h3>Upload the entire document</h3>
            <p>Make sure the image shows:</p>
            <ul>
              <li>Patient name</li>
              <li>Prescriber information</li>
              <li>Lens brand</li>
              <li>Values for both eyes</li>
              <li>Issue or examination date</li>
              <li>Expiration date</li>
            </ul>
            <p>
              Photograph it straight on, with good light, no glare, and all
              edges visible.
            </p>
            <h3>Select the exact lens</h3>
            <p>
              Match the brand and product name before entering the prescription
              values. Do not assume that lenses with similar names are
              interchangeable.
            </p>
            <h3>Use information the office will recognize</h3>
            <p>
              Use the patient&apos;s charted name, correct date of birth, and the
              address most likely to appear in the prescriber&apos;s records.
            </p>
            <h3>Provide current office contact information</h3>
            <p>
              A current practice name and direct phone number or monitored email
              address help the request reach the intended office.
            </p>
            <h3>Let the office know a request is coming</h3>
            <p>
              You do not have to obtain approval yourself. A brief notice can
              help the office recognize the request among its normal calls,
              faxes, and emails.
            </p>
            <h3>Respond when Honest Lenses asks for something</h3>
            <p>
              Honest Lenses contacts the customer when information is missing,
              conflicting, or requires a decision. Responding promptly keeps
              the order from remaining paused.
            </p>
          </>
        ),
      },
      {
        heading: "Frequently Misunderstood Situations",
        content: (
          <GuideTable
            headers={["Misunderstanding", "What is actually true"]}
            rows={[
              [
                "“Verification gives me a new prescription.”",
                "Verification confirms an existing prescription. It is not an examination or renewal.",
              ],
              [
                "“The clock starts when I order.”",
                "It starts after the prescriber receives a complete verification request.",
              ],
              [
                "“Eight business hours means later today.”",
                "Business hours, weekends, holidays, time zone, and receipt time affect the deadline.",
              ],
              [
                "“No response means my doctor approved it.”",
                "It may result in passive verification, but it is not active approval.",
              ],
              [
                "“My contact lens box is my prescription.”",
                "The box can identify the lens, but it may not show prescription validity or prescriber information.",
              ],
              [
                "“My glasses prescription is close enough.”",
                "Glasses and contact lens prescriptions are not interchangeable.",
              ],
              [
                "“The seller can switch me to something similar.”",
                "Sellers generally may not alter the prescription or substitute another brand without authorization.",
              ],
              [
                "“Uploading means immediate approval.”",
                "The document must still be readable, current, complete, and consistent with the order.",
              ],
              [
                "“A pending card transaction means I was charged.”",
                "Honest Lenses authorizes payment before verification and captures it afterward.",
              ],
              [
                "“The eight-hour and 40-hour rules are the same.”",
                "Eight hours concerns verification. The separate 40-business-hour rule concerns certain requests for an additional prescription copy.",
              ],
            ]}
          />
        ),
      },
    ],
    faqs: [
      {
        question: "Do I have to upload my prescription?",
        answer:
          "No. Honest Lenses offers a way to upload the prescription, but you may instead provide the patient and prescriber information needed for direct verification. A complete upload can avoid the prescriber-response timeline.",
      },
      {
        question: "How long does verification take?",
        answer:
          "It depends on the path. An uploaded prescription may be reviewed directly. If prescriber verification is required, the federal period is eight business hours after the prescriber receives a complete request. The total time from checkout may be longer when information is missing, the office cannot be reached, or the request arrives outside business hours.",
      },
      {
        question: "Does the clock begin when I place the order?",
        answer:
          "No. It begins when the prescriber receives the complete verification request.",
      },
      {
        question: "What if the eye doctor does not respond?",
        answer:
          "If a complete request was received and the prescriber does not respond within eight business hours, the prescription is passively verified under the Contact Lens Rule.",
      },
      {
        question: "Can the prescriber reject the request?",
        answer:
          "Yes. The prescriber may report that the prescription is inaccurate, expired, or otherwise invalid. A timely denial should explain the reason.",
      },
      {
        question: "What if the prescriber corrects a value?",
        answer:
          "The corrected prescription is considered verified, but the order must match it. If it does not, Honest Lenses pauses the order and contacts the customer.",
      },
      {
        question: "Can passive verification renew an expired prescription?",
        answer:
          "No. It is not an examination or renewal and does not extend an expiration date already known to have passed.",
      },
      {
        question: "Can I use a glasses prescription?",
        answer:
          "No. A contact lens prescription includes product and fitting information that a glasses prescription does not provide.",
      },
      {
        question: "Why does the exact brand matter?",
        answer:
          "Brands can differ in material, shape, dimensions, and optical design. Federal rules generally prohibit sellers from altering the prescribed brand, and the FDA advises customers not to accept substitutions without prescriber approval.",
      },
      {
        question: "Do decorative or zero-power contacts require a prescription?",
        answer:
          "Yes. The Contact Lens Rule also applies to decorative, cosmetic, and plano contact lenses.",
      },
      {
        question: "When does Honest Lenses charge my card?",
        answer:
          "Honest Lenses authorizes the payment when the order is placed and captures it after prescription verification is complete.",
      },
      {
        question: "Can another person order contacts for me?",
        answer:
          "Another person can help place the order, but the prescription and patient information must belong to the person who will wear the lenses.",
      },
      {
        question: "How will I know verification is complete?",
        answer:
          "Honest Lenses provides status updates through the customer order page and order-related emails. If customer action is needed, the message should explain what information or decision is required.",
      },
    ],
    postFaqSections: [
      {
        heading: "What Customers Should Expect From Honest Lenses",
        content: (
          <>
            <p>
              Prescription verification exists to protect the patient and make
              sure the order matches what the prescriber authorized. The goal is
              accuracy—not creating an obstacle between the customer and the
              lenses they need.
            </p>
            <p>
              Verification is generally straightforward when the prescription
              information is complete and the correct prescriber can be reached.
            </p>
            <p>Honest Lenses handles as much of the process as possible:</p>
            <ul>
              <li>Reviewing an uploaded prescription</li>
              <li>
                Preparing and sending the verification request when needed
              </li>
              <li>Tracking the applicable response period</li>
              <li>Recording the outcome</li>
              <li>
                Moving the order forward when verification is complete
              </li>
            </ul>
            <p>
              Customers are contacted when action is genuinely required—for
              example, when a document is unreadable, information is missing, or
              the prescriber provides a correction or denial.
            </p>
            <p>
              If nothing is required from the customer, Honest Lenses continues
              handling the verification process and provides status updates as
              the order moves forward.
            </p>
          </>
        ),
      },
      {
        heading: "Primary Sources",
        content: (
          <ul>
            <li>
              <a href="https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-315">
                Electronic Code of Federal Regulations: 16 CFR Part 315
              </a>
            </li>
            <li>
              <a href="https://www.ftc.gov/business-guidance/resources/contact-lens-rule-guide-prescribers-sellers">
                FTC: The Contact Lens Rule—A Guide for Prescribers and Sellers
              </a>
            </li>
            <li>
              <a href="https://www.ftc.gov/business-guidance/resources/faqs-complying-contact-lens-rule">
                FTC: FAQs—Complying with the Contact Lens Rule
              </a>
            </li>
            <li>
              <a href="https://www.fda.gov/medical-devices/contact-lenses/contact-lens-prescription">
                FDA: Contact Lens Prescription
              </a>
            </li>
            <li>
              <a href="https://www.fda.gov/medical-devices/contact-lenses/buying-contact-lenses">
                FDA: Buying Contact Lenses
              </a>
            </li>
          </ul>
        ),
      },
    ],
  },
];

export const guideMap = new Map(guides.map((guide) => [guide.slug, guide]));

export function getGuideBySlug(slug: string) {
  return guideMap.get(slug) ?? null;
}

export function getGuideUrl(slug: string) {
  return `/guides/${slug}`;
}

export function getAbsoluteGuideUrl(slug: string) {
  return `https://honestlenses.com${getGuideUrl(slug)}`;
}
