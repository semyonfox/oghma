import { inferFileType } from "@/lib/notes/utils/file-spec";

export function isStudyBinary(note: {
  title: string;
  mime_type: string | null;
  s3_key: string | null;
}): boolean {
  if (inferFileType(note.title, note.mime_type) !== "note") return true;
  if (!note.s3_key) return false;
  const mime = note.mime_type?.split(";", 1)[0].trim().toLowerCase();
  if (mime?.startsWith("text/") || mime === "application/json" || mime === "application/xml") return false;
  if (/\.(?:md|markdown|txt|text|csv|json|xml|html?|rst)$/i.test(note.title)) return false;
  return true;
}
