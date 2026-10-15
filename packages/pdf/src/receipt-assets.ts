import path from "node:path";

const directory = path.resolve(import.meta.dirname, "../assets/fonts");

/**
 * Product-language fonts for the donation receipt. The web build embeds these
 * as data URLs (`apps/web/src/lib/dev/kalakriti-pdf-assets.ts`), so keep this
 * a flat map of file paths.
 */
export const receiptAssets = {
  sansRegular: path.join(directory, "Geist-Regular.ttf"),
  sansSemiBold: path.join(directory, "Geist-SemiBold.ttf"),
  displaySemiBold: path.join(directory, "BricolageGrotesque-SemiBold.ttf"),
  monoRegular: path.join(directory, "PaperMono-Regular.ttf"),
  monoMedium: path.join(directory, "PaperMono-Medium.ttf"),
};
