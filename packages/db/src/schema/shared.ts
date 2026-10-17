import {
  attachmentTypeValues,
  expenseChargedToValues,
  historyActionValues,
  reminderTargetValues,
} from "@pi-dash/shared/constants";
import { pgEnum } from "drizzle-orm/pg-core";

// Shared Postgres enums
export const attachmentTypeEnum = pgEnum(
  "attachment_type",
  attachmentTypeValues
);
export const historyActionEnum = pgEnum("history_action", historyActionValues);
export const reminderTargetEnum = pgEnum(
  "reminder_target",
  reminderTargetValues
);

/** What an expense is charged to: an event, a programme or the organisation. */
export const expenseChargedToEnum = pgEnum(
  "expense_charged_to",
  expenseChargedToValues
);
