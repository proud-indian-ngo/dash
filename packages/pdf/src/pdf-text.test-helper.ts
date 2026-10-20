import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Every word drawn in a PDF, page by page, for tests that check nothing is lost. */
export async function pdfWords(pdf: Buffer): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(pdf) });
  const doc = await task.promise;
  const words: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const item of content.items) {
      if ("str" in item) {
        words.push(...item.str.split(/\s+/).filter(Boolean));
      }
    }
  }
  await task.destroy();
  return words;
}
