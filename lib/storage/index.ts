import { isSeedLoginEnabled } from "@/lib/deployment";

import { bucketStore } from "./bucket";
import { localStore } from "./local";
import {
  readBucketConfig,
  StorageUnavailableError,
  type ObjectStore,
  type StorageEnvironment,
} from "./objects";

/**
 * The private bucket when it is configured. Without it, a disk store in
 * development only: anywhere else uploads are unavailable and say so, because
 * the alternative is holding someone's receipts somewhere that outlives one
 * request or, worse, is readable.
 */
export function getObjectStore(
  environment: StorageEnvironment = process.env,
): ObjectStore {
  const config = readBucketConfig(environment);

  if (config) {
    return bucketStore(config);
  }

  if (environment.NODE_ENV === "development" || environment.NODE_ENV === "test") {
    return localStore();
  }

  throw new StorageUnavailableError(
    isSeedLoginEnabled(environment)
      ? "File capture is unavailable: this preview has no CAPTURE_STORAGE_* bucket credentials. Add them to the server environment - the development disk store deliberately does not run here."
      : "File capture is unavailable: CAPTURE_STORAGE_* bucket credentials are not set on the server.",
  );
}
