import { receiptPdf } from "../lib/receipt-pdf";
import type { StoreContributionReceiptPdfPayload } from "../types";
import { createNotifyHandler } from "./create-handler";

/**
 * Stores a newly issued receipt's PDF, so the file a donor gets is fixed
 * from issue. Fetching it does the storing; a receipt already stored, or
 * voided meanwhile, is left as it is.
 */
export const handleStoreContributionReceiptPdf =
  createNotifyHandler<StoreContributionReceiptPdfPayload>(
    "store-contribution-receipt-pdf",
    async () => async (data) => {
      await receiptPdf(data.receiptId);
    }
  );
