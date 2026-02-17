// Storage provider base class (MIT License - Notea)
// Defines interface for all storage backends (S3, MinIO, etc.)

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
  readonly content?: string;
  readonly meta?: Readonly<Record<string, string>>;
  readonly contentType?: string;
  readonly buffer?: Buffer;
}

/**
 * Abstract base class for storage providers
 * Handles path prefixing and defines the storage interface
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

  /**
   * Generate a signed URL for temporary access to an object
   */
  abstract getSignUrl(path: string, expiresIn?: number): Promise<string>;

  /**
   * Check if an object exists in storage
   */
  abstract hasObject(path: string): Promise<boolean>;

  /**
   * Retrieve object content as string
   */
  abstract getObject(
    path: string,
    isCompressed?: boolean
  ): Promise<string | undefined>;

  /**
   * Retrieve only metadata for an object
   */
  abstract getObjectMeta(
    path: string
  ): Promise<Record<string, string> | undefined>;

  /**
   * Retrieve object content and metadata together
   */
  abstract getObjectAndMeta(
    path: string,
    isCompressed?: boolean
  ): Promise<ObjectMetadata>;

  /**
   * Store an object with optional metadata and headers
   */
  abstract putObject(
    path: string,
    raw: string | Buffer,
    options?: ObjectOptions,
    isCompressed?: boolean
  ): Promise<void>;

  /**
   * Delete an object from storage
   */
  abstract deleteObject(path: string): Promise<void>;

  /**
   * Copy an object and optionally update its metadata
   */
  abstract copyObject(
    fromPath: string,
    toPath: string,
    options: ObjectOptions
  ): Promise<void>;
}
