// extracted from Notea (MIT License)
// original: libs/server/store/providers/base.ts

export interface StoreProviderConfig {
  prefix?: string;
}

export interface ObjectOptions {
  meta?: { [key: string]: string };
  contentType?: string;
  headers?: {
    cacheControl?: string;
    contentDisposition?: string;
    contentEncoding?: string;
  };
}

export abstract class StoreProvider {
  prefix?: string;

  constructor({ prefix }: StoreProviderConfig) {
    this.prefix = prefix?.replace(/\/$/, '');

    if (this.prefix) {
      this.prefix += '/';
    }
  }

  getPath(...paths: string[]) {
    return this.prefix + paths.join('/');
  }

  // get signed URL for presigned access
  abstract getSignUrl(path: string, expires: number): Promise<string | null>;

  // check if object exists
  abstract hasObject(path: string): Promise<boolean>;

  // get object content
  abstract getObject(
    path: string,
    isCompressed?: boolean
  ): Promise<string | undefined>;

  // get object metadata
  abstract getObjectMeta(
    path: string
  ): Promise<{ [key: string]: string } | undefined>;

  // get object and metadata together
  abstract getObjectAndMeta(
    path: string,
    isCompressed?: boolean
  ): Promise<{
    content?: string;
    meta?: { [key: string]: string };
    contentType?: string;
    buffer?: Buffer;
  }>;

  // store object
  abstract putObject(
    path: string,
    raw: string | Buffer,
    headers?: ObjectOptions,
    isCompressed?: boolean
  ): Promise<void>;

  // delete object
  abstract deleteObject(path: string): Promise<void>;

  // copy object (can be used to update meta)
  abstract copyObject(
    fromPath: string,
    toPath: string,
    options: ObjectOptions
  ): Promise<void>;
}
