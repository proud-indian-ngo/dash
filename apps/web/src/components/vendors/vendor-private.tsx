import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
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

export type VendorDetails = VendorDetailsResponse["details"];

export type VendorDetailsState =
  | { kind: "loading" }
  | { kind: "error" }
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
          setState({ kind: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, vendorId, version, attempt, loadDetails]);

  return { retry, state };
}

/**
 * Finance staff may reveal any vendor's account; whoever records payments may
 * reveal an approved vendor's, since they need it to pay. The server applies
 * the same rule.
 */
export function useCanRevealVendorBank(status: string | null): boolean {
  const { hasPermission } = useApp();
  return (
    hasPermission("finance.view_sensitive") ||
    (status === "approved" && hasPermission("requests.record_payment"))
  );
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
    try {
      const result = await reveal({ data: { vendorId } });
      setRevealed(result.account?.accountNumber ?? "");
    } catch (error) {
      log.error({
        action: "vendor.bank_account.reveal",
        caughtError: error instanceof Error ? error.message : String(error),
        component: "VendorAccountNumber",
      });
      toast.error("Couldn't reveal the account number");
    }
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
