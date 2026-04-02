import {
  attachmentTypeValues,
  cityValues,
  historyActionValues,
} from "@pi-dash/shared/constants";
import { pgEnum } from "drizzle-orm/pg-core";

// Shared Postgres enums
// Postgres enum name is "reimbursement_city" from initial migration (0006)
export const cityEnum = pgEnum("reimbursement_city", cityValues);
export const attachmentTypeEnum = pgEnum(
  "attachment_type",
  attachmentTypeValues
);
export const historyActionEnum = pgEnum("history_action", historyActionValues);
