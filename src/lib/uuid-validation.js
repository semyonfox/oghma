/**
 * Validate any UUID format (v4 or v7)
 * Use this for accepting UUIDs from any source (DB, external, etc.)
 */
export function isValidUUID(value) {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Strictly validate UUID v7 format
 * Use this for validating frontend-generated or application UUIDs
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 */
export function isValidUUIDv7(value) {
  if (typeof value !== 'string') return false;
  const uuidv7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidv7Pattern.test(value);
}

/**
 * Validate and throw error if invalid (loose validation)
 */
export function getValidatedUUID(value, fieldName = 'ID') {
  if (!isValidUUID(value)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID format`);
  }
  return value;
}

/**
 * Validate and throw error if not UUID v7 (strict validation)
 */
export function getValidatedUUIDv7(value, fieldName = 'ID') {
  if (!isValidUUIDv7(value)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID v7 format`);
  }
  return value;
}
