import { addMonths, addWeeks } from "date-fns";

export interface RecurrenceRule {
  endDate?: string;
  frequency: "weekly" | "biweekly" | "monthly";
}

export function getNextOccurrenceDate(
  lastOccurrenceStart: Date,
  rule: RecurrenceRule
): Date | null {
  let next: Date;

  switch (rule.frequency) {
    case "weekly":
      next = addWeeks(lastOccurrenceStart, 1);
      break;
    case "biweekly":
      next = addWeeks(lastOccurrenceStart, 2);
      break;
    case "monthly":
      next = addMonths(lastOccurrenceStart, 1);
      break;
    default:
      return null;
  }

  if (rule.endDate) {
    const end = new Date(rule.endDate);
    if (next > end) {
      return null;
    }
  }

  return next;
}
