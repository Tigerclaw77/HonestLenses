import {
  getLensById,
  resolveLensRxState,
  resolveParameterOption,
  validate,
} from "../index";
import { getColorOptions } from "../../data/lensColors";

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
    name: "single-option toric base curve may auto-resolve",
    expectedValid: true,
    lensId: "MOIST_AST",
    rx: {
      sphere: -1,
      cylinder: -0.75,
      axis: 10,
    },
  },
  {
    name: "single-option toric rejects stale invalid base curve",
    expectedValid: false,
    lensId: "MOIST_AST",
    rx: {
      sphere: -1,
      cylinder: -0.75,
      axis: 10,
      baseCurve: 8.4,
    },
    expectedError: "Invalid base curve for this lens.",
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
    name: "multi-option toric base curve requires explicit selection",
    expectedValid: false,
    lensId: "PROCLEAR_AST",
    rx: {
      sphere: -1,
      cylinder: -0.75,
      axis: 10,
    },
    expectedError: "Base curve is required for this lens.",
  },
  {
    name: "multi-option toric base curve accepts a manufactured selection",
    expectedValid: true,
    lensId: "PROCLEAR_AST",
    rx: {
      sphere: -1,
      cylinder: -0.75,
      axis: 10,
      baseCurve: 8.8,
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

function assertInvariant(condition: boolean, message: string): string[] {
  return condition ? [] : [message];
}

const moistAst = getLensById("MOIST_AST");
if (!moistAst) {
  failures.push("MOIST_AST invariant fixture is missing.");
} else {
  const resolved = resolveLensRxState(moistAst, {
    sphere: -1,
    cylinder: -0.75,
    axis: 10,
  });

  failures.push(
    ...assertInvariant(
      resolved.baseCurve.source === "single-option" &&
        resolved.baseCurve.value === 8.5,
      "MOIST_AST should resolve its single base curve to 8.5.",
    ),
  );
}

const oasys1d = getLensById("OASYS_1D");
if (!oasys1d) {
  failures.push("OASYS_1D invariant fixture is missing.");
} else {
  const resolved = resolveLensRxState(oasys1d, { sphere: -1 });

  failures.push(
    ...assertInvariant(
      resolved.baseCurve.required,
      "OASYS_1D should keep multi-option base curve ambiguous until selected.",
    ),
  );
}

const defineColorOptions = getColorOptions("Define");
const requiredColor = resolveParameterOption(null, defineColorOptions);
const validColor = resolveParameterOption("Natural Shine", defineColorOptions);
const invalidColor = resolveParameterOption("Not A Color", defineColorOptions);
const singleColor = resolveParameterOption(null, ["Only Color"]);

failures.push(
  ...assertInvariant(
    requiredColor.required,
    "Multi-option color should require explicit selection.",
  ),
  ...assertInvariant(
    validColor.value === "Natural Shine" && !validColor.invalid,
    "Known color should validate as selected.",
  ),
  ...assertInvariant(
    invalidColor.invalid,
    "Stale invalid color should be rejected.",
  ),
  ...assertInvariant(
    singleColor.source === "single-option" && singleColor.value === "Only Color",
    "Single-option color should auto-resolve.",
  ),
);

if (failures.length > 0) {
  console.error("Lens validation invariant check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Lens validation invariant check passed (${cases.length} cases plus ambiguity assertions).`,
);
