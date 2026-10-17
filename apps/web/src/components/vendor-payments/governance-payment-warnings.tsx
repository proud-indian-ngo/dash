import {
  Alert,
  AlertTitle,
} from "@pi-dash/design-system/components/reui/alert";
import type { PaymentWarning } from "@pi-dash/shared/declarations";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { getPaymentGovernanceWarnings } from "@/functions/declarations";

/**
 * Warns an approver when the vendor is a trustee (clause 7.24 allows
 * trustees expenses only) or a party a trustee declared an interest in.
 * Matched by name, so it warns and never blocks.
 */
export function GovernancePaymentWarnings({
  enabled,
  vendorPaymentId,
}: {
  enabled: boolean;
  vendorPaymentId: string;
}) {
  const load = useServerFn(getPaymentGovernanceWarnings);
  const [warnings, setWarnings] = useState<PaymentWarning[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    load({ data: { vendorPaymentId } })
      .then((result) => {
        if (!cancelled) {
          setWarnings(result);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "vendorPayment.governanceWarnings",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "GovernancePaymentWarnings",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, vendorPaymentId, load]);

  if (warnings.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      {warnings.map((w) => (
        <Alert key={`${w.kind}-${w.trusteeName}`} variant="warning">
          <AlertTitle>{w.message}</AlertTitle>
        </Alert>
      ))}
    </div>
  );
}
