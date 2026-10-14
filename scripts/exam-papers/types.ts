export interface ExamPaperMetadata {
  moduleCode: string;
  academicYear: string;
  sitting?: string;
  period?: string;
  component?: string;
  sourcePath?: string;
}

export interface ParsedQuestion {
  number: string;
  text: string;
  marks?: number;
  topics: string[];
}

export interface ParsedExamPaper {
  metadata: ExamPaperMetadata;
  questions: ParsedQuestion[];
  rawText: string;
}

export interface ParseExamPaperOptions {
  metadata?: Partial<ExamPaperMetadata>;
  sourcePath?: string;
}
