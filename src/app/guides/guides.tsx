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
  description: string;
  summary: string;
  intro: ReactNode;
  sections: GuideSection[];
  faqs: GuideFaq[];
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
