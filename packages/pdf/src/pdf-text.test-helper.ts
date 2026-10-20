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

/** Each run of text drawn on the first page, with its left edge and width in points. */
export async function pdfTextRuns(
  pdf: Buffer
): Promise<{ str: string; width: number; x: number }[]> {
  const task = getDocument({ data: new Uint8Array(pdf) });
  const doc = await task.promise;
  const content = await (await doc.getPage(1)).getTextContent();
  const runs = content.items.flatMap((item) =>
    "str" in item && item.str.trim()
      ? [{ str: item.str, width: item.width, x: item.transform[4] as number }]
      : []
  );
  await task.destroy();
  return runs;
}
