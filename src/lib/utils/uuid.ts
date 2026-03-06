import { v7 as uuidv7 } from 'uuid';

/**
 * Generate a UUID v7 (sortable, cryptographically secure)
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 */
export function generateUUID(): string {
  return uuidv7();
}

/**
 * Validate if a string is a valid UUID v7
 */
export function isValidUUID(id: string): boolean {
  const uuidv7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidv7Pattern.test(id);
}
