import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { MAX_CAPTURE_BYTES } from "@/lib/capture/upload";

import {
  ObjectMissingError,
  UPLOAD_URL_TTL_SECONDS,
  type BucketConfig,
  type ObjectStore,
} from "./objects";

/**
 * A private R2 or S3 bucket. The bucket has no public access and this module
 * never mints a readable URL: uploads are signed for one key and one content
 * type, and the bytes come back only through a server-side read.
 */
export function bucketStore(config: BucketConfig): ObjectStore {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });

  return {
    label: "bucket",
    async presignUpload({ key, mediaType }) {
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ContentType: mediaType,
        }),
        { expiresIn: UPLOAD_URL_TTL_SECONDS },
      );

      return {
        url,
        headers: { "Content-Type": mediaType },
        expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000),
      };
    },
    async read(key) {
      const object = await client
        .send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
        .catch((error: unknown) => {
          if (isMissing(error)) {
            throw new ObjectMissingError(key);
          }

          throw error;
        });

      if (!object.Body) {
        throw new ObjectMissingError(key);
      }

      if (object.ContentLength !== undefined && object.ContentLength > MAX_CAPTURE_BYTES) {
        throw new Error(
          `the stored object at ${key} is larger than the ${MAX_CAPTURE_BYTES} byte limit`,
        );
      }

      return {
        bytes: await object.Body.transformToByteArray(),
        mediaType: object.ContentType ?? null,
      };
    },
  };
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "NoSuchKey" || error.name === "NotFound")
  );
}
