import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { getReceiptContacts } from "@/functions/contribution-receipts";

type ReceiptContactsMap = Awaited<ReturnType<typeof getReceiptContacts>>;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

/**
 * Whether each live receipt's donor can be emailed or messaged, for
 * issuers. Contact details are private, so a server function returns flags
 * only. Reloads when `refreshKey` changes; until it answers, sends stay
 * enabled and the server refuses what can't work.
 */
export function useReceiptContacts(enabled: boolean, refreshKey: string) {
  const load = useServerFn(getReceiptContacts);
  const [contacts, setContacts] = useState<ReceiptContactsMap | null>(null);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    load()
      .then((result) => {
        if (!cancelled) {
          setContacts(result);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "receipts.contacts",
          caughtError: errorMessage(error),
          component: "ReceiptsTab",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey, load]);
  return contacts;
}
