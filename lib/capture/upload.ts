import { z } from "zod";

import {
  audioExtension,
  AUDIO_MEDIA_TYPES,
  isAudioMediaType,
  MAX_AUDIO_BYTES,
  type AudioMediaType,
} from "./audio";
import {
  imageExtension,
  IMAGE_MEDIA_TYPES,
  isImageMediaType,
  MAX_IMAGE_BYTES,
  type ImageMediaType,
} from "./image";
import { isPdfMediaType, MAX_PDF_BYTES, PDF_MEDIA_TYPE } from "./pdf";

/**
 * Everything the chat can hand over for reading: a screenshot, a PDF invoice, or
 * a recording of someone saying what they pay for.
 */
export const CAPTURE_MEDIA_TYPES = [
  ...IMAGE_MEDIA_TYPES,
  PDF_MEDIA_TYPE,
  ...AUDIO_MEDIA_TYPES,
] as const;

export type CaptureMediaType = (typeof CAPTURE_MEDIA_TYPES)[number];

/** Which reader a file goes to, and the `captures.kind` it is stored as. */
export type CaptureFileKind = "image" | "pdf" | "audio";

/** The largest an upload of any kind may be, for a store that holds them all. */
export const MAX_CAPTURE_BYTES = Math.max(
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_AUDIO_BYTES,
);

export function isCaptureMediaType(value: string): value is CaptureMediaType {
  return isImageMediaType(value) || isPdfMediaType(value) || isAudioMediaType(value);
}

export function captureFileKind(mediaType: CaptureMediaType): CaptureFileKind {
  if (isPdfMediaType(mediaType)) {
    return "pdf";
  }

  return isAudioMediaType(mediaType) ? "audio" : "image";
}

export function maxCaptureBytes(mediaType: CaptureMediaType): number {
  if (isPdfMediaType(mediaType)) {
    return MAX_PDF_BYTES;
  }

  return isAudioMediaType(mediaType) ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
}

export function captureExtension(mediaType: CaptureMediaType): string {
  if (isPdfMediaType(mediaType)) {
    return "pdf";
  }

  return isAudioMediaType(mediaType)
    ? audioExtension(mediaType as AudioMediaType)
    : imageExtension(mediaType as ImageMediaType);
}

/**
 * The browser describes the file it is about to send, so the upload is signed
 * for that content type and refused before any bytes move when it is not
 * something a reader can read. The size ceiling is the one for that kind: a
 * screenshot has no business being as large as a document.
 */
export const fileCaptureSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    mediaType: z.enum(CAPTURE_MEDIA_TYPES),
    byteSize: z.number().int().positive().max(MAX_CAPTURE_BYTES),
  })
  .strict()
  .superRefine((input, context) => {
    const limit = maxCaptureBytes(input.mediaType);

    if (input.byteSize > limit) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        type: "number",
        maximum: limit,
        inclusive: true,
        path: ["byteSize"],
        message: `a ${input.mediaType} upload must be ${limit} bytes or smaller`,
      });
    }
  });

export type FileCaptureInput = z.infer<typeof fileCaptureSchema>;

export type FileCaptureResult =
  | { success: true; input: FileCaptureInput }
  | { success: false; issues: { field: string; message: string }[] };

export function parseFileCaptureBody(body: unknown): FileCaptureResult {
  const parsed = fileCaptureSchema.safeParse(body);

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
