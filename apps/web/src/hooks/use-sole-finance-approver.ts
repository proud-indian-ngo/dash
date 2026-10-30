import {
  isSoleFinanceApprover,
  SOLE_FINANCE_APPROVER_CONFIG_KEY,
} from "@pi-dash/shared/approval-policy";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

/**
 * Whether one person handles finance (Settings → General), so they may
 * approve and pay their own requests. The mutators read the same row, and
 * the server has the final say.
 */
export function useSoleFinanceApprover(): boolean {
  const [configs] = useQuery(queries.appConfig.all());
  return isSoleFinanceApprover(
    configs?.find((c) => c.key === SOLE_FINANCE_APPROVER_CONFIG_KEY)?.value
  );
}
