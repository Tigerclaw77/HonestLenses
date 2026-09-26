import OpenAI from "openai";

export async function resolveBrandAI(
  rawString: string,
  candidates: { coreId: string; label: string }[]
): Promise<string | null> {
  if (!candidates.length) return null;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI product resolver is not configured");
  const openai = new OpenAI({ apiKey });

  const prompt = `
OCR Text:
"${rawString}"

Candidates:
${candidates.map((c) => `${c.coreId}: ${c.label}`).join("\n")}

Choose a candidate only when the OCR text identifies that catalog product.
Do not infer or invent any prescription parameter or missing product identity.
If none is supported by the text, return "none".
`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini-2025-04-14",
    store: false,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "catalog_product_resolution",
        strict: true,
        schema: {
          type: "object",
          properties: {
            coreId: {
              type: "string",
              enum: [...candidates.map((candidate) => candidate.coreId), "none"],
            },
          },
          required: ["coreId"],
          additionalProperties: false,
        },
      },
    },
  });

  const output = response.output_text?.trim();
  if (!output) return null;
  const parsed = JSON.parse(output) as { coreId?: unknown };
  if (parsed.coreId === "none") return null;
  const match = candidates.find((candidate) => candidate.coreId === parsed.coreId);

  return match ? match.coreId : null;
}
