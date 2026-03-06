// data/lensAdds.ts

/**
 * Key = lens.coreId
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

  OASYS_MAX_1D_MF: ["Low", "Medium", "High"], // Oasys Max 1-Day Multifocal
  MOIST_MF: ["Low", "Medium", "High"], // Moist Multifocal
  OASYS_2W_MF: ["Low", "Medium", "High"], // Oasys Multifocal
  OASYS_MAX_1D_AST_MF: ["Low", "Medium", "High"], // Max 1-Day Multifocal for Astigmatism

  /* =========================
     BAUSCH + LOMB
     (from your Bausch add component: Low/High)
  ========================= */

  INFUSE_1D_MF: ["Low", "High"], // Infuse One-Day Multifocal
  BIOTRUE_1D_MF: ["Low", "High"], // Biotrue ONEday for Presbyopia
  ULTRA_MF: ["Low", "High"], // Ultra for Presbyopia
  ULTRA_AST_MF: ["Low", "High"], // Ultra Multifocal for Astigmatism
  PUREVISION_MF: ["Low", "High"], // PureVision Multi-Focal
  PUREVISION2_MF: ["Low", "High"], // PureVision2 For Presbyopia
  SOFLENS_MF: ["Low", "High"], // Soflens Multi-Focal

  /* =========================
     COOPER VISION
     (from your Cooper file)
  ========================= */

  // clariti 1 day multifocal
  CLARITI_1D_MF: ["Low", "High"],

  // MyDay multifocal (your Cooper file uses Low/Mid/High)
  MYDAY_MF: ["Low", "Mid", "High"],

  // Proclear 1 day multifocal (your Cooper file returns "MF")
  PROCLEAR_1D_MF: ["MF"],

  // The core N/D numeric add set used for Biofinity MF + Proclear MF family:
  BIOFINITY_MF: [
    "+1.00 D",
    "+1.00 N",
    "+1.50 D",
    "+1.50 N",
    "+2.00 D",
    "+2.00 N",
    "+2.50 D",
    "+2.50 N",
  ], // Biofinity multifocal
  BIOFINITY_AST_MF: [
    "+1.00 D",
    "+1.00 N",
    "+1.50 D",
    "+1.50 N",
    "+2.00 D",
    "+2.00 N",
    "+2.50 D",
    "+2.50 N",
  ], // Biofinity toric multifocal
  PROCLEAR_MF: [
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
  PROCLEAR_MF_XR: [
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
  PROCLEAR_AST_MF: [
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

  DACP_MF: ["Low", "Medium", "High"], // Dailies AquaComfort Plus Multifocal
  DT1_MF: ["Low", "Medium", "High"], // Dailies Total 1 Multifocal
  AO_HG_MF: ["Low", "Medium", "High"], // Air Optix MF
  TOTAL30_MF: ["LOW", "MED", "HIGH"], // Total30 Multifocal
  TOTAL30_AST_MF: ["LOW", "MED", "HIGH"], // Total30 Multifocal for Astigmatism
};
