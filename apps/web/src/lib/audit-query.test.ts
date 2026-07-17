import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAuditLogQuery } from "./audit-query";

describe("audit log query", () => {
  it("applies bounded pagination defaults", () => {
    const result = parseAuditLogQuery("https://example.test/api/audit-log");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ limit: 20, offset: 0 });
    }
  });

  it("accepts supported filters", () => {
    const result = parseAuditLogQuery(
      "https://example.test/api/audit-log?offset=20&limit=50&outcome=denied&action=user.update&targetType=user&from=2026-07-01&to=2026-07-17&search=admin"
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        action: "user.update",
        from: "2026-07-01",
        limit: 50,
        offset: 20,
        outcome: "denied",
        search: "admin",
        targetType: "user",
        to: "2026-07-17",
      });
    }
  });

  it.each([
    "?limit=0",
    "?limit=101",
    "?offset=-1",
    "?outcome=unknown",
    "?from=17-07-2026",
    "?from=2026-99-99",
    "?to=2026-02-30",
  ])("rejects invalid query %s", (query) => {
    expect(
      parseAuditLogQuery(`https://example.test/api/audit-log${query}`).success
    ).toBe(false);
  });

  it("keeps target-type search and deterministic newest-first ordering", () => {
    const source = readFileSync(
      new URL("../routes/api/audit-log.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("ilike(auditLog.targetType, pattern)");
    expect(source).toContain(
      ".orderBy(desc(auditLog.attemptedAt), desc(auditLog.id))"
    );
  });
});
