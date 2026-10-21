import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { getGiftFiling } from "@/functions/donation-filings";

/** The live filing holding a gift: none, being checked, or its number and state. */
export type GiftFiling =
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "filed"; sequence: number; status: string };

/**
 * Whether a donations return filing holds the gift, read from the server
 * (filings are private). While unknown, or when the check fails, the form
 * treats the gift as filed, so it never offers an edit the server refuses.
 */
export function useGiftFiling(contributionId: string | null): GiftFiling {
  const check = useServerFn(getGiftFiling);
  const [result, setResult] = useState<{
    filing: GiftFiling;
    id: string;
  } | null>(null);
  useEffect(() => {
    if (!contributionId) {
      return;
    }
    let cancelled = false;
    check({ data: { contributionId } })
      .then((filing) => {
        if (!cancelled) {
          setResult({
            filing: filing
              ? {
                  kind: "filed",
                  sequence: filing.sequence,
                  status: filing.status,
                }
              : { kind: "none" },
            id: contributionId,
          });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "income.giftFiling",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "useGiftFiling",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [contributionId, check]);
  if (!contributionId) {
    return { kind: "none" };
  }
  return result?.id === contributionId ? result.filing : { kind: "checking" };
}

/** Why a filed gift's reported fields are fixed, and what to do instead. */
export function giftFilingNote(filing: GiftFiling): string | null {
  // While checking, the fields wait without a note; most gifts aren't filed.
  if (filing.kind !== "filed") {
    return null;
  }
  return filing.status === "prepared"
    ? `Donor, amount, date, channel, reporting mode, donation type and tax certificate are fixed: this gift is in filing ${filing.sequence}, which isn't uploaded yet. Discard that filing on the Donations return page to change them.`
    : `Donor, amount, date, channel, reporting mode, donation type and tax certificate are fixed: this gift is in donations return filing ${filing.sequence}. Correct it with a revision on the portal.`;
}
