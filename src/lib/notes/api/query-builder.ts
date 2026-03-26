/**
 * API Query Builder - Optimize API payloads
 * 
 * Problem: APIs often return full objects when only a few fields are needed
 * Solution: Support field selection to reduce payload size
 * 
 * Example:
 *   Before: GET /api/notes/123 → returns 500 KB full note
 *   After:  GET /api/notes/123?fields=id,title,updatedAt → 5 KB minimal object
 * 
 * Payload reduction: 99% on some requests!
 */

/**
 * Build optimized query parameters
 */
export interface QueryOptions {
  // Only include specific fields
  fields?: string[];
  // Pagination
  skip?: number;
  limit?: number;
  // Sorting
  sort?: string;
  order?: 'asc' | 'desc';
  // Filtering
  filter?: Record<string, any>;
}

/**
 * Build query string from options
 */
export function buildQueryString(options: QueryOptions): string {
  const params = new URLSearchParams();

  if (options.fields?.length) {
    params.append('fields', options.fields.join(','));
  }

  if (options.skip !== undefined) {
    params.append('skip', String(options.skip));
  }

  if (options.limit !== undefined) {
    params.append('limit', String(options.limit));
  }

  if (options.sort) {
    params.append('sort', options.sort);
  }

  if (options.order) {
    params.append('order', options.order);
  }

  if (options.filter) {
    params.append('filter', JSON.stringify(options.filter));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Common field selections for notes
 */
export const FIELD_PRESETS = {
  // Minimal: Just ID and title for listings
  minimal: ['id', 'title', 'updatedAt'],
  
  // Summary: Title, dates, and basic metadata
  summary: ['id', 'title', 'content', 'updatedAt', 'createdAt'],
  
  // Full: Everything (default)
  full: undefined,
};

/**
 * Estimate payload reduction
 */
export function estimatePayloadReduction(
  fullSize: number,
  fieldSelection: string[]
): number {
  // Very rough estimate: each field ~50-100 bytes
  // Full object might be 10-20x larger
  const selectedSize = fieldSelection.length * 75; // 75 bytes per field
  const reduction = ((fullSize - selectedSize) / fullSize) * 100;
  return Math.max(0, reduction);
}

/**
 * URL builder with query optimization
 */
export class APIUrl {
  private base: string;
  private path: string;
  private options: QueryOptions = {};

  constructor(base: string, path: string) {
    this.base = base;
    this.path = path;
  }

  /**
   * Select specific fields
   */
  fields(...fields: string[]): this {
    this.options.fields = fields;
    return this;
  }

  /**
   * Pagination
   */
  paginate(skip: number, limit: number): this {
    this.options.skip = skip;
    this.options.limit = limit;
    return this;
  }

  /**
   * Sorting
   */
  sort(field: string, order: 'asc' | 'desc' = 'asc'): this {
    this.options.sort = field;
    this.options.order = order;
    return this;
  }

  /**
   * Filtering
   */
  filter(criteria: Record<string, any>): this {
    this.options.filter = criteria;
    return this;
  }

  /**
   * Get full URL
   */
  toString(): string {
    const query = buildQueryString(this.options);
    return `${this.base}${this.path}${query}`;
  }

  /**
   * Get URL without base
   */
  toPath(): string {
    const query = buildQueryString(this.options);
    return `${this.path}${query}`;
  }
}

/**
 * Example usage:
 * 
 * // Get only title and updateDate for listings (reduces payload by ~80%)
 * const url = new APIUrl('/api', '/notes/123')
 *   .fields('id', 'title', 'updatedAt')
 *   .toString();
 * // Result: /api/notes/123?fields=id,title,updatedAt
 * 
 * // Get paginated results
 * const url = new APIUrl('/api', '/notes')
 *   .fields('id', 'title')
 *   .paginate(0, 50)
 *   .toString();
 * // Result: /api/notes?fields=id,title&skip=0&limit=50
 */
