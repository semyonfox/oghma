// S3 storage provider (MIT License - Notea)
// Supports AWS S3, MinIO, and compatible S3 endpoints

import {
  type ExternalSignOptions,
  ObjectOptions,
  ObjectMetadata,
  ObjectNotFoundError,
  ObjectStream,
  StoreProvider,
  StoreProviderConfig,
} from './base';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

// an unreachable or wedged RustFS must fail the request instead of holding a
// route or worker forever. requestTimeout stops once response headers arrive,
// so long proxied downloads are not cut off; it does cover upload bodies
const CONNECTION_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * True only for a confirmed missing object. A missing bucket is a
 * misconfiguration and must surface as a failure, not as absence.
 */
function isMissingObjectError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === 'NoSuchBucket') return false;
  const { code, $metadata } = error as Error & {
    code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    error.name === 'NoSuchKey' ||
    error.name === 'NotFound' ||
    code === 'NoSuchKey' ||
    $metadata?.httpStatusCode === 404
  );
}

/**
 * S3 storage provider configuration
 */
export interface S3Config extends StoreProviderConfig {
  /** S3 bucket name */
  readonly bucket: string;
  /** AWS access key ID or equivalent */
  readonly accessKey?: string;
  /** AWS secret access key or equivalent */
  readonly secretKey?: string;
  /** Custom S3 endpoint (for MinIO or other S3-compatible services) */
  readonly endPoint?: string;
  /** Public endpoint used only to sign URLs consumed outside the homelab. */
  readonly publicEndPoint?: string;
  /** Force path-style URLs (required for MinIO) */
  readonly pathStyle?: boolean;
  /** AWS region or equivalent */
  readonly region?: string;
}

/**
 * Build an AWS SDK v3 config for S3-compatible storage, including R2/RustFS.
 */
export function createS3ClientConfig(config: S3Config): S3ClientConfig {
  const clientConfig: S3ClientConfig = {
    region: config.region ?? 'us-east-1',
    requestHandler: {
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      requestTimeout: REQUEST_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
    ...(config.endPoint && { endpoint: config.endPoint }),
    ...(config.pathStyle !== undefined && { forcePathStyle: config.pathStyle }),
  };

  if (config.accessKey && config.secretKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    };
  }

  return clientConfig;
}

export function createS3ConfigFromEnv(): S3Config {
  const bucket = process.env.STORAGE_BUCKET;

  if (!bucket) {
    throw new Error(
      'Missing required environment variable: STORAGE_BUCKET. ' +
        'Set it to your S3 bucket name.'
    );
  }

  return {
    bucket,
    accessKey: process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.STORAGE_SECRET_KEY,
    region: process.env.STORAGE_REGION || 'us-east-1',
    endPoint: process.env.STORAGE_ENDPOINT,
    publicEndPoint: process.env.STORAGE_PUBLIC_ENDPOINT,
    pathStyle: process.env.STORAGE_PATH_STYLE === 'true',
    prefix: process.env.STORAGE_PREFIX || 'oghma',
  };
}

export function createS3ClientFromEnv(): S3Client {
  return new S3Client(createS3ClientConfig(createS3ConfigFromEnv()));
}

async function readBody(body: GetObjectCommandOutput['Body']): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const bytes = await body.transformToByteArray();
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * S3-compatible storage provider
 * Supports AWS S3, MinIO, and other S3-compatible endpoints
 */
export class StoreS3 extends StoreProvider {
  private readonly client: S3Client;
  private readonly publicClient: S3Client;
  private readonly config: Readonly<S3Config>;

  constructor(config: S3Config) {
    super(config);
    this.config = config;
    this.client = new S3Client(createS3ClientConfig(config));
    this.publicClient = config.publicEndPoint
      ? new S3Client(createS3ClientConfig({ ...config, endPoint: config.publicEndPoint }))
      : this.client;
  }

  get bucket(): string {
    return this.config.bucket;
  }

