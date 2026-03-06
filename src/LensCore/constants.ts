export const AXIS_PRESETS = {
  /* 10° increments from 10–180 */
  full10: Array.from({ length: 18 }, (_, i) => (i + 1) * 10),

  /* 5° increments from 5–180 */
  full5: Array.from({ length: 36 }, (_, i) => (i + 1) * 5),

  /* [70,80,90,100,110,160,170,180,10,20] */
  reduced10: [70, 80, 90, 100, 110, 160, 170, 180, 10, 20],

  /* TOTAL30 / some high-cyl torics */
  reduced10Plus: [10, 20, 30, 70, 80, 90, 100, 110, 150, 160, 170, 180],

claritiHighMinus: [10, 20, 60, 70, 80, 90, 100, 110, 120,160, 170, 180],} as const;

export type AxisPresetKey = keyof typeof AXIS_PRESETS;