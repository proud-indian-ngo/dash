import { receiptPdf } from "../lib/receipt-pdf";
import type { StoreContributionReceiptPdfPayload } from "../types";
import { createNotifyHandler } from "./create-handler";

/**
 * Stores a newly issued receipt's PDF, so the file a donor gets is fixed
 * from issue. Fetching it does the storing; a receipt already stored, or
 * voided meanwhile, is left as it is. A failure is rethrown by name only:
 * rendering errors can quote donor details, and pg-boss keeps what a job
 * throws.
 */
export const handleStoreContributionReceiptPdf =
  createNotifyHandler<StoreContributionReceiptPdfPayload>(
    "store-contribution-receipt-pdf",
    async () => async (data) => {
      try {
        await receiptPdf(data.receiptId);
      } catch (error) {
        throw new Error(
          `Receipt PDF store failed: ${error instanceof Error ? error.name : typeof error}`
        );
      }
    }
  );
