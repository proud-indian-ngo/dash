import {
  CASH_VOUCHER_LIMIT_CONFIG_KEY,
  parseCashVoucherLimit,
} from "@pi-dash/shared/cash-voucher";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

/**
 * The cash-voucher limit in paise from the synced `app_config`, or the
 * default until it arrives. The mutators read the same row, and the server
 * has the final say.
 */
export function useCashVoucherLimit(): number {
  const [configs] = useQuery(queries.appConfig.all());
  return parseCashVoucherLimit(
    configs?.find((c) => c.key === CASH_VOUCHER_LIMIT_CONFIG_KEY)?.value
  );
}
