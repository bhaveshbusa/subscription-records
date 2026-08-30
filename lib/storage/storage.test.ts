import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getObjectStore } from ".";
import { LOCAL_STORAGE_DIRECTORY, localStore } from "./local";
import {
  ObjectMissingError,
  readBucketConfig,
  StorageUnavailableError,
  storageKey,
  storageKeyPrefix,
  UPLOAD_URL_TTL_SECONDS,
} from "./objects";

const bucketEnvironment = {
  CAPTURE_STORAGE_BUCKET: "captures",
  CAPTURE_STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  CAPTURE_STORAGE_ACCESS_KEY_ID: "key",
  CAPTURE_STORAGE_SECRET_ACCESS_KEY: "secret",
};

const roots: string[] = [];

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "captures-"));

  roots.push(path);

  return path;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("readBucketConfig", () => {
  it("reads a fully configured bucket, defaulting the region R2 ignores", () => {
    expect(readBucketConfig(bucketEnvironment)).toEqual({
      bucket: "captures",
      endpoint: "https://account.r2.cloudflarestorage.com",
      region: "auto",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
  });

  it("is nothing when a credential is missing, so half a bucket is never used", () => {
    expect(
      readBucketConfig({ ...bucketEnvironment, CAPTURE_STORAGE_SECRET_ACCESS_KEY: "" }),
    ).toBeNull();
    expect(readBucketConfig({})).toBeNull();
  });
});

describe("storageKey", () => {
  it("scopes every object to the user it belongs to", () => {
    const key = storageKey({ userId: "user-1", extension: "png" });

    expect(key.startsWith(storageKeyPrefix("user-1"))).toBe(true);
    expect(key.endsWith(".png")).toBe(true);
  });

  it("never derives the key from anything a browser sent", () => {
    const first = storageKey({ userId: "user-1", extension: "png" });
    const second = storageKey({ userId: "user-1", extension: "png" });

    expect(first).not.toBe(second);
  });
});

describe("getObjectStore", () => {
  it("uses the private bucket whenever it is configured", () => {
    const store = getObjectStore({ ...bucketEnvironment, NODE_ENV: "production" });

    expect(store.label).toBe("bucket");
    /** Bucket bytes go browser to signed URL, never through the app. */
    expect(store.write).toBeUndefined();
  });

  it("falls back to disk only on a development machine", () => {
    expect(getObjectStore({ NODE_ENV: "development" }).label).toBe("local");
    expect(getObjectStore({ NODE_ENV: "test" }).label).toBe("local");
  });

  it("refuses to store captures anywhere in production without a bucket", () => {
    expect(() => getObjectStore({ NODE_ENV: "production" })).toThrow(
      StorageUnavailableError,
    );
  });
});

describe("localStore", () => {
  it("keeps files outside public/, so nothing is served as a static asset", () => {
    expect(LOCAL_STORAGE_DIRECTORY.startsWith("public")).toBe(false);
  });

  it("signs an upload for one key and expires it", async () => {
    const store = localStore(await root());
    const upload = await store.presignUpload({
      key: "captures/user-1/a.png",
      mediaType: "image/png",
    });

    expect(upload.url).toContain(encodeURIComponent("captures/user-1/a.png"));
    expect(upload.headers["Content-Type"]).toBe("image/png");
    expect(upload.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + UPLOAD_URL_TTL_SECONDS * 1000,
    );
  });

  it("reads back the bytes it wrote, on the server", async () => {
    const path = await root();
    const store = localStore(path);
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await store.write("captures/user-1/a.png", bytes);

    await expect(readFile(join(path, "captures/user-1/a.png"))).resolves.toHaveLength(4);
    expect((await store.read("captures/user-1/a.png")).bytes).toEqual(bytes);
  });

  it("reports a key nothing was ever uploaded to", async () => {
    await expect(localStore(await root()).read("captures/user-1/missing.png")).rejects.toThrow(
      ObjectMissingError,
    );
  });

  it("refuses a key that climbs out of the store", async () => {
    const path = await root();

    await expect(
      localStore(path).write("captures/../../escaped.png", new Uint8Array([1])),
    ).rejects.toThrow(/outside the capture store/);
    await expect(localStore(path).read("../escaped.png")).rejects.toThrow(
      /outside the capture store/,
    );
  });
});
