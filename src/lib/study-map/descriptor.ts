import sql from "@/database/pgsql";

// University of Galway publishes every module's description, learning outcomes and
// assessment split. It is free, official, and usually better topic input than course slides
const DESCRIPTOR_URL =
  "https://www.universityofgalway.ie/course-information/module/";
const DESCRIPTOR_ORIGIN = "https://www.universityofgalway.ie";
const REFRESH_DAYS = 30;
const CODE = /^([A-Z]{2,4}[0-9]{3,4}[A-Z]?)(?![A-Za-z0-9])/;
const MODULE_CODE = /^[A-Z]{2,4}[0-9]{3,4}[A-Z]?$/;
const MAX_DESCRIPTOR_REDIRECTS = 2;
const MAX_DESCRIPTOR_CHARS = 1_000_000;

export function nextDescriptorUrl(current: string, location: string): string | null {
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    return null;
  }
  if (
    next.origin !== DESCRIPTOR_ORIGIN ||
    next.username ||
    next.password ||
    next.port
  ) {
    return null;
  }
  return next.href;
}

/** "CT230-Database-Systems-I" → "CT230", as Canvas imports name course folders */
export function moduleCode(title: string): string | null {
  return CODE.exec(title.trim().toUpperCase())?.[1] ?? null;
}

function textLines(html: string): string[] {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) =>
      entity.startsWith("#x")
        ? String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
        : entity.startsWith("#")
          ? String.fromCodePoint(Number(entity.slice(1)))
          : (entities[entity.toLowerCase()] ?? match),
    )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * turns the public module page into Markdown. Returns null when the page has no
 * description, content or learning outcomes, since an assessment split alone cannot seed topics
 */
export function parseDescriptor(html: string, code: string): string | null {
  const lines = textLines(html);
  const start = lines.findIndex((line) => line.startsWith(`${code}:`));
  if (start === -1) return null;
  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      (line === "Teachers & Administrators" ||
        line.startsWith("The above information outlines")),
  );
  const body = lines.slice(start + 1, end === -1 ? undefined : end);
  const section = (heading: string, until: string[]) => {
    const from = body.indexOf(heading);
    if (from === -1) return [];
    const to = body.findIndex(
      (line, index) => index > from && until.includes(line),
    );
    return body.slice(from + 1, to === -1 ? undefined : to);
  };
  const headings = ["Learning Outcomes", "Assessments", "Reading List"];
  const firstHeading = body.findIndex((line) => headings.includes(line));
  const about = body
    .slice(0, firstHeading === -1 ? undefined : firstHeading)
    .filter((line) => line !== "(Language of instruction: English)");
  const [meta, ...description] = about;
  const outcomes = section("Learning Outcomes", headings);
  if (description.length === 0 && outcomes.length === 0) return null;
  const assessments = section("Assessments", headings);
  return [
    `# ${lines[start]}`,
    meta ?? "",
    description.join("\n\n"),
    outcomes.length
      ? `## Learning outcomes\n\n${outcomes.map((line) => `- ${line}`).join("\n")}`
      : "",
    assessments.length
      ? `## Assessment\n\n${assessments.map((line) => `- ${line}`).join("\n")}`
      : "",
    `Source: ${DESCRIPTOR_URL}${code}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** cached per module code for everyone; a module without a usable page is cached as null too */
export async function fetchModuleDescriptor(
  code: string,
): Promise<string | null> {
  const [cached] = await sql<Array<{ body: string | null; fresh: boolean }>>`
    SELECT body, fetched_at > NOW() - make_interval(days => ${REFRESH_DAYS}) AS fresh
    FROM app.module_descriptors WHERE code = ${code}
  `;
  if (cached?.fresh) return cached.body;
  let body: string | null;
  try {
    const html = await readDescriptorHtml(code);
    // the site serves real module pages with a 404 status, so the body decides.
    // a refused redirect throws and keeps the previous copy instead of caching null
    body = parseDescriptor(html, code);
  } catch {
    // keep a stale copy rather than losing it to a network blip
    return cached?.body ?? null;
  }
  await sql`
    INSERT INTO app.module_descriptors (code, body, fetched_at) VALUES (${code}, ${body}, NOW())
    ON CONFLICT (code) DO UPDATE SET body = EXCLUDED.body, fetched_at = EXCLUDED.fetched_at
  `;
  return body;
}

async function readDescriptorHtml(code: string): Promise<string> {
  if (!MODULE_CODE.test(code)) {
    throw new Error("Module code is not a Galway course code");
  }
  let current = `${DESCRIPTOR_URL}${code}`;
  for (let hop = 0; hop <= MAX_DESCRIPTOR_REDIRECTS; hop++) {
    const response = await fetch(current, {
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || hop === MAX_DESCRIPTOR_REDIRECTS) {
        throw new Error("Module page redirected too many times");
      }
      const next = nextDescriptorUrl(current, location);
      if (!next) throw new Error("Module page redirected off the university host");
      current = next;
      continue;
    }
    const html = await response.text();
    if (html.length > MAX_DESCRIPTOR_CHARS) {
      throw new Error("Module page exceeded the size limit");
    }
    return html;
  }
  throw new Error("Module page redirected too many times");
}

// Galway's empty-course home page; it describes Canvas, not the module
const CANVAS_TEMPLATE = "Do not publish your course with this resource";

/**
 * one Markdown note from every free description of a course. Canvas module names are
 * often the teaching units themselves, so they are included even when nothing else is
 */
export function buildCourseOutline(input: {
  title: string;
  descriptor: string | null;
  syllabus: string | null;
  frontPage: string | null;
  modules: string[];
}): string | null {
  const frontPage = input.frontPage?.includes(CANVAS_TEMPLATE)
    ? null
    : input.frontPage?.trim() || null;
  const syllabus = input.syllabus?.trim() || null;
  const modules = input.modules.map((name) => name.trim()).filter(Boolean);
  if (!input.descriptor && !syllabus && !frontPage && modules.length < 3)
    return null;
  // the descriptor's own title becomes a section heading under the course title
  const descriptor = input.descriptor
    ?.replace(/^# .*\n+/, "")
    .replace(/^## /gm, "### ");
  return [
    `# ${input.title} course outline`,
    descriptor ? `## Module descriptor\n\n${descriptor}` : "",
    syllabus ? `## Canvas syllabus\n\n${syllabus}` : "",
    frontPage ? `## Canvas home page\n\n${frontPage}` : "",
    modules.length >= 3
      ? `## Canvas modules\n\n${modules.map((name) => `- ${name}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
