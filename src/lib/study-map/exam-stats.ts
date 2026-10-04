import type { ExamQuestion, ExamStructure, StudyPaper, StudyTopic } from "./types";

export interface ExamTopicMarks {
  topicId: string;
  exclusiveMarks: number;
  sharedMarks: number;
  questionCount: number;
  minAnswerableMarks: number | null;
  maxAnswerableMarks: number | null;
}

export interface ExamStructureAnalysis {
  printedMarks: number | null;
  answerableMarks: { min: number; max: number } | null;
  issues: string[];
  leafQuestions: ExamQuestion[];
  topicMarks: ExamTopicMarks[];
}

export interface ExamPaperMetrics extends ExamStructureAnalysis {
  noteId: string;
  title: string;
  year: number;
  sitting: string;
  syllabusVersion: string;
  status: "eligible" | "unreviewed" | "unresolved" | "duplicate";
  duplicateOf: string | null;
}

export interface ExamCorpusTopic extends ExamTopicMarks {
  name: string;
  paperCount: number;
  paperFrequencyPercent: number | null;
}

export interface ExamCorpusSummary {
  paperCount: number;
  reviewedCount: number;
  eligibleCount: number;
  unreviewedCount: number;
  unresolvedCount: number;
  duplicateCount: number;
  taxonomyVersion: number;
  syllabusVersion: string | null;
  papers: ExamPaperMetrics[];
  topics: ExamCorpusTopic[];
  issues: string[];
}

interface MarkedQuestion {
  question: ExamQuestion;
  rootId: string;
  marks: number;
  topicIds: string[];
}

const total = (values: number[]): number => values.reduce((sum, value) => sum + value, 0);
const validMarks = (marks: number | null): marks is number => marks !== null && Number.isFinite(marks) && marks >= 0;
const sameMarks = (left: number, right: number): boolean => Math.abs(left - right) <= 1e-8;

function answerCommands(text: string): string[] {
  return [...text.matchAll(/(?:^|[\n.!?:])\s*(?:[-*]\s+)?(?:(?:you\s+)?(?:must|should)\s+|you\s+are\s+required\s+to\s+)?(?:answer|attempt|choose|complete)\s+([^\n.!?]+)/gi)].map((match) => match[1].trim());
}

// choices select whole root questions; nested rules leave answerable totals unknown
function hasInternalChoice(text: string): boolean {
  return answerCommands(text).some((command) => {
    if (/^(?:any\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:of\b|from\b|(?:the\s+)?following\b|parts?\b|subparts?\b|subquestions?\b|questions?\b|options?\b|alternatives?\b)/i.test(command)) return true;
    const refersToParts = /\([a-z0-9ivx]+\)|\b(?:parts?|subparts?|subquestions?|questions?|options?|alternatives?)\b/i.test(command);
    return refersToParts && /\b(?:either|or|only|optional)\b/i.test(command);
  });
}

