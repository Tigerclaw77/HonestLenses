const REPLACEMENT_DAYS: Readonly<Record<string, number>> = {
  DD: 1,
  "1W": 7,
  "2W": 14,
  "1M": 30,
};

export function getReplacementDays(replacement: string): number | null {
  return REPLACEMENT_DAYS[replacement] ?? null;
}

export function getPricePerLensCents(
  pricePerBoxCents: number,
  boxSize: number,
): number {
  return pricePerBoxCents / boxSize;
}

export function getPricePerWearingDayCents({
  pricePerBoxCents,
  boxSize,
  replacement,
}: {
  pricePerBoxCents: number;
  boxSize: number;
  replacement: string;
}): number | null {
  const replacementDays = getReplacementDays(replacement);
  if (!replacementDays) return null;
  return getPricePerLensCents(pricePerBoxCents, boxSize) / replacementDays;
}

export function getAnnualSupplyEstimate({
  monthsPerBox,
  pricePerBoxCents,
  eyeCount,
}: {
  monthsPerBox: number;
  pricePerBoxCents: number;
  eyeCount: 1 | 2;
}) {
  const boxesPerEye = Math.ceil(12 / monthsPerBox);
  const totalBoxes = boxesPerEye * eyeCount;

  return {
    boxesPerEye,
    totalBoxes,
    totalPriceCents: totalBoxes * pricePerBoxCents,
  };
}
