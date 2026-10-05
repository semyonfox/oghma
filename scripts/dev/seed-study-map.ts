#!/usr/bin/env node

// run with tsx and the dedicated study-map preview environment
// reruns preserve completed maps and resume only unfinished synthetic maps
// this script never resets the database or deletes existing notes

import { emptyBoard } from "../../src/lib/study-map/types.ts";
import { pathToFileURL } from "node:url";

const userId = "11111111-1111-4111-8111-111111111111";
const academicYear = "2025/26";
const fixedId = (number: number): string =>
  `71000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const osFolder = fixedId(1);
const dbFolder = fixedId(2);
const osSyllabus = fixedId(3);
const dbSyllabus = fixedId(4);
const pdfId = fixedId(30);
const companionId = fixedId(31);
const diagramId = fixedId(32);
const checklistId = fixedId(33);
const starterId = fixedId(34);
const osCourse = "910001";
const dbCourse = "910002";
// teaching weeks come from Canvas-style module folders, as in a real import
const weekFolder = (module: "os" | "db", week: number): string =>
  fixedId((module === "os" ? 200 : 300) + week);
const osWeeks = [1, 2, 3, 4, 4, 5, 6, 7, 8, 8, 9, 9];
const dbWeeks = [1, 2, 3, 4];
let seedStage = "preflight";

class SeedError extends Error {}

function assertPreviewEnvironment(): void {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new SeedError("DATABASE_URL is required for the study-map preview");
  let database: URL;
  try {
    database = new URL(url);
  } catch {
    throw new SeedError("DATABASE_URL must be a valid PostgreSQL URL");
  }
  const allowedParameters = [...database.searchParams].every(
    ([key, value]) =>
      key === "search_path" && (value === "app,public" || value === "app"),
  );
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "localhost"].includes(database.hostname) ||
    database.port !== "55488" ||
    database.pathname !== "/oghma_study_e2e" ||
    !allowedParameters ||
    database.searchParams.getAll("search_path").length > 1
  ) {
    throw new SeedError(
      "Use the loopback study-map database on port 55488, named oghma_study_e2e; only search_path=app,public or search_path=app is allowed",
    );
  }
  if (process.env.STUDY_CLASSIFIER_PROVIDER !== "mock") {
    throw new SeedError(
      "STUDY_CLASSIFIER_PROVIDER must be mock for this synthetic seed",
    );
  }
  let storage: URL;
  try {
    storage = new URL(process.env.STORAGE_ENDPOINT ?? "http://invalid");
  } catch {
    throw new SeedError(
      "STORAGE_ENDPOINT must be a valid loopback preview URL",
    );
  }
  if (
    storage.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(storage.hostname) ||
    storage.port !== "59108" ||
    storage.username ||
    storage.password ||
    process.env.STORAGE_ACCESS_KEY !== "oghmastudy" ||
    process.env.STORAGE_SECRET_KEY !== "oghmastudy-test" ||
    !process.env.STORAGE_BUCKET ||
    process.env.STORAGE_PATH_STYLE !== "true"
  ) {
    throw new SeedError(
      "Storage must use the dedicated loopback preview on port 59108 with its synthetic credentials, a bucket, and path-style URLs",
    );
  }
}

const osTopics = [
  [
    "Processes",
    "Processes are running programs with independent address spaces, process states and controlled transitions. Study process creation, context switches and interprocess communication.",
  ],
  [
    "Scheduling",
    "Scheduling allocates processor time to runnable processes. Compare first-come first-served, round robin and priority policies using turnaround, response time and fairness.",
  ],
  [
    "Synchronization",
    "Synchronization coordinates concurrent threads around shared state. Study mutex locks, semaphores, race conditions, deadlock and safe ordering of critical sections.",
  ],
  [
    "Virtual Memory",
    "Virtual Memory maps process addresses to physical frames. Study page tables, address translation, demand paging, page faults and replacement policies.",
  ],
  [
    "File Systems",
    "File Systems persist named data using directories, inodes, blocks and metadata. Compare allocation policies, journaling and recovery after interrupted writes.",
  ],
  [
    "Security",
    "Security protects operating system resources using privilege boundaries, authentication and permissions. Study least privilege, access controls and isolation of untrusted processes.",
  ],
] as const;

const dbTopics = [
  [
    "Relational Model",
    "The Relational Model represents facts as rows and columns with primary keys and foreign keys. Study integrity constraints and relationships between entities.",
  ],
  [
    "SQL Queries",
    "SQL Queries select and combine rows using joins, aggregation, grouping and predicates. Compare inner joins and outer joins with concrete query results.",
  ],
  [
    "Normalization",
    "Normalization uses functional dependencies to reduce duplicate facts. Study candidate keys, third normal form and lossless decomposition.",
  ],
  [
    "Transactions",
    "Transactions group database changes into atomic operations. Study isolation levels, concurrency anomalies, commit and rollback.",
  ],
  [
    "Indexes",
    "Indexes speed up access to selected rows using ordered keys. Study B-tree access, compound indexes, query plans and the cost of maintaining indexes.",
  ],
  [
    "Recovery",
    "Recovery reconstructs committed database state after failure using write-ahead logs. Study checkpoints, redo, undo and durable commits.",
  ],
] as const;

function syllabus(topics: ReadonlyArray<readonly [string, string]>): string {
  return topics
    .map(([name, definition]) => `## ${name}\n\n${definition}`)
    .join("\n\n");
}