function hasCompoundSectionChoice(instructions: string): boolean {
  const rule = instructions.trim();
  if (!rule || /^(?:Answer\s+all\s+questions|All\s+questions\s+are\s+compulsory)[.!]?$/i.test(rule)) return false;
  if (/\b(?:questions?|parts?)\b[^.\n]*\b(?:mandatory|compulsory|required|must|optional)\b|\b(?:mandatory|compulsory|required|optional)\s+(?:questions?|parts?)\b/i.test(rule)) return true;
  if (/(?:^|[\n.!?])\s*Either\s+(?:Questions?\b|\(?\d+\)?\b)/i.test(rule)) return true;
  const commands = answerCommands(rule);
  if (commands.length > 1) return true;
  if (!commands.length) return false;
  return !/^(?:all\s+questions|(?:any\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:of\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?questions(?:\s+(?:from|in)\s+this\s+section)?)$/i.test(commands[0]);
}

function explicitSectionCount(instructions: string, rootCount: number): { answerCount: number; offeredCount: number | null } | null {
  const rule = instructions.trim();
  if (/^(?:Answer\s+all\s+questions|All\s+questions\s+are\s+compulsory)[.!]?$/i.test(rule)) return { answerCount: rootCount, offeredCount: null };
  const commands = answerCommands(rule);
  if (commands.length !== 1) return null;
  if (/^all\s+questions$/i.test(commands[0])) return { answerCount: rootCount, offeredCount: null };
  const match = /^(?:any\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:of\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?questions(?:\s+(?:from|in)\s+this\s+section)?$/i.exec(commands[0]);
  if (!match) return null;
  const numbers = new Map(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].map((word, index) => [word, index + 1]));
  const readNumber = (value: string): number => numbers.get(value.toLocaleLowerCase("en")) ?? Number(value);
  return { answerCount: readNumber(match[1]), offeredCount: match[2] === undefined ? null : readNumber(match[2]) };
}

function selectionBounds(values: number[], answerCount: number): { min: number; max: number } {
  const sorted = [...values].sort((left, right) => left - right);
  return { min: total(sorted.slice(0, answerCount)), max: total(sorted.slice(sorted.length - answerCount)) };
}

function inspectStructure(structure: ExamStructure): { analysis: ExamStructureAnalysis; valid: boolean } {
  const issues: string[] = [];
  const report = (issue: string): void => { if (!issues.includes(issue)) issues.push(issue); };
  const questions = new Map<string, ExamQuestion>();
  let treeValid = true;
  let internalChoices = false;
  for (const question of structure.questions) {
    if (questions.has(question.id)) {
      report(`Question ID "${question.id}" is repeated.`);
      treeValid = false;
    } else {
      questions.set(question.id, question);
    }
    if (question.marks !== null && !validMarks(question.marks)) {
      report(`Question "${question.label}" has invalid marks.`);
      treeValid = false;
    }
    if (new Set(question.topicIds).size !== question.topicIds.length) {
      report(`Question "${question.label}" repeats a topic ID.`);
    }
    if (hasInternalChoice(question.text)) {
      report(`Question "${question.label}" contains an unsupported internal choice. The exam model supports choices between whole root questions in sections; nested or mixed part choices need manual review.`);
      internalChoices = true;
    }
  }
  if (questions.size === 0) {
    report("No questions have been recorded.");
    treeValid = false;
  }

  const children = new Map<string, ExamQuestion[]>();
  for (const question of questions.values()) {
    if (question.parentId === null) continue;
    if (!questions.has(question.parentId)) {
      report(`Question "${question.label}" references a missing parent.`);
      treeValid = false;
      continue;
    }
    const siblings = children.get(question.parentId) ?? [];
    siblings.push(question);
    children.set(question.parentId, siblings);
  }

  const rootIds = new Map<string, string>();
  const inheritedTopics = new Map<string, string[]>();
  for (const question of questions.values()) {
    const path = new Set<string>();
    let current: ExamQuestion | undefined = question;
    let topicIds: string[] | undefined;
    while (current) {
      if (path.has(current.id)) {
        report(`Question "${question.label}" belongs to a parent cycle.`);
        treeValid = false;
        break;
      }
      path.add(current.id);
      if (topicIds === undefined && current.topicIds.length > 0) topicIds = [...new Set(current.topicIds)];
      if (current.parentId === null) {
        rootIds.set(question.id, current.id);
        break;
      }
      current = questions.get(current.parentId);
    }
    inheritedTopics.set(question.id, topicIds ?? []);
  }

  const leafQuestions = [...questions.values()].filter((question) => !children.has(question.id));
  const marked: MarkedQuestion[] = [];
  for (const question of leafQuestions) {
    const rootId = rootIds.get(question.id);
    if (!validMarks(question.marks)) {
      report(`Question "${question.label}" has unknown marks. Parent totals cannot allocate missing subquestion marks.`);
    } else if (rootId !== undefined) {
      marked.push({ question, rootId, marks: question.marks, topicIds: inheritedTopics.get(question.id) ?? [] });
    }
  }

  const subtreeTotals = new Map<string, number | null>();
  function subtreeTotal(question: ExamQuestion): number | null {
    if (subtreeTotals.has(question.id)) return subtreeTotals.get(question.id) ?? null;
    const subquestions = children.get(question.id);
    if (!subquestions) return validMarks(question.marks) ? question.marks : null;
    const childTotals = subquestions.map(subtreeTotal);
    if (childTotals.some((marks) => marks === null)) {
      subtreeTotals.set(question.id, null);
      return null;
    }
    const sum = total(childTotals.filter((marks): marks is number => marks !== null));
    if (validMarks(question.marks) && !sameMarks(question.marks, sum)) {
      report(`Question "${question.label}" totals ${question.marks} marks, but its subquestions total ${sum}.`);
      subtreeTotals.set(question.id, null);
      return null;
    }
    subtreeTotals.set(question.id, sum);
    return sum;
  }

  const roots = [...questions.values()].filter((question) => question.parentId === null);
  const rootTotals = new Map<string, number>();
  if (treeValid) {
    for (const root of roots) {
      const marks = subtreeTotal(root);
      if (marks !== null) rootTotals.set(root.id, marks);
    }
  }
  const printedMarks = treeValid && rootTotals.size === roots.length ? total([...rootTotals.values()]) : null;

  const sectionIds = new Set<string>();
  const memberships = new Map<string, number>();
  let choicesValid = treeValid && !internalChoices;
  if (structure.sections.length === 0) {
    report("No exam sections have been recorded.");
    choicesValid = false;
  }
  for (const section of structure.sections) {
    if (sectionIds.has(section.id)) {
      report(`Section ID "${section.id}" is repeated.`);
      choicesValid = false;
    }
    sectionIds.add(section.id);
    if (hasCompoundSectionChoice(section.instructions)) {
      report(`Section "${section.name}" contains unsupported compound or mandatory choice instructions. A single answer count cannot represent this rule; review the source manually.`);
      choicesValid = false;
    }
    const references = new Set<string>();
    for (const id of section.questionIds) {
      if (references.has(id)) {
        report(`Section "${section.name}" repeats question "${id}".`);
        choicesValid = false;
      }
      references.add(id);
      const question = questions.get(id);
      if (!question) {
        report(`Section "${section.name}" references missing question "${id}".`);
        choicesValid = false;
      } else if (question.parentId !== null) {
        report(`Section "${section.name}" references a subquestion. Nested choices are unavailable; sections must select whole root questions.`);
        choicesValid = false;
      } else {
        memberships.set(id, (memberships.get(id) ?? 0) + 1);
      }
    }
    const explicitCount = explicitSectionCount(section.instructions, references.size);
    if (explicitCount && explicitCount.answerCount !== section.answerCount) {
      report(`Section "${section.name}" records ${section.answerCount ?? "unknown"} answers, but its quoted instructions require ${explicitCount.answerCount}. Review the source and answer count.`);
      choicesValid = false;
    }
    if (explicitCount && explicitCount.offeredCount !== null && explicitCount.offeredCount !== references.size) {
      report(`Section "${section.name}" contains ${references.size} root questions, but its quoted instructions offer ${explicitCount.offeredCount}. Review the source and question structure.`);
      choicesValid = false;
    }
    if (section.questionIds.length === 0 || section.answerCount === null || !Number.isInteger(section.answerCount)
      || section.answerCount < 1 || section.answerCount > references.size) {
      report(`Section "${section.name}" needs a valid answer count between 1 and its number of questions.`);
      choicesValid = false;
    }
  }
  for (const root of roots) {
    if (memberships.get(root.id) !== 1) {
      report(`Root question "${root.label}" must belong to exactly one section.`);
      choicesValid = false;
    }
  }

  let answerableMarks: ExamStructureAnalysis["answerableMarks"] = null;
  if (choicesValid && printedMarks !== null) {
    const bounds = structure.sections.map((section) => selectionBounds(
      section.questionIds.map((id) => rootTotals.get(id) ?? 0),
      section.answerCount ?? 0,
    ));
    answerableMarks = { min: total(bounds.map((value) => value.min)), max: total(bounds.map((value) => value.max)) };
    if (structure.statedTotalMarks !== null && (!validMarks(structure.statedTotalMarks)
      || structure.statedTotalMarks < answerableMarks.min - 1e-8 || structure.statedTotalMarks > answerableMarks.max + 1e-8)) {
      report(`Stated total marks ${structure.statedTotalMarks} conflict with the answerable range ${answerableMarks.min}–${answerableMarks.max}.`);
    }
  }

  const topicMarks = new Map<string, ExamTopicMarks>();
  const rootTopicMarks = new Map<string, Map<string, number>>();
  // empty leaf assignments inherit the nearest assigned parent; shared marks count once per listed topic
  for (const unit of marked) {
    for (const topicId of unit.topicIds) {
      const row = topicMarks.get(topicId) ?? { topicId, exclusiveMarks: 0, sharedMarks: 0, questionCount: 0, minAnswerableMarks: null, maxAnswerableMarks: null };
      if (unit.topicIds.length === 1) row.exclusiveMarks += unit.marks;
      else row.sharedMarks += unit.marks;
      row.questionCount += 1;
      topicMarks.set(topicId, row);
      const rootTopics = rootTopicMarks.get(unit.rootId) ?? new Map<string, number>();
      rootTopics.set(topicId, (rootTopics.get(topicId) ?? 0) + unit.marks);
      rootTopicMarks.set(unit.rootId, rootTopics);
    }
  }
  if (answerableMarks !== null) {
    for (const row of topicMarks.values()) {
      const bounds = structure.sections.map((section) => selectionBounds(
        section.questionIds.map((id) => rootTopicMarks.get(id)?.get(row.topicId) ?? 0),
        section.answerCount ?? 0,
      ));
      row.minAnswerableMarks = total(bounds.map((value) => value.min));
      row.maxAnswerableMarks = total(bounds.map((value) => value.max));
    }
  }

  const valid = issues.length === 0 && printedMarks !== null && answerableMarks !== null;
  return { valid, analysis: { printedMarks, answerableMarks, issues: [...issues, ...structure.warnings], leafQuestions, topicMarks: [...topicMarks.values()] } };
}

// printed topic marks are known leaf subtotals; any missing marks make the paper ineligible for corpus totals
export function analyseExamStructure(structure: ExamStructure): ExamStructureAnalysis {
  return inspectStructure(structure).analysis;
}

export function summariseExamCorpus(
  papers: StudyPaper[],
  topics: StudyTopic[],
  taxonomyVersion: number,
  syllabusVersion?: string,
): ExamCorpusSummary {
  const topicIds = new Set(topics.map((topic) => topic.id));
  const metrics: ExamPaperMetrics[] = papers.map((paper) => {
    const { analysis, valid } = inspectStructure(paper.structure);
    const issues = [...analysis.issues];
    if (!paper.sourceHash || paper.sourceHash !== paper.currentHash) issues.push("Source content has changed since this paper was reviewed.");
    if (paper.taxonomyVersion !== taxonomyVersion) issues.push("Paper topic assignments use an earlier taxonomy version.");
    if (syllabusVersion !== undefined && paper.structure.syllabusVersion !== syllabusVersion) issues.push("Paper belongs to a different syllabus version.");
    const unknownTopicIds = [...new Set(paper.structure.questions.flatMap((question) => question.topicIds))].filter((id) => !topicIds.has(id));
    if (unknownTopicIds.length > 0) issues.push(`Paper references missing topics: ${unknownTopicIds.join(", ")}.`);
    const current = Boolean(paper.sourceHash) && paper.sourceHash === paper.currentHash && paper.taxonomyVersion === taxonomyVersion
      && (syllabusVersion === undefined || paper.structure.syllabusVersion === syllabusVersion) && unknownTopicIds.length === 0;
    return { ...analysis, issues, noteId: paper.noteId, title: paper.title, year: paper.structure.year, sitting: paper.structure.sitting,
      syllabusVersion: paper.structure.syllabusVersion, status: !paper.reviewed ? "unreviewed" : valid && current ? "eligible" : "unresolved", duplicateOf: null };
  });

  const hashGroups = new Map<string, number[]>();
  papers.forEach((paper, index) => {
    if (!paper.sourceHash) return;
    const group = hashGroups.get(paper.sourceHash) ?? [];
    group.push(index);
    hashGroups.set(paper.sourceHash, group);
  });
  for (const group of hashGroups.values()) {
    // prefer a usable review when the same source was uploaded more than once
    const canonicalIndex = group.find((index) => metrics[index].status === "eligible") ?? group.find((index) => papers[index].reviewed) ?? group[0];
    for (const index of group) {
      if (index === canonicalIndex) continue;
      metrics[index].status = "duplicate";
      metrics[index].duplicateOf = metrics[canonicalIndex].noteId;
      metrics[index].issues.push("Identical source content is counted once, regardless of upload or note ID.");
    }
  }

  const issues: string[] = [];
  const sittingGroups = new Map<string, ExamPaperMetrics[]>();
  for (const paper of metrics.filter((metric) => metric.status !== "duplicate")) {
    const key = `${paper.year}:${paper.sitting.trim().toLowerCase()}`;
    const group = sittingGroups.get(key) ?? [];
    group.push(paper);
    sittingGroups.set(key, group);
  }
  for (const group of sittingGroups.values()) {
    if (group.length < 2) continue;
    const issue = `${group[0].year} ${group[0].sitting} has different source files. Check for alternate versions or duplicate papers; both remain separate until resolved.`;
    issues.push(issue);
    for (const paper of group) paper.issues.push(issue);
  }

  const eligible = metrics.filter((paper) => paper.status === "eligible");
  const topicRows: ExamCorpusTopic[] = topics.map((topic) => {
    const rows = eligible.flatMap((paper) => paper.topicMarks.filter((row) => row.topicId === topic.id));
    return { topicId: topic.id, name: topic.name, paperCount: rows.length,
      paperFrequencyPercent: eligible.length === 0 ? null : rows.length / eligible.length * 100,
      exclusiveMarks: total(rows.map((row) => row.exclusiveMarks)), sharedMarks: total(rows.map((row) => row.sharedMarks)),
      questionCount: total(rows.map((row) => row.questionCount)),
      minAnswerableMarks: eligible.length === 0 ? null : total(rows.map((row) => row.minAnswerableMarks ?? 0)),
      maxAnswerableMarks: eligible.length === 0 ? null : total(rows.map((row) => row.maxAnswerableMarks ?? 0)) };
  });
  return { paperCount: papers.length, reviewedCount: papers.filter((paper) => paper.reviewed).length,
    eligibleCount: eligible.length, unreviewedCount: metrics.filter((paper) => paper.status === "unreviewed").length,
    unresolvedCount: metrics.filter((paper) => paper.status === "unresolved").length,
    duplicateCount: metrics.filter((paper) => paper.status === "duplicate").length, taxonomyVersion,
    syllabusVersion: syllabusVersion ?? null, papers: metrics, topics: topicRows, issues };
}
