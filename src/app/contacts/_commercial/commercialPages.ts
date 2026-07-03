import { SITE_URL } from "@/lib/seo/contactSeoRoutes";

export type CommercialLink = {
  href: string;
  label: string;
  description?: string;
};

export type CommercialSection = {
  heading: string;
  body: string[];
  bullets?: string[];
};

export type CommercialContactPageConfig = {
  slug: string;
  primaryIntent: string;
  primaryConversionGoal: string;
  title: string;
  metaDescription: string;
  h1: string;
  eyebrow: string;
  intro: string;
  primaryCta: CommercialLink;
  secondaryCta: CommercialLink;
  productCoreIds: string[];
  productSelectionLogic: string;
  sections: CommercialSection[];
  relatedGuides: CommercialLink[];
  relatedPages: CommercialLink[];
  canonicalUrl: string;
};

const verificationGuide = {
  href: "/guides/what-information-is-needed-to-verify-a-contact-lens-prescription",
  label: "What information is needed to verify a contact lens prescription?",
};

const glassesGuide = {
  href: "/guides/can-i-use-my-glasses-prescription-to-buy-contacts",
  label: "Can I use a glasses prescription to buy contacts?",
};

const verificationTimeGuide = {
  href: "/guides/how-long-does-contact-lens-verification-take",
  label: "How long does contact lens verification take?",
};

const rejectedGuide = {
  href: "/guides/why-was-my-contact-lens-prescription-rejected",
  label: "Why was my contact lens prescription rejected?",
};

const expiredGuide = {
  href: "/guides/can-i-buy-contacts-with-expired-prescription",
  label: "Can I buy contacts with an expired prescription?",
};

const pricingGuide = {
  href: "/guides/why-are-contact-lenses-cheaper-online",
  label: "Why are contact lenses cheaper online?",
};

const expirationGuide = {
  href: "/guides/why-do-contact-lens-prescriptions-expire",
  label: "Why do contact lens prescriptions expire?",
};

