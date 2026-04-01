// S3 storage provider (MIT License - Notea)
// Supports AWS S3, MinIO, and compatible S3 endpoints

import { ObjectOptions, ObjectMetadata, StoreProvider, StoreProviderConfig } from './base';
import { toBuffer, toStr } from './str';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { streamToBuffer } from './utils';
import { Readable } from 'stream';
import { createLogger, Logger } from './logger';

/**
 * Check if an error indicates a missing object (NoSuchKey)
 * Handles variations from different S3 implementations
 */
function isNoSuchKeyError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  return (
    (error as any).code === 'NoSuchKey' ||
    message.includes('nosuchkey') ||
    message.includes('not found') ||
    name.includes('nosuchkey') ||
    (error as any).type === 'NotFound'
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
  /** Force path-style URLs (required for MinIO) */
  readonly pathStyle?: boolean;
  /** AWS region or equivalent */
  readonly region?: string;
}

/**
 * S3-compatible storage provider
 * Supports AWS S3, MinIO, and other S3-compatible endpoints
 */
export class StoreS3 extends StoreProvider {
  private readonly client: S3Client;
  private readonly config: Readonly<S3Config>;
  private readonly logger: Logger;

  constructor(config: S3Config) {
    super(config);
    this.config = config;
    this.logger = createLogger('store.s3');
    this.client = this.createS3Client(config);

    if (!config.accessKey || !config.secretKey) {
      this.logger.warn(
        'AWS credentials (STORAGE_ACCESS_KEY/STORAGE_SECRET_KEY) not provided. ' +
          'Attempting to use IAM role credentials or environment variables instead.'
      );
    }
  }

  /**
   * Create and configure S3Client instance
   */
  private createS3Client(config: S3Config): S3Client {
    const clientConfig: S3ClientConfig = {
      region: config.region ?? 'us-east-1',
      ...(config.endPoint && { endpoint: config.endPoint }),
      ...(config.pathStyle !== undefined && { forcePathStyle: config.pathStyle }),
    };

    // Only add credentials if both key and secret are provided
    if (config.accessKey && config.secretKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      };
    }

    return new S3Client(clientConfig);
  }

  /**
   * Generate a signed URL for temporary access
   * Handles MinIO with custom ports via presigning workaround
   * @see https://github.com/aws/aws-sdk-js-v3/issues/2121
   */
  async getSignUrl(path: string, expiresIn = 600): Promise<string> {
    // Use AWS SDK for S3-compatible endpoints
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
   * Check if an object exists
   */
  async hasObject(path: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.getPath(path),
        })
      );
      return true;
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        return false;
      }
      this.logger.error(error instanceof Error ? error : String(error), `Error checking if object exists: ${path}`);
      return false;
    }
  }

  /**
   * Retrieve object content as string
   */
   async getObject(path: string, isCompressed = false): Promise<string | undefined> {
     try {
       const result = await this.client.send(
         new GetObjectCommand({
           Bucket: this.config.bucket,
           Key: this.getPath(path),
         })
       );

       const buffer = await streamToBuffer(result.Body as Readable);
       return await toStr(buffer, isCompressed);
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        return undefined;
      }
      this.logger.error(error instanceof Error ? error : String(error), `Error retrieving object: ${path}`);
      throw error;
    }
  }

  /**
   * Retrieve object metadata only
   */
  async getObjectMeta(path: string): Promise<Record<string, string> | undefined> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.getPath(path),
        })
      );
      return result.Metadata;
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        return undefined;
      }
      this.logger.error(error instanceof Error ? error : String(error), `Error retrieving object metadata: ${path}`);
      throw error;
    }
  }

  /**
   * Retrieve object content and metadata together
   */
  async getObjectAndMeta(
    path: string,
    isCompressed = false
  ): Promise<ObjectMetadata> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: this.getPath(path),
        })
      );

       const buffer = await streamToBuffer(result.Body as Readable);

       return {
         content: await toStr(buffer, isCompressed),
         meta: result.Metadata,
         contentType: result.ContentType,
         buffer,
       };
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        return {};
      }
      this.logger.error(error instanceof Error ? error : String(error), `Error retrieving object and metadata: ${path}`);
      throw error;
    }
  }

  /**
   * Store an object with optional metadata and headers
   */
  async putObject(
    path: string,
    raw: string | Buffer,
    options?: ObjectOptions,
    isCompressed?: boolean
  ): Promise<void> {
    const fullPath = this.getPath(path);
    this.logger.debug(`Uploading object: ${fullPath}`);

     try {
       const body = Buffer.isBuffer(raw) ? raw : await toBuffer(raw, isCompressed);
       await this.client.send(
         new PutObjectCommand({
           Bucket: this.config.bucket,
           Key: fullPath,
           Body: body,
           Metadata: options?.meta as Record<string, string> | undefined,
          CacheControl: options?.headers?.cacheControl,
          ContentDisposition: options?.headers?.contentDisposition,
          ContentEncoding: options?.headers?.contentEncoding,
          ContentType: options?.contentType,
        })
      );
    } catch (error) {
      this.logger.error(error instanceof Error ? error : String(error), `Error uploading object: ${fullPath}`);
      throw error;
    }
  }

  /**
   * Delete an object
   */
  async deleteObject(path: string): Promise<void> {
    const fullPath = this.getPath(path);
    this.logger.debug(`Deleting object: ${fullPath}`);

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: fullPath,
        })
      );
    } catch (error) {
      this.logger.error(error instanceof Error ? error : String(error), `Error deleting object: ${fullPath}`);
      throw error;
    }
  }

  /**
   * Copy an object and optionally update its metadata
   */
  async copyObject(
    fromPath: string,
    toPath: string,
    options: ObjectOptions
  ): Promise<void> {
    const from = this.getPath(fromPath);
    const to = this.getPath(toPath);
    this.logger.debug(`Copying object from ${from} to ${to}`);

    const hasMetadata = options.meta && Object.keys(options.meta).length > 0;

    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.config.bucket,
          Key: to,
          CopySource: `${this.config.bucket}/${from}`,
          Metadata: options.meta as Record<string, string> | undefined,
          CacheControl: options.headers?.cacheControl,
          ContentDisposition: options.headers?.contentDisposition,
          ContentEncoding: options.headers?.contentEncoding,
          ContentType: options.contentType,
          MetadataDirective: hasMetadata ? 'REPLACE' : 'COPY',
        })
      );
    } catch (error) {
      this.logger.error(error instanceof Error ? error : String(error), `Error copying object from ${from} to ${to}`);
      throw error;
    }
  }
}