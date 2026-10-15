import { LEDGER_SOURCE_LABELS } from "@pi-dash/shared/ledger";
import { format } from "date-fns";

import { DATE } from "@/lib/date-formats";

export const formatDay = (iso: string) =>
  format(new Date(`${iso}T00:00:00`), DATE);

export const formatMonth = (month: string) =>
  format(new Date(`${month}-01T00:00:00`), "MMM yyyy");

/** What posted a line, in words. */
export function sourceLabel(sourceType: string | undefined): string {
  if (!sourceType) {
    return "—";
  }
  return (
    (LEDGER_SOURCE_LABELS as Record<string, string>)[sourceType] ??
    sourceType.replaceAll("_", " ")
  );
}
