import { describe, expect, it } from "vitest";

import { samplePdf } from "./pdf-sample";
import { installPdfJsDomGlobals } from "./pdfjs-dom";
import { readPdfTextLayer } from "./pdf-text";

describe("readPdfTextLayer", () => {
  it("reads the words a PDF already carries", async () => {
    const layer = await readPdfTextLayer(
      samplePdf([["Netflix Standard subscription", "GBP 10.99 monthly"]]),
    );

    expect(layer.pageCount).toBe(1);
    expect(layer.pagesRead).toBe(1);
    expect(layer.text).toContain("Netflix Standard subscription");
    expect(layer.text).toContain("GBP 10.99 monthly");
  });

  it("returns empty text for a page with no text layer", async () => {
    const layer = await readPdfTextLayer(samplePdf([["scan"]], { text: false }));

    expect(layer.pageCount).toBe(1);
    expect(layer.text).toBe("");
  });
});

describe("installPdfJsDomGlobals", () => {
  it("leaves a constructable DOMMatrix on globalThis", () => {
    installPdfJsDomGlobals();

    expect(typeof globalThis.DOMMatrix).toBe("function");
    expect(new globalThis.DOMMatrix()).toBeTruthy();
  });

  it("lets pdf.js load after those globals exist", async () => {
    installPdfJsDomGlobals();

    await expect(import("pdfjs-dist/legacy/build/pdf.mjs")).resolves.toMatchObject({
      getDocument: expect.any(Function),
    });
  });
});
