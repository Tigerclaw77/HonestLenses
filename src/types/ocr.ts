export type OcrExtract = {
  patientName?: string;
  doctorName?: string;
  doctorPhone?: string;
  issuedDate?: string;
  expires?: string;
  rawText?: string;
  proposedLensId?: string | null;
  proposalConfidence?: "high" | "medium" | "low" | null;
};