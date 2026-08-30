import { randomUUID } from "node:crypto";

/**
 * An upload the browser can perform and nothing else: the URL it carries is a
 * write to one key with one content type, and it stops working when it expires.
 * Reads never leave the server, so no request the browser makes can fetch a
 * stored image back.
 */
export type PresignedUpload = {
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
};

export type StoredObject = {
  bytes: Uint8Array;
  mediaType: string | null;
};

export type ObjectStore = {
  /** `bucket` for R2 or S3; `local` for the development-only disk store. */
  label: "bucket" | "local";
  presignUpload(options: { key: string; mediaType: string }): Promise<PresignedUpload>;
  read(key: string): Promise<StoredObject>;
  /**
   * Only the disk store takes a write from this server: a bucket upload goes
   * from the browser to the signed URL and never through the app.
   */
  write?(key: string, bytes: Uint8Array): Promise<void>;
};

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

export class ObjectMissingError extends Error {
  constructor(key: string) {
    super(`no stored object at ${key}`);
    this.name = "ObjectMissingError";
  }
}

export type StorageEnvironment = {
  CAPTURE_STORAGE_BUCKET?: string;
  CAPTURE_STORAGE_ENDPOINT?: string;
  CAPTURE_STORAGE_REGION?: string;
  CAPTURE_STORAGE_ACCESS_KEY_ID?: string;
  CAPTURE_STORAGE_SECRET_ACCESS_KEY?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

export type BucketConfig = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Long enough to send a screenshot on a slow connection, short enough that a leaked URL is worthless. */
export const UPLOAD_URL_TTL_SECONDS = 300;

/**
 * Every credential or none. A half-configured bucket is a misconfiguration, not
 * a reason to fall back to something less private.
 */
export function readBucketConfig(
  environment: StorageEnvironment = process.env,
): BucketConfig | null {
  const bucket = environment.CAPTURE_STORAGE_BUCKET?.trim();
  const endpoint = environment.CAPTURE_STORAGE_ENDPOINT?.trim();
  const accessKeyId = environment.CAPTURE_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = environment.CAPTURE_STORAGE_SECRET_ACCESS_KEY?.trim();

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    bucket,
    endpoint,
    region: environment.CAPTURE_STORAGE_REGION?.trim() || "auto",
    accessKeyId,
    secretAccessKey,
  };
}

/** Per user, so one person's captures are never mistaken for another's. */
export function storageKeyPrefix(userId: string): string {
  return `captures/${userId}/`;
}

/** Random, and never derived from the file name the browser sent. */
export function storageKey(options: {
  userId: string;
  extension: string;
  id?: string;
}): string {
  return `${storageKeyPrefix(options.userId)}${options.id ?? randomUUID()}.${options.extension}`;
}
