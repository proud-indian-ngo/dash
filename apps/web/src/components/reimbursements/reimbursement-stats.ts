import { Invoice01Icon } from "@hugeicons/core-free-icons";
import type { StatItem } from "@/components/stats/stats-cards";
import {
  computeSubmissionStats,
  type WithStatusAndLineItems,
} from "@/lib/stats";

export function computeReimbursementStats(
  data: readonly WithStatusAndLineItems[]
): StatItem[] {
  return computeSubmissionStats(data, Invoice01Icon);
}
