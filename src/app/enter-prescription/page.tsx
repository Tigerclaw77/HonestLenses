import Header from "../../components/Header";
import RxForm, { type RxDraft } from "../../components/RxForm";
import { lenses } from "@/LensCore";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{
    right?: string | string[];
    left?: string | string[];
  }>;
};

const KNOWN_LENS_IDS = new Set(lenses.map((lens) => lens.coreId));

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function normalizeLensParam(value: string | string[] | undefined): string {
  const normalized = firstParam(value).trim();
  return normalized && KNOWN_LENS_IDS.has(normalized) ? normalized : "";
}

function emptyEye(): RxDraft["left"] {
  return {
    coreId: "",
    sph: "",
    cyl: "",
    axis: "",
    add: "",
    bc: "",
    color: "",
  };
}

export default async function EnterPrescriptionPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const hasLensParams = "right" in params || "left" in params;
  const rawRightLens = firstParam(params.right).trim();
  const rawLeftLens = firstParam(params.left).trim();

  if (hasLensParams && !rawRightLens && !rawLeftLens) {
    redirect("/upload-prescription");
  }

  const rightLens = normalizeLensParam(params.right);
  const leftLens = normalizeLensParam(params.left);
  const hasPrefill = Boolean(rightLens || leftLens);

  if (hasLensParams && (rawRightLens || rawLeftLens) && !hasPrefill) {
    redirect("/upload-prescription");
  }

  const initialDraft: RxDraft | undefined = hasPrefill
    ? {
        right: {
          ...emptyEye(),
          coreId: rightLens,
        },
        left: {
          ...emptyEye(),
          coreId: leftLens,
        },
        expires: "",
      }
    : undefined;

  return (
    <>
      <Header variant="shop" />
      <RxForm initialDraft={initialDraft} />
    </>
  );
}
