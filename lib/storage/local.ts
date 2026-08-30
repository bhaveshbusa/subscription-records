import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import {
  ObjectMissingError,
  UPLOAD_URL_TTL_SECONDS,
  type ObjectStore,
} from "./objects";

/** Git-ignored, outside `public/`, so a stored image is never served as a static file. */
export const LOCAL_STORAGE_DIRECTORY = ".captures";

/** The route the browser PUTs to when there is no bucket; development only. */
export const LOCAL_UPLOAD_PATH = "/api/captures/upload";

function pathFor(root: string, key: string): string {
  const base = resolve(root);
  const path = resolve(join(base, key));

  /** A key comes from this server, but a `..` in one must never escape the store. */
  if (path !== base && !path.startsWith(base + sep)) {
    throw new Error(`refusing to use ${key} outside the capture store`);
  }

  return path;
}

/** The disk store, unlike a bucket, takes its uploads through this server. */
export type LocalObjectStore = ObjectStore & Required<Pick<ObjectStore, "write">>;

/**
 * A disk-backed stand-in so screenshot capture can be exercised on a laptop with
 * no bucket credentials. It is only ever selected in development: a preview or
 * production deployment has no writable disk and, more to the point, files there
 * belong in the private bucket.
 */
export function localStore(root: string = LOCAL_STORAGE_DIRECTORY): LocalObjectStore {
  return {
    label: "local",
    async presignUpload({ key, mediaType }) {
      return {
        url: `${LOCAL_UPLOAD_PATH}?key=${encodeURIComponent(key)}`,
        headers: { "Content-Type": mediaType },
        expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000),
      };
    },
    async read(key) {
      const path = pathFor(root, key);
      const bytes = await readFile(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          throw new ObjectMissingError(key);
        }

        throw error;
      });

      return { bytes: new Uint8Array(bytes), mediaType: null };
    },
    async write(key, bytes) {
      const path = pathFor(root, key);

      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },
  };
}
