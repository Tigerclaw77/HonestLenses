import { validate } from "../index";

type InvariantCase = {
  name: string;
  expectedValid: boolean;
  lensId: string;
  rx: Parameters<typeof validate>[1];
  expectedError?: string;
};

const cases: InvariantCase[] = [
  {
    name: "single-option base curve may auto-resolve",
    expectedValid: true,
    lensId: "BIOTRUE_1D",
    rx: {
      sphere: -1,
    },
  },
  {
    name: "multi-option base curve requires explicit selection",
    expectedValid: false,
    lensId: "OASYS_1D",
    rx: {
      sphere: -1,
    },
    expectedError: "Base curve is required for this lens.",
  },
  {
    name: "multi-option base curve accepts a manufactured selection",
    expectedValid: true,
    lensId: "OASYS_1D",
    rx: {
      sphere: -1,
      baseCurve: 8.5,
    },
  },
  {
    name: "stale invalid base curve is rejected",
    expectedValid: false,
    lensId: "OASYS_1D",
    rx: {
      sphere: -1,
      baseCurve: 8.4,
    },
    expectedError: "Invalid base curve for this lens.",
  },
  {
    name: "toric lens requires cylinder and axis",
    expectedValid: false,
    lensId: "OASYS_1D_AST",
    rx: {
      sphere: -1,
      baseCurve: 8.5,
    },
    expectedError: "Cylinder is required for this lens.",
  },
  {
    name: "toric lens accepts complete manufactured parameters",
    expectedValid: true,
    lensId: "OASYS_1D_AST",
    rx: {
      sphere: -1,
      cylinder: -0.75,
      axis: 10,
      baseCurve: 8.5,
    },
  },
  {
    name: "multifocal lens requires ADD",
    expectedValid: false,
    lensId: "OASYS_MAX_1D_MF",
    rx: {
      sphere: -1,
      baseCurve: 8.4,
    },
    expectedError: "ADD is required for this lens.",
  },
  {
    name: "multifocal lens accepts complete manufactured parameters",
    expectedValid: true,
    lensId: "OASYS_MAX_1D_MF",
    rx: {
      sphere: -1,
      add: "LOW",
      baseCurve: 8.4,
    },
  },
];

const failures = cases.flatMap((testCase) => {
  const result = validate(testCase.lensId, testCase.rx);
  const errors: string[] = [];

  if (result.valid !== testCase.expectedValid) {
    errors.push(
      `${testCase.name}: expected valid=${testCase.expectedValid}, got valid=${result.valid}. Errors: ${result.errors.join("; ")}`,
    );
  }

  if (
    testCase.expectedError &&
    !result.errors.includes(testCase.expectedError)
  ) {
    errors.push(
      `${testCase.name}: expected error "${testCase.expectedError}", got: ${result.errors.join("; ")}`,
    );
  }

  return errors;
});

if (failures.length > 0) {
  console.error("Lens validation invariant check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Lens validation invariant check passed (${cases.length} cases).`);
