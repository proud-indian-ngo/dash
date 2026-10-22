import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  emailContributionReceipt,
  sendContributionReceiptNow,
  whatsappContributionReceipt,
} from "@/functions/contribution-receipts";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

/** How finance sends a receipt: by the automatic rule, or one channel. */
export type ReceiptSend = "now" | "email" | "whatsapp";

const FAILED: Record<ReceiptSend, string> = {
  email: "Couldn't email the receipt",
  now: "Couldn't send the receipt",
  whatsapp: "Couldn't send the receipt on WhatsApp",
};

/** "Send now", "Email receipt" and "Send on WhatsApp": queue the donor's copy. */
export function useSendReceipt() {
  const email = useServerFn(emailContributionReceipt);
  const now = useServerFn(sendContributionReceiptNow);
  const whatsapp = useServerFn(whatsappContributionReceipt);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const send = async (
    how: ReceiptSend,
    receipt: { id: string; number: string }
  ) => {
    // One request at a time: a double click must not queue two sends.
    if (sendingId !== null) {
      return;
    }
    setSendingId(receipt.id);
    const request = { data: { receiptId: receipt.id } };
    const queued =
      how === "email"
        ? email(request)
        : how === "whatsapp"
          ? whatsapp(request)
          : now(request);
    await queued
      .then(() => {
        toast.success(`Receipt ${receipt.number} is queued to send`);
      })
      .catch((error: unknown) => {
        toast.error(FAILED[how], { description: errorMessage(error) });
      })
      .finally(() => setSendingId(null));
  };
  return { send, sendingId };
}