interface SeedNote {
  id: string;
  title: string;
  content: string;
  parent: string;
}

const osNotes: SeedNote[] = [
  [
    "Processes: states and context switches",
    "Processes",
    "A process is a running program. The ready, running and blocked states describe whether it can use the processor. A context switch saves registers and restores another process's execution state.\n\nExample: a terminal starts a compiler, the compiler waits for disk input, and the shell remains responsive. Unlike a thread, an independent process has a separate address space.",
  ],
  [
    "Processes and Security: the privilege boundary",
    "Processes",
    "Processes request protected operations through system calls. Security checks the caller's identity and permissions before opening a file or changing another process.\n\nComparison: a user process cannot write kernel memory, whereas privileged kernel code can manage physical devices. Least privilege limits the damage of a compromised application.",
  ],
  [
    "Scheduling: round robin worked example",
    "Scheduling",
    "Worked example: three processes arrive together with bursts of 6, 3 and 1 units. Round robin with a quantum of 2 shares the processor in repeated turns.\n\nCalculate turnaround time by tracing each ready-queue transition. A shorter quantum improves response time but causes more context switches. Compare this schedule with first-come first-served.",
  ],
  [
    "Scheduling versus Synchronization",
    "Scheduling",
    "Scheduling chooses the next runnable thread. Synchronization decides when a thread may safely access shared state. A blocked thread waiting on a semaphore leaves the ready queue.\n\nExample: priority inversion occurs when a high-priority thread waits for a lock held by a low-priority thread. Priority inheritance changes scheduling while preserving the synchronization contract.",
  ],
  [
    "Synchronization: mutexes and semaphores",
    "Synchronization",
    "Synchronization protects a critical section with a mutex or semaphore. A race condition occurs when the result depends on an unsafe interleaving.\n\nPseudocode: lock(mutex); counter = counter + 1; unlock(mutex). The operation is safe only when all writers follow the same locking rule. A counting semaphore can bound access to several identical resources.",
  ],
  [
    "Synchronization: deadlock and ordering",
    "Synchronization",
    "A deadlock needs mutual exclusion, hold-and-wait, no preemption and a circular wait. Synchronization can prevent circular wait by acquiring locks in one global order.\n\nWorked example: threads each hold one mutex and request the other's mutex. Draw the resource graph and identify the cycle. A timeout may detect the failure without proving that recovery is safe.",
  ],
  [
    "Virtual Memory: address translation",
    "Virtual Memory",
    "Virtual Memory divides a logical address into a page number and an offset. A page table maps the page number to a physical frame.\n\nWorked example: with 4 KiB pages, address 12,300 has page number 3 and offset 12. A translation lookaside buffer caches recent page-table entries. Processes retain distinct virtual address spaces.",
  ],
  [
    "Virtual Memory and File Systems: demand paging",
    "Virtual Memory",
    "Virtual Memory loads a page only when a process touches it. A page fault transfers control to the operating system, which reads backing data through File Systems before resuming the process.\n\nComparison: FIFO evicts the oldest resident page, whereas LRU approximates the least recently used page. Calculate faults for the reference string 1, 2, 3, 1, 4 with three frames.",
  ],
  [
    "File Systems: inodes and directories",
    "File Systems",
    "File Systems separate a file's name from its metadata. A directory maps a name to an inode; the inode records permissions, size and data blocks.\n\nExample: two hard links can refer to one inode. Removing one name does not remove the data while another link remains. Compare contiguous allocation with indexed allocation.",
  ],
  [
    "File Systems and Security: permissions",
    "File Systems",
    "File Systems store ownership and permission bits with each file. Security applies read, write and execute checks to the current user and groups.\n\nWorked example: permission mode 640 permits the owner to read and write, the group to read, and others no access. A directory's execute permission permits traversal; it does not itself grant permission to read every file.",
  ],
  [
    "Security: isolation and least privilege",
    "Security",
    "Security uses process isolation and least privilege to limit the impact of bugs. Authentication identifies a user; authorization decides which resources that user may access.\n\nComparison: a privileged service can bind a protected port, then drop unnecessary permissions before handling input. Validate requests at the privilege boundary rather than trusting a caller's claimed identity.",
  ],
  [
    "Security reading: sandbox trade-offs",
    "Security",
    "Reading: Security sandboxes constrain system calls, file access and network access. Processes may still communicate through explicitly permitted channels.\n\nA sandbox is one layer of isolation. Consider the trade-off between convenient access to shared files and a small permission set. This reading remains a suggestion until its topic associations are reviewed.",
  ],
].map(([title, topic, body], index) => ({
  id: fixedId(10 + index),
  title,
  content: `# ${title}\n\n${body}\n\n## Revision prompt\n\nExplain ${topic} using one concrete example and identify a failure case.`,
  parent: weekFolder("os", osWeeks[index]),
}));
osNotes[3].content += `\n\nSee [mutexes and semaphores](/notes/${osNotes[4].id}) for the locking side.`;
osNotes[7].content += `\n\nBuilds on [address translation](/notes/${osNotes[6].id}).`;
osNotes[9].content += `\n\nPermissions are stored in the [inode](/notes/${osNotes[8].id}).`;

