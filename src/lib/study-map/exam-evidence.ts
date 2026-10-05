import type { ExamSection, ExamStructure, SourceDocument } from "./types";

export function explicitMarks(text: string): number | null {
  const matches = [
    ...text.matchAll(
      /(?:\[|\()?\b(\d+(?:\.\d+)?)\s*(?:marks?|points?)\b(?:\]|\))?/gi,
    ),
  ];
  const marks = new Set(matches.map((match) => Number(match[1])));
  return marks.size === 1 ? [...marks][0] : null;
}

// callers validate current anchors first; unknown marks remain null until supported by the source
export function validatePaperMarksEvidence(
  structure: ExamStructure,
  source: SourceDocument,
): void {
  for (const question of structure.questions) {
    if (
      question.marks !== null &&
      explicitMarks(question.source.quote) !== question.marks
    ) {
      throw new Error(
        "Question marks are not explicitly supported by its source quote. Review the paper manually.",
      );
    }
  }
  if (structure.statedTotalMarks !== null) {
    const statedTotals = [
      ...source.text.matchAll(
        /\b(?:total\s*(?:marks)?\s*[:=]?\s*(\d+(?:\.\d+)?)|(?:out\s+of|maximum\s+(?:of\s+)?)\s*(\d+(?:\.\d+)?)\s*marks)\b/gi,
      ),
    ].map((match) => Number(match[1] ?? match[2]));
    if (!statedTotals.includes(structure.statedTotalMarks)) {
      throw new Error(
        "The stated paper total could not be verified in the source. Review it manually.",
      );
    }
  }
  const headings = [
    ...source.text.matchAll(/^ {0,3}#{1,6}[ \t]+([^\r\n]+)[\r\n]*/gm),
  ];
  for (const [index, heading] of headings.entries()) {
    if (!/^Question\s+\d+[a-z]?[.):]?(?:\s|\[|$)/i.test(heading[1].trim()))
      continue;
    const end = headings[index + 1]?.index ?? source.text.length;
    if (
      !structure.questions.some(
        (question) =>
          question.parentId === null &&
          question.source.start >= heading.index &&
          question.source.start < end,
      )
    ) {
      throw new Error(
        "Paper extraction is incomplete: a numbered question heading was omitted. Review the source manually and retry extraction.",
      );
    }
  }
}

interface SectionHeading {
  start: number;
  end: number;
}

function sectionHeadings(source: SourceDocument): SectionHeading[] {
  return [
    ...source.text.matchAll(
      /^ {0,3}(?:#{1,6}[ \t]+Section[ \t]+[a-z0-9]+[^\r\n]*|Section[ \t]+[a-z0-9]+(?:[ \t]*[:.\-][^\r\n]*)?[ \t]*)$/gim,
    ),
  ].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

const compulsoryRule =
  /^(?:Answer\s+all\s+questions|All\s+questions\s+are\s+compulsory)[.!]?$/i;

function ruleBearingLine(text: string): boolean {
  const line = text.trim().replace(/^[-*]\s+/, "");
  if (
    /^(?:You\s+(?:must|should)\s+)?(?:answer|attempt|choose|complete)\b.*(?:\b(?:questions?|parts?|subparts?|subquestions?|options?|alternatives?)\b|\([a-z0-9ivx]+\))/i.test(
      line,
    )
  )
    return true;
  if (
    /\b(?:questions?|parts?|subquestions?|subparts?)\b[^.]*\b(?:is|are|must\s+be|will\s+be)\s+(?:compulsory|mandatory|required|optional)\b/i.test(
      line,
    )
  )
    return true;
  return /^(?:Either|Both)\s+(?:Questions?\b|Parts?\b|\([a-z0-9ivx]+\))/i.test(
    line,
  );
}

function ruleRanges(
  source: SourceDocument,
  start: number,
  end: number,
): { start: number; end: number }[] {
  return [...source.text.slice(start, end).matchAll(/[^\r\n]+/g)]
    .filter((match) => ruleBearingLine(match[0]))
    .map((match) => {
      const leading = match[0].search(/\S/);
      return {
        start: start + match.index + leading,
        end: start + match.index + match[0].trimEnd().length,
      };
    });
}

function globallyCompulsory(
  source: SourceDocument,
  section: ExamSection,
  localInstructions: string,
  firstSectionStart: number,
): boolean {
  const preamble = source.text.slice(0, firstSectionStart);
  const rules = preamble
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(ruleBearingLine);
  return (
    rules.length === 1 &&
    compulsoryRule.test(rules[0]) &&
    section.answerCount === section.questionIds.length &&
    !localInstructions.split(/\r?\n/).some(ruleBearingLine)
  );
}

// callers validate current anchors first; this checks which section each rule belongs to
export function validateSectionInstructionPlacement(
  structure: ExamStructure,
  source: SourceDocument,
): void {
  const headings = sectionHeadings(source);
  const virtualSection =
    headings.length === 0 && structure.sections.length === 1;
  if (!headings.length && !virtualSection) {
    throw new Error(
      "The source section boundaries could not be verified. Review the paper manually before extracting its choice rules.",
    );
  }
  const roots = structure.questions.filter(
    (question) => question.parentId === null,
  );
  if (!roots.length)
    throw new Error(
      "The paper has no root questions. Review the question structure manually.",
    );
  const rootById = new Map(roots.map((question) => [question.id, question]));
  const firstPaperRoot = Math.min(
    ...roots.map((question) => question.source.start),
  );
  const usedHeadings = new Set<number>();
  const nearestHeading = (start: number): number =>
    headings.findLastIndex((heading) => heading.start <= start);
  for (const section of structure.sections) {
    const sectionRoots = section.questionIds.map((id) => rootById.get(id));
    if (
      !sectionRoots.length ||
      sectionRoots.some((question) => question === undefined)
    ) {
      throw new Error(
        "A section references unavailable root questions. Review the paper manually.",
      );
    }
    const positions = sectionRoots.flatMap((question) =>
      question ? [question.source.start] : [],
    );
    const firstRoot = Math.min(...positions);
    const headingIndex = nearestHeading(firstRoot);
    if (
      !virtualSection &&
      (headingIndex === -1 ||
        positions.some(
          (position) => nearestHeading(position) !== headingIndex,
        ) ||
        usedHeadings.has(headingIndex))
    ) {
      throw new Error(
        "Extracted roots do not match distinct source sections. Review the paper manually and retry extraction.",
      );
    }
    usedHeadings.add(headingIndex);
    const heading = virtualSection
      ? { start: 0, end: 0 }
      : headings[headingIndex];
    const localInstructions = virtualSection
      ? ""
      : source.text.slice(heading.end, firstRoot);
    const compulsoryGlobal = globallyCompulsory(
      source,
      section,
      localInstructions,
      virtualSection ? firstPaperRoot : headings[0].start,
    );
    if (section.source === null) {
      if (section.instructions)
        throw new Error(
          "Section instructions need an exact evidence quote. Review the paper manually.",
        );
      if (!compulsoryGlobal)
        throw new Error(
          "Compulsory questions need an explicit instruction for this section or the whole paper. Review the paper manually.",
        );
      continue;
    }
    const anchor = section.source;
    if (anchor.end > firstRoot)
      throw new Error(
        "Section instruction evidence must precede its root questions. Review the paper manually.",
      );
    if (
      section.answerCount !== null &&
      !section.instructions.split(/\r?\n/).some(ruleBearingLine)
    ) {
      throw new Error(
        "A known answer count needs an explicit quoted choice instruction. Review the paper manually.",
      );
    }
    const globalCitation =
      !virtualSection &&
      anchor.end <= headings[0].start &&
      anchor.end <= firstPaperRoot;
    if (
      !virtualSection &&
      !globalCitation &&
      (anchor.start < heading.end ||
        nearestHeading(anchor.start) !== headingIndex)
    ) {
      throw new Error(
        "The instruction quote belongs to a different section. Review the paper manually and cite this section's own rules.",
      );
    }
    const instructionStart = virtualSection ? 0 : heading.end;
    const omittedLocalRules = ruleRanges(
      source,
      instructionStart,
      firstRoot,
    ).some((rule) => anchor.start > rule.start || anchor.end < rule.end);
    if (omittedLocalRules)
      throw new Error(
        "The section citation omits source choice instructions. Review and cite every rule before approving this paper.",
      );
    if (virtualSection) continue;
    if (
      ruleRanges(source, 0, headings[0].start).some(
        (rule) => anchor.start > rule.start || anchor.end < rule.end,
      )
    ) {
      throw new Error(
        "The paper-wide citation omits source choice instructions. Review and cite every global rule before approving this paper.",
      );
    }
    if (globalCitation) {
      if (
        !compulsoryGlobal ||
        !compulsoryRule.test(section.instructions.trim())
      ) {
        throw new Error(
          "A global instruction cannot verify this section's choice rule. Review the paper manually.",
        );
      }
    }
  }
}
