import type { AuditMetadata, AuditOutcome } from "@pi-dash/db/schema/audit-log";

export interface AuditLogRow {
  action: string;
  actorName: string;
  actorRole: string;
  actorUserId: string;
  attemptedAt: string;
  completedAt: string | null;
  id: string;
  impersonatorName: string | null;
  impersonatorUserId: string | null;
  metadata: AuditMetadata;
  outcome: AuditOutcome;
  targetId: string | null;
  targetType: string | null;
  traceId: string | null;
}

export interface AuditLogResponse {
  entries: AuditLogRow[];
  facets: {
    actions: string[];
    targetTypes: string[];
  };
  total: number;
}
