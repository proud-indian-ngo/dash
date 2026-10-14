import type {
  GatewaySettlementStatus,
  GatewaySettlementItemType,
} from "@pi-dash/shared/constants";
import type {
  Contribution,
  GatewaySettlement,
  GatewaySettlementItem,
  Party,
} from "@pi-dash/zero/schema";

import type { StatusTone } from "@/components/shared/status-badge";

/** A settlement as the Settlements tab query returns it: only its unlinked lines come along. */
export type SettlementRow = GatewaySettlement & {
  items?: readonly GatewaySettlementItem[];
};

/** A settlement line on the sheet, with its contribution's donor. */
export type SettlementLineRow = GatewaySettlementItem & {
  contribution?: (Contribution & { party?: Party | null }) | null;
};

export type SettlementDetail = GatewaySettlement & {
  items?: readonly SettlementLineRow[];
};

export const SETTLEMENT_STATUS_LABELS: Record<GatewaySettlementStatus, string> =
  {
    created: "Created",
    failed: "Failed",
    processed: "Processed",
  };

export const SETTLEMENT_STATUS_TONES: Record<
  GatewaySettlementStatus,
  StatusTone
> = {
  created: "info",
  failed: "danger",
  processed: "success",
};

export const SETTLEMENT_LINE_LABELS: Record<GatewaySettlementItemType, string> =
  {
    adjustment: "Adjustment",
    payment: "Payment",
    refund: "Refund",
    transfer: "Transfer",
  };

/** "setl_ABC…XYZ": long IDs shortened for a table cell. */
export function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 9)}…${id.slice(-4)}` : id;
}
