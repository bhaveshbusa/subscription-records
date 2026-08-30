import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  /** pdf.js reads a PDF's text layer server-side; it is never bundled for a browser. */
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