const dbNotes: SeedNote[] = [
  {
    id: fixedId(50),
    title: "Relational Model and SQL Queries",
    parent: weekFolder("db", 1),
    content:
      "# Relational Model\n\nThe Relational Model uses primary keys to identify rows and foreign keys to preserve relationships.\n\n# SQL Queries\n\nWorked example: join enrolment to students on student_id, then GROUP BY module_id to count registrations. Compare an inner join with an outer join when a student has no enrolments.",
  },
  {
    id: fixedId(51),
    title: "Normalization worked example",
    parent: weekFolder("db", 2),
    content:
      "# Normalization\n\nNormalization removes repeated lecturer details from an enrolment relation. The dependency module_id -> lecturer_id suggests a separate module relation.\n\nProve that the join is lossless using the shared key, then check which functional dependencies remain enforceable.",
  },
  {
    id: fixedId(52),
    title: "Transactions and Recovery",
    parent: weekFolder("db", 4),
    content:
      "# Transactions\n\nTransactions make both sides of a bank transfer atomic. Concurrent updates require an isolation policy that prevents lost updates.\n\n# Recovery\n\nRecovery uses write-ahead logging so committed changes survive failure. A checkpoint shortens redo work; rollback removes the effects of an aborted transaction.",
  },
  {
    id: fixedId(53),
    title: "Indexes and query plans",
    parent: weekFolder("db", 3),
    content:
      "# Indexes\n\nIndexes reduce the rows scanned by selective SQL Queries. A compound index on module_id and student_id supports searches beginning with module_id.\n\nComparison: a table scan may beat an index scan when most rows match. Read EXPLAIN output before adding another index, because every write must maintain it.",
  },
];
dbNotes[2].content += `\n\nThe same lost-update problem appears in [Operating Systems deadlock and ordering](/notes/${osNotes[5].id}).`;
const ownNotes: SeedNote[] = [
  {
    id: checklistId,
    title: "My deadlock checklist",
    parent: weekFolder("os", 5),
    content: `# My deadlock checklist\n\nFour conditions: mutual exclusion, hold and wait, no preemption, circular wait. Breaking any one prevents Synchronization deadlock.\n\nWorked through in [deadlock and ordering](/notes/${osNotes[5].id}).`,
  },
  {
    id: starterId,
    title: "Scheduler simulator starter notes",
    parent: weekFolder("os", 5),
    content:
      "# Scheduler simulator starter notes\n\nThe simulator reads process arrivals and bursts, then prints a Scheduling trace for first-come first-served and round robin. Track Processes in a ready queue and record turnaround time.",
  },
];

