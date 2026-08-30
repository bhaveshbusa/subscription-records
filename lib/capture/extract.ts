import { isSeedLoginEnabled } from "@/lib/deployment";
import { canonicalProvider } from "@/lib/subscriptions/write";

import { dedupeCandidates, type ExtractionCandidate } from "./candidates";
import {
  extractImageWithAnthropic,
  extractWithAnthropic,
  type MessageCreator,
} from "./anthropic";
import { extractWithFixtures, FIXTURE_EXTRACTOR_LABEL } from "./fixture-extractor";
import type { ImageMediaType } from "./image";

export type ExtractorMode = "claude" | "fixture";

export type Extraction = {
  mode: ExtractorMode;
  /** Shown next to the cards when the reader must know a model was not used. */
  notice: string | null;
  candidates: ExtractionCandidate[];
};

export class ExtractorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractorUnavailableError";
  }
}

export type ExtractorEnvironment = {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

export type ExtractOptions = {
  environment?: ExtractorEnvironment;
  createMessage?: MessageCreator;
  /** The day the message arrived, so "paid today" resolves to a date. */
  now?: Date;
};

/**
 * Claude when a server-side key exists. Without one, a labelled fixture pass in
 * development only: anywhere else extraction is unavailable and says so, rather
 * than pattern-matching while claiming to be the product.
 */
export async function extractCandidates(
  text: string,
  options: ExtractOptions = {},
): Promise<Extraction> {
  const environment = options.environment ?? process.env;
  const apiKey = environment.ANTHROPIC_API_KEY?.trim();

  if (apiKey) {
    const candidates = await extractWithAnthropic(text, {
      apiKey,
      model: environment.ANTHROPIC_MODEL?.trim() || undefined,
      createMessage: options.createMessage,
      now: options.now,
    });

    return {
      mode: "claude",
      notice: null,
      candidates: dedupeCandidates(candidates, canonicalProvider),
    };
  }

  if (environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test") {
    throw new ExtractorUnavailableError(
      isSeedLoginEnabled(environment)
        ? "Extraction is unavailable: this preview has no ANTHROPIC_API_KEY. Add one to the server environment - the development fixture extractor deliberately does not run here."
        : "Extraction is unavailable: ANTHROPIC_API_KEY is not set on the server.",
    );
  }

  return {
    mode: "fixture",
    notice: FIXTURE_EXTRACTOR_LABEL,
    candidates: dedupeCandidates(
      extractWithFixtures(text, options.now),
      canonicalProvider,
    ),
  };
}

export const IMAGE_FIXTURE_LABEL =
  "Development fixture reader - no Anthropic key, so the file name was pattern-matched and the image itself was not read.";

export type ImageToRead = {
  bytes: Uint8Array;
  mediaType: ImageMediaType;
  fileName: string;
};

/**
 * Claude reads the pixels when a server-side key exists. Without one, a
 * development pass over the file name so the upload path can be exercised on a
 * laptop, labelled so nobody mistakes `netflix-receipt.png` for a reading of the
 * receipt. Anywhere else an image without a key is unavailable and says so.
 */
export async function extractImageCandidates(
  image: ImageToRead,
  options: ExtractOptions = {},
): Promise<Extraction> {
  const environment = options.environment ?? process.env;
  const apiKey = environment.ANTHROPIC_API_KEY?.trim();

  if (apiKey) {
    const candidates = await extractImageWithAnthropic(image, {
      apiKey,
      model: environment.ANTHROPIC_MODEL?.trim() || undefined,
      createMessage: options.createMessage,
      now: options.now,
    });

    return {
      mode: "claude",
      notice: null,
      candidates: dedupeCandidates(candidates, canonicalProvider),
    };
  }

  if (environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test") {
    throw new ExtractorUnavailableError(
      isSeedLoginEnabled(environment)
        ? "Reading images is unavailable: this preview has no ANTHROPIC_API_KEY. Add one to the server environment - the development file-name reader deliberately does not run here."
        : "Reading images is unavailable: ANTHROPIC_API_KEY is not set on the server.",
    );
  }

  return {
    mode: "fixture",
    notice: IMAGE_FIXTURE_LABEL,
    candidates: dedupeCandidates(
      extractWithFixtures(image.fileName.replace(/[-_.]+/g, " "), options.now),
      canonicalProvider,
    ),
  };
}
