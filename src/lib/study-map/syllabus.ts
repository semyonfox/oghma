// course imports have no syllabus flag, so the module outline is recognised by its title
const syllabusTitles: Array<[RegExp, number]> = [
  [/\bsyllabus\b/i, 3],
  [
    /\b(module|course|unit)[\s_-]+(outline|descriptor|handbook|overview|information|guide|description)\b/i,
    2,
  ],
  [/\blearning[\s_-]+outcomes\b/i, 1],
];

export function syllabusScore(title: string): number {
  return Math.max(
    0,
    ...syllabusTitles.map(([pattern, score]) =>
      pattern.test(title) ? score : 0,
    ),
  );
}

/** the strongest title match, preferring shorter titles over "week 3 syllabus recap" style notes */
export function chooseSyllabus<Note extends { noteId: string; title: string }>(
  notes: Note[],
): Note | null {
  let best: Note | null = null;
  let bestScore = 0;
  for (const note of notes) {
    const score = syllabusScore(note.title);
    if (
      score > bestScore ||
      (score > 0 &&
        score === bestScore &&
        best &&
        note.title.length < best.title.length)
    ) {
      best = note;
      bestScore = score;
    }
  }
  return best;
}
