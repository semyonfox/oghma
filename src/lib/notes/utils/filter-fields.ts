/**
 * Filter an object to only include requested fields
 */
export function filterNoteFields<T extends Record<string, any>>(
  note: T,
  fields?: string[]
): Partial<T> {
  if (!fields || fields.length === 0) {
    return note;
  }

  const filtered: Partial<T> = {};
  for (const field of fields) {
    if (field in note) {
      filtered[field as keyof T] = note[field];
    }
  }
  return filtered;
}
