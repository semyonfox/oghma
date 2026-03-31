import { isValidUUID } from "@/lib/utils/uuid";

export function normalizeSessionCardIds(rawCardIds: unknown): string[] {
  if (Array.isArray(rawCardIds)) {
    return rawCardIds.filter(
      (id): id is string => typeof id === "string" && isValidUUID(id),
    );
  }

  if (typeof rawCardIds === "string") {
    try {
      const parsed = JSON.parse(rawCardIds);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (id): id is string => typeof id === "string" && isValidUUID(id),
        );
      }
    } catch {
      return [];
    }
  }

  return [];
}

export function getSessionCardIdAtIndex(
  rawCardIds: unknown,
  index: number,
): string | null {
  if (!Number.isInteger(index) || index < 0) return null;

  const cardIds = normalizeSessionCardIds(rawCardIds);
  return cardIds[index] ?? null;
}
