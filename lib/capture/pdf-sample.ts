/**
 * A PDF built by hand, for tests: one page per group of lines, each line in the
 * text layer where a reader will find it. Small enough to read in this file, so
 * a test that turns an invoice into candidates says what the invoice said.
 *
 * Pass `text: false` for a page with no text layer at all - the shape of a
 * scanned bill, which the reader has to look at rather than read.
 */
export function samplePdf(pages: string[][], options: { text?: boolean } = {}): Uint8Array {
  const objects: string[] = [];
  const add = (body: string): number => objects.push(body);
  const pageIds: number[] = [];
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;

  objects.push("", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const lines of pages) {
    const content =
      options.text === false
        ? "0 0 0 rg 40 700 200 60 re f\n"
        : `BT /F1 12 Tf 40 760 Td 16 TL\n${lines
            .map((line) => `(${line.replace(/([\\()])/g, "\\$1")}) Tj T*\n`)
            .join("")}ET\n`;
    const streamId = add(
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    );

    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`,
      ),
    );
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startxref = pdf.length;

  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
