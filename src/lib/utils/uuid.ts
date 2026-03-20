import { v7 as uuidv7 } from 'uuid';
// Re-export unified validators from uuid-validation.js for backwards compatibility
export { isValidUUID, isValidUUIDv7, getValidatedUUID, getValidatedUUIDv7 } from '@/lib/uuid-validation';

/**
 * Generate a UUID v7 (sortable, cryptographically secure)
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 */
export function generateUUID(): string {
  return uuidv7();
}
