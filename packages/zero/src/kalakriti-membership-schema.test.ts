import {
  kalakritiAuditEntry,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

describe("Kalakriti Guardian membership invariants", () => {
  it("enforces one active Guardian membership per login identity", () => {
    const index = getTableConfig(kalakritiEditionMembership).indexes.find(
      (candidate) =>
        candidate.config.name ===
        "kalakriti_membership_active_guardian_userId_uidx"
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns).toHaveLength(1);
    expect(index?.config.where).toBeDefined();
  });
});

describe("Kalakriti audit invariants", () => {
  it("retains the immutable actor ID after its User is deleted", () => {
    const foreignKeyNames = getTableConfig(kalakritiAuditEntry).foreignKeys.map(
      (foreignKey) => foreignKey.getName()
    );

    expect(foreignKeyNames).not.toContain(
      "kalakriti_audit_entry_actor_user_id_user_id_fk"
    );
  });
});
