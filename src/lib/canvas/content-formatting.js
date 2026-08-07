/**
 * Shared Canvas content naming and text-formatting utilities.
 */

export function cleanCourseName(courseCode, courseName, term) {
  // extract year prefix from course code: "2526-CT2109" → year="2526", code="CT2109"
  const codeMatch = courseCode?.match(/^(\d{4})-?(.*)/);
  const cleanCode = codeMatch?.[2] || courseCode || '';
  let academicYear = codeMatch?.[1] || null;

  // fall back to enrollment term for year (e.g. "2025/2026" → "2526")
  if (!academicYear && term?.name) {
    const fullYears = term.name.match(/(\d{4})\D+(\d{4})/);
    if (fullYears) {
      academicYear = fullYears[1].slice(2) + fullYears[2].slice(2);
    } else {
      const shortYears = term.name.match(/(\d{4})\D+(\d{2})\b/);
      if (shortYears) academicYear = shortYears[1].slice(2) + shortYears[2];
    }
  }

  // strip duplicate code/prefix from course name
  let cleanName = courseName ?? '';
  if (courseCode && cleanName.startsWith(courseCode)) {
    cleanName = cleanName.slice(courseCode.length).trim();
  }
  if (cleanCode && cleanName.startsWith(cleanCode)) {
    cleanName = cleanName.slice(cleanCode.length).trim();
  }
  cleanName = cleanName.replace(/^[-—–:\s]+/, '').trim();

  // slugify: "Software Engineering 1" → "Software-Engineering-1"
  const slugged = cleanName
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  const title = cleanCode && slugged
    ? `${cleanCode}-${slugged}`
    : cleanCode || slugged || 'Untitled-Course';

  return { title, academicYear };
}

export function stripHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<h[1-6][^>]*>/gi, '## ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, m => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>',
      '&quot;': '"', '&nbsp;': ' ', '&#39;': "'",
    })[m])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