function pastPaper(year: number, version: string, alternate = false): string {
  return `# Operating Systems examination ${year}\n\nSitting: Summer\nSyllabus: ${version}\nTotal marks: 40\n\n## Section A\n\nAnswer 2 of 3 questions.\n\n### Question 1 [20 marks]\n\nExplain the relationship between Processes and Scheduling.\n\n#### (a) [10 marks]\n\nDescribe Processes states and context switches with an example.\n\n#### (b) [10 marks]\n\n${alternate ? "Compare priority Scheduling with round robin." : "Calculate a round-robin Scheduling trace for three processes."}\n\n### Question 2 [20 marks]\n\nCompare Synchronization and Virtual Memory mechanisms.\n\n#### (a) [10 marks]\n\nExplain Synchronization using a mutex and a semaphore.\n\n#### (b) [10 marks]\n\nExplain a Virtual Memory page fault and address translation.\n\n### Question 3 [20 marks]\n\nExplain File Systems and Security boundaries.\n\n#### (a) [10 marks]\n\nDescribe File Systems directory entries and inode metadata.\n\n#### (b) [10 marks]\n\nCompare Security permissions and process isolation.\n`;
}

const papers: SeedNote[] = [
  {
    id: fixedId(40),
    title: "Past paper 2025: Summer",
    content: pastPaper(2025, academicYear),
    parent: osFolder,
  },
  {
    id: fixedId(41),
    title: "Past paper 2024: Summer",
    content: pastPaper(2024, academicYear, true),
    parent: osFolder,
  },
  {
    id: fixedId(42),
    title: "Past paper 2023: awaiting review",
    content: pastPaper(2023, academicYear),
    parent: osFolder,
  },
  {
    id: fixedId(43),
    title: "Past paper 2021: older syllabus",
    content: pastPaper(2021, "2021/22"),
    parent: osFolder,
  },
];

