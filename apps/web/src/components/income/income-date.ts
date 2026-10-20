import { format } from "date-fns";

import { DATE } from "@/lib/date-formats";
import { epochToLocalDate } from "@/lib/local-date";

export function formatReceivedOn(epoch: number): string {
  const date = epochToLocalDate(epoch);
  return date ? format(date, DATE) : "—";
}
