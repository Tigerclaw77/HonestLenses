export type ResolveCartEyeBoxCountsInput = {
  hasRightEye: boolean;
  hasLeftEye: boolean;
  defaultPerEye: number;
  requestedRightBoxCount?: number | null;
  requestedLeftBoxCount?: number | null;
  hasRequestedRightBoxCount?: boolean;
  hasRequestedLeftBoxCount?: boolean;
  storedRightBoxCount?: number | null;
  storedLeftBoxCount?: number | null;
};

export type ResolvedCartEyeBoxCounts = {
  right: number | null;
  left: number | null;
  totalBoxes: number;
};

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function resolveEyeBoxCount({
  hasEye,
  hasRequestedCount,
  requestedCount,
  storedCount,
  defaultPerEye,
}: {
  hasEye: boolean;
  hasRequestedCount: boolean;
  requestedCount?: number | null;
  storedCount?: number | null;
  defaultPerEye: number;
}): number | null {
  if (!hasEye) return null;

  if (hasRequestedCount && isNonNegativeInteger(requestedCount)) {
    return requestedCount;
  }

  if (isNonNegativeInteger(storedCount)) {
    return storedCount;
  }

  return defaultPerEye;
}

export function resolveCartEyeBoxCounts({
  hasRightEye,
  hasLeftEye,
  defaultPerEye,
  requestedRightBoxCount,
  requestedLeftBoxCount,
  hasRequestedRightBoxCount = false,
  hasRequestedLeftBoxCount = false,
  storedRightBoxCount,
  storedLeftBoxCount,
}: ResolveCartEyeBoxCountsInput): ResolvedCartEyeBoxCounts {
  const right = resolveEyeBoxCount({
    hasEye: hasRightEye,
    hasRequestedCount: hasRequestedRightBoxCount,
    requestedCount: requestedRightBoxCount,
    storedCount: storedRightBoxCount,
    defaultPerEye,
  });

  const left = resolveEyeBoxCount({
    hasEye: hasLeftEye,
    hasRequestedCount: hasRequestedLeftBoxCount,
    requestedCount: requestedLeftBoxCount,
    storedCount: storedLeftBoxCount,
    defaultPerEye,
  });

  return {
    right,
    left,
    totalBoxes: (right ?? 0) + (left ?? 0),
  };
}
