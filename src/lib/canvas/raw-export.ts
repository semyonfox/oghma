import { Zip, ZipDeflate } from "fflate";
import { normalizeCanvasCourseSelection } from "./id";
import { collectAccountArchive } from "./raw-export-account";
import { collectCourseArchive } from "./raw-export-course";
import { addJsonEntry } from "./raw-export-helpers";
import type {
  CanvasRawExportArchive,
  RawExportClient,
  RawExportDownloadClient,
  RawExportOptions,
  RawExportState,
} from "./raw-export-types";

export type { CanvasRawExportArchive };

const README_PATH = "README.txt";
const README = [
  "Canvas read-only archive",
  "",
  "_account/ holds your profile, inbox, calendar, planner and personal files.",
  "Each course folder holds that course's pages, modules, assignments, quizzes,",
  "discussions, grades and files. _groups/ holds group content.",
  "",
  "_canvas-export-manifest.json lists what was collected and",
  "_canvas-export-summary.txt lists anything Canvas did not let us download.",
  "",
].join("\n");

class ExportCancelledError extends Error {}

function emptyArchive(options: RawExportOptions) {
  const archive: CanvasRawExportArchive = {
    downloads: [],
    textEntries: [],
    skipped: [],
    manifest: {
      generated_at: new Date().toISOString(),
      export_type: "canvas-full-readonly-archive",
      courses: [],
    },
  };
  if (Array.isArray(options.skipped)) archive.skipped.push(...options.skipped);
  if (options.courseDiscovery) {
    archive.manifest.course_discovery = options.courseDiscovery;
  }
  const state: RawExportState = {
    seenPaths: new Set<string>([README_PATH]),
    seenFileIds: new Set<string>(),
    seenGroupIds: new Set<string>(),
    skipped: archive.skipped,
  };
  // first entry, so a streamed export sends bytes before any Canvas request
  archive.textEntries.push({ path: README_PATH, content: README });
  return { archive, state };
}

async function collectArchive(
  client: RawExportClient,
  courses: unknown[],
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  await collectAccountArchive(client, archive, state);
  for (const courseValue of courses) {
    const course = normalizeCanvasCourseSelection(courseValue);
    await collectCourseArchive(client, course, archive, state);
  }
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    "_canvas-export-manifest.json",
    {
      ...archive.manifest,
      binary_file_count: archive.downloads.length,
      generated_file_count: archive.textEntries.length + 2,
      skipped_count: archive.skipped.length,
    },
  );
}

export async function discoverCanvasRawExportEntries(
  client: RawExportClient,
  courses: unknown[],
  options: RawExportOptions = {},
) {
  const { archive, state } = emptyArchive(options);
  await collectArchive(client, courses, archive, state);
  return archive;
}

function compressionLevel(path: string): 1 | 6 {
  const lower = path.toLowerCase();
  return lower.endsWith(".json") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".html")
    ? 6
    : 1;
}

function pushTextEntry(zip: Zip, path: string, text: string) {
  const entry = new ZipDeflate(path, { level: 6 });
  zip.add(entry);
  entry.push(new TextEncoder().encode(text), true);
}

function exportSummary(
  archive: CanvasRawExportArchive,
  downloaded: number,
  skipped: string[],
) {
  return [
    "Canvas full read-only archive",
    `Generated metadata/content files: ${archive.textEntries.length}`,
    `Downloaded binary files: ${downloaded}`,
    `Skipped files/resources: ${skipped.length}`,
    "",
    ...skipped.map((item) => `- ${item}`),
  ].join("\n");
}

/**
 * Stream a full Canvas archive as a ZIP while it is being discovered.
 *
 * A full export makes hundreds of sequential Canvas requests, so waiting for
 * discovery before the first byte would trip proxy response timeouts. The
 * archive is written as it is collected instead: before each Canvas request,
 * everything gathered so far is flushed into the ZIP. Downloads wait for the
 * reader, so a slow client holds at most about one file in memory, and a
 * disconnect stops further Canvas requests.
 */
export function createCanvasRawExportZipStream(
  client: RawExportClient & RawExportDownloadClient,
  courses: unknown[],
  options: RawExportOptions = {},
) {
  let cancelled = false;
  let closed = false;
  let zip: Zip | null = null;
  let wake: (() => void) | null = null;
  const signal = () => {
    wake?.();
    wake = null;
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const archiveZip = new Zip();
      zip = archiveZip;
      archiveZip.ondata = (error, data, final) => {
        if (closed) return;
        if (error) {
          closed = true;
          controller.error(error);
          return;
        }
        if (data.length > 0) controller.enqueue(data);
        if (final) {
          closed = true;
          controller.close();
        }
      };
      const ready = async () => {
        while (!cancelled && (controller.desiredSize ?? 1) <= 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
        if (cancelled) throw new ExportCancelledError();
      };
      void writeArchive(client, courses, options, archiveZip, ready).catch(
        (error: unknown) => {
          if (closed) return;
          closed = true;
          controller.error(error);
        },
      );
    },
    pull: signal,
    cancel() {
      cancelled = true;
      closed = true;
      zip?.terminate();
      signal();
    },
  });
}

async function writeArchive(
  client: RawExportClient & RawExportDownloadClient,
  courses: unknown[],
  options: RawExportOptions,
  zip: Zip,
  ready: () => Promise<void>,
) {
  const { archive, state } = emptyArchive(options);
  const downloadSkipped: string[] = [];
  let textWritten = 0;
  let downloadsWritten = 0;
  let downloaded = 0;

  const flush = async () => {
    await ready();
    while (textWritten < archive.textEntries.length) {
      const entry = archive.textEntries[textWritten++];
      pushTextEntry(zip, entry.path, entry.content);
      // only the count is needed later, so release the text once written
      entry.content = "";
    }
    while (downloadsWritten < archive.downloads.length) {
      const entry = archive.downloads[downloadsWritten++];
      await ready();
      const result = await client.downloadFile(entry.file.url);
      if (result.forbidden || !result.buffer) {
        downloadSkipped.push(`${entry.path}: ${result.error ?? "restricted"}`);
        continue;
      }
      const zipEntry = new ZipDeflate(entry.path, {
        level: compressionLevel(entry.path),
      });
      zip.add(zipEntry);
      zipEntry.push(result.buffer, true);
      downloaded += 1;
    }
  };

  const flushingClient: RawExportClient = {
    getPath: async (path) => {
      await flush();
      return client.getPath(path);
    },
    getPaginatedPath: async (path) => {
      await flush();
      return client.getPaginatedPath(path);
    },
  };

  await collectArchive(flushingClient, courses, archive, state);
  await flush();
  const skipped = [...archive.skipped, ...downloadSkipped];
  pushTextEntry(
    zip,
    "_canvas-export-summary.txt",
    `${exportSummary(archive, downloaded, skipped)}\n`,
  );
  zip.end();
}
