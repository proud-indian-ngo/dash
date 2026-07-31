import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const auditOutcomeValues = [
  "pending",
  "success",
  "denied",
  "failure",
] as const;

export type AuditOutcome = (typeof auditOutcomeValues)[number];

export type AuditMetadata = Record<
  string,
  boolean | number | string | string[] | Record<string, string | string[]>
>;

export const auditOutcomeEnum = pgEnum("audit_outcome", auditOutcomeValues);

export const auditLog = pgTable(
  "audit_log",
  {
    action: text("action").notNull(),
    actorName: text("actor_name").notNull(),
    actorRole: text("actor_role").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    id: uuid("id").primaryKey(),
    impersonatorName: text("impersonator_name"),
    impersonatorUserId: text("impersonator_user_id"),
    metadata: jsonb("metadata").$type<AuditMetadata>().default({}).notNull(),
    outcome: auditOutcomeEnum("outcome").notNull(),
    targetId: text("target_id"),
    targetType: text("target_type"),
    traceId: text("trace_id"),
  },
  (table) => [
    index("audit_log_attempted_at_idx").on(table.attemptedAt.desc()),
    index("audit_log_actor_attempted_at_idx").on(
      table.actorUserId,
      table.attemptedAt.desc()
    ),
    index("audit_log_action_attempted_at_idx").on(
      table.action,
      table.attemptedAt.desc()
    ),
    index("audit_log_outcome_attempted_at_idx").on(
      table.outcome,
      table.attemptedAt.desc()
    ),
    index("audit_log_target_attempted_at_idx").on(
      table.targetType,
      table.targetId,
      table.attemptedAt.desc()
    ),
  ]
);
