type LensImagePresentation = {
  scale: number;
  y?: number;
};

const DEFAULT_PRESENTATION: LensImagePresentation = {
  scale: 1,
  y: 0,
};

const PRESENTATION_OVERRIDES: Record<string, LensImagePresentation> = {
  ACUVUE2: { scale: 1.36 },
  OASYS_2W: { scale: 1.2 },
  OASYS_2W_AST: { scale: 1.24 },
  OASYS_2W_MF: { scale: 1.46 },
  VITA: { scale: 1.14 },
  VITA_AST: { scale: 1.14 },

  MOIST: { scale: 1.14 },
  MOIST_AST: { scale: 1.14 },
  MOIST_MF: { scale: 1.16 },

  OASYS_1D_AST: { scale: 1.14 },
  OASYS_MAX_1D: { scale: 1.1 },
  OASYS_MAX_1D_MF: { scale: 1.16 },
  OASYS_MAX_1D_AST: { scale: 1.04 },
  OASYS_MAX_1D_AST_MF: { scale: 1.06 },

  PUREVISION_MF: { scale: 1.06 },
  PUREVISION2_MF: { scale: 1.04 },
  SOFLENS_MF: { scale: 1.04 },
};

export function getLensImagePresentation(coreId: string): LensImagePresentation {
  return PRESENTATION_OVERRIDES[coreId] ?? DEFAULT_PRESENTATION;
}
