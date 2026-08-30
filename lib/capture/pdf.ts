export const PDF_MEDIA_TYPE = "application/pdf";

/** An exported invoice is a few hundred kilobytes; ten megabytes is a scan of a book. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Reading is paid for by the page, so only the front of a document is read. An
 * invoice states what it bills on its first pages; a hundred-page statement is
 * not worth reading in full to find out it does not.
 */
export const MAX_PDF_PAGES = 5;

/**
 * Below this a text layer is page furniture - a header, a page number, a font
 * name - rather than an invoice, and the pages are worth looking at instead.
 */
export const MIN_TEXT_LAYER_CHARACTERS = 40;

export function isPdfMediaType(value: string): value is typeof PDF_MEDIA_TYPE {
  return value === PDF_MEDIA_TYPE;
}

/**
 * The text a PDF carries in its own text layer, and how much of the document it
 * came from, so a reading can say when it stopped at the page cap.
 */
export type PdfTextLayer = {
  pageCount: number;
  pagesRead: number;
  text: string;
};

/** Whether the text layer says enough to be read instead of the pages themselves. */
export function hasTextLayer(layer: PdfTextLayer): boolean {
  return layer.text.length >= MIN_TEXT_LAYER_CHARACTERS;
}

/** Said once, so the cards and the ledger agree on what was actually read. */
export function pageCapNotice(layer: PdfTextLayer): string | null {
  return layer.pageCount > layer.pagesRead
    ? `Only the first ${layer.pagesRead} of ${layer.pageCount} pages were read.`
    : null;
}
