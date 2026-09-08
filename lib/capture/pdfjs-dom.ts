/**
 * pdf.js 6 evaluates `new DOMMatrix()` while the module loads. Node does not
 * provide that constructor, and Vercel's server chunk loads the package before
 * `@napi-rs/canvas` can polyfill it. A stub is enough: capture only reads the
 * text layer, it never paints a page.
 */
class NodeDomMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[]) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    }
  }

  multiplySelf() {
    return this;
  }

  preMultiplySelf() {
    return this;
  }

  invertSelf() {
    return this;
  }

  translate() {
    return this;
  }

  scale() {
    return this;
  }
}

class NodePath2D {
  addPath() {}
}

export function installPdfJsDomGlobals() {
  const global = globalThis as unknown as {
    DOMMatrix?: unknown;
    Path2D?: unknown;
  };

  if (typeof global.DOMMatrix !== "function") {
    global.DOMMatrix = NodeDomMatrix;
  }

  if (typeof global.Path2D !== "function") {
    global.Path2D = NodePath2D;
  }
}
