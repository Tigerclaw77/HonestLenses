/*
Lens showroom popularity ordering.

Design goals
- Reflect real prescribing popularity roughly
- Prevent one manufacturer from dominating the grid
- Keep LensCore independent
- Require minimal manual maintenance
*/

type Manufacturer =
  | "VISTAKON"
  | "ALCON"
  | "COOPERVISION"
  | "BAUSCH + LOMB";

/*
Manufacturer rotation pattern

Your requested logic:
V A C V B A C V A B
*/

const manufacturerPattern: Manufacturer[] = [
  "VISTAKON",
  "ALCON",
  "COOPERVISION",
  "VISTAKON",
  "BAUSCH + LOMB",
  "ALCON",
  "COOPERVISION",
  "VISTAKON",
  "ALCON",
  "BAUSCH + LOMB",
];

/*
Per-manufacturer popularity queues

Only rank lenses within a manufacturer.
Everything else automatically falls behind.
*/

const vistakon = [
  "OASYS_1D",
  "OASYS_2W",
  "VITA",
  "OASYS_MAX_1D",
  "MOIST",
  "DEFINE",
  "ACUVUE2",
];

const alcon = [
  "DT1",
  "PRECISION1",
  "AO_HG",
  "TOTAL30",
  "DACP",
  "PRECISION7",
  "AO_ND",
];

const coopervision = [
  "BIOFINITY",
  "MYDAY",
  "CLARITI_1D",
  "PROCLEAR",
  "AVAIRA_VIT",
  "BIOMEDICS",
];

const bausch = [
  "ULTRA",
  "BIOTRUE_1D",
  "INFUSE_1D",
  "PUREVISION2",
  "PUREVISION",
];

/*
Internal helper
*/

function buildQueues() {
  return {
    VISTAKON: [...vistakon],
    ALCON: [...alcon],
    COOPERVISION: [...coopervision],
    "BAUSCH + LOMB": [...bausch],
  };
}

/*
Generate popularity order list
*/

export function generatePopularityOrder(): string[] {
  const queues = buildQueues();
  const result: string[] = [];

  let exhausted = false;

  while (!exhausted) {
    exhausted = true;

    for (const mfr of manufacturerPattern) {
      const next = queues[mfr].shift();

      if (next) {
        result.push(next);
        exhausted = false;
      }
    }
  }

  return result;
}

/*
Create lookup map for fast sorting
*/

export const popularityOrder = generatePopularityOrder();

export const popularityIndex: Record<string, number> =
  Object.fromEntries(
    popularityOrder.map((coreId, index) => [coreId, index]),
  );

/*
Sorting helper
*/

export function getPopularityRank(coreId: string): number {
  return popularityIndex[coreId] ?? 9999;
}