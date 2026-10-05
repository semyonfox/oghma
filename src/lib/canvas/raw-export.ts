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

export async function discoverCanvasRawExportEntries(
  client: RawExportClient,
  courses: unknown[],
  options: RawExportOptions = {},
) {
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
    seenPaths: new Set<string>(),
    seenFileIds: new Set<string>(),
    seenGroupIds: new Set<string>(),
    skipped: archive.skipped,
  };
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

export function createCanvasRawExportZipStream(
  client: RawExportDownloadClient,
  archive: CanvasRawExportArchive,
) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip();
      let closed = false;
      zip.ondata = (error, data, final) => {
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
      void writeArchive(client, archive, zip).catch((error: unknown) => {
        if (!closed) controller.error(error);
      });
    },
  });
}

async function writeArchive(
  client: RawExportDownloadClient,
  archive: CanvasRawExportArchive,
  zip: Zip,
) {
  const skipped = [...archive.skipped];
  let downloaded = 0;
  for (const entry of archive.textEntries) {
    pushTextEntry(zip, entry.path, entry.content);
  }
  for (const entry of archive.downloads) {
    const result = await client.downloadFile(entry.file.url);
    if (result.forbidden || !result.buffer) {
      skipped.push(`${entry.path}: ${result.error ?? "restricted"}`);
      continue;
    }
    const zipEntry = new ZipDeflate(entry.path, {
      level: compressionLevel(entry.path),
    });
    zip.add(zipEntry);
    zipEntry.push(new Uint8Array(result.buffer), true);
    downloaded += 1;
  }
  const summary = `${exportSummary(archive, downloaded, skipped)}\n`;
  pushTextEntry(zip, "_canvas-export-summary.txt", summary);
  zip.end();
}
