import path from "node:path";
import type { ExamPaperMetadata } from "./types.ts";

const EXAM_FILE_PATTERN =
  /^(?<startYear>\d{4})_(?<endYear>\d{4})_(?<moduleCode>[A-Z]{2,}\d+[A-Z0-9.]*)(?:_(?<component>[A-Z0-9]+))?_(?<sitting>\d+)_(?<period>\d+)\.pdf$/i;

export function parseExamFilename(filePath: string): ExamPaperMetadata {
  const basename = path.basename(filePath);
  const match = EXAM_FILE_PATTERN.exec(basename);

  if (!match?.groups) {
    throw new Error(`Unsupported exam-paper filename: ${basename}`);
  }

  const { startYear, endYear, moduleCode, component, sitting, period } =
    match.groups;

  if (!startYear || !endYear || !moduleCode) {
    throw new Error(`Incomplete exam-paper filename metadata: ${basename}`);
  }

  return {
    moduleCode: moduleCode.toUpperCase(),
    academicYear: `${startYear}/${endYear}`,
    ...(component ? { component: component.toUpperCase() } : {}),
    ...(sitting ? { sitting } : {}),
    ...(period ? { period } : {}),
    sourcePath: filePath,
  };
}

export function mergeMetadata(
  inferred: ExamPaperMetadata,
  overrides: Partial<ExamPaperMetadata> = {},
): ExamPaperMetadata {
  return {
    ...inferred,
    ...overrides,
    moduleCode: overrides.moduleCode?.toUpperCase() ?? inferred.moduleCode,
  };
}
