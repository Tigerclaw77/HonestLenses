/* =========================
   Power Modeling
========================= */

export type PowerSegment = {
  min: number;
  max: number;
  step: 0.25 | 0.5 | 1;
};

export type PowerSpec = {
  segments: PowerSegment[];
  exclude?: number[];
};

/* =========================
   Toric Modeling
========================= */

export type SphereAxisRule = {
  sphereRange: {
    min: number;
    max: number;
  };

  axis: readonly number[];

  /** Optional: override sphere step inside this range */
  sphereStepOverride?: 0.25 | 0.5 | 1;
};

export type ToricGroup =
  | {
      cylinders: number[];
      axis: readonly number[];
      sphereAxisRules?: never;
    }
  | {
      cylinders: number[];
      sphereAxisRules: SphereAxisRule[];
      axis?: never;
    };

export type ToricSpec = {
  groups: ToricGroup[];
};

/* =========================
   Multifocal Modeling
========================= */

export type MultifocalGroup = {
  baseCurve?: number;

  adds: readonly string[];

  sphereRange: {
    min: number;
    max: number;
  };

  sphereStepOverride?: 0.25 | 0.5 | 1;
};

export type MultifocalSpec = {
  groups?: MultifocalGroup[];
  adds: readonly string[];
  xrAdds?: readonly string[];
};

/* =========================
   LensCore
========================= */

export type LensCore = {
  coreId: string;
  displayName: string;
  manufacturer: string;
  replacement: string;

  type: {
    toric: boolean;
    multifocal: boolean;
  };

  parameters: {
    baseCurve?: number[];
    diameter?: number[];

    sphere?: PowerSpec;

    sphereByBaseCurve?: {
      baseCurve: number | number[];
      spec: PowerSpec;
    }[];

    toric?: ToricSpec;

    multifocal?: MultifocalSpec;
  };
};

/* =========================
   Rx Payload
========================= */

export type RxPayload = {
  sphere: number;

  cylinder?: number | null;
  axis?: number | null;
  add?: string | null;

  baseCurve?: number | null;
  diameter?: number | null;
};
