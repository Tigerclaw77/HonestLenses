import type { LensCore } from "../types";
import { AXIS_PRESETS } from "../constants";

/* To use preset axis
axis: AXIS_PRESETS.full10,
axis: AXIS_PRESETS.reduced10, (010, 020, 070, 080, 090, 100, 110, 160, 170, 180)

To modify axis
Remove axes:
axis: AXIS_PRESETS.full10.filter(
  v => ![040, 050, 130, 140].includes(v)
),
Add axes:
filter(
  v => ![070, 110].includes(v)
), 
 Do both:
 axis: [
  ...AXIS_PRESETS.reduced10.filter(
    v => ![70, 110].includes(v)
  ),
  60, 150,
],   */

export const lenses: LensCore[] = [
  /* =========================
     VISTAKON
  ========================= */

  /* =========================
     OASYS MAX 1-DAY FAMILY
  ========================= */

  {
    coreId: "OASYS_MAX_1D",
    displayName: "ACUVUE OASYS MAX 1-Day",
    manufacturer: "VISTAKON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.5, 9.0],
      diameter: [14.3],
      sphere: {
        segments: [
          { min: -12.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: 6.5, max: 8.0, step: 0.5 },
        ],
        exclude: [-0.25, 0.25],
      },
    },
  },

  {
    coreId: "OASYS_MAX_1D_MF",
    displayName: "ACUVUE OASYS MAX 1-Day MULTIFOCAL",
    manufacturer: "VISTAKON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.4],
      diameter: [14.3],
      sphere: {
        segments: [{ min: -9.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["LOW", "MID", "HIGH"],
      },
    },
  },

  {
    coreId: "OASYS_MAX_1D_AST",
    displayName: "ACUVUE OASYS MAX 1-Day for ASTIGMATISM",
    manufacturer: "VISTAKON",
    replacement: "DD",

    type: {
      toric: true,
      multifocal: false,
    },

    parameters: {
      baseCurve: [8.5],
      diameter: [14.3],

      sphere: {
        segments: [
          { min: -9.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 4.0, step: 0.25 },
        ],
      },

      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],
            axis: AXIS_PRESETS.full10,
          },
          {
            cylinders: [-2.25],
            axis: AXIS_PRESETS.reduced10,
          },
        ],
      },
    },
  },

  {
    coreId: "OASYS_MAX_1D_AST_MF",
    displayName: "ACUVUE OASYS MAX 1-Day MULTIFOCAL for ASTIGMATISM",
    manufacturer: "VISTAKON",
    replacement: "DD",
    type: {
      toric: true,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.5],
      diameter: [14.3],
      sphere: {
        segments: [{ min: -9.0, max: 6.0, step: 0.25 }],
      },
      toric: {
        groups: [
          {
            cylinders: [-1.0],
            axis: AXIS_PRESETS.reduced10,
          },
        ],
      },
      multifocal: {
        adds: ["LOW", "MID", "HIGH"],
      },
    },
  },

  /* =========================
     OASYS 1-DAY FAMILY
  ========================= */

  {
    coreId: "OASYS_1D",
    displayName: "ACUVUE OASYS 1-Day",
    manufacturer: "VISTAKON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.5, 9.0],
      diameter: [14.3],
      sphere: {
        segments: [
          { min: -12.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: 6.5, max: 8.0, step: 0.5 },
        ],
      },
    },
  },

  {
    coreId: "OASYS_1D_AST",
    displayName: "ACUVUE OASYS 1-Day for ASTIGMATISM",
    manufacturer: "VISTAKON",
    replacement: "DD",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.5],
      diameter: [14.3],

      sphere: {
        segments: [
          { min: -9.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 4.0, step: 0.25 },
        ],
      },

      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],
            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.full10,
              },
              {
                sphereRange: { min: -9.0, max: 4.0 },
                axis: AXIS_PRESETS.reduced10,
              },
            ],
          },

          {
            cylinders: [-2.25],
            axis: AXIS_PRESETS.reduced10,
          },
        ],
      },
    },
  },

  /* =========================
     OASYS 2-WEEK FAMILY
  ========================= */

  {
    coreId: "OASYS_2W",
    displayName: "ACUVUE OASYS",
    manufacturer: "VISTAKON",
    replacement: "2W",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.4, 8.8],
      diameter: [14.0],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: 8.0, step: 0.5 },
        ],
        exclude: [-0.25, 0.0, 0.25],
        // Plano (0.00) is commercially packaged differently by manufacturer.
      },
    },
  },

  {
    coreId: "OASYS_2W_AST",
    displayName: "ACUVUE OASYS for ASTIGMATISM",
    manufacturer: "VISTAKON",
    replacement: "2W",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -9.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 6.0, step: 0.25 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25, -2.75],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  {
    coreId: "OASYS_2W_MF",
    displayName: "ACUVUE OASYS MULTIFOCAL",
    manufacturer: "VISTAKON",
    replacement: "2W",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.4],
      diameter: [14.3],
      sphere: {
        segments: [{ min: -9.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["LOW", "MID", "HIGH"],
      },
    },
  },

  /* =========================
     VITA FAMILY
  ========================= */

  {
    coreId: "VITA",
    displayName: "ACUVUE VITA",
    manufacturer: "VISTAKON",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.4, 8.8],
      diameter: [14.0],
      sphere: {
        segments: [
          { min: -12.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: 6.5, max: 8.0, step: 0.5 },
        ],
        exclude: [-0.25, 0.0, 0.25],
      },
    },
  },

  {
    coreId: "VITA_AST",
    displayName: "ACUVUE VITA for ASTIGMATISM",
    manufacturer: "VISTAKON",
    replacement: "1M",

    type: {
      toric: true,
      multifocal: false,
    },

    parameters: {
      baseCurve: [8.6],
      diameter: [14.5],

      sphere: {
        segments: [
          { min: -9.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 4.0, step: 0.25 },
        ],
      },

      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],

            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.full10,
              },
              {
                sphereRange: { min: -9.0, max: 4.0 },
                axis: AXIS_PRESETS.reduced10,
              },
            ],
          },

          {
            cylinders: [-2.25],
            axis: AXIS_PRESETS.reduced10,
          },
        ],
      },
    },
  },

  /* =========================
     MOIST FAMILY
  ========================= */

  {
    coreId: "MOIST",
    displayName: "1-DAY ACUVUE MOIST",
    manufacturer: "VISTAKON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.5, 9.0],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -12.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 6.0, step: 0.25 },
        ],
        exclude: [-0.25, 0.0, 0.25],
      },
    },
  },

  {
    coreId: "MOIST_MF",
    displayName: "1-DAY ACUVUE MOIST MULTIFOCAL",
    manufacturer: "VISTAKON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.4],
      diameter: [14.3],
      sphere: {
        segments: [{ min: -9.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["LOW", "MID", "HIGH"],
      },
    },
  },

  {
    coreId: "MOIST_AST",
    displayName: "1-DAY ACUVUE MOIST for ASTIGMATISM",
    manufacturer: "VISTAKON",
    replacement: "DD",

    type: {
      toric: true,
      multifocal: false,
    },

    parameters: {
      baseCurve: [8.5],
      diameter: [14.5],

      sphere: {
        segments: [
          { min: -9.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 4.0, step: 0.25 },
        ],
      },

      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],

            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.full10,
              },
              {
                sphereRange: { min: -9.0, max: 4.0 },
                axis: AXIS_PRESETS.reduced10,
              },
            ],
          },

          {
            cylinders: [-2.25],
            axis: AXIS_PRESETS.reduced10,
          },
        ],
      },
    },
  },

  /* =========================
     DEFINE
  ========================= */

  {
    coreId: "DEFINE",
    displayName: "1-DAY ACUVUE DEFINE",
    manufacturer: "VISTAKON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.5],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -6.0, max: 1.0, step: 0.25 },
          { min: -9.0, max: -6.5, step: 0.5 },
        ],
        exclude: [-0.25, 0.25],
      },
    },
  },

  /* =========================
     ACUVUE 2
  ========================= */

  {
    coreId: "ACUVUE2",
    displayName: "ACUVUE 2",
    manufacturer: "VISTAKON",
    replacement: "2W",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.3, 8.7],
      diameter: [14.0],
      sphere: {
        segments: [
          { min: -12.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: 6.5, max: 8.0, step: 0.5 },
        ],
        exclude: [-0.25, 0.0, 0.25],
      },
    },
  },

  /* =========================
     BAUSCH + LOMB
  ========================= */

  /* =========================
     Infuse One-Day family
  ========================= */

  {
    coreId: "INFUSE_1D",
    displayName: "Infuse One-Day",
    manufacturer: "BAUSCH + LOMB",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -12.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 6.0, step: 0.25 },
        ],
      },
    },
  },

  {
    coreId: "INFUSE_1D_MF",
    displayName: "Infuse One-Day Multifocal",
    manufacturer: "BAUSCH + LOMB",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.2],
      sphere: {
        segments: [{ min: -10.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["Low", "High"],
      },
    },
  },

  {
    coreId: "INFUSE_1D_AST",
    displayName: "Infuse One-Day for Astigmatism",
    manufacturer: "BAUSCH + LOMB",
    replacement: "DD",

    type: {
      toric: true,
      multifocal: false,
    },

    parameters: {
      baseCurve: [8.6],
      diameter: [14.5],

      sphere: {
        segments: [
          { min: -8.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 4.0, step: 0.25 },
        ],
      },

      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],

            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.full10,
              },
              {
                sphereRange: { min: -8.0, max: 4.0 },
                axis: AXIS_PRESETS.reduced10,
              },
            ],
          },

          {
            cylinders: [-2.25, -2.75],

            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.reduced10,
              },
            ],
          },
        ],
      },
    },
  },

  /* =========================
     Biotrue ONEday family
  ========================= */

  {
    coreId: "BIOTRUE_1D",
    displayName: "Biotrue ONEday",
    manufacturer: "BAUSCH + LOMB",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -12.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 6.0, step: 0.25 },
        ],
      },
    },
  },

  {
    coreId: "BIOTRUE_1D_MF",
    displayName: "Biotrue ONEday for Presbyopia",
    manufacturer: "BAUSCH + LOMB",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.2],
      sphere: {
        segments: [{ min: -9.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["Low", "High"],
      },
    },
  },

  {
    coreId: "BIOTRUE_1D_AST",
    displayName: "Biotrue ONEday for Astigmatism",
    manufacturer: "BAUSCH + LOMB",
    replacement: "DD",

    type: {
      toric: true,
      multifocal: false,
    },

    parameters: {
      baseCurve: [8.5],
      diameter: [14.5],

      sphere: {
        segments: [
          { min: -9.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 4.0, step: 0.25 },
        ],
      },

      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],

            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.full10,
              },
              {
                sphereRange: { min: -9.0, max: 4.0 },
                axis: AXIS_PRESETS.reduced10,
              },
            ],
          },

          {
            cylinders: [-2.25],

            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.reduced10,
              },
            ],
          },
          {
            cylinders: [-2.75],

            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },

                axis: AXIS_PRESETS.reduced10.filter(
                  (v) => ![70, 80, 100, 110].includes(v),
                ),

                sphereStepOverride: 0.5,
              },
            ],
          },
        ],
      },
    },
  },

  /* =========================
     Ultra family
  ========================= */

  {
    coreId: "ULTRA",
    displayName: "Ultra",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.5],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: -6.5, step: 0.5 },
        ],
      },
    },
  },

  {
    coreId: "ULTRA_AST",
    displayName: "Ultra for Astigmatism",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -9.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 6.0, step: 0.25 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25, -2.75],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  {
    coreId: "ULTRA_MF",
    displayName: "Ultra for Presbyopia",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.5],
      diameter: [14.2],
      sphere: {
        segments: [{ min: -10.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["Low", "High"],
      },
    },
  },

  {
    coreId: "ULTRA_AST_MF",
    displayName: "Ultra Multifocal for Astigmatism",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -9.0, max: -6.5, step: 0.5 },
          { min: -6.0, max: 6.0, step: 0.25 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],
            axis: AXIS_PRESETS.full10,
          },
          {
            cylinders: [-2.25, -2.75],
            axis: AXIS_PRESETS.reduced10,
          },
        ],
      },
      multifocal: {
        adds: ["Low", "High"],
      },
    },
  },

  /* =========================
     PureVision family
  ========================= */

  {
    coreId: "PUREVISION",
    displayName: "PureVision",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.3, 8.6],
      diameter: [14.0],
      sphereByBaseCurve: [
        {
          baseCurve: 8.3,
          spec: {
            segments: [{ min: -6.0, max: -0.25, step: 0.25 }],
          },
        },
        {
          baseCurve: 8.6,
          spec: {
            segments: [
              { min: -6.0, max: 6.0, step: 0.25 },
              { min: -12.0, max: -6.5, step: 0.5 },
            ],
          },
        },
      ],
    },
  },

  {
    coreId: "PUREVISION_MF",
    displayName: "PureVision Multi-Focal",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.0],
      sphere: {
        segments: [{ min: -10.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["Low", "High"],
      },
    },
  },

  {
    coreId: "PUREVISION2",
    displayName: "PureVision2",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.0],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: -6.5, step: 0.5 },
        ],
      },
    },
  },

  {
    coreId: "PUREVISION2_AST",
    displayName: "PureVision2 for Astigmatism",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.9],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -9.0, max: -6.5, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  {
    coreId: "PUREVISION2_MF",
    displayName: "PureVision2 For Presbyopia",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.0],
      sphere: {
        segments: [{ min: -10.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["Low", "High"],
      },
    },
  },

  /* =========================
     SofLens family
  ========================= */

  {
    coreId: "SOFLENS_DAILY",
    displayName: "SofLens Daily Disposable",
    manufacturer: "BAUSCH + LOMB",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -9.0, max: -7.0, step: 0.5 },
          { min: -6.5, max: 6.5, step: 0.25 },
        ],
      },
    },
  },

  {
    coreId: "SOFLENS38",
    displayName: "SofLens 38",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.4, 8.7, 9.0],
      diameter: [14.0],
      sphere: {
        segments: [{ min: -9.0, max: -0.25, step: 0.25 }],
      },
    },
  },

  {
    coreId: "SOFLENS_AST",
    displayName: "SofLens For Astigmatism",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.5],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: -0.25, step: 0.25 },
          { min: -9.0, max: -6.5, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25, -2.75],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  {
    coreId: "SOFLENS_MF",
    displayName: "SofLens Multi-Focal",
    manufacturer: "BAUSCH + LOMB",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.5, 8.8],
      diameter: [14.5],
      sphere: {
        segments: [{ min: -7.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["Low", "High"],
      },
    },
  },

  /* =========================
     ALCON
  ========================= */

  /* =========================
     AIR OPTIX family
  ========================= */

  {
    coreId: "AO_HG",
    displayName: "AIR OPTIX plus HydraGlyde",
    manufacturer: "ALCON",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -8.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: 8.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "AO_HG_AST",
    displayName: "AIR OPTIX plus HydraGlyde for ASTIGMATISM",
    manufacturer: "ALCON",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.7],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -10.0, max: -6.5, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  {
    coreId: "AO_HG_MF",
    displayName: "AIR OPTIX plus HydraGlyde MULTIFOCAL",
    manufacturer: "ALCON",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.2],
      sphere: {
        segments: [{ min: -10.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["LO", "MED", "HI"],
      },
    },
  },

  {
    coreId: "AO_ND",
    displayName: "AIR OPTIX NIGHT & DAY AQUA",
    manufacturer: "ALCON",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.4, 8.6],
      diameter: [13.8],
      sphere: {
        segments: [
          { min: -8.0, max: 6.0, step: 0.25 },
          { min: -10.0, max: -8.5, step: 0.5 },
        ],
      },
    },
  },

  {
    coreId: "AO_COL",
    displayName: "AIR OPTIX COLORS",
    manufacturer: "ALCON",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -8.0, max: -6.5, step: 0.5 },
        ],
      },
    },
  },

  /* =========================
     Dailies TOTAL1 family
  ========================= */

  {
    coreId: "DT1",
    displayName: "Dailies TOTAL1",
    manufacturer: "ALCON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.5],
      diameter: [14.1],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: -6.5, step: 0.5 },
        ],
        exclude: [-0.25, 0.0, 0.25],
      },
    },
  },

  {
    coreId: "DT1_AST",
    displayName: "Dailies TOTAL1 for Astigmatism",
    manufacturer: "ALCON",
    replacement: "DD",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 4.0, step: 0.25 },
          { min: -8.0, max: -6.5, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],
            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.full10,
              },
              {
                sphereRange: { min: -8.0, max: 4.0 },
                axis: AXIS_PRESETS.reduced10,
              },
            ],
          },
          {
            cylinders: [-2.25],
            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.reduced10,
              },
              {
                sphereRange: { min: -8.0, max: 4.0 },
                axis: [10, 20, 160, 170, 180] as const,
              },
            ],
          },
        ],
      },
    },
  },

  {
    coreId: "DT1_MF",
    displayName: "Dailies TOTAL1 Multifocal",
    manufacturer: "ALCON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.5],
      diameter: [14.1],
      sphere: {
        segments: [{ min: -10.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["LO", "MED", "HI"],
      },
    },
  },

  /* =========================
     Precision1 family
  ========================= */

  {
    coreId: "PRECISION1",
    displayName: "PRECISION1",
    manufacturer: "ALCON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.3],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: 8.0, step: 0.5 },
        ],
        exclude: [-0.25, 0.0, 0.25],
      },
    },
  },

  {
    coreId: "PRECISION1_AST",
    displayName: "PRECISION1 for Astigmatism",
    manufacturer: "ALCON",
    replacement: "DD",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.5],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 4.0, step: 0.25 },
          { min: -8.0, max: -6.5, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],
            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.full10,
              },
              {
                sphereRange: { min: -8.0, max: 4.0 },
                axis: AXIS_PRESETS.reduced10,
              },
            ],
          },
          {
            cylinders: [-2.25],
            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.reduced10,
              },
              {
                sphereRange: { min: -8.0, max: 4.0 },
                axis: [10, 20, 160, 170, 180] as const,
              },
            ],
          },
        ],
      },
    },
  },

  /* =========================
     PRECISION7 family
  ========================= */

  {
    coreId: "PRECISION7",
    displayName: "PRECISION7",
    manufacturer: "ALCON",
    replacement: "1W",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.4],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -8.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: 8.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "PRECISION7_AST",
    displayName: "PRECISION7 for Astigmatism",
    manufacturer: "ALCON",
    replacement: "1W",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -10.0, max: 8.0, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  /* =========================
     TOTAL30 family
  ========================= */

  {
    coreId: "TOTAL30",
    displayName: "TOTAL30",
    manufacturer: "ALCON",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.4],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -8.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: 8.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "TOTAL30_AST",
    displayName: "TOTAL30 for Astigmatism",
    manufacturer: "ALCON",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -10.0, max: 8.0, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
          {
            cylinders: [-2.75],
            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 4.0 },
                axis: AXIS_PRESETS.reduced10Plus,
              },
            ],
          },
        ],
      },
    },
  },

  {
    coreId: "TOTAL30_MF",
    displayName: "TOTAL30 Multifocal",
    manufacturer: "ALCON",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.4],
      diameter: [14.2],
      sphere: {
        segments: [{ min: -10.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["LO", "MED", "HI"],
      },
    },
  },

  {
    coreId: "TOTAL30_AST_MF",
    displayName: "TOTAL30 Multifocal for Astigmatism",
    manufacturer: "ALCON",
    replacement: "1M",

    type: {
      toric: true,
      multifocal: true,
    },

    parameters: {
      baseCurve: [8.6],
      diameter: [14.5],

      sphere: {
        segments: [{ min: -6.0, max: 4.0, step: 0.25 }],
      },

      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
      multifocal: {
        adds: ["LO", "MED", "HI"],
      },
    },
  },

  /* =========================
     DAILIES COLORS
  ========================= */

  {
    coreId: "DAILIES_COL",
    displayName: "DAILIES COLORS",
    manufacturer: "ALCON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [13.8],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -8.0, max: -6.5, step: 0.5 },
        ],
        exclude: [-0.25],
      },
    },
  },

  /* =========================
     DAILIES AquaComfort PLUS
  ========================= */

  {
    coreId: "DACP",
    displayName: "DAILIES AquaComfort PLUS",
    manufacturer: "ALCON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.7],
      diameter: [14.0],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -15.0, max: 8.0, step: 0.5 },
        ],
        exclude: [-0.25, 0.0, 0.25],
      },
    },
  },

  {
    coreId: "DACP_MF",
    displayName: "DAILIES AquaComfort PLUS Multifocal",
    manufacturer: "ALCON",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.7],
      diameter: [14.0],
      sphere: {
        segments: [{ min: -10.0, max: 6.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["LO", "MED", "HI"],
      },
    },
  },

  {
    coreId: "DACP_AST",
    displayName: "DAILIES AquaComfort PLUS for Astigmatism",
    manufacturer: "ALCON",
    replacement: "DD",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.8],
      diameter: [14.4],
      sphere: {
        segments: [
          { min: -6.0, max: 4.0, step: 0.25 },
          { min: -8.0, max: -6.5, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],
            axis: AXIS_PRESETS.reduced10,
          },
        ],
      },
    },
  },

  /* =========================
     CooperVision
  ========================= */

  /* =========================
     clariti 1 day family
  ========================= */

  {
    coreId: "CLARITI_1D",
    displayName: "clariti 1 day",
    manufacturer: "COOPERVISION",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.1],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -10.0, max: 8.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "CLARITI_1D_AST",
    displayName: "clariti 1 day toric",
    manufacturer: "COOPERVISION",
    replacement: "DD",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.3],
      sphere: {
        segments: [
          { min: -6.0, max: 4.0, step: 0.25 },
          { min: -9.0, max: -6.5, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75],
            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.full10,
              },
              {
                sphereRange: { min: -9.0, max: -6.5 },
                axis: AXIS_PRESETS.claritiHighMinus,
              },
              {
                sphereRange: { min: 0.25, max: 4.0 },
                axis: AXIS_PRESETS.reduced10,
              },
            ],
          },

          {
            cylinders: [-2.25],
            sphereAxisRules: [
              {
                sphereRange: { min: -6.0, max: 0.0 },
                axis: AXIS_PRESETS.reduced10,
              },
              {
                sphereRange: { min: -9.0, max: -6.5 },
                axis: [10, 20, 90, 160, 170, 180] as const,
              },
            ],
          },
        ],
      },
    },
  },

  {
    coreId: "CLARITI_1D_MF",
    displayName: "clariti 1 day multifocal",
    manufacturer: "COOPERVISION",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.1],
      sphere: {
        segments: [{ min: -6.0, max: 5.0, step: 0.25 }],
      },
      multifocal: {
        adds: ["Low", "High"],
      },
    },
  },

  /* =========================
     MyDay family
  ========================= */

  {
    coreId: "MYDAY",
    displayName: "MyDay",
    manufacturer: "COOPERVISION",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.4],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -6.0, max: 5.0, step: 0.25 },
          { min: -12.0, max: 8.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "MYDAY_ENG",
    displayName: "MyDay Energys",
    manufacturer: "COOPERVISION",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.4],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -6.0, max: 5.0, step: 0.25 },
          { min: -12.0, max: 8.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "MYDAY_AST",
    displayName: "MyDay toric",
    manufacturer: "COOPERVISION",
    replacement: "DD",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 8.0, step: 0.25 },
          { min: -10.0, max: -6.5, step: 0.5 },
        ],
        exclude: [0.0],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  {
    coreId: "MYDAY_MF",
    displayName: "MyDay multifocal",
    manufacturer: "COOPERVISION",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.4],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -10.0, max: 8.0, step: 0.25 },
          { min: -12.0, max: -10.5, step: 0.5 },
        ],
      },
      multifocal: {
        adds: ["Low", "Med", "High"],
      },
    },
  },

  /* =========================
     Proclear family
  ========================= */

  {
    coreId: "PROCLEAR_1D",
    displayName: "Proclear 1 day",
    manufacturer: "COOPERVISION",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.7],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -6.0, max: 5.0, step: 0.25 },
          { min: -12.0, max: 8.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "PROCLEAR_1D_MF",
    displayName: "Proclear 1 day multifocal",
    manufacturer: "COOPERVISION",
    replacement: "DD",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.7],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -10.0, max: -6.5, step: 0.5 },
        ],
      },
      multifocal: {
        adds: ["Multi"],
      },
    },
  },

  {
    coreId: "PROCLEAR",
    displayName: "Proclear sphere",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6, 8.2],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -20.0, max: 20.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "PROCLEAR_AST",
    displayName: "Proclear toric",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.8, 8.4],
      diameter: [14.4],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -8.0, max: -6.5, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  {
    coreId: "PROCLEAR_XR_AST",
    displayName: "Proclear XR toric",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.8, 8.4],
      diameter: [14.4],

      sphere: {
        segments: [
          { min: -6.5, max: 6.5, step: 0.25 },
          { min: -10.0, max: 10.0, step: 0.5 },
        ],
      },

      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
          {
            cylinders: [-2.75, -3.25, -3.75, -4.25, -4.75, -5.25, -5.75],
            axis: AXIS_PRESETS.full5,
          },
        ],
      },
    },
  },

  {
    coreId: "PROCLEAR_MF",
    displayName: "Proclear multifocal",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.7],
      diameter: [14.4],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -8.0, max: -6.5, step: 0.5 },
        ],
      },
      multifocal: {
        adds: [
          "+1.00D",
          "+1.00N",
          "+1.50D",
          "+1.50N",
          "+2.00D",
          "+2.00N",
          "+2.50D",
          "+2.50N",
        ],
      },
    },
  },

  {
    coreId: "PROCLEAR_XR_MF",
    displayName: "Proclear XR multifocal",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.4, 8.7],
      diameter: [14.4],

      sphere: {
        segments: [
          { min: -6.5, max: 6.5, step: 0.25 },
          { min: -20.0, max: 20.0, step: 0.5 },
        ],
      },

      multifocal: {
        adds: [
          "+1.00D",
          "+1.00N",
          "+1.50D",
          "+1.50N",
          "+2.00D",
          "+2.00N",
          "+2.50D",
          "+2.50N",
        ],
        xrAdds: ["+3.00D", "+3.00N", "+3.50D", "+3.50N", "+4.00D", "+4.00N"],
      },
    },
  },

  {
    coreId: "PROCLEAR_AST_MF",
    displayName: "Proclear multifocal toric",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.8, 8.4],
      diameter: [14.4],
      sphere: {
        segments: [
          { min: -6.5, max: 6.5, step: 0.25 },
          { min: -20.0, max: 20.0, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [
              -0.75, -1.25, -1.75, -2.25, -2.75, -3.25, -3.75, -4.25, -4.75,
              -5.25, -5.75,
            ],
            axis: AXIS_PRESETS.full5,
          },
        ],
      },
      multifocal: {
        adds: [
          "+1.00D",
          "+1.00N",
          "+1.50D",
          "+1.50N",
          "+2.00D",
          "+2.00N",
          "+2.50D",
          "+2.50N",
          "+3.00D",
          "+3.00N",
          "+3.50D",
          "+3.50N",
          "+4.00D",
          "+4.00N",
        ],
      },
    },
  },

  /* =========================
     Biofinity family
  ========================= */

  {
    coreId: "BIOFINITY",
    displayName: "Biofinity",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.0],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: -8.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "BIOFINITY_ENG",
    displayName: "Biofinity Energys",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.0],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: -8.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "BIOFINITY_XR",
    displayName: "Biofinity XR",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.0],
      sphere: {
        segments: [
          { min: 8.5, max: 15.0, step: 0.5 },
          { min: -20.0, max: -12.5, step: 0.5 },
        ],
      },
    },
  },

  {
    coreId: "BIOFINITY_AST",
    displayName: "Biofinity toric",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.7],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -10.0, max: 8.0, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  {
    coreId: "BIOFINITY_XR_AST",
    displayName: "Biofinity XR toric",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.7],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -20.0, max: 20.0, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
          {
            cylinders: [-2.75, -3.25, -3.75, -4.25, -4.75, -5.25, -5.75],
            axis: AXIS_PRESETS.full5,
          },
        ],
      },
    },
  },

  {
    coreId: "BIOFINITY_MF",
    displayName: "Biofinity multifocal",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: false,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.6],
      diameter: [14.0],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -10.0, max: -6.5, step: 0.5 },
        ],
      },
      multifocal: {
        adds: [
          "+1.00D",
          "+1.00N",
          "+1.50D",
          "+1.50N",
          "+2.00D",
          "+2.00N",
          "+2.50D",
          "+2.50N",
        ],
      },
    },
  },

  {
    coreId: "BIOFINITY_AST_MF",
    displayName: "Biofinity toric multifocal",
    manufacturer: "COOPERVISION",
    replacement: "1M",
    type: {
      toric: true,
      multifocal: true,
    },
    parameters: {
      baseCurve: [8.7],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -10.0, max: 10.0, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [
              -0.75, -1.25, -1.75, -2.25, -2.75, -3.25, -3.75, -4.25, -4.75,
              -5.25, -5.75,
            ],
            axis: AXIS_PRESETS.full5,
          },
        ],
      },
      multifocal: {
        adds: [
          "+1.00D",
          "+1.00N",
          "+1.50D",
          "+1.50N",
          "+2.00D",
          "+2.00N",
          "+2.50D",
          "+2.50N",
        ],
      },
    },
  },

  /* =========================
     Avaira family
  ========================= */
  {
    coreId: "AVAIRA_VIT",
    displayName: "Avaira Vitality",
    manufacturer: "COOPERVISION",
    replacement: "2W",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.4],
      diameter: [14.2],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -12.0, max: 8.0, step: 0.5 },
        ],
        exclude: [0.0],
      },
    },
  },

  {
    coreId: "AVAIRA_VIT_AST",
    displayName: "Avaira Vitality toric",
    manufacturer: "COOPERVISION",
    replacement: "2W",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.5],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 6.0, step: 0.25 },
          { min: -10.0, max: 8.0, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  /* =========================
     Biomedics family
  ========================= */

  {
    coreId: "BIOMEDICS",
    displayName: "Biomedics 55 Premier",
    manufacturer: "COOPERVISION",
    replacement: "2W",
    type: {
      toric: false,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.6, 8.8, 8.9],
      diameter: [14.2],

      sphereByBaseCurve: [
        {
          baseCurve: [8.6, 8.9],
          spec: {
            segments: [
              { min: -6.0, max: -0.25, step: 0.25 },
              { min: -10.0, max: -6.5, step: 0.5 },
            ],
          },
        },

        {
          baseCurve: [8.8],
          spec: {
            segments: [
              { min: 0.25, max: 5.0, step: 0.25 },
              { min: 5.5, max: 8.0, step: 0.5 },
            ],
          },
        },
      ],
    },
  },

  {
    coreId: "BIOMEDICS_AST",
    displayName: "Biomedics toric",
    manufacturer: "COOPERVISION",
    replacement: "2W",
    type: {
      toric: true,
      multifocal: false,
    },
    parameters: {
      baseCurve: [8.7],
      diameter: [14.5],
      sphere: {
        segments: [
          { min: -6.0, max: 5.0, step: 0.25 },
          { min: -10.0, max: 6.0, step: 0.5 },
        ],
      },
      toric: {
        groups: [
          {
            cylinders: [-0.75, -1.25, -1.75, -2.25],
            axis: AXIS_PRESETS.full10,
          },
        ],
      },
    },
  },

  /* =========================
     MiSight 1 day
  ========================= */

  /*
{
  coreId: "MISIGHT_1D",
  displayName: "MiSight 1 day",
  manufacturer: "COOPERVISION",
  replacement: "DD",
  type: {
    toric: false,
    multifocal: false,
  },
  parameters: {
    baseCurve: [8.7],
    diameter: [14.2],
    sphere: {
      segments: [
        { min: -6.0, max: -0.5, step: 0.25 },
        { min: -7.0, max: -6.5, step: 0.5 },
      ],
    },
  },
},
*/
];
