/** Return the requested public fields without changing the original object. */
export function filterNoteFields<T extends object>(
  note: T,
  fields?: readonly string[],
): Partial<T> {
  if (!fields || fields.length === 0) {
    return note;
  }

  const filtered: Partial<T> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(note, field)) {
      const key = field as keyof T;
      filtered[key] = note[key];
    }
  }
  return filtered;
}
