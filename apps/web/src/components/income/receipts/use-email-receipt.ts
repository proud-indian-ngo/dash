import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { emailContributionReceipt } from "@/functions/contribution-receipts";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

/** "Email receipt": queues the donor's copy; never sent automatically. */
export function useEmailReceipt() {
  const email = useServerFn(emailContributionReceipt);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const send = async (receipt: { id: string; number: string }) => {
    setSendingId(receipt.id);
    try {
      await email({ data: { receiptId: receipt.id } });
      toast.success(`Receipt ${receipt.number} is on its way to the donor`);
    } catch (error) {
      toast.error("Couldn't email the receipt", {
        description: errorMessage(error),
      });
    } finally {
      setSendingId(null);
    }
  };
  return { send, sendingId };
}
