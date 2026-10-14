import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  examPaperImportSchema,
  type ExamPaperImport,
} from "../../src/lib/study-map/paper-import-format.ts";
import { extractPaper, type ExtractedPaper } from "./pdf.ts";
import { safePath, verifyLocal, type Paper } from "./library.ts";

export function importText(paper: Paper, extracted: ExtractedPaper): string {
  return [
    `# ${paper.moduleCode} ${paper.academicYear} past paper`,
    `Module: ${paper.moduleCode}\nAcademic year: ${paper.academicYear}\nSitting: ${paper.sitting}\nAssessment period: ${paper.period}`,
    ...extracted.pages.map((page) => `[Page ${page.number}]\n${page.text}`),
    ...(extracted.warnings.length
      ? [
          "## Extraction notes\n" +
            extracted.warnings.map((warning) => `- ${warning}`).join("\n"),
        ]
      : []),
  ].join("\n\n");
}

export async function exportForOghma(
  root: string,
  papers: Paper[],
  output: string,
): Promise<{ exported: string[]; skipped: string[] }> {
  await mkdir(output, { recursive: true });
  const exported: string[] = [],
    skipped: string[] = [];
  for (const paper of papers) {
    if (
      !paper.localPath ||
      !paper.sha256 ||
      !(await verifyLocal(root, paper))
    ) {
      throw new Error(
        `No verified PDF for ${paper.filename}; download or import it first`,
      );
    }
    const file = safePath(root, paper.localPath);
    const extracted = await extractPaper(file);
    if (!extracted.pages.some((page) => page.text.trim().length >= 100)) {
      skipped.push(
        `${paper.filename}: no usable text; OCR is needed before importing into a study map`,
      );
      continue;
    }
    const value: ExamPaperImport = examPaperImportSchema.parse({
      format: "oghma-exam-paper",
      version: 1,
      filename: paper.filename,
      title: paper.title,
      moduleCode: paper.moduleCode,
      academicYear: paper.academicYear,
      sitting: Number(paper.sitting),
      period: Number(paper.period),
      sha256: paper.sha256,
      ...(paper.archiveId ? { archiveId: paper.archiveId } : {}),
      ...(paper.language ? { language: paper.language } : {}),
      pdfBase64: (await readFile(file)).toString("base64"),
      text: importText(paper, extracted),
      warnings: extracted.warnings,
    });
    const name = `${paper.filename.slice(0, -4)}${paper.archiveId ? `_${paper.archiveId}` : ""}${paper.language ? "_ga" : ""}.oghma-exam.json`;
    const destination = path.join(output, name);
    const bytes = JSON.stringify(value);
    try {
      await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ))
        throw error;
      if ((await readFile(destination, "utf8")) !== bytes)
        throw new Error(
          `Existing export differs: ${destination}. Choose a new --output directory.`,
        );
    }
    exported.push(destination);
  }
  return { exported, skipped };
}
