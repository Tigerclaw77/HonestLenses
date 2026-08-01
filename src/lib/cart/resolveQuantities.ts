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
  hasStoredRightBoxCount?: boolean;
  hasStoredLeftBoxCount?: boolean;
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
  hasStoredCount,
  defaultPerEye,
}: {
  hasEye: boolean;
  hasRequestedCount: boolean;
  requestedCount?: number | null;
  storedCount?: number | null;
  hasStoredCount: boolean;
  defaultPerEye: number;
}): number | null {
  if (!hasEye) return null;

  if (hasRequestedCount && isNonNegativeInteger(requestedCount)) {
    return requestedCount;
  }

  if (hasStoredCount && isNonNegativeInteger(storedCount)) {
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
  hasStoredRightBoxCount,
  hasStoredLeftBoxCount,
}: ResolveCartEyeBoxCountsInput): ResolvedCartEyeBoxCounts {
  const hasStoredQuantity =
    (isNonNegativeInteger(storedRightBoxCount) ? storedRightBoxCount : 0) +
      (isNonNegativeInteger(storedLeftBoxCount) ? storedLeftBoxCount : 0) >
    0;

  const right = resolveEyeBoxCount({
    hasEye: hasRightEye,
    hasRequestedCount: hasRequestedRightBoxCount,
    requestedCount: requestedRightBoxCount,
    storedCount: storedRightBoxCount,
    hasStoredCount:
      hasStoredQuantity &&
      (hasStoredRightBoxCount ??
        (storedRightBoxCount !== null && storedRightBoxCount !== undefined)),
    defaultPerEye,
  });

  const left = resolveEyeBoxCount({
    hasEye: hasLeftEye,
    hasRequestedCount: hasRequestedLeftBoxCount,
    requestedCount: requestedLeftBoxCount,
    storedCount: storedLeftBoxCount,
    hasStoredCount:
      hasStoredQuantity &&
      (hasStoredLeftBoxCount ??
        (storedLeftBoxCount !== null && storedLeftBoxCount !== undefined)),
    defaultPerEye,
  });

  return {
    right,
    left,
    totalBoxes: (right ?? 0) + (left ?? 0),
  };
}

export function hasResolvedCartQuantity(
  counts: ResolvedCartEyeBoxCounts,
): boolean {
  return counts.totalBoxes > 0;
}
