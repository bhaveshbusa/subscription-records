import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  /** pdf.js reads a PDF's text layer server-side; it is never bundled for a browser. */
  serverExternalPackages: ["pdfjs-dist"],
  /**
   * Capture lives on Inbox, beside the proposals it raises. `/chat` was the
   * second door to the same cards; a bookmark still works, it just arrives at
   * the one page. Not permanent: the old path may be reused one day.
   */
  async redirects() {
    return [{ source: "/chat", destination: "/inbox", permanent: false }];
  },
};

export default nextConfig;
