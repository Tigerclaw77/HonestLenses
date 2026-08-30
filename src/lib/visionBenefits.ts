export const VISION_CARRIERS = [
  {
    value: "vsp",
    label: "VSP",
    helpUrl: "https://www.vsp.com/claims/submit-oon-claim",
    helpText: "Submit an out-of-network claim through VSP.",
  },
  {
    value: "eyemed",
    label: "EyeMed",
    helpUrl: "https://www.eyemed.com/en-us/member/faq/",
    helpText: "Log in to EyeMed Member Web and open the Claims tab.",
  },
  {
    value: "davis_vision",
    label: "Davis Vision",
    helpUrl: "https://davisvision.com/members/faqs/",
    helpText: "Log in and choose Access Benefits and Forms for the claim form.",
  },
  {
    value: "superior_vision",
    label: "Superior Vision",
    helpUrl:
      "https://portal.superiorvision.com/PDF/member/MemReimbClaimForm.pdf",
    helpText: "Open Superior Vision's member reimbursement claim form.",
  },
  {
    value: "uhc_spectera",
    label: "UnitedHealthcare / Spectera",
    helpUrl: "https://plexusbenefits.uhc.com/health/vision-plan-options/",
    helpText:
      "Review UnitedHealthcare / Spectera out-of-network claim options.",
  },
  {
    value: "aetna_vision",
    label: "Aetna Vision",
    helpUrl:
      "https://www.aetna.com/document-library/individuals-families/oon-vision-claim-form.pdf",
    helpText: "Open Aetna's out-of-network vision services claim form.",
  },
  {
    value: "cigna_vision",
    label: "Cigna Vision",
    helpUrl:
      "https://www.cigna.com/individuals-families/shop-plans/transparency-in-coverage",
    helpText:
      "Choose the claim form that matches the vision network shown on your plan.",
  },
  {
    value: "metlife_vision",
    label: "MetLife Vision",
    helpUrl: "https://www.metlife.com/insurance/vision-insurance/",
    helpText:
      "Choose MetLife's instructions for the network named on your vision plan.",
  },
] as const;

export const OTHER_VISION_CARRIER = {
  value: "other",
  label: "Other",
} as const;

export type VisionCarrierValue =
  | (typeof VISION_CARRIERS)[number]["value"]
  | typeof OTHER_VISION_CARRIER.value;

const VISION_CARRIER_VALUES = new Set<string>([
  ...VISION_CARRIERS.map((carrier) => carrier.value),
  OTHER_VISION_CARRIER.value,
]);

export function isVisionCarrierValue(
  value: unknown,
): value is VisionCarrierValue {
  return typeof value === "string" && VISION_CARRIER_VALUES.has(value);
}

export function getVisionCarrier(value: string | null | undefined) {
  if (!value) return null;
  if (value === OTHER_VISION_CARRIER.value) return OTHER_VISION_CARRIER;
  return VISION_CARRIERS.find((carrier) => carrier.value === value) ?? null;
}
