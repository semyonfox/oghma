// shared by the image, video and PDF viewers and the study board previews

export type Resolved<T> = { value: T } | { error: string };

function stringField(value: unknown, field: string): string {
  if (typeof value !== "object" || value === null || !(field in value)) return "";
  const candidate: unknown = Reflect.get(value, field);
  return typeof candidate === "string" ? candidate : "";
}

/**
 * A spec without sourcePath only knows the note id, so ask the server for the
 * storage key. That request is also the ownership check for this path.
 */
export async function resolveStorageKey(
  sourcePath?: string,
  fileId?: string,
): Promise<Resolved<string>> {
  if (sourcePath) return { value: sourcePath };
  if (!fileId) return { error: "no-source" };

  const response = await fetch(
    `/api/notes/${encodeURIComponent(fileId)}?fields=s3Key,content`,
  );
  if (!response.ok) return { error: "note-fetch-failed" };
  const note: unknown = await response.json();
  // Canvas imports keep the path in s3Key; older uploads kept it in content
  const storageKey = stringField(note, "s3Key") || stringField(note, "content");
  return storageKey ? { value: storageKey } : { error: "no-source" };
}

/**
 * Exchange a storage key for the URL the browser loads it from. The upload
 * route checks ownership here and again on every streamed request, so the
 * URL does not expire.
 */
export async function resolveStreamUrl(s3Key: string): Promise<Resolved<string>> {
  const response = await fetch(`/api/upload?path=${encodeURIComponent(s3Key)}`);
  if (!response.ok) return { error: `http-${response.status}` };
  const url = stringField(await response.json(), "url");
  // an empty src or fetch("") would load the current page instead
  return url ? { value: url } : { error: "no-url" };
}
