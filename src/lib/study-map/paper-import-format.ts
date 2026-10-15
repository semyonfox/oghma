import { z } from "zod";

export const MAX_EXAM_PDF_BYTES = 32 * 1024 * 1024;
export const MAX_EXAM_IMPORT_BYTES = 46 * 1024 * 1024;

// the transport keeps archive authentication and local filesystem paths out of app data
export const examPaperImportSchema = z
  .object({
    format: z.literal("oghma-exam-paper"),
    version: z.literal(1),
    filename: z
      .string()
      .regex(/^\d{4}_\d{4}_[A-Z][A-Z0-9.]*_[A-Z0-9]+_\d+_\d+\.pdf$/),
    title: z.string().trim().min(1).max(300),
    moduleCode: z.string().regex(/^[A-Z][A-Z0-9.]{1,29}$/),
    academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
    sitting: z.number().int().min(1).max(99),
    period: z.number().int().min(1).max(99),
    archiveId: z
      .string()
      .regex(/^\d{1,30}$/)
      .optional(),
    language: z.literal("ga").optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    pdfBase64: z
      .string()
      .min(8)
      .max(Math.ceil(MAX_EXAM_PDF_BYTES / 3) * 4)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/)
      .refine((value) => value.length % 4 === 0, "Invalid PDF encoding"),
    text: z
      .string()
      .min(1)
      .max(320_000)
      .refine((text) => !text.includes("\0"), "Text contains a null character"),
    warnings: z.array(z.string().max(1_000)).max(100),
  })
  .strict()
  .superRefine((paper, context) => {
    const [from, to, code, , sitting, period] = paper.filename
      .slice(0, -4)
      .split("_");
    if (
      Number(to) !== Number(from) + 1 ||
      `${from}/${to}` !== paper.academicYear ||
      code !== paper.moduleCode ||
      Number(sitting) !== paper.sitting ||
      Number(period) !== paper.period
    ) {
      context.addIssue({
        code: "custom",
        message: "Filename and exam metadata disagree",
      });
    }
  });

export type ExamPaperImport = z.infer<typeof examPaperImportSchema>;
export interface ExamPaperImportResult {
  noteId: string;
  textNoteId: string;
  duplicate: boolean;
  indexing: "queued" | "retry-needed";
}
