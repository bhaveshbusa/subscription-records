import { afterEach, describe, expect, it } from "vitest";

import { installPdfJsDomGlobals } from "./pdfjs-dom";

/**
 * Vercel/Turbopack can evaluate pdf.js in a context where it does not treat the
 * runtime as Node, so `@napi-rs/canvas` never polyfills `DOMMatrix` and the
 * module throws while loading. Electron `process.type` is the documented way
 * pdf.js decides that.
 */
describe("pdf.js on a non-Node-looking runtime", () => {
  const versions = process.versions as { electron?: string };
  const previousElectron = versions.electron;
  const previousType = (process as { type?: string }).type;

  afterEach(() => {
    if (previousElectron === undefined) {
      delete versions.electron;
    } else {
      versions.electron = previousElectron;
    }

    (process as { type?: string }).type = previousType;
  });

  it("loads after DOMMatrix is stubbed", async () => {
    versions.electron = "1";
    (process as { type?: string }).type = "renderer";
    installPdfJsDomGlobals();

    await expect(import("pdfjs-dist/legacy/build/pdf.mjs")).resolves.toMatchObject({
      getDocument: expect.any(Function),
    });
  });
});
