// Storage provider base class (MIT License - Notea)
// Defines interface for all storage backends (S3, MinIO, etc.)

import type { Readable } from 'stream';

/**
 * Configuration options for storage providers
 */
export interface StoreProviderConfig {
  /** Optional prefix for all object paths */
  readonly prefix?: string;
}

/**
 * Options for storing objects with metadata and headers
 */
export interface ObjectOptions {
  /** Custom metadata tags */
  readonly meta?: Readonly<Record<string, string>>;
  /** MIME type for the object */
  readonly contentType?: string;
  /** HTTP cache and content headers */
  readonly headers?: Readonly<{
    cacheControl?: string;
    contentDisposition?: string;
    contentEncoding?: string;
  }>;
}

/**
 * Metadata returned when retrieving objects
 */
export interface ObjectMetadata {
  readonly meta?: Readonly<Record<string, string>>;
  readonly contentType?: string;
  /** Known object byte length when the storage backend returned it. */
  readonly contentLength?: number;
  readonly buffer?: Buffer;
}

/** Thrown by `getObjectStream` when the object is confirmed missing. */
export class ObjectNotFoundError extends Error {
  constructor() {
    super('Storage object not found');
    this.name = 'ObjectNotFoundError';
  }
}

export interface ExternalSignOptions {
  /** Serve the object as a download with this filename. */
  readonly downloadName?: string;
}

export interface ObjectStream {
  readonly body: Readable;
  readonly contentType?: string;
  readonly contentLength?: number;
}

/**
 * Abstract base class for storage providers
 * Handles path prefixing and defines the storage interface.
 *
 * Reads report a confirmed miss as false, `undefined`, `{}` or
 * `ObjectNotFoundError` (streams), and reject on any other storage failure so
 * an outage is never mistaken for absence.
 */
export abstract class StoreProvider {
  protected readonly prefix?: string;

  constructor(config: StoreProviderConfig) {
    // Remove trailing slash and add it back if prefix exists
    this.prefix = config.prefix?.replace(/\/$/, '');
    if (this.prefix) {
      this.prefix += '/';
    }
  }

  /**
   * Construct full object path with prefix
   */
  protected getPath(...paths: string[]): string {
    return this.prefix ? this.prefix + paths.join('/') : paths.join('/');
  }

  /** Signed GET URL for consumers on the internal storage network. */
  abstract getSignUrl(path: string, expiresIn?: number): Promise<string>;

  /** Signed GET URL for consumers outside the homelab, such as GPU workers and browsers. */
  abstract getExternalSignUrl(
    path: string,
    expiresIn?: number,
    options?: ExternalSignOptions
  ): Promise<string>;

  /** Generate a signed URL that permits uploading one object. */
  abstract getPutSignUrl(
    path: string,
    expiresIn?: number,
    contentType?: string,
    ifNoneMatch?: boolean
  ): Promise<string>;

  /**
   * Check if an object exists in storage
   */
  abstract hasObject(path: string): Promise<boolean>;

  /**
   * Retrieve object content as a UTF-8 string
   */
  abstract getObject(path: string): Promise<string | undefined>;

  /**
   * Retrieve only metadata for an object. A successful HEAD may return an
   * empty record; `undefined` means the object was confirmed missing.
   */
  abstract getObjectMeta(
    path: string
  ): Promise<Pick<ObjectMetadata, "meta" | "contentType" | "contentLength"> | undefined>;

  /**
   * Retrieve object bytes and metadata together; `{}` means confirmed missing
   */
  abstract getObjectAndMeta(path: string): Promise<ObjectMetadata>;

  /** Stream an object without buffering it in memory. */
  abstract getObjectStream(path: string): Promise<ObjectStream>;

  /**
   * Store an object with optional metadata and headers
   */
  abstract putObject(
    path: string,
    raw: string | Buffer,
    options?: ObjectOptions
  ): Promise<void>;

  /**
   * Delete an object from storage
   */
  abstract deleteObject(path: string, signal?: AbortSignal): Promise<void>;

  /**
   * Delete every object below a storage prefix. Callers must pass a narrowly
   * scoped, user-owned prefix; this is used for untracked Marker assets.
   */
  abstract deletePrefix(path: string): Promise<void>;

  /**
   * Copy an object and optionally update its metadata
   */
  abstract copyObject(
    fromPath: string,
    toPath: string,
    options: ObjectOptions
  ): Promise<void>;
}