export function tinyPdf(text: string): Buffer {
  const ascii = text.replace(/\r\n?/g, "\n").replace(/[^\x20-\x7e\n]/g, " ");
  const sections = ascii
    .split(/(?=^\[Page [1-9]\d*\][ \t]*$)/m)
    .filter((section) => section.trim());
  const pages = (sections.length ? sections : [""]).map((section) =>
    section.split("\n").flatMap((line) => line.match(/.{1,90}/g) ?? [""]),
  );
  const escape = (line: string): string => line.replace(/([\\()])/g, "\\$1");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const lines of pages) {
    const pageId = objects.length + 1;
    const height = Math.max(842, 110 + lines.length * 12);
    const stream = `BT /F1 10 Tf 12 TL 40 ${height - 52} Td\n${lines.map((line) => `(${escape(line)}) Tj T*`).join("\n")}\nET\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    );
  }
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

async function main(): Promise<void> {
  assertPreviewEnvironment();
  seedStage = "load application modules";
  const [
    database,
    notes,
    storageModule,
    mutations,
    repository,
    generation,
    jobs,
    links,
  ] = await Promise.all([
    import("../../src/database/pgsql.ts"),
    import("../../src/lib/notes/storage/create-note.ts"),
    import("../../src/lib/storage/init.ts"),
    import("../../src/lib/study-map/mutations.ts"),
    import("../../src/lib/study-map/repository.ts"),
    import("../../src/lib/study-map/generation.ts"),
    import("../../src/lib/study-map/jobs.ts"),
    import("../../src/lib/notes/storage/note-links.ts"),
  ]);
  const sql = database.default;
  try {
    seedStage = "verify synthetic database user and schema";
    const [user] = await sql<
      { user_id: string }[]
    >`SELECT user_id FROM app.login WHERE user_id = ${userId}::uuid`;
    if (!user)
      throw new SeedError(
        "The dedicated preview must already contain the synthetic reset user",
      );
    const existing = await sql<
      { id: string; root_note_id: string; board_version: number }[]
    >`
      SELECT id, root_note_id, board_version FROM app.study_maps
      WHERE user_id = ${userId}::uuid AND root_note_id = ANY(${[osFolder, dbFolder]}::uuid[])
    `;
    if (
      existing.length === 2 &&
      existing.every((map) => map.board_version > 0)
    ) {
      console.log(
        "[study-map] Reused both completed synthetic maps; notes, reviews and edits were preserved.",
      );
      return;
    }
    if (existing.length)
      console.log(
        "[study-map] Resuming unfinished synthetic maps; completed maps and existing reviews are preserved.",
      );

    seedStage = "create synthetic notes and storage objects";
    const storage = storageModule.getStorageProvider();
    async function createNote(
      note: SeedNote,
      isFolder = false,
      s3Key: string | null = null,
    ): Promise<void> {
      const [existingNote] = await sql<
        { user_id: string }[]
      >`SELECT user_id FROM app.notes WHERE note_id = ${note.id}::uuid`;
      if (existingNote) {
        if (existingNote.user_id !== userId)
          throw new SeedError(
            "A synthetic note ID is already owned by another user",
          );
        return;
      }
      await notes.createNoteWithTree({
        noteId: note.id,
        userId,
        title: note.title,
        content: note.content,
        isFolder,
        parentId: note.parent || null,
        s3Key,
      });
    }
    async function attachment(
      noteId: string,
      filename: string,
      key: string,
      mime: string,
      size: number,
    ): Promise<void> {
      await sql`
        INSERT INTO app.attachments (note_id, user_id, filename, s3_key, mime_type, file_size)
        SELECT ${noteId}::uuid, ${userId}::uuid, ${filename}, ${key}, ${mime}, ${size}
        WHERE NOT EXISTS (SELECT 1 FROM app.attachments WHERE note_id = ${noteId}::uuid
          AND user_id = ${userId}::uuid AND s3_key = ${key})
      `;
    }
    await createNote(
      { id: osFolder, title: "Operating Systems", content: "", parent: "" },
      true,
    );
    await createNote(
      { id: dbFolder, title: "Database Systems", content: "", parent: "" },
      true,
    );
    await createNote({
      id: osSyllabus,
      title: "Operating Systems syllabus 2025/26",
      content: syllabus(osTopics),
      parent: osFolder,
    });
    await createNote({
      id: dbSyllabus,
      title: "Database Systems syllabus 2025/26",
      content: syllabus(dbTopics),
      parent: dbFolder,
    });

    for (const [module, root, weeks] of [
      ["os", osFolder, osWeeks],
      ["db", dbFolder, dbWeeks],
    ] as const) {
      for (const week of [...new Set(weeks)])
        await createNote(
          {
            id: weekFolder(module, week),
            title: `Week ${week}`,
            content: "",
            parent: root,
          },
          true,
        );
    }
    const firstNote = osNotes[0];
    firstNote.content += `\n\n![Process state diagram](/api/notes/${firstNote.id}/assets?name=process-states.svg)\n\n[Process state diagram file](/notes/${diagramId})`;
    for (const note of [...osNotes, ...dbNotes, ...ownNotes, ...papers])
      await createNote(note);
    // lecture material arrives through the Canvas import; the two own notes do not
    await sql`UPDATE app.notes SET canvas_course_id = ${osCourse}::bigint WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${[...osNotes.map((note) => note.id), pdfId, companionId, diagramId]}::uuid[]) AND canvas_course_id IS NULL`;
    await sql`UPDATE app.notes SET canvas_course_id = ${dbCourse}::bigint WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${dbNotes.map((note) => note.id)}::uuid[]) AND canvas_course_id IS NULL`;

    const slideText =
      "[Page 1]\n# Slides: Virtual Memory\n\nVirtual Memory maps a process page number to a physical frame. A page fault loads missing backing data.\n\n[Page 2]\n# Slides: Scheduling and Processes\n\nScheduling chooses runnable Processes. A context switch restores the next process registers.\n";
    const pdfKey = `notes/${pdfId}/lecture-slides.pdf`;
    const mdKey = `notes/${companionId}/lecture-slides.md`;
    const pdf = tinyPdf(slideText);
    await storage.putObject(pdfKey, pdf, { contentType: "application/pdf" });
    await storage.putObject(mdKey, Buffer.from(slideText), {
      contentType: "text/markdown",
    });
    await createNote(
      {
        id: pdfId,
        title: "lecture-slides.pdf",
        content: "",
        parent: weekFolder("os", 6),
      },
      false,
      pdfKey,
    );
    await createNote(
      {
        id: companionId,
        title: "lecture-slides.md",
        content: slideText,
        parent: weekFolder("os", 6),
      },
      false,
      mdKey,
    );
    await sql`UPDATE app.notes SET extracted_text = ${slideText} WHERE user_id = ${userId}::uuid AND note_id = ${pdfId}::uuid AND COALESCE(extracted_text, '') = ''`;
    await sql`UPDATE app.notes SET extracted_from_note_id = ${pdfId}::uuid WHERE user_id = ${userId}::uuid AND note_id = ${companionId}::uuid AND extracted_from_note_id IS NULL`;
    await attachment(
      pdfId,
      "lecture-slides.pdf",
      pdfKey,
      "application/pdf",
      pdf.length,
    );
    await attachment(
      companionId,
      "lecture-slides.md",
      mdKey,
      "text/markdown",
      Buffer.byteLength(slideText),
    );

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="200" viewBox="0 0 720 200"><rect width="720" height="200" fill="#f1f5f9"/><g fill="#dbeafe" stroke="#2563eb" stroke-width="2"><rect x="35" y="65" width="170" height="70" rx="14"/><rect x="275" y="65" width="170" height="70" rx="14"/><rect x="515" y="65" width="170" height="70" rx="14"/></g><g fill="#0f172a" font-family="sans-serif" font-size="22" text-anchor="middle"><text x="120" y="108">Ready</text><text x="360" y="108">Running</text><text x="600" y="108">Blocked</text></g><g stroke="#2563eb" stroke-width="3"><path d="M210 100h55m-10-7 10 7-10 7M450 100h55m-10-7 10 7-10 7" fill="none"/></g></svg>';
    const svgKey = `notes/${diagramId}/process-states.svg`;
    await storage.putObject(svgKey, Buffer.from(svg), {
      contentType: "image/svg+xml",
    });
    await createNote(
      {
        id: diagramId,
        title: "process-states.svg",
        content: "",
        parent: weekFolder("os", 1),
      },
      false,
      svgKey,
    );
    await sql`UPDATE app.notes SET extracted_text = 'Processes transition between ready, running and blocked states.'
      WHERE user_id = ${userId}::uuid AND note_id = ${diagramId}::uuid AND COALESCE(extracted_text, '') = ''`;
    await attachment(
      diagramId,
      "process-states.svg",
      svgKey,
      "image/svg+xml",
      Buffer.byteLength(svg),
    );
    await attachment(
      firstNote.id,
      "process-states.svg",
      svgKey,
      "image/svg+xml",
      Buffer.byteLength(svg),
    );
    for (const note of [...osNotes, ...dbNotes, ...ownNotes]) {
      if (note.content.includes("/notes/"))
        await links.replaceNoteLinks(userId, note.id, note.content);
    }

    seedStage = "create synthetic assignments";
    const day = 24 * 60 * 60 * 1000;
    const assignments = [
      {
        course: osCourse,
        canvasId: "920001",
        title: "Assignment 1: scheduler simulator",
        due: 10,
        description:
          "<p>Build a simulator that compares first-come first-served and round robin <b>Scheduling</b>. Report turnaround and response time for each of the Processes.</p>",
      },
      {
        course: osCourse,
        canvasId: "920002",
        title: "Assignment 2: file permissions audit",
        due: 38,
        description:
          "<p>Audit File Systems permissions on a shared server and explain each Security decision using least privilege.</p>",
      },
      {
        course: dbCourse,
        canvasId: "920003",
        title: "Assignment: library schema",
        due: 17,
        description:
          "<p>Design a library schema with the Relational Model, apply Normalization to third normal form, and write five SQL Queries against it.</p>",
      },
    ];
    for (const assignment of assignments) {
      // manual source keeps the synthetic preview from calling Canvas when the details dialog opens
      await sql`
        INSERT INTO app.assignments (user_id, canvas_course_id, canvas_assignment_id, title, description, course_name, due_at, status, source, assignment_type)
        VALUES (${userId}::uuid, ${assignment.course}::bigint, ${assignment.canvasId}::bigint, ${assignment.title}, ${assignment.description},
          ${assignment.course === osCourse ? "Operating Systems" : "Database Systems"}, ${new Date(Date.now() + assignment.due * day).toISOString()}::timestamptz,
          'upcoming', 'manual', 'assignment')
        ON CONFLICT (user_id, canvas_assignment_id) WHERE canvas_assignment_id IS NOT NULL DO NOTHING
      `;
    }
    await sql`UPDATE app.notes SET canvas_assignment_id = 920001 WHERE user_id = ${userId}::uuid AND note_id = ${starterId}::uuid`;

    async function drainJobs(
      mapId: string,
      kind: "classify" | "paper",
    ): Promise<void> {
      let processed = 0;
      while (await jobs.processNextStudyJob()) {
        processed += 1;
        if (processed > 100)
          throw new SeedError(
            "The synthetic job queue exceeded the expected seed workload",
          );
      }
      const failed = await sql<{ id: string }[]>`
        SELECT id FROM (SELECT DISTINCT ON (note_id) id, state FROM app.study_jobs
          WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid AND kind = ${kind}
          ORDER BY note_id, created_at DESC, id DESC) latest WHERE state = 'failed'
      `;
      if (failed.length)
        throw new SeedError(
          `A synthetic ${kind} job failed; inspect the preview's study jobs before continuing`,
        );
    }

    for (const module of [
      {
        name: "Operating Systems",
        root: osFolder,
        syllabus: osSyllabus,
        course: osCourse,
        reviewIds: [...osNotes.slice(0, 10), ...ownNotes].map(
          (note) => note.id,
        ),
      },
      {
        name: "Database Systems",
        root: dbFolder,
        syllabus: dbSyllabus,
        course: dbCourse,
        reviewIds: dbNotes.slice(0, 3).map((note) => note.id),
      },
    ]) {
      const previous = existing.find((map) => map.root_note_id === module.root);
      if (previous && previous.board_version > 0) continue;
      seedStage = `${module.name}: create map and propose topics`;
      const mapId =
        previous?.id ??
        (await mutations.createStudyMap(userId, {
          name: module.name,
          academicYear,
          rootNoteId: module.root,
          canvasCourseId: module.course,
          syllabusNoteId: module.syllabus,
        }));
      await mutations.syncStudyMaterials(userId, mapId);
      const map = await repository.getStudyMap(userId, mapId);
      if (!map.topics.length) {
        const source = await repository.loadStudySource(
          userId,
          module.syllabus,
        );
        const topics = await generation.proposeStudyTopics([source], []);
        await mutations.saveStudyTopics(userId, mapId, {
          version: map.version,
          topics: topics.map((topic) => ({ ...topic, reviewed: true })),
        });
      }
      seedStage = `${module.name}: classify materials and review associations`;
      await jobs.enqueueStudyJobs(userId, mapId, {
        kind: "classify",
        noteId: null,
      });
      await drainJobs(mapId, "classify");
      let snapshot = await repository.getStudyMapSnapshot(userId, mapId);
      for (const material of snapshot.materials.filter((material) =>
        module.reviewIds.includes(material.noteId),
      )) {
        if (material.overrides.sourceHash) continue;
        await mutations.reviewStudyMaterial(userId, mapId, {
          noteId: material.noteId,
          sourceHash: material.currentHash,
          taxonomyVersion: snapshot.map.taxonomyVersion,
          kind: material.kind,
          labels: material.labels,
          topics: Object.fromEntries(
            material.associations.map((association) => [
              association.topicId,
              association.relevance,
            ]),
          ),
        });
      }
      if (module.root === osFolder) {
        seedStage = "Operating Systems: extract and review past papers";
        for (const paper of papers.filter(
          (note) => !snapshot.papers.some((paper) => paper.noteId === note.id),
        )) {
          await jobs.enqueueStudyJobs(userId, mapId, {
            kind: "paper",
            noteId: paper.id,
          });
        }
        await drainJobs(mapId, "paper");
        snapshot = await repository.getStudyMapSnapshot(userId, mapId);
        for (const paper of snapshot.papers.filter(
          (paper) => paper.noteId !== fixedId(42) && !paper.reviewed,
        )) {
          await mutations.saveStudyPaper(userId, mapId, {
            noteId: paper.noteId,
            sourceHash: paper.currentHash,
            taxonomyVersion: snapshot.map.taxonomyVersion,
            reviewed: true,
            structure: paper.structure,
          });
        }
        const revision =
          "Revision added after review: File Systems journaling records intent before metadata writes.";
        await sql`UPDATE app.notes SET content = content || ${`\n\n${revision}`}, updated_at = NOW()
          WHERE user_id = ${userId}::uuid AND note_id = ${osNotes[8].id}::uuid AND position(${revision} in content) = 0`;
      }
      seedStage = `${module.name}: save initial board`;
      snapshot = await repository.getStudyMapSnapshot(userId, mapId);
      const board = emptyBoard();
      if (module.root === osFolder) {
        board.links.push({
          id: fixedId(900),
          source: `note:${osNotes[2].id}`,
          target: `note:${osNotes[0].id}`,
          label: "applies",
        });
      }
      await mutations.saveStudyBoard(userId, mapId, {
        version: snapshot.map.boardVersion,
        board,
      });
      console.log(
        `[study-map] Seeded ${module.name}: ${snapshot.map.topics.length} reviewed topics, ${snapshot.materials.length} classified materials, ${snapshot.papers.length} papers.`,
      );
    }

    console.log(
      "[study-map] Ready: reviewed and suggested associations, one stale note, two compatible reviewed papers, one unreviewed paper, and one older-syllabus paper.",
    );
  } finally {
    await sql.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    const detail =
      error instanceof SeedError
        ? error.message
        : "Check the preview configuration, migrations, storage bucket and study-job state; provider and database details are omitted.";
    console.error(
      `[study-map] Seed failed during ${seedStage}: ${detail} Existing data was preserved.`,
    );
    process.exitCode = 1;
  });
}
