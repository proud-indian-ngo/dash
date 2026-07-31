import { auditOutcomeValues } from "@pi-dash/db/schema/audit-log";
import { z } from "zod";

const dateSchema = z.iso.date().optional();

export const auditLogQuerySchema = z.object({
  action: z.string().max(120).optional(),
  from: dateSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  outcome: z.enum(auditOutcomeValues).optional(),
  search: z.string().max(120).optional(),
  targetType: z.string().max(80).optional(),
  to: dateSchema,
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export function parseAuditLogQuery(url: string) {
  return auditLogQuerySchema.safeParse(
    Object.fromEntries(new URL(url).searchParams)
  );
}
