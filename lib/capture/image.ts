import { z } from "zod";

/**
 * What a vision model accepts, and what a screenshot actually is. Anything else
 * is refused at the request rather than stored and failed later.
 */
export const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

/** A phone screenshot is under a megabyte; five is the model's own per-image ceiling. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<ImageMediaType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function imageExtension(mediaType: ImageMediaType): string {
  return EXTENSIONS[mediaType];
}

export function isImageMediaType(value: string): value is ImageMediaType {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * The browser describes the file it is about to send, so the upload is signed
 * for that content type and refused before any bytes move when it is not an
 * image the reader can read.
 */
export const imageCaptureSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    mediaType: z.enum(IMAGE_MEDIA_TYPES),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(MAX_IMAGE_BYTES, `an image must be ${MAX_IMAGE_BYTES} bytes or smaller`),
  })
  .strict();

export type ImageCaptureInput = z.infer<typeof imageCaptureSchema>;

export type ImageCaptureResult =
  | { success: true; input: ImageCaptureInput }
  | { success: false; issues: { field: string; message: string }[] };

export function parseImageCaptureBody(body: unknown): ImageCaptureResult {
  const parsed = imageCaptureSchema.safeParse(body);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    };
  }

  return { success: true, input: parsed.data };
}
