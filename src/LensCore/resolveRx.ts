import type { LensCore, RxPayload } from "./types";
import { resolveAddOptions } from "./helpers/resolveAddOptions";
import { resolveAxisOptions } from "./helpers/resolveAxisOptions";
import { resolveCylinderOptions } from "./helpers/resolveCylinderOptions";
import { resolveParameterOption } from "./helpers/resolveParameterOption";
import { resolveSphereOptions } from "./helpers/resolveSphereOptions";
import type { ParameterResolution } from "./helpers/resolveParameterOption";

export type ResolvedRxState = {
  sphere: number | null;
  sphereOptions: readonly number[];
  baseCurve: ParameterResolution<number>;
  diameter: ParameterResolution<number>;
  cylinder: ParameterResolution<number>;
  axis: ParameterResolution<number>;
  add: ParameterResolution<string>;
};

export function normalizeRxNumber(
  value: number | null | undefined,
  decimals: number,
): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Number(Number(value).toFixed(decimals));
}

export function resolveLensRxState(
  lens: LensCore,
  rx: RxPayload,
): ResolvedRxState {
  const sphere = normalizeRxNumber(rx.sphere, 2);
  const rawCylinder = normalizeRxNumber(rx.cylinder, 2);
  const rawAxis = normalizeRxNumber(rx.axis, 0);
  const rawBaseCurve = normalizeRxNumber(rx.baseCurve, 1);
  const rawDiameter = normalizeRxNumber(rx.diameter, 1);

  const baseCurve = resolveParameterOption(
    rawBaseCurve,
    lens.parameters.baseCurve,
  );
  const diameter = resolveParameterOption(
    rawDiameter,
    lens.parameters.diameter,
  );

  const preliminaryCylinderOptions = lens.type.toric
    ? resolveCylinderOptions(lens, rawAxis, sphere)
    : [];
  const preliminaryCylinder = resolveParameterOption(
    rawCylinder,
    preliminaryCylinderOptions,
  );

  const axisOptions = lens.type.toric
    ? resolveAxisOptions(lens, preliminaryCylinder.value, sphere)
    : [];
  const axis = resolveParameterOption(rawAxis, axisOptions);

  const cylinderOptions = lens.type.toric
    ? resolveCylinderOptions(lens, axis.value, sphere)
    : [];
  const cylinder = resolveParameterOption(rawCylinder, cylinderOptions);

  const addOptions = lens.type.multifocal
    ? resolveAddOptions(lens, baseCurve.value, sphere)
    : [];
  const add = resolveParameterOption(rx.add ?? null, addOptions);

  const sphereOptions = resolveSphereOptions(
    lens,
    baseCurve.value,
    cylinder.value,
    axis.value,
    add.value,
  );

  return {
    sphere,
    sphereOptions,
    baseCurve,
    diameter,
    cylinder,
    axis,
    add,
  };
}
