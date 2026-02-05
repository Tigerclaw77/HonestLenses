// data/lensAdds.ts

/**
 * Key = lens.nameID
 * Value = exact ADD labels as shown to the user
 *
 * Rule:
 * - Only multifocal lenses should appear here.
 * - If a lens is NOT here, it has NO add selector.
 *
 * Note:
 * - CooperVision multifocals use numeric adds AND N/D designation (e.g. "+2.00 D", "+2.00 N").
 * - We keep this "not complex" by encoding N/D into the same single string option.
 */

export const lensAddOptions: Record<string, string[]> = {
  /* =========================
     VISTAKON / ACUVUE
     (from your Vistakon add component: Low/Medium/High)
  ========================= */

  V002: ["Low", "Medium", "High"], // Oasys Max 1-Day Multifocal
  V007: ["Low", "Medium", "High"], // Moist Multifocal
  V010: ["Low", "Medium", "High"], // Oasys Multifocal
  V019: ["Low", "Medium", "High"], // Max 1-Day Multifocal for Astigmatism

  /* =========================
     BAUSCH + LOMB
     (from your Bausch add component: Low/High)
  ========================= */

  BL02: ["Low", "High"], // Infuse One-Day Multifocal
  BL05: ["Low", "High"], // Biotrue ONEday for Presbyopia
  BL08: ["Low", "High"], // Ultra for Presbyopia
  BL09: ["Low", "High"], // Ultra Multifocal for Astigmatism
  BL11: ["Low", "High"], // PureVision Multi-Focal
  BL14: ["Low", "High"], // PureVision2 For Presbyopia
  BL17: ["Low", "High"], // Soflens Multi-Focal

  /* =========================
     COOPER VISION
     (from your Cooper file)
  ========================= */

  // clariti 1 day multifocal
  CV14: ["Low", "High"],

  // MyDay multifocal (your Cooper file uses Low/Mid/High)
  CV18: ["Low", "Mid", "High"],

  // Proclear 1 day multifocal (your Cooper file returns "MF")
  CV21: ["MF"],

  // The core N/D numeric add set used for Biofinity MF + Proclear MF family:
  CV06: [
    "+1.00 D",
    "+1.00 N",
    "+1.50 D",
    "+1.50 N",
    "+2.00 D",
    "+2.00 N",
    "+2.50 D",
    "+2.50 N",
  ], // Biofinity multifocal
  CV09: [
    "+1.00 D",
    "+1.00 N",
    "+1.50 D",
    "+1.50 N",
    "+2.00 D",
    "+2.00 N",
    "+2.50 D",
    "+2.50 N",
  ], // Biofinity toric multifocal
  CV22: [
    "+1.00 D",
    "+1.00 N",
    "+1.50 D",
    "+1.50 N",
    "+2.00 D",
    "+2.00 N",
    "+2.50 D",
    "+2.50 N",
  ], // Proclear multifocal

  // Proclear multifocal XR:
  // Your Cooper file makes this conditional on power range.
  // Keeping it "not complex": include the superset; you can fine-tune later if you want.
  CV23: [
    "+1.00 D",
    "+1.00 N",
    "+1.50 D",
    "+1.50 N",
    "+2.00 D",
    "+2.00 N",
    "+2.50 D",
    "+2.50 N",
    "+3.00 D",
    "+3.00 N",
    "+3.50 D",
    "+3.50 N",
    "+4.00 D",
    "+4.00 N",
  ],

  // Proclear multifocal toric:
  CV24: [
    "+1.00 D",
    "+1.00 N",
    "+1.50 D",
    "+1.50 N",
    "+2.00 D",
    "+2.00 N",
    "+2.50 D",
    "+2.50 N",
    "+3.00 D",
    "+3.00 N",
    "+3.50 D",
    "+3.50 N",
    "+4.00 D",
    "+4.00 N",
  ],

  /* =========================
     ALCON
     Your current lenses list includes Dailies Total1 MF + Air Optix MF etc.
     You uploaded an Alcon add component (Low/Medium/High),
     BUT your lenses list does not include any Alcon MF that uses Medium explicitly
     (except Total1 MF is usually Low/Med/High in some lines — you can adjust if needed).
     Add here only if/when you want them selectable.
  ========================= */

  A007: ["Low", "Medium", "High"], // Dailies AquaComfort Plus Multifocal
  A012: ["Low", "Medium", "High"], // Dailies Total 1 Multifocal
  A003: ["Low", "Medium", "High"], // Air Optix MF
  A021: ["LOW", "MED", "HIGH"], // Total30 Multifocal
  A022: ["LOW", "MED", "HIGH"], // Total30 Multifocal for Astigmatism
};
