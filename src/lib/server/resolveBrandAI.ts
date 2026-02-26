import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function resolveBrandAI(
  rawString: string,
  candidates: { lens_id: string; label: string }[]
): Promise<string | null> {
  if (!candidates.length) return null;

  const prompt = `
OCR Text:
"${rawString}"

Candidates:
${candidates.map((c, i) => `${i + 1}. ${c.label}`).join("\n")}

Select the exact matching candidate label.
If none match, return "none".
Return only the label.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  const output = response.choices[0].message.content?.trim();

  if (!output || output.toLowerCase() === "none") return null;

  const match = candidates.find(
    (c) => c.label.toLowerCase() === output.toLowerCase()
  );

  return match ? match.lens_id : null;
}