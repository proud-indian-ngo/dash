import { renderToBuffer } from "@react-pdf/renderer";

import { DonationReceipt, type DonationReceiptProps } from "./donation-receipt";

export type { DonationReceiptProps } from "./donation-receipt";

/** Renders a donation receipt to a PDF buffer. Server only; never log the props. */
export function generateDonationReceiptPdf(
  props: DonationReceiptProps
): Promise<Buffer> {
  return renderToBuffer(<DonationReceipt {...props} />);
}
