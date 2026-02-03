// data/addProfiles.ts
export type AddProfile = {
  values: string[];
};

export const addProfiles: Record<string, AddProfile> = {
  VISTAKON_MF_STANDARD: {
    values: ["+0.75", "+1.00", "+1.25", "+1.50", "+1.75", "+2.00", "+2.25", "+2.50"],
  },

  VISTAKON_DEFINE: {
    values: ["Low", "High"],
  },

  BAUSCH_ULTRA_MF: {
    values: ["Low", "High"],
  },

  COOPER_BIOFINITY_MF: {
    values: ["+1.00", "+1.50", "+2.00", "+2.50"],
  },

  ALCON_DAILIES_MF: {
    values: ["Low", "Medium", "High"],
  },
};
