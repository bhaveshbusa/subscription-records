import { isSeedLoginEnabled } from "@/lib/deployment";
import { canonicalProvider } from "@/lib/subscriptions/write";

import { dedupeCandidates, type ExtractionCandidate } from "./candidates";
import {
  extractImageWithAnthropic,
  extractPdfTextWithAnthropic,
  extractPdfWithAnthropic,
  extractWithAnthropic,
  type MessageCreator,
} from "./anthropic";
import { extractWithFixtures, FIXTURE_EXTRACTOR_LABEL } from "./fixture-extractor";
import type { ImageMediaType } from "./image";
import {
  hasTextLayer,
  MAX_PDF_PAGES,
  pageCapNotice,
  type PdfTextLayer,
} from "./pdf";
import { readPdfTextLayer } from "./pdf-text";

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

export type PdfToRead = {
  bytes: Uint8Array;
  fileName: string;
};

/** A stored capture on its way to a reader, and which reader that is. */
export type FileToRead =
  | ({ kind: "image" } & ImageToRead)
  | ({ kind: "pdf" } & PdfToRead);

/** One entry point for a stored file, so a capture route reads any kind of one. */
export function extractFileCandidates(
  file: FileToRead,
  options: ExtractOptions = {},
): Promise<Extraction> {
  return file.kind === "pdf"
    ? extractPdfCandidates(file, options)
    : extractImageCandidates(file, options);
}

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

export const PDF_TEXT_FIXTURE_LABEL =
  "Development fixture reader - no Anthropic key, so the PDF's own text was pattern-matched rather than read by a model.";

export const PDF_NAME_FIXTURE_LABEL =
  "Development fixture reader - no Anthropic key and no text layer in this PDF, so the file name was pattern-matched and the document itself was not read.";

export type PdfExtractOptions = ExtractOptions & {
  /** Stood in for by a test; the real one opens the document with pdf.js. */
  readTextLayer?: (bytes: Uint8Array) => Promise<PdfTextLayer>;
};

/**
 * The text layer first: an invoice exported from a billing portal already
 * carries its own words, and reading them is exact and costs nothing. Only a
 * document with no text to read - a scan, a photographed bill - has its pages
 * looked at, and only up to the page cap, so a long scan is refused rather than
 * paid for.
 *
 * Whatever the reading came from, the candidates go through the same pipeline
 * as a chat message's: pending proposals, with money and dates unconfirmed.
 */
export async function extractPdfCandidates(
  pdf: PdfToRead,
  options: PdfExtractOptions = {},
): Promise<Extraction> {
  const environment = options.environment ?? process.env;
  const apiKey = environment.ANTHROPIC_API_KEY?.trim();
  const layer = await (options.readTextLayer ?? readPdfTextLayer)(pdf.bytes);
  const readable = hasTextLayer(layer);

  if (apiKey) {
    const call = {
      apiKey,
      model: environment.ANTHROPIC_MODEL?.trim() || undefined,
      createMessage: options.createMessage,
      now: options.now,
    };
    const candidates = readable
      ? await extractPdfTextWithAnthropic(layer.text, call)
      : await extractPdfWithAnthropic(pagesWithinCap(pdf, layer), call);

    return {
      mode: "claude",
      notice: pageCapNotice(layer),
      candidates: dedupeCandidates(candidates, canonicalProvider),
    };
  }

  if (environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test") {
    throw new ExtractorUnavailableError(
      isSeedLoginEnabled(environment)
        ? "Reading PDFs is unavailable: this preview has no ANTHROPIC_API_KEY. Add one to the server environment - the development fixture reader deliberately does not run here."
        : "Reading PDFs is unavailable: ANTHROPIC_API_KEY is not set on the server.",
    );
  }

  return {
    mode: "fixture",
    notice: notices([
      readable ? PDF_TEXT_FIXTURE_LABEL : PDF_NAME_FIXTURE_LABEL,
      pageCapNotice(layer),
    ]),
    candidates: dedupeCandidates(
      extractWithFixtures(
        readable ? layer.text : pdf.fileName.replace(/[-_.]+/g, " "),
        options.now,
      ),
      canonicalProvider,
    ),
  };
}

/**
 * A document with no text layer is read by looking at its pages, which is paid
 * for by the page and cannot be trimmed here without rewriting the file. Past
 * the cap it is refused with something the reader can act on instead.
 */
function pagesWithinCap(pdf: PdfToRead, layer: PdfTextLayer): PdfToRead {
  if (layer.pageCount > MAX_PDF_PAGES) {
    throw new Error(
      `this PDF has no text to read and is ${layer.pageCount} pages, past the ${MAX_PDF_PAGES}-page cap on reading pages as images - upload the pages that matter as screenshots`,
    );
  }

  return pdf;
}

function notices(parts: (string | null)[]): string | null {
  const said = parts.filter((part): part is string => part !== null);

  return said.length > 0 ? said.join(" ") : null;
}