export const commercialContactPages = {
  orderContactLensesOnline: {
    slug: "order-contact-lenses-online",
    primaryIntent: "Buy authentic contact lenses online with prescription verification.",
    primaryConversionGoal:
      "Move shoppers from broad online-ordering intent into browse, prescription upload, or manual prescription entry.",
    title: "Order Contact Lenses Online",
    metaDescription:
      "Order authentic contact lenses online from Honest Lenses with valid prescription verification, clear product matching, and manufacturer-direct fulfillment.",
    h1: "Order Contact Lenses Online",
    eyebrow: "Online Contact Lens Ordering",
    intro:
      "Honest Lenses helps you order the exact contact lenses on your valid prescription, then verifies the prescription before fulfillment.",
    primaryCta: {
      href: "/browse",
      label: "Browse lenses",
    },
    secondaryCta: {
      href: "/upload-prescription",
      label: "Start with your prescription",
    },
    productCoreIds: [
      "OASYS_1D",
      "DT1",
      "PRECISION1",
      "BIOFINITY",
      "ULTRA",
      "MYDAY",
    ],
    productSelectionLogic:
      "This page surfaces popular daily and reusable lenses across major manufacturers so shoppers can move from broad ordering intent to the exact product named on their prescription.",
    sections: [
      {
        heading: "How online contact lens ordering works",
        body: [
          "Start by matching the lens brand and product name on your contact lens prescription. Contact lenses are not interchangeable just because the power looks similar.",
          "During checkout, you can upload your prescription or enter the prescription details manually. Honest Lenses verifies prescriptions before fulfillment.",
        ],
      },
      {
        heading: "What to check before you order",
        body: [
          "Confirm the lens name, power, base curve, diameter, expiration date, and prescriber information before placing an order.",
          "If your right and left eyes use different lenses or parameters, order each eye according to the prescription instead of assuming both sides match.",
        ],
        bullets: [
          "Use the exact lens brand or product family listed on the prescription.",
          "Do not use a glasses prescription to order contact lenses.",
          "Choose quantity based on prescription timing and replacement schedule.",
        ],
      },
      {
        heading: "When to start with browsing",
        body: [
          "If you already know the product name from your box or prescription, use the product links below or search the catalog. If you are not sure, start with the prescription upload flow so the order can be reviewed against the document.",
        ],
      },
    ],
    relatedGuides: [
      verificationGuide,
      glassesGuide,
      verificationTimeGuide,
      pricingGuide,
    ],
    relatedPages: [
      {
        href: "/contacts/daily-contact-lenses",
        label: "Daily contact lenses",
      },
      {
        href: "/contacts/acuvue-contact-lenses",
        label: "ACUVUE contact lenses",
      },
      {
        href: "/contacts/annual-supply-contact-lenses",
        label: "Annual supply contact lenses",
      },
      {
        href: "/contacts/toric-contact-lenses",
        label: "Toric contact lenses",
      },
    ],
    canonicalUrl: `${SITE_URL}/contacts/order-contact-lenses-online`,
  },
  dailyContactLenses: {
    slug: "daily-contact-lenses",
    primaryIntent: "Shop daily disposable contact lenses.",
    primaryConversionGoal:
      "Help shoppers with daily-lens intent choose the prescribed daily product and enter the order flow.",
    title: "Daily Contact Lenses",
    metaDescription:
      "Shop daily contact lenses from Honest Lenses and compare popular daily disposable options by brand, lens type, and prescription needs.",
    h1: "Daily Contact Lenses",
    eyebrow: "Daily Disposable Contacts",
    intro:
      "Daily disposable contact lenses are worn for one day and replaced with a fresh pair, but the right daily lens still has to match your contact lens prescription.",
    primaryCta: {
      href: "/browse",
      label: "Browse daily lenses",
    },
    secondaryCta: {
      href: "/upload-prescription",
      label: "Upload prescription",
    },
    productCoreIds: [
      "OASYS_1D",
      "OASYS_MAX_1D",
      "MOIST",
      "DT1",
      "PRECISION1",
      "DACP",
      "MYDAY",
      "CLARITI_1D",
      "INFUSE_1D",
      "BIOTRUE_1D",
    ],
    productSelectionLogic:
      "This page includes daily replacement lenses from the Honest Lenses catalog, prioritizing popular daily products with product pages and available catalog pricing.",
    sections: [
      {
        heading: "When daily lenses may make sense",
        body: [
          "Daily lenses can be convenient for people who are prescribed a fresh pair for each day of wear. They are often chosen for simplicity, travel, part-time wear, or avoiding lens storage.",
          "The prescription still controls what you can order. A daily lens should not be substituted for a different brand or design unless your prescriber updates the prescription.",
        ],
      },
      {
        heading: "How to choose among daily lenses",
        body: [
          "Use the exact product name on your prescription first. Then confirm whether the prescription is spherical, toric for astigmatism, multifocal, or a color lens.",
          "Pack size affects how long each order lasts. If you are considering a larger supply, check the prescription expiration date before ordering.",
        ],
      },
      {
        heading: "Daily lenses and prescription verification",
        body: [
          "Honest Lenses verifies contact lens prescriptions before fulfillment. If your prescription is incomplete, expired, or does not match the ordered lens, the order may need correction before it can ship.",
        ],
      },
    ],
    relatedGuides: [verificationGuide, expiredGuide, rejectedGuide, pricingGuide],
    relatedPages: [
      {
        href: "/contacts/order-contact-lenses-online",
        label: "Order contact lenses online",
      },
      {
        href: "/contacts/annual-supply-contact-lenses",
        label: "Annual supply contact lenses",
      },
      {
        href: "/contacts/toric-contact-lenses",
        label: "Toric contact lenses",
      },
      {
        href: "/contacts/acuvue-contact-lenses",
        label: "ACUVUE contact lenses",
      },
    ],
    canonicalUrl: `${SITE_URL}/contacts/daily-contact-lenses`,
  },
  acuvueContactLenses: {
    slug: "acuvue-contact-lenses",
    primaryIntent: "Shop ACUVUE contact lenses.",
    primaryConversionGoal:
      "Help shoppers with ACUVUE brand intent find the exact prescribed ACUVUE product and begin ordering.",
    title: "ACUVUE Contact Lenses",
    metaDescription:
      "Shop ACUVUE contact lenses from Honest Lenses, including OASYS, OASYS MAX, VITA, 1-DAY ACUVUE MOIST, and astigmatism options.",
    h1: "ACUVUE Contact Lenses",
    eyebrow: "ACUVUE Lens Options",
    intro:
      "ACUVUE prescriptions can name a specific product, replacement schedule, and lens design. Match the exact ACUVUE lens on your prescription before ordering.",
    primaryCta: {
      href: "/browse",
      label: "Browse ACUVUE lenses",
    },
    secondaryCta: {
      href: "/upload-prescription",
      label: "Upload prescription",
    },
    productCoreIds: [
      "OASYS_1D",
      "OASYS_MAX_1D",
      "OASYS_2W",
      "MOIST",
      "VITA",
      "OASYS_1D_AST",
      "OASYS_2W_AST",
      "MOIST_AST",
      "DEFINE",
      "ACUVUE2",
    ],
    productSelectionLogic:
      "This page includes ACUVUE lenses in the Honest Lenses catalog, grouping daily, two-week, monthly, color, and astigmatism options manufactured by VISTAKON.",
    sections: [
      {
        heading: "Match the specific ACUVUE product",
        body: [
          "ACUVUE product names can look similar, but ACUVUE OASYS, ACUVUE OASYS 1-Day, ACUVUE OASYS MAX 1-Day, and ACUVUE VITA are not the same lens.",
          "Use the full product name on the prescription or box before choosing a product page.",
        ],
      },
      {
        heading: "Daily, two-week, and monthly ACUVUE options",
        body: [
          "The Honest Lenses catalog includes daily disposable ACUVUE options, two-week ACUVUE OASYS options, and monthly ACUVUE VITA options.",
          "Replacement schedule affects how many boxes you may need, especially if you are planning a larger supply.",
        ],
      },
      {
        heading: "ACUVUE astigmatism and specialty prescriptions",
        body: [
          "If your prescription includes cylinder and axis, you may need an ACUVUE for ASTIGMATISM product. If it includes add power, you may need a multifocal product.",
          "Do not switch between standard, toric, multifocal, or color designs unless your eye care professional changes the prescription.",
        ],
      },
    ],
    relatedGuides: [verificationGuide, rejectedGuide, glassesGuide, expirationGuide],
    relatedPages: [
      {
        href: "/contacts/daily-contact-lenses",
        label: "Daily contact lenses",
      },
      {
        href: "/contacts/toric-contact-lenses",
        label: "Toric contact lenses",
      },
      {
        href: "/contacts/annual-supply-contact-lenses",
        label: "Annual supply contact lenses",
      },
      {
        href: "/contacts/order-contact-lenses-online",
        label: "Order contact lenses online",
      },
    ],
    canonicalUrl: `${SITE_URL}/contacts/acuvue-contact-lenses`,
  },
  annualSupplyContactLenses: {
    slug: "annual-supply-contact-lenses",
    primaryIntent: "Evaluate and order a larger contact lens supply.",
    primaryConversionGoal:
      "Increase qualified larger-quantity orders by helping shoppers understand prescription timing, pack size, and replacement schedule.",
    title: "Annual Supply Contact Lenses",
    metaDescription:
      "Learn how to think about annual supply contact lens orders, prescription expiration timing, pack sizes, and product matching before ordering.",
    h1: "Annual Supply Contact Lenses",
    eyebrow: "Larger Contact Lens Orders",
    intro:
      "An annual supply can be convenient when your prescription timing and replacement schedule support it. The order still needs to match your valid contact lens prescription.",
    primaryCta: {
      href: "/browse",
      label: "Browse lenses",
    },
    secondaryCta: {
      href: "/upload-prescription",
      label: "Start annual supply order",
    },
    productCoreIds: [
      "OASYS_1D",
      "DT1",
      "PRECISION1",
      "BIOFINITY",
      "ULTRA",
      "TOTAL30",
      "MYDAY",
      "BIOTRUE_1D",
    ],
    productSelectionLogic:
      "This page surfaces popular daily and reusable lenses where pack size, replacement schedule, and prescription expiration commonly affect annual-supply planning.",
    sections: [
      {
        heading: "When an annual supply may be appropriate",
        body: [
          "A larger supply is usually easiest when your contact lens prescription is current, the product is stable, and your prescriber has not recently changed your lens design or parameters.",
          "Honest Lenses cannot use an annual-supply order to renew or extend an expired prescription.",
        ],
      },
      {
        heading: "What affects annual quantity",
        body: [
          "Daily disposable, weekly, two-week, and monthly lenses use different replacement schedules and pack sizes. The number of boxes needed can also change if your right and left eyes have different prescriptions.",
          "Prescription expiration date matters. A prescription that expires soon may limit how much supply can be fulfilled.",
        ],
        bullets: [
          "Daily lenses usually require more individual lenses over a year.",
          "Reusable lenses may use fewer lenses but still require exact prescription matching.",
          "Toric and multifocal lenses can have more parameter-specific availability constraints.",
        ],
      },
      {
        heading: "Before ordering a full supply",
        body: [
          "Check the exact product name, expiration date, and prescriber information. If your prescription is incomplete or near expiration, it may be better to upload the document first and let the order be reviewed.",
        ],
      },
    ],
    relatedGuides: [expiredGuide, pricingGuide, expirationGuide, verificationGuide],
    relatedPages: [
      {
        href: "/contacts/order-contact-lenses-online",
        label: "Order contact lenses online",
      },
      {
        href: "/contacts/daily-contact-lenses",
        label: "Daily contact lenses",
      },
      {
        href: "/contacts/acuvue-contact-lenses",
        label: "ACUVUE contact lenses",
      },
      {
        href: "/contacts/toric-contact-lenses",
        label: "Toric contact lenses",
      },
    ],
    canonicalUrl: `${SITE_URL}/contacts/annual-supply-contact-lenses`,
  },
  toricContactLenses: {
    slug: "toric-contact-lenses",
    primaryIntent: "Shop toric contact lenses for astigmatism prescriptions.",
    primaryConversionGoal:
      "Help shoppers with astigmatism intent find toric products and understand the extra prescription fields needed to order.",
    title: "Toric Contact Lenses",
    metaDescription:
      "Shop toric contact lenses for astigmatism from Honest Lenses and review cylinder, axis, brand, and prescription matching requirements before ordering.",
    h1: "Toric Contact Lenses",
    eyebrow: "Contacts for Astigmatism",
    intro:
      "Toric contact lenses are designed for prescriptions that include astigmatism correction. Your order must match the lens brand, cylinder, axis, and other prescribed parameters.",
    primaryCta: {
      href: "/browse",
      label: "Browse toric lenses",
    },
    secondaryCta: {
      href: "/upload-prescription",
      label: "Upload toric prescription",
    },
    productCoreIds: [
      "OASYS_1D_AST",
      "OASYS_2W_AST",
      "OASYS_MAX_1D_AST",
      "MOIST_AST",
      "DT1_AST",
      "PRECISION1_AST",
      "BIOFINITY_AST",
      "MYDAY_AST",
      "CLARITI_1D_AST",
      "INFUSE_1D_AST",
      "ULTRA_AST",
      "AO_HG_AST",
      "TOTAL30_AST",
    ],
    productSelectionLogic:
      "This page includes toric lenses in the Honest Lenses catalog, prioritizing products with astigmatism-specific parameters and product pages.",
    sections: [
      {
        heading: "Toric prescriptions include extra parameters",
        body: [
          "A toric prescription usually includes cylinder and axis in addition to sphere, base curve, diameter, brand, and expiration date.",
          "Those details are part of the fit and vision correction. A non-toric lens should not be used for a toric prescription unless your prescriber changes the prescription.",
        ],
      },
      {
        heading: "Daily and reusable toric options",
        body: [
          "The Honest Lenses catalog includes daily disposable toric lenses and reusable toric lenses from major manufacturers.",
          "Choose the product that matches the prescription first, then review pack size and quantity.",
        ],
      },
      {
        heading: "Ordering toric lenses online",
        body: [
          "Because toric lenses have more prescription fields, incomplete or mismatched information can slow verification. Uploading a clear prescription can help reduce avoidable order corrections.",
        ],
      },
    ],
    relatedGuides: [verificationGuide, rejectedGuide, glassesGuide, verificationTimeGuide],
    relatedPages: [
      {
        href: "/contacts/daily-contact-lenses",
        label: "Daily contact lenses",
      },
      {
        href: "/contacts/acuvue-contact-lenses",
        label: "ACUVUE contact lenses",
      },
      {
        href: "/contacts/annual-supply-contact-lenses",
        label: "Annual supply contact lenses",
      },
      {
        href: "/contacts/order-contact-lenses-online",
        label: "Order contact lenses online",
      },
    ],
    canonicalUrl: `${SITE_URL}/contacts/toric-contact-lenses`,
  },
} satisfies Record<string, CommercialContactPageConfig>;

export const commercialContactPageList = Object.values(commercialContactPages);
