import { v7 as uuidv7 } from "uuid";

/**
 * Generate a UUID v7 (sortable, cryptographically secure)
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 */
export function generateUUID(): string {
  return uuidv7();
}

/**
 * Validate any UUID format (v4 or v7)
 * Use this for accepting UUIDs from any source (DB, external, etc.)
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}
