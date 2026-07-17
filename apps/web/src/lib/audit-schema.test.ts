import { auditLog, auditOutcomeValues } from "@pi-dash/db/schema/audit-log";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

describe("audit log schema", () => {
  it("keeps actor and target snapshots independent from deleted records", () => {
    const config = getTableConfig(auditLog);
    expect(config.foreignKeys).toHaveLength(0);
  });

  it("supports the complete audit outcome lifecycle", () => {
    expect(auditOutcomeValues).toEqual([
      "pending",
      "success",
      "denied",
      "failure",
    ]);
  });
});
