/**
 * Runs once when the Node server starts, before any route loads pdf.js.
 * Preview was failing at import with `DOMMatrix is not defined`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { installPdfJsDomGlobals } = await import("./lib/capture/pdfjs-dom");

  installPdfJsDomGlobals();
}
