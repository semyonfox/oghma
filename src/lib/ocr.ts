// document text extraction via self-hosted Marker on EC2 (primary)
// falls back to Datalab Convert API if EC2 is unavailable
//
// EC2 Marker: synchronous POST /marker/upload (g4dn.xlarge GPU, auto-starts)
// Datalab: async submit+poll POST /api/v1/convert

import { ensureMarkerRunning } from "./marker-ec2";

export interface MarkerResult {
  text: string;
  chunks: string[];
  source: "ec2" | "datalab" | "pdf-parse";
}

const DATALAB_URL = "https://www.datalab.to/api/v1/convert";
const POLL_INTERVAL_MS = 2_000;
const TOTAL_TIMEOUT_MS = 120_000;

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function mimeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export async function extractWithMarker(
  buffer: Buffer,
  filename: string,
): Promise<MarkerResult> {
  // primary: self-hosted Marker on EC2 (GPU)
  if (process.env.MARKER_EC2_INSTANCE_ID) {
    try {
      const markerUrl = await ensureMarkerRunning();
      const result = await callEc2Marker(
        `${markerUrl}/marker/upload`,
        buffer,
        filename,
      );
      if (result) return { ...result, source: "ec2" };
    } catch (err: any) {
      console.warn(`EC2 Marker error: ${err?.message ?? err}`);
    }
  }

  // fallback: Datalab hosted API
  const datalabKey = process.env.DATALAB_API_KEY;
  if (datalabKey) {
    try {
      const result = await callDatalab(buffer, filename, datalabKey);
      if (result) return { ...result, source: "datalab" };
    } catch (err: any) {
      console.warn(`Datalab error: ${err?.message ?? err}`);
    }
  }

  throw new Error("Marker unavailable (both EC2 and Datalab failed)");
}

// self-hosted marker_server on EC2 — synchronous single-request
async function callEc2Marker(
  url: string,
  buffer: Buffer,
  filename: string,
): Promise<{ text: string; chunks: string[] } | null> {
  const form = new FormData();
  const mime = mimeFromFilename(filename);
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mime }),
    filename,
  );
  form.append("output_format", "markdown");
  form.append("paginate_output", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(
        `EC2 Marker ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }

    const json = await res.json();
    if (!json.success)
      throw new Error(json.error ?? "EC2 Marker returned success=false");

    const text = typeof json.output === "string" ? json.output : "";
    const chunks = splitMarkdownToChunks(text);
    return { text, chunks };
  } finally {
    clearTimeout(timeout);
  }
}

// Datalab Convert API — async submit + poll
async function callDatalab(
  buffer: Buffer,
  filename: string,
  apiKey: string,
): Promise<{ text: string; chunks: string[] } | null> {
  const form = new FormData();
  const mime = mimeFromFilename(filename);
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mime }),
    filename,
  );
  form.append("output_format", "markdown");
  form.append("paginate", "true");

  const submitRes = await fetch(DATALAB_URL, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
  });

  if (submitRes.status === 429) {
    throw new Error("Datalab rate limited");
  }

  if (!submitRes.ok) {
    throw new Error(
      `Datalab submit ${submitRes.status}: ${(await submitRes.text()).slice(0, 200)}`,
    );
  }

  const submitJson = await submitRes.json();
  if (!submitJson.success)
    throw new Error(submitJson.error ?? "Datalab submit failed");

  const checkUrl = submitJson.request_check_url;
  if (!checkUrl) throw new Error("Datalab did not return request_check_url");

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(checkUrl, {
      headers: { "X-API-Key": apiKey },
    });

    if (!pollRes.ok) {
      throw new Error(
        `Datalab poll ${pollRes.status}: ${(await pollRes.text()).slice(0, 200)}`,
      );
    }

    const result = await pollRes.json();
    if (result.status === "processing") continue;
    if (result.status === "failed")
      throw new Error(result.error ?? "Datalab conversion failed");

    if (result.status === "complete") {
      const text = typeof result.markdown === "string" ? result.markdown : "";
      return { text, chunks: splitMarkdownToChunks(text) };
    }
  }

  throw new Error("Datalab conversion timed out");
}

function splitMarkdownToChunks(markdown: string, targetSize = 500): string[] {
  if (!markdown?.trim()) return [];

  const pages = markdown.split(/\n-{3,}\n/);
  const chunks: string[] = [];

  for (const page of pages) {
    const sections = page.split(/(?=^#{1,3}\s)/m).filter((s) => s.trim());
    let current = "";
    for (const section of sections) {
      if ((current + section).length > targetSize && current.trim()) {
        chunks.push(current.trim());
        current = section;
      } else {
        current += "\n" + section;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }

  return chunks;
}
