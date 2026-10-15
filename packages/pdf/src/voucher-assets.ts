import path from "node:path";

const directory = path.resolve(import.meta.dirname, "../assets");

/**
 * Images the cash voucher draws. The web build embeds these as data URLs
 * (`apps/web/src/lib/dev/kalakriti-pdf-assets.ts`), so keep this a flat map
 * of file paths.
 */
export const voucherAssets = {
  treasurerSignature: path.join(directory, "signature.png"),
};
