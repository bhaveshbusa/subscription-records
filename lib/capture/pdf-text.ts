import { MAX_PDF_PAGES, type PdfTextLayer } from "./pdf";
import { installPdfJsDomGlobals } from "./pdfjs-dom";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjs: Promise<PdfJsModule> | null = null;

function loadPdfJs() {
  installPdfJsDomGlobals();
  pdfjs ??= import("pdfjs-dist/legacy/build/pdf.mjs");

  return pdfjs;
}

/**
 * The document's own text layer, page by page up to the cap. Nothing is
 * rendered and no font is downloaded: an invoice exported from a billing portal
 * carries its words already, and reading them costs nothing.
 *
 * A PDF that carries no text - a photographed or scanned bill - comes back with
 * an empty string rather than an error, and the caller looks at the pages.
 */
export async function readPdfTextLayer(bytes: Uint8Array): Promise<PdfTextLayer> {
  const { getDocument } = await loadPdfJs();
  /** pdf.js takes ownership of the buffer it is handed, so it gets a copy. */
  const loading = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    verbosity: 0,
  });
  const document = await loading.promise;

  try {
    const pagesRead = Math.min(document.numPages, MAX_PDF_PAGES);
    const pages: string[] = [];

    for (let number = 1; number <= pagesRead; number += 1) {
      const page = await document.getPage(number);

      try {
        const content = await page.getTextContent();

        pages.push(
          content.items
            .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
            .join("")
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
        );
      } finally {
        page.cleanup();
      }
    }

    return {
      pageCount: document.numPages,
      pagesRead,
      text: pages.filter((page) => page.length > 0).join("\n\n"),
    };
  } finally {
    await loading.destroy();
  }
}
