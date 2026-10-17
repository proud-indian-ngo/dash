import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { revealErrorMessage } from "@pi-dash/shared/encrypted-values";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useApp } from "@/context/app-context";
import {
  getVendorDetails,
  revealVendorBankAccount,
  type VendorDetailsResponse,
} from "@/functions/vendors";
import { canRevealVendorBank } from "@/lib/vendor-access";

export type VendorDetails = VendorDetailsResponse["details"];

export type VendorDetailsState =
  | { kind: "loading" }
  | { kind: "error" }
  /** The server refused: this user may not see the vendor's details. */
  | { kind: "forbidden" }
  | { details: VendorDetails; kind: "ready" };

/**
 * Loads a vendor's private details while `enabled`, again whenever `version`
 * changes, and on `retry`. Private details are not synced, so every view
 * that shows them reads them through this hook.
 */
export function useVendorDetails(
  vendorId: string | null,
  enabled: boolean,
  version = 0
): { retry: () => void; state: VendorDetailsState } {
  const loadDetails = useServerFn(getVendorDetails);
  const [state, setState] = useState<VendorDetailsState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useEventCallback(() => setAttempt((n) => n + 1));

  useEffect(() => {
    if (!(enabled && vendorId)) {
      return;
    }
    let cancelled = false;
    // Reset on open, not on close, so views do not flash skeletons during a
    // close animation.
    setState({ kind: "loading" });
    loadDetails({ data: { vendorId } })
      .then((response) => {
        if (!cancelled) {
          setState({ details: response.details, kind: "ready" });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "vendor.loadDetails",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "useVendorDetails",
        });
        if (!cancelled) {
          // assertServerPermission and the vendor rules throw "Forbidden".
          setState({
            kind:
              error instanceof Error && error.message === "Forbidden"
                ? "forbidden"
                : "error",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, vendorId, version, attempt, loadDetails]);

  return { retry, state };
}

/**
 * Whether to offer Reveal. Mirrors `canRevealVendorBank`, which the server
 * enforces; `ownsPaymentToVendor` is only known on a payment the current user
 * raised that is past approval, so elsewhere record-payment holders do not
 * see the button.
 */
export function useCanRevealVendorBank(ownsPaymentToVendor = false): boolean {
  const { permissions } = useApp();
  return canRevealVendorBank(permissions, ownsPaymentToVendor);
}

export function maskedAccount(last4: string | null): string {
  return `•••• ${last4 ?? ""}`.trim();
}

/** The masked account number, with a Reveal/Hide button for those allowed. */
export function VendorAccountNumber({
  canReveal,
  last4,
  vendorId,
}: {
  canReveal: boolean;
  last4: string | null;
  vendorId: string;
}) {
  const reveal = useServerFn(revealVendorBankAccount);
  const [revealed, setRevealed] = useState<string | null>(null);
  const handleReveal = useEventCallback(async () => {
    await reveal({ data: { vendorId } })
      .then((result) => setRevealed(result.account?.accountNumber ?? ""))
      .catch((error: unknown) => {
        log.error({
          action: "vendor.bank_account.reveal",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "VendorAccountNumber",
        });
        toast.error(
          revealErrorMessage(
            error,
            "account number",
            "Couldn't reveal the account number"
          )
        );
      });
  });
  const handleHide = useEventCallback(() => setRevealed(null));
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-mono tabular-nums">
        {revealed ?? maskedAccount(last4)}
      </span>
      {canReveal ? (
        <Button
          onClick={revealed === null ? handleReveal : handleHide}
          size="sm"
          type="button"
          variant="outline"
        >
          {revealed === null ? "Reveal" : "Hide"}
        </Button>
      ) : null}
    </span>
  );
}
