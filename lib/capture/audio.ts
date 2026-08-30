/**
 * What a browser recording arrives as, and what a transcriber will listen to.
 * MediaRecorder produces WebM/Opus in Chrome and Firefox and MP4/AAC in Safari;
 * the rest are here for a voice memo someone already has on disk.
 */
export const AUDIO_MEDIA_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const;

export type AudioMediaType = (typeof AUDIO_MEDIA_TYPES)[number];

/** A minute of Opus is well under a megabyte; ten is far past a voice note. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/**
 * The recorder stops itself here, so a microphone left open does not become a
 * long recording nobody meant to make or pay to transcribe.
 */
export const MAX_RECORDING_MS = 120_000;

/**
 * What the recorder asks for, best first: Opus in a WebM container is what
 * Chrome and Firefox record and is small, and MP4 is what Safari records.
 * `mimeType` carries codec parameters, which the capture itself is stored
 * without.
 */
export const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

const EXTENSIONS: Record<AudioMediaType, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

export function audioExtension(mediaType: AudioMediaType): string {
  return EXTENSIONS[mediaType];
}

export function isAudioMediaType(value: string): value is AudioMediaType {
  return (AUDIO_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * A recording's type as it is stored: `audio/webm;codecs=opus` is a WebM file,
 * and the codec parameters are the recorder's business rather than the bucket's.
 */
export function baseMediaType(value: string): string {
  return value.split(";")[0].trim().toLowerCase();
}
