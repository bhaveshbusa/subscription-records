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
