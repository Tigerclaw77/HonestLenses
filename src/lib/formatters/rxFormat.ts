export function formatSphere(value: number) {
  return value.toFixed(2);
}

export function formatCylinder(value: number) {
  return value.toFixed(2);
}

export function formatDiameter(value: number) {
  return value.toFixed(1);
}

export function formatBaseCurve(value: number) {
  return value.toFixed(1);
}

export function formatAxis(value: number) {
  return value.toString().padStart(3, "0");
}