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