  /**
   * Stream an object directly without buffering — used to proxy content through
   * the Next.js server so browsers never receive internal HTTP presigned URLs.
   */
  async getObjectStream(path: string): Promise<ObjectStream> {
    let result: GetObjectCommandOutput;
    try {
      result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: this.getPath(path),
        })
      );
    } catch (error) {
      if (isMissingObjectError(error)) throw new ObjectNotFoundError();
      throw error;
    }
    // the node runtime always returns an IncomingMessage; anything else means
    // this module was bundled for a runtime that cannot proxy the stream
    if (!(result.Body instanceof Readable)) {
      throw new Error('Storage returned a non-stream object body');
    }
    return {
      body: result.Body,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
    };
  }

  /** Sign a GET URL with the internal storage hostname. */
  async getSignUrl(path: string, expiresIn = 600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.getPath(path),
      }),
      { expiresIn }
    );
  }

  /**
   * Sign a GET URL with the public storage hostname for consumers outside the
   * homelab: GPU workers, and browsers following a download link.
   */
  async getExternalSignUrl(
    path: string,
    expiresIn = 600,
    options: ExternalSignOptions = {},
  ): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.getPath(path),
        ...(options.downloadName
          ? { ResponseContentDisposition: `attachment; filename="${options.downloadName}"` }
          : {}),
      }),
      { expiresIn }
    );
  }

  async getPutSignUrl(
    path: string,
    expiresIn = 600,
    contentType = 'application/octet-stream',
    ifNoneMatch = false,
  ): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.getPath(path),
        ContentType: contentType,
        ...(ifNoneMatch ? { IfNoneMatch: '*' } : {}),
      }),
      { expiresIn }
    );
  }

  async hasObject(path: string): Promise<boolean> {
    return (await this.getObjectMeta(path)) !== undefined;
  }

  async getObject(path: string): Promise<string | undefined> {
    const { buffer } = await this.getObjectAndMeta(path);
    return buffer?.toString('utf-8');
  }

  async getObjectMeta(
    path: string,
  ): Promise<
    Pick<ObjectMetadata, "meta" | "contentType" | "contentLength"> | undefined
  > {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.getPath(path),
        })
      );
      // A successful HEAD proves existence even when the object has no custom
      // user metadata. Keep `undefined` exclusively for a confirmed 404 so
      // callers can distinguish absence from both an empty metadata map and a
      // real storage failure.
      return {
        ...(result.Metadata ? { meta: result.Metadata } : {}),
        ...(result.ContentType ? { contentType: result.ContentType } : {}),
        ...(typeof result.ContentLength === "number"
          ? { contentLength: result.ContentLength }
          : {}),
      };
    } catch (error) {
      if (isMissingObjectError(error)) return undefined;
      throw error;
    }
  }

  async getObjectAndMeta(path: string): Promise<ObjectMetadata> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: this.getPath(path),
        })
      );
      return {
        meta: result.Metadata,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        buffer: await readBody(result.Body),
      };
    } catch (error) {
      if (isMissingObjectError(error)) return {};
      throw error;
    }
  }

  async putObject(
    path: string,
    raw: string | Buffer,
    options?: ObjectOptions,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.getPath(path),
        Body: raw,
        Metadata: options?.meta,
        CacheControl: options?.headers?.cacheControl,
        ContentDisposition: options?.headers?.contentDisposition,
        ContentEncoding: options?.headers?.contentEncoding,
        ContentType: options?.contentType,
      })
    );
  }

  async deleteObject(path: string, signal?: AbortSignal): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: this.getPath(path),
      }),
      { abortSignal: signal }
    );
  }

  /** Delete all objects under one narrow application-owned prefix. */
  async deletePrefix(path: string): Promise<void> {
    const normalized = path.replace(/^\/+/, "");
    if (!normalized || normalized.includes("..")) {
      throw new Error("Refusing to delete an unsafe storage prefix");
    }
    const fullPrefix = this.getPath(
      normalized.endsWith("/") ? normalized : `${normalized}/`,
    );

    let continuationToken: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: fullPrefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objects = (listed.Contents ?? [])
        .map((entry) => entry.Key)
        .filter((key): key is string => Boolean(key));
      if (objects.length > 0) {
        const deleted = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: {
              Objects: objects.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
        if (deleted.Errors?.length) {
          throw new Error(
            `Failed to delete ${deleted.Errors.length} storage object${deleted.Errors.length === 1 ? "" : "s"}`,
          );
        }
      }
      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  /**
   * Copy an object and optionally update its metadata
   */
  async copyObject(
    fromPath: string,
    toPath: string,
    options: ObjectOptions
  ): Promise<void> {
    const hasMetadata = options.meta && Object.keys(options.meta).length > 0;
    // CopySource is parsed as a URL path by the server, so keys with spaces,
    // `+`, `%`, `?` or `#` (vault and Canvas filenames) must be encoded
    const source = `${this.config.bucket}/${this.getPath(fromPath)}`
      .split('/')
      .map(encodeURIComponent)
      .join('/');

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        Key: this.getPath(toPath),
        CopySource: source,
        Metadata: options.meta,
        CacheControl: options.headers?.cacheControl,
        ContentDisposition: options.headers?.contentDisposition,
        ContentEncoding: options.headers?.contentEncoding,
        ContentType: options.contentType,
        MetadataDirective: hasMetadata ? 'REPLACE' : 'COPY',
      })
    );
  }
}
