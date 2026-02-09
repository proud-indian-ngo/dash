import { Wallet01Icon } from "@hugeicons/core-free-icons";
import type { StatItem } from "@/components/stats/stats-cards";
import {
  computeSubmissionStats,
  type WithStatusAndLineItems,
} from "@/lib/stats";

export function computeAdvancePaymentStats(
  data: readonly WithStatusAndLineItems[]
): StatItem[] {
  return computeSubmissionStats(data, Wallet01Icon);
}
